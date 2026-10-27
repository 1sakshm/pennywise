// Fetches the router's ONNX weights on first run and keeps them in a local cache.
// Every file is checked against the size and sha256 in assets/weights_manifest.json.
// Only stderr is used for logs: stdout belongs to the MCP stdio transport.
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const ASSETS = join(here, "..", "assets");
const RAW = JSON.parse(readFileSync(join(ASSETS, "weights_manifest.json"), "utf8"));
export const MANIFEST = {
  version: "v1-" + RAW["lower.onnx"].sha256.slice(0, 8),
  files: Object.entries(RAW).map(([name, f]) => ({ name, size: f.bytes, sha256: f.sha256 })),
};

export const DEFAULT_WEIGHTS_URL = "https://huggingface.co/SuckSome/pennywise-router/resolve/main";

export function cacheDir() {
  return process.env.PENNYWISE_CACHE || join(homedir(), ".cache", "pennywise", MANIFEST.version || "v1");
}

const log = (...a) => process.stderr.write(`[pennywise] ${a.join(" ")}\n`);

function sha256(path) {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(path).on("data", (c) => h.update(c)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}

// Progress shared with the server so tools can report "warming up N%".
export const progress = { done: 0, total: MANIFEST.files.reduce((s, f) => s + f.size, 0), state: "idle", error: null };

async function fetchOne(base, file, dir) {
  const dest = join(dir, file.name);
  const okMarker = dest + ".ok";
  if (existsSync(dest) && existsSync(okMarker) && statSync(dest).size === file.size) {
    progress.done += file.size;
    return dest;
  }
  if (existsSync(dest) && statSync(dest).size === file.size && (await sha256(dest)) === file.sha256) {
    createWriteStream(okMarker).end(file.sha256);
    progress.done += file.size;
    return dest;
  }
  const url = `${base.replace(/\/$/, "")}/${file.name}`;
  log(`downloading ${file.name} (${(file.size / 1e6).toFixed(0)} MB) from ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`download failed: ${url} -> HTTP ${res.status}`);
  const part = dest + ".part";
  const out = createWriteStream(part);
  const h = createHash("sha256");
  let got = 0;
  let lastLog = 0;
  for await (const chunk of res.body) {
    h.update(chunk);
    got += chunk.length;
    progress.done += chunk.length;
    if (!out.write(chunk)) await new Promise((r) => out.once("drain", r));
    if (Date.now() - lastLog > 5000) {
      lastLog = Date.now();
      log(`${file.name}: ${((100 * got) / file.size).toFixed(0)}%`);
    }
  }
  await new Promise((resolve, reject) => out.end((e) => (e ? reject(e) : resolve())));
  const digest = h.digest("hex");
  if (got !== file.size || digest !== file.sha256) {
    try { unlinkSync(part); } catch {}
    progress.done -= got;
    throw new Error(`${file.name}: checksum mismatch (got ${got} bytes, sha256 ${digest.slice(0, 12)}…)`);
  }
  renameSync(part, dest);
  createWriteStream(okMarker).end(digest);
  log(`${file.name}: verified`);
  return dest;
}

// Resolves to { name: absolutePath } for every weight file, downloading what is missing.
export async function ensureWeights() {
  const local = process.env.PENNYWISE_WEIGHTS_DIR;
  if (local) {
    const paths = {};
    for (const f of MANIFEST.files) {
      const p = join(local, f.name);
      if (!existsSync(p)) throw new Error(`PENNYWISE_WEIGHTS_DIR is set but ${p} is missing`);
      paths[f.name] = p;
    }
    progress.done = progress.total;
    progress.state = "ready";
    return paths;
  }
  const dir = cacheDir();
  mkdirSync(dir, { recursive: true });
  const base = process.env.PENNYWISE_WEIGHTS_URL || DEFAULT_WEIGHTS_URL;
  progress.state = "downloading";
  progress.done = 0;
  const paths = {};
  try {
    for (const f of MANIFEST.files) paths[f.name] = await fetchOne(base, f, dir);
  } catch (e) {
    progress.state = "error";
    progress.error = String(e.message || e);
    throw e;
  }
  progress.state = "ready";
  return paths;
}
