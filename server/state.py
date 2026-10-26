"""Shared server state: router, tiers, rate limits, spend cap, cumulative stats, sticky sessions."""
import hashlib
import json
import os
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path

from router.models import TIER_NAMES, cost_usd, load_tiers

ROOT = Path(__file__).resolve().parents[1]


def env_f(name, default):
    return float(os.environ.get(name, default))


DAILY_CAP = env_f("DAILY_SPEND_CAP_USD", 3.0)
MAX_REQUEST_CHARS = int(env_f("MAX_REQUEST_CHARS", 400_000))   # agent contexts are large
MAX_PROMPT_CHARS = int(env_f("MAX_PROMPT_CHARS", 4_000))       # live demo text box
SESSION_TTL_S = env_f("SESSION_TTL_S", 7200)
STATS_PATH = Path(os.environ.get("STATS_PATH", ROOT / "server" / "stats.json"))
PROXY_API_KEY = os.environ.get("PROXY_API_KEY", "")


class RateLimiter:
    def __init__(self, per_minute):
        self.per_minute, self.hits, self.lock = per_minute, defaultdict(deque), threading.Lock()

    def allow(self, key):
        now = time.time()
        with self.lock:
            q = self.hits[key]
            while q and now - q[0] > 60:
                q.popleft()
            if len(q) >= self.per_minute:
                return False
            q.append(now)
            return True


class Stats:
    """Cumulative routed-request stats (feeds the Savings Counter) + today's spend. Persisted to disk."""

    def __init__(self, path=STATS_PATH):
        self.path, self.lock = path, threading.Lock()
        self.d = {"requests_routed": 0, "savings_usd": 0.0, "spend_usd": 0.0, "by_tier": {t: 0 for t in TIER_NAMES},
                  "spend_by_day": {}, "since": datetime.now(timezone.utc).isoformat()}
        if path.exists():
            try:
                self.d.update(json.loads(path.read_text()))
            except Exception:
                pass

    @staticmethod
    def today():
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def spend_today(self):
        return self.d["spend_by_day"].get(self.today(), 0.0)

    def over_cap(self):
        return self.spend_today() >= DAILY_CAP

    def record(self, tier, cost, large_cost, routed: bool):
        with self.lock:
            self.d["spend_usd"] += cost
            day = self.today()
            self.d["spend_by_day"][day] = self.d["spend_by_day"].get(day, 0.0) + cost
            if routed:
                self.d["requests_routed"] += 1
                self.d["savings_usd"] += max(0.0, large_cost - cost)
                self.d["by_tier"][tier] = self.d["by_tier"].get(tier, 0) + 1
            try:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                tmp = self.path.with_suffix(".tmp")
                tmp.write_text(json.dumps(self.d))
                os.replace(tmp, self.path)
            except OSError:
                pass

    def public(self):
        return {"requests_routed": self.d["requests_routed"], "savings_usd": round(self.d["savings_usd"], 6),
                "by_tier": self.d["by_tier"], "since": self.d["since"]}


class Sessions:
    """Sticky routing: conversation key -> routing decision, with TTL."""

    def __init__(self, ttl=SESSION_TTL_S):
        self.ttl, self.d, self.lock = ttl, {}, threading.Lock()

    @staticmethod
    def key(messages, explicit=None):
        if explicit:
            return "h:" + explicit
        system = next((text_of(m) for m in messages if m.get("role") == "system"), "")
        first_user = next((text_of(m) for m in messages if m.get("role") == "user"), "")
        return "c:" + hashlib.sha256((system + "\x00" + first_user).encode()).hexdigest()[:32]

    def get(self, k):
        with self.lock:
            v = self.d.get(k)
            if v and time.time() - v["ts"] < self.ttl:
                return v
            self.d.pop(k, None)
            return None

    def put(self, k, v):
        with self.lock:
            now = time.time()
            if len(self.d) > 10_000:  # opportunistic cleanup
                for kk in [kk for kk, vv in self.d.items() if now - vv["ts"] >= self.ttl]:
                    del self.d[kk]
            self.d[k] = {**v, "ts": now}


def text_of(msg):
    c = msg.get("content")
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return "\n".join(p.get("text", "") for p in c if isinstance(p, dict) and p.get("type") == "text")
    return ""


def load_modes():
    """Proxy mode -> lambda, chosen by eval/evaluate.py (fixed rules); copied to router/serve/modes.json."""
    for p in (ROOT / "router" / "serve" / "modes.json", ROOT / "eval" / "results" / "all.json"):
        if p.exists():
            d = json.loads(p.read_text())
            m = d.get("modes") if "modes" in d else d
            if m:
                return {k: float(v) for k, v in m.items()}
    return {"auto": 0.25, "auto-quality": 0.1, "auto-cheap": 1.0}


class State:
    def __init__(self):
        self.tiers = load_tiers(require_tools=True)
        self.tiers.pop("_generation", None)
        self.modes = load_modes()
        self.stats, self.sessions = Stats(), Sessions()
        self.proxy_limit = RateLimiter(env_f("PROXY_RATE_PER_MIN", 120))
        self.route_limit = RateLimiter(env_f("ROUTE_RATE_PER_MIN", 30))
        self.answer_limit = RateLimiter(env_f("ANSWER_RATE_PER_MIN", 6))
        self.router = None  # loaded in background at startup
        self.router_error = None

    def load_router(self):
        try:
            from router.serve_policy import SERVE_DIR, MultiPolicy
            backend = os.environ.get("ROUTER_BACKEND", "auto")
            if backend == "onnx" or (backend == "auto" and (SERVE_DIR / "lower.onnx").exists()):
                from router.onnx_serve import OnnxMultiPolicy  # same decisions as torch, faster on CPU
                self.router = OnnxMultiPolicy(SERVE_DIR)
            else:
                self.router = MultiPolicy(device=os.environ.get("ROUTER_DEVICE", "cpu"))
        except Exception as e:  # noqa: BLE001 - surfaced via /health
            self.router_error = f"{type(e).__name__}: {e}"

    def api_key(self, tier):
        return os.environ.get(self.tiers[tier]["api_key_env"], "")

    def costs(self, tier, tin, tout):
        return cost_usd(self.tiers[tier], tin, tout), cost_usd(self.tiers["large"], tin, tout)


def client_ip(request):
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")
