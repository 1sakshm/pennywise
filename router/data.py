"""Load prompts + outcomes into aligned arrays; shared reward and metrics."""
import json
from dataclasses import dataclass

import numpy as np

from router.models import TIER_NAMES, load_tiers
from router.paths import OUTCOMES, PROMPTS


@dataclass
class Table:
    ids: np.ndarray        # [N] prompt ids
    prompts: list          # [N] prompt text
    source: np.ndarray     # [N]
    split: np.ndarray      # [N] train/val/test
    correct: np.ndarray    # [N, 3] bool, tier order = TIER_NAMES
    cost: np.ndarray       # [N, 3] USD
    cost_ref: float        # mean cost of always-large on the train split (makes lambda unitless)

    def idx(self, split):
        return np.where(self.split == split)[0]

    def oracle(self):
        """Cheapest tier that was correct; `large` if none was."""
        first = np.argmax(self.correct, axis=1)
        return np.where(self.correct.any(1), first, 2)

    def reward(self, actions, lam, rows=None):
        rows = np.arange(len(self.ids)) if rows is None else rows
        a = np.asarray(actions)
        return self.correct[rows, a].astype(float) - lam * self.cost[rows, a] / self.cost_ref


def load_table(require_complete=True) -> Table:
    recs = [json.loads(l) for l in open(PROMPTS, encoding="utf-8")]
    pos = {r["id"]: i for i, r in enumerate(recs)}
    n = len(recs)
    models = {t: c["model"] for t, c in load_tiers().items() if t in TIER_NAMES}  # ignore rows from swapped-out models
    correct = np.zeros((n, 3), bool)
    cost = np.full((n, 3), np.nan)
    for line in open(OUTCOMES, encoding="utf-8"):
        o = json.loads(line)
        if o["prompt_id"] in pos and o.get("model") == models[o["tier"]]:
            i, t = pos[o["prompt_id"]], TIER_NAMES.index(o["tier"])
            correct[i, t], cost[i, t] = o["correct"], o["cost_usd"]
    have = ~np.isnan(cost).any(1)
    if require_complete and not have.all():
        print(f"WARNING: {(~have).sum()} prompts lack outcomes for all 3 tiers; dropping them")
    keep = np.where(have)[0]
    split = np.array([recs[i]["split"] for i in keep])
    cost_k = cost[keep]
    return Table(
        ids=np.array([recs[i]["id"] for i in keep]), prompts=[recs[i]["prompt"] for i in keep],
        source=np.array([recs[i]["source"] for i in keep]), split=split, correct=correct[keep],
        cost=cost_k, cost_ref=float(cost_k[split == "train", 2].mean()))


def metrics(tab: Table, actions, rows):
    a = np.asarray(actions)
    acc = tab.correct[rows, a].mean()
    cost = tab.cost[rows, a].mean()
    return {"accuracy": float(acc), "mean_cost_usd": float(cost),
            "cost_vs_large": float(cost / tab.cost[rows, 2].mean()),
            "action_share": (np.bincount(a, minlength=3) / len(a)).round(4).tolist()}
