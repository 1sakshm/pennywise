// Parity with the Python reference: token ids must match exactly, probabilities to ~1e-4.
// Uses PENNYWISE_WEIGHTS_DIR (or the download cache) for the ONNX graphs.
import { readFileSync } from "node:fs";
import { Router, buildIds, ACTIONS } from "../src/router.js";

const fx = JSON.parse(readFileSync(new URL("./parity_fixture.json", import.meta.url), "utf8"));
let idFail = 0, argFail = 0, maxDp = 0;
for (const c of fx) {
  const ids = buildIds(c.prompt);
  if (ids.length !== c.ids.length || ids.some((v, i) => v !== c.ids[i])) {
    idFail++;
    const at = ids.findIndex((v, i) => v !== c.ids[i]);
    console.error(`ids mismatch at ${at}: ${JSON.stringify(c.prompt.slice(0, 60))} js=${ids.slice(at, at + 5)} py=${c.ids.slice(at, at + 5)}`);
  }
}
console.log(`token ids: ${fx.length - idFail}/${fx.length} exact`);
if (process.argv.includes("--ids-only")) process.exit(idFail ? 1 : 0);

const r = await Router.load();
for (const c of fx) {
  for (const [lamS, ref] of Object.entries(c.probs)) {
    const { p } = await r.probs(c.prompt, Number(lamS));
    const pr = ACTIONS.map((k) => ref[k]);
    maxDp = Math.max(maxDp, ...p.map((v, i) => Math.abs(v - pr[i])));
    const am = (a) => a.indexOf(Math.max(...a));
    if (am(p) !== am(pr)) argFail++;
  }
}
const n = fx.length * 2;
console.log(`argmax agreement: ${n - argFail}/${n}, max |dp| = ${maxDp.toExponential(2)}`);
const t = await r.route("Write a haiku about autumn.");
console.log("sample:", JSON.stringify(t));
process.exit(idFail || argFail || maxDp > 1e-3 ? 1 : 0);
