"""Tier config loading and OpenAI-compatible clients. Model names live in config/models.yaml only."""
import os
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
TIER_NAMES = ["small", "medium", "large"]


def _load_dotenv():
    p = ROOT / ".env"
    if p.exists():
        for line in open(p, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def load_tiers(require_tools: bool = False):
    """Returns {tier: cfg} plus '_generation'. Refuses to run on unfilled config."""
    _load_dotenv()
    path = os.environ.get("MODELS_CONFIG") or ROOT / "config" / "models.yaml"
    cfg = yaml.safe_load(open(path))
    tiers = cfg["tiers"]
    for name in TIER_NAMES:
        t = tiers[name]
        missing = [k for k, v in t.items() if v == "FILL_ME"]
        if missing:
            raise SystemExit(f"config/models.yaml: tier '{name}' has unfilled fields {missing}")
        if require_tools and not t.get("supports_tools"):
            raise SystemExit(f"config/models.yaml: tier '{name}' lacks supports_tools: true (required for agent routing)")
    tiers["_generation"] = cfg.get("generation", {})
    return tiers


def cost_usd(tier, input_tokens: int, output_tokens: int) -> float:
    return (input_tokens * float(tier["price_in_per_m"]) + output_tokens * float(tier["price_out_per_m"])) / 1e6


def make_client(tier, async_: bool = False):
    from openai import AsyncOpenAI, OpenAI
    key = os.environ.get(tier["api_key_env"], "")
    if not key:
        raise SystemExit(f"env var {tier['api_key_env']} is not set (see .env.example)")
    cls = AsyncOpenAI if async_ else OpenAI
    return cls(base_url=tier["base_url"], api_key=key, max_retries=0)
