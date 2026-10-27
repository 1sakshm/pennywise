#!/usr/bin/env node
// npx -y pennywise-mcp            -> MCP server on stdio
// npx -y pennywise-mcp --download -> fetch + verify the router weights, then exit
// npx -y pennywise-mcp --route "…" -> route one prompt and print the decision
const args = process.argv.slice(2);

try {
  if (args.includes("--version")) {
    const { VERSION } = await import("../src/server.js");
    console.log(VERSION);
  } else if (args.includes("--download")) {
    const { ensureWeights, cacheDir } = await import("../src/weights.js");
    await ensureWeights();
    console.log(`router weights ready in ${process.env.PENNYWISE_WEIGHTS_DIR || cacheDir()}`);
  } else if (args.includes("--route")) {
    const { Router } = await import("../src/router.js");
    const prompt = args[args.indexOf("--route") + 1] || "";
    const mode = args.includes("--mode") ? args[args.indexOf("--mode") + 1] : "auto";
    const r = await Router.load();
    console.log(JSON.stringify(await r.route(prompt, mode), null, 2));
    process.exit(0);
  } else {
    const { main } = await import("../src/server.js");
    await main();
  }
} catch (e) {
  process.stderr.write(`[pennywise] error: ${e?.message || e}\n`);
  process.exit(1);
}
