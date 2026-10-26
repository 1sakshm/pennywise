"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { PROXY_URL } from "@/lib/api";

const REPO = process.env.NEXT_PUBLIC_REPO_URL || "https://github.com/YOUR-USER/pennywise";

const SNIPPETS: Record<string, { lang: string; file: string; code: string }> = {
  Python: {
    lang: "python",
    file: "client.py",
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
    file: "client.mjs",
    code: `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "${PROXY_URL}", apiKey: "unused" });

const r = await client.chat.completions.create({
  model: "auto",
  messages: [{ role: "user", content: "Summarise this diff in one line" }],
});`,
  },
  OpenCode: {
    lang: "json",
    file: "opencode.json",
    code: `// opencode.json — the path Alan's agents use (see examples/alan/)
{
  "model": "pennywise/auto",
  "provider": {
    "pennywise": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Pennywise",
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
    file: "mcp.json",
    code: `{
  "mcpServers": {
    "pennywise": {
      "command": "python",
      "args": ["-m", "integrations.mcp.server"],
      "env": { "PENNYWISE_URL": "${PROXY_URL.replace(/\/v1$/, "")}" }
    }
  }
}
// tools: route(prompt) · ask_routed(prompt, mode)`,
  },
  Skill: {
    lang: "sh",
    file: "install.sh",
    code: `# Agent skill: send bounded sub-tasks through the router,
# keep your main model for the hard parts.
git clone ${REPO}
cp -r pennywise/integrations/skill ~/.claude/skills/pennywise
export PENNYWISE_URL=${PROXY_URL.replace(/\/v1$/, "")}`,
  },
};

const HOST = PROXY_URL.replace(/\/v1$/, "");

export default function Integrate() {
  const [tab, setTab] = useState("Python");
  const [copied, setCopied] = useState(false);
  const copyT = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyT.current) clearTimeout(copyT.current); }, []);
  const keys = Object.keys(SNIPPETS);
  const s = SNIPPETS[tab];
  const lines = s.code.split("\n");
  const onTabKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = keys.indexOf(tab);
    const n = keys[(i + (e.key === "ArrowRight" ? 1 : keys.length - 1)) % keys.length];
    setTab(n);
    setCopied(false);
    (document.getElementById(`ig-tab-${n}`) as HTMLButtonElement | null)?.focus();
  };
  return (
    <div className="panel ig">
      <div className="fig-head">
        <span className="fig-id">INTEGRATE</span>
        <span>one line</span>
        <span className="sp" />
        <span className="dim">OpenAI-compatible</span>
      </div>
      <div className="body">
        <p className="lede">
          Point any OpenAI SDK at the proxy. Every request goes to the cheapest tier Laya thinks can handle it; agent sessions stay on one tier, tool calls pass
          through.
        </p>
        <div className="file">
          <div className="tabs">
            <div className="tl" role="tablist" aria-label="Integration snippets" onKeyDown={onTabKey}>
              {keys.map((k) => (
                <button
                  key={k}
                  id={`ig-tab-${k}`}
                  role="tab"
                  aria-selected={k === tab}
                  aria-controls="ig-panel"
                  tabIndex={k === tab ? 0 : -1}
                  title={k}
                  onClick={() => {
                    setTab(k);
                    setCopied(false);
                  }}
                >
                  {SNIPPETS[k].file}
                </button>
              ))}
            </div>
          </div>
          <div className="meta">
            <span>{tab}</span>
            <span className="sp" />
            <span className="tab">{lines.length} lines</span>
            <button
              className={`copy ${copied ? "done" : ""}`}
              aria-label={`Copy ${s.file}`}
              onClick={() => {
                navigator.clipboard?.writeText(s.code).then(() => {
                  setCopied(true);
                  if (copyT.current) clearTimeout(copyT.current);
                  copyT.current = setTimeout(() => setCopied(false), 1400);
                }, () => {});
              }}
            >
              {copied ? "✓ copied" : "copy"}
            </button>
          </div>
          <pre className="src" id="ig-panel" role="tabpanel" aria-labelledby={`ig-tab-${tab}`}>
            <code>
              {lines.map((l, i) => (
                <span key={tab + i} className={`ln ${l.includes(HOST) ? "hl" : ""}`}>
                  <span className="no" aria-hidden>{i + 1}</span>
                  <span className="lc">{l || " "}</span>
                </span>
              ))}
            </code>
          </pre>
        </div>
        <div className="hdrs">
          <span className="hk">Response headers</span>
          <div className="hlist">
            <code>x-router-tier</code>
            <code>x-router-confidence</code>
            <code>x-router-latency-ms</code>
            <code>x-estimated-savings-usd</code>
          </div>
        </div>
      </div>
      <style jsx>{`
        .ig { min-width: 0; }
        .dim { color: var(--dim); }
        .body { padding: clamp(14px, 2.4vw, 22px); display: flex; flex-direction: column; gap: 14px; }
        .lede { margin: 0; font-size: 14px; }
        .file { border: 1px solid var(--line-2); border-radius: var(--radius); background: #07080c; min-width: 0; overflow: hidden; }
        .tabs { display: flex; align-items: stretch; border-bottom: 1px solid var(--line); background: var(--bg-2); }
        .tl { display: flex; overflow-x: auto; scrollbar-width: none; flex: 1; min-width: 0; }
        .tl::-webkit-scrollbar { display: none; }
        .tl button {
          position: relative; border: 0; border-right: 1px solid var(--line); background: transparent; padding: 8px 11px; cursor: pointer; white-space: nowrap;
          font-family: var(--font-mono); font-size: 11.5px; color: var(--dim); transition: color 0.2s var(--ease), background 0.2s var(--ease);
        }
        .tl button:hover { color: var(--text); }
        .tl button[aria-selected="true"] { color: var(--text); background: #07080c; }
        .tl button[aria-selected="true"]::after { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 1px; background: var(--accent); }
        .tl button[aria-selected="true"]::before { content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 1px; background: #07080c; }
        .copy {
          flex: none; border: 1px solid var(--line-2); border-radius: 3px; background: transparent; padding: 2px 8px; margin: -3px 0; cursor: pointer;
          font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); transition: color 0.2s;
        }
        .copy:hover { color: var(--text); border-color: rgba(232, 235, 241, 0.45); }
        .copy.done { color: var(--ok); }
        .meta { display: flex; align-items: center; gap: 10px; padding: 6px 8px 6px 12px; font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); border-bottom: 1px dashed var(--line); }
        .sp { flex: 1; }
        .src { margin: 0; padding: 10px 0; overflow-x: auto; font-family: var(--font-mono); font-size: 12.5px; line-height: 1.7; }
        .src code { display: block; min-width: max-content; }
        .ln { display: flex; padding-right: 16px; }
        .ln.hl { background: rgba(250, 204, 21, 0.06); box-shadow: inset 2px 0 0 var(--accent); }
        .no { flex: none; width: 36px; padding-right: 12px; text-align: right; color: var(--dim); opacity: 0.6; user-select: none; font-variant-numeric: tabular-nums; }
        .lc { white-space: pre; color: #cfd5e1; }
        .ln.hl .lc { color: var(--text); }
        .hdrs { display: flex; flex-direction: column; gap: 8px; }
        .hk { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); }
        .hlist { display: flex; flex-wrap: wrap; gap: 6px; }
        .hlist code { font-family: var(--font-mono); font-size: 11.5px; color: var(--muted); border: 1px solid var(--line); border-radius: 3px; padding: 2px 7px; }
      `}</style>
    </div>
  );
}
