"use client";
import { useEffect, useRef, useState } from "react";

const REPO = process.env.NEXT_PUBLIC_REPO_URL || "https://github.com/1sakshm/pennywise";

type OS = "Windows" | "macOS / Linux";
const FORMS: Record<OS, { command: string; args: string[] }> = {
  Windows: { command: "cmd", args: ["/c", "npx", "-y", "pennywise-mcp"] },
  "macOS / Linux": { command: "npx", args: ["-y", "pennywise-mcp"] },
};

// Recorded in the Alan desktop app (Alan Code · Auto Router), Oct 27 2026. Verbatim tool output.
const ROUTE_OUT = `{"tier":"medium","probabilities":{"small":0.1394,"medium":0.8558,"large":0.0047},
 "confidence":0.8558,"lambda":0.5,"mode":"auto","latency_ms":345,"model":"openai/gpt-oss-20b"}`;
const ASK_OUT = `pennywise: {"routed_to":"medium","answered_by":"medium","model":"openai/gpt-oss-20b",
 "escalated":null,"tokens":{"in":75,"out":91},"list_price_usd":0.00001,"seconds":20.81}`;

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  return (
    <button
      className={`cp ${done ? "done" : ""}`}
      aria-label={`Copy ${label}`}
      onClick={() =>
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          if (t.current) clearTimeout(t.current);
          t.current = setTimeout(() => setDone(false), 1400);
        }, () => {})
      }
    >
      {done ? "✓" : "copy"}
      <style jsx>{`
        .cp { flex: none; border: 1px solid var(--line-2); border-radius: 3px; background: transparent; padding: 1px 7px; cursor: pointer;
          font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
        .cp:hover { color: var(--text); }
        .cp.done { color: var(--ok); }
      `}</style>
    </button>
  );
}

export default function AlanConnector() {
  const [os, setOs] = useState<OS>("Windows");
  const f = FORMS[os];
  return (
    <div className="ac">
      <div className="panel cfg">
        <div className="fig-head">
          <span className="fig-id">CONNECTOR</span>
          <span>Alan → Settings → Plugins → MCP → Add custom connector</span>
        </div>
        <div className="body">
          <div className="os" role="tablist" aria-label="Operating system">
            {(Object.keys(FORMS) as OS[]).map((k) => (
              <button key={k} role="tab" aria-selected={k === os} onClick={() => setOs(k)}>
                {k}
              </button>
            ))}
          </div>
          <dl className="fields">
            <div><dt>Type</dt><dd><span className="v">Command</span></dd></div>
            <div><dt>Name</dt><dd><span className="v">pennywise</span></dd></div>
            <div><dt>Command</dt><dd><code>{f.command}</code><Copy text={f.command} label="command" /></dd></div>
            <div>
              <dt>Arguments<small>one per line</small></dt>
              <dd className="args">
                <pre>{f.args.join("\n")}</pre>
                <Copy text={f.args.join("\n")} label="arguments" />
              </dd>
            </div>
            <div><dt>Environment</dt><dd><code>NVIDIA_API_KEY = ${"{NVIDIA_API_KEY}"}</code><Copy text="${NVIDIA_API_KEY}" label="environment value" /></dd></div>
          </dl>
          <ol className="steps">
            <li>Save, then click <b>Enter API key</b> and paste your NVIDIA key (free at build.nvidia.com). Only <code>ask_routed</code> needs it.</li>
            <li>Start a new chat. Alan launches the server per agent run; the router runs on your CPU (~0.3 s a decision).</li>
            <li>First run downloads the 2 GB router once from Hugging Face, sha256-verified. Prefetch: <code>npx -y pennywise-mcp --download</code></li>
          </ol>
          {os === "Windows" && (
            <p className="note">
              Why <code>cmd /c</code>: on Windows <code>npx</code> is a <code>.cmd</code> script. Alan starts commands without a shell and won&apos;t take a full path, so a bare{" "}
              <code>npx</code> never launches and the agent sees no tools.
            </p>
          )}
        </div>
      </div>

      <div className="panel run">
        <div className="fig-head">
          <span className="fig-id">IN ALAN</span>
          <span>Alan Code · Auto Router · recorded Oct 27</span>
        </div>
        <div className="body">
          <div className="msg user">Use the pennywise route tool on: &ldquo;design a distributed rate limiter with exact per-user quotas across regions&rdquo;</div>
          <div className="call">
            <div className="ch"><span className="led" />pennywise.route<span className="ok">completed</span></div>
            <pre>{ROUTE_OUT}</pre>
          </div>
          <div className="msg user">Use pennywise ask_routed: &ldquo;Explain why the sky is blue in one sentence.&rdquo;</div>
          <div className="call">
            <div className="ch"><span className="led" />pennywise.ask_routed<span className="ok">completed</span></div>
            <p className="ans">Because sunlight is scattered by air molecules, and Rayleigh scattering is far more efficient at shorter (blue) wavelengths…</p>
            <pre>{ASK_OUT}</pre>
          </div>
          <p className="honest">
            Verbatim tool output. Honest note: the default <code>auto</code> policy sends most requests to the medium tier (as here); <code>auto-quality</code> leans to large.
            The 3.4× agent speed-up comes from the full proxy (routing + tool-call cascade), not from this one call.
          </p>
          <div className="links">
            <a className="btn" href="https://www.npmjs.com/package/pennywise-mcp" target="_blank" rel="noreferrer">npm: pennywise-mcp ↗</a>
            <a className="btn" href="https://huggingface.co/SuckSome/pennywise-router" target="_blank" rel="noreferrer">Weights on Hugging Face ↗</a>
            <a className="btn" href={`${REPO}/blob/main/docs/ALAN_MCP_CONNECTOR.md`} target="_blank" rel="noreferrer">Setup notes ↗</a>
          </div>
        </div>
      </div>

      <style jsx>{`
        .ac { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; }
        @media (max-width: 900px) { .ac { grid-template-columns: 1fr; } }
        .panel { min-width: 0; }
        .body { padding: clamp(14px, 2.4vw, 22px); display: flex; flex-direction: column; gap: 14px; }
        code { font-family: var(--font-mono); font-size: 12px; color: var(--text); }
        .os { display: inline-flex; align-self: flex-start; border: 1px solid var(--line-2); border-radius: 3px; overflow: hidden; }
        .os button { border: 0; background: transparent; padding: 6px 12px; cursor: pointer; font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.06em;
          text-transform: uppercase; color: var(--dim); }
        .os button[aria-selected="true"] { background: rgba(250, 204, 21, 0.1); color: var(--accent); }
        .fields { margin: 0; border: 1px solid var(--line-2); border-radius: var(--radius); background: #07080c; }
        .fields > div { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 12px; padding: 9px 12px; border-bottom: 1px dashed var(--line); align-items: start; }
        .fields > div:last-child { border-bottom: 0; }
        dt { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); padding-top: 3px; }
        dt small { display: block; text-transform: none; letter-spacing: 0; font-size: 10px; opacity: 0.8; }
        dd { margin: 0; display: flex; align-items: center; justify-content: space-between; gap: 10px; min-width: 0; }
        dd code { overflow-wrap: anywhere; }
        .v { font-family: var(--font-mono); font-size: 12px; color: var(--muted); }
        .args { align-items: flex-start; }
        .args pre { margin: 0; font-family: var(--font-mono); font-size: 12px; line-height: 1.6; color: var(--accent); }
        .steps { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; color: var(--muted); }
        .steps b { color: var(--text); font-weight: 500; }
        .note { margin: 0; font-size: 12.5px; color: var(--dim); border-left: 2px solid var(--line-2); padding-left: 10px; }
        .msg.user { align-self: flex-end; max-width: 92%; background: var(--bg-2); border: 1px solid var(--line); border-radius: 10px 10px 2px 10px; padding: 8px 12px; font-size: 13px; color: var(--text); }
        .call { border: 1px solid var(--line-2); border-radius: var(--radius); background: #07080c; overflow: hidden; }
        .ch { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-bottom: 1px dashed var(--line); font-family: var(--font-mono); font-size: 11.5px; color: var(--text); }
        .led { width: 6px; height: 6px; border-radius: 50%; background: var(--medium); box-shadow: 0 0 8px var(--medium); }
        .ok { margin-left: auto; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ok); }
        .call pre { margin: 0; padding: 9px 10px; font-family: var(--font-mono); font-size: 11px; line-height: 1.6; color: #cfd5e1; white-space: pre-wrap; overflow-wrap: anywhere; }
        .ans { margin: 0; padding: 9px 10px 0; font-size: 13px; color: var(--text); }
        .honest { margin: 0; font-size: 12.5px; color: var(--dim); }
        .links { display: flex; flex-wrap: wrap; gap: 8px; }
      `}</style>
    </div>
  );
}
