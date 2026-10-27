// Spawns bin/pennywise-mcp.js over stdio (as Alan's Command connector does) and calls the tools.
// Set PENNYWISE_WEIGHTS_DIR or PENNYWISE_WEIGHTS_URL as needed; ask_routed runs only if NVIDIA_API_KEY is set.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const bin = fileURLToPath(new URL("../bin/pennywise-mcp.js", import.meta.url));
const transport = new StdioClientTransport({ command: process.execPath, args: [bin], env: { ...process.env }, stderr: "inherit" });
const client = new Client({ name: "pennywise-test", version: "0" });
await client.connect(transport);
let bad = 0;
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); if (!ok) bad++; };

const { tools } = await client.listTools();
check(tools.map((t) => t.name).sort().join() === "ask_routed,route", `tools: ${tools.map((t) => t.name)}`);

const cases = [["hi, what's 2+2?", "auto"], ["Prove that there are infinitely many primes of the form 4k+3, rigorously.", "auto-quality"], ["Write a haiku about autumn.", "auto-cheap"]];
for (const [prompt, mode] of cases) {
  const t0 = Date.now();
  const r = await client.callTool({ name: "route", arguments: { prompt, mode } });
  const txt = r.content[0].text;
  let d = null; try { d = JSON.parse(txt); } catch {}
  check(!r.isError && d && ["small", "medium", "large"].includes(d.tier), `route[${mode}] ${Date.now() - t0}ms -> ${d ? `${d.tier} (${d.confidence}) ${d.model}` : txt}`);
}
const badMode = await client.callTool({ name: "route", arguments: { prompt: "x", mode: "turbo" } }).catch((e) => ({ isError: true, content: [{ text: e.message }] }));
check(badMode.isError, `invalid mode rejected: ${String(badMode.content[0].text).slice(0, 80)}`);

if (process.env.NVIDIA_API_KEY) {
  const t0 = Date.now();
  const r = await client.callTool({ name: "ask_routed", arguments: { prompt: "In one sentence: why is the sky blue?", max_tokens: 400 } });
  const meta = r.content.at(-1).text;
  check(!r.isError && r.content[0].text.length > 10, `ask_routed ${Date.now() - t0}ms -> ${r.content[0].text.slice(0, 120).replace(/\s+/g, " ")}`);
  console.log("     " + meta);
} else console.log("SKIP ask_routed (no NVIDIA_API_KEY)");

await client.close();
console.log(bad ? `${bad} FAILED` : "all passed");
process.exit(bad ? 1 : 0);
