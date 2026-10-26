"use client";
import { useState } from "react";
import { PROXY_URL } from "@/lib/api";

const REPO = process.env.NEXT_PUBLIC_REPO_URL || "https://github.com/YOUR-USER/laya-router";

const SNIPPETS: Record<string, { lang: string; code: string }> = {
  Python: {
    lang: "python",
    code: `from openai import OpenAI

client = OpenAI(base_url="${PROXY_URL}", api_key="unused")  # ← the one line

r = client.chat.completions.create(
    model="auto",  # or "auto-cheap" / "auto-quality"
    messages=[{"role": "user", "content": "Summarise this diff in one line"}],
)
print(r.choices[0].message.content)`,
  },
  JavaScript: {
    lang: "js",
    code: `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "${PROXY_URL}", apiKey: "unused" });

const r = await client.chat.completions.create({
  model: "auto",
  messages: [{ role: "user", content: "Summarise this diff in one line" }],
});`,
  },
  OpenCode: {
    lang: "json",
    code: `// opencode.json — the path Alan's agents use (see examples/alan/)
{
  "model": "laya-router/auto",
  "provider": {
    "laya-router": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Laya Router",
      "options": { "baseURL": "${PROXY_URL}" },
      "models": {
        "auto": { "limit": { "context": 32000, "output": 8192 } },
        "auto-cheap": { "limit": { "context": 32000, "output": 8192 } },
        "auto-quality": { "limit": { "context": 32000, "output": 8192 } }
      }
    }
  }
}`,
  },
  MCP: {
    lang: "json",
    code: `{
  "mcpServers": {
    "laya-router": {
      "command": "python",
      "args": ["-m", "integrations.mcp.server"],
      "env": { "LAYA_ROUTER_URL": "${PROXY_URL.replace(/\/v1$/, "")}" }
    }
  }
}
// tools: route(prompt) · ask_routed(prompt, mode)`,
  },
  Skill: {
    lang: "sh",
    code: `# Agent skill: send bounded sub-tasks through the router,
# keep your main model for the hard parts.
git clone ${REPO}
cp -r laya-router/integrations/skill ~/.claude/skills/laya-router
export LAYA_ROUTER_URL=${PROXY_URL.replace(/\/v1$/, "")}`,
  },
};

export default function Integrate() {
  const [tab, setTab] = useState("Python");
  const [copied, setCopied] = useState(false);
  const s = SNIPPETS[tab];
  return (
    <div className="panel ig">
      <div className="eyebrow">integrate in one line</div>
      <p className="lede">Point any OpenAI SDK at the proxy. Every request goes to the cheapest tier Laya thinks can handle it; agent sessions stay on one tier, tool calls pass through.</p>
      <div className="seg" role="tablist">
        {Object.keys(SNIPPETS).map((k) => (
          <button key={k} role="tab" aria-pressed={k === tab} onClick={() => setTab(k)}>
            {k}
          </button>
        ))}
      </div>
      <div className="codewrap">
        <pre className="code">{s.code}</pre>
        <button
          className="btn copy"
          onClick={() => {
            navigator.clipboard?.writeText(s.code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            }, () => {});
          }}
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <p className="k">
        Response headers show what happened: <code>x-router-tier</code>, <code>x-router-confidence</code>, <code>x-router-latency-ms</code>, <code>x-estimated-savings-usd</code>.
      </p>
      <style jsx>{`
        .ig { padding: clamp(16px, 2.6vw, 24px); display: flex; flex-direction: column; gap: 12px; }
        .lede { margin: 0; font-size: 14px; }
        .codewrap { position: relative; }
        .copy { position: absolute; top: 8px; right: 8px; padding: 4px 10px; font-size: 12px; }
        .k { font-size: 12px; color: var(--muted); margin: 0; }
        code { font-size: 12px; color: var(--text); }
      `}</style>
    </div>
  );
}
