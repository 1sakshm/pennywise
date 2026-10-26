"""Sample benchmark prompts with automatically checkable answers, plus the Alan-style
agent slice (bug-fix edits + failure triage built from MBPP by bug injection).

Writes data/processed/prompts.jsonl. Deterministic given config/train.yaml seed.
Usage: python data/build_prompts.py
"""
import ast
import json
import random
import re
import sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import yaml
from datasets import load_dataset

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from data.graders import TRIAGE_LABELS, run_python, tests_program  # noqa: E402

OUT = ROOT / "data" / "processed" / "prompts.jsonl"
CFG = yaml.safe_load(open(ROOT / "config" / "train.yaml"))
SEED = CFG["seed"]
N = CFG["data"]["per_source"]


# ---------------------------------------------------------------- benchmarks

def gsm8k(rng):
    ds = load_dataset("openai/gsm8k", "main", split="test")
    idx = rng.sample(range(len(ds)), N["gsm8k"])
    for i in idx:
        r = ds[i]
        yield {"id": f"gsm8k-{i}", "source": "gsm8k", "prompt": r["question"],
               "answer": r["answer"].split("####")[-1].strip().replace(",", "")}


def arc(rng):
    ds = load_dataset("allenai/ai2_arc", "ARC-Challenge", split="test")
    idx = rng.sample(range(len(ds)), N["arc"])
    for i in idx:
        r = ds[i]
        labels = r["choices"]["label"]
        letters = [chr(ord("A") + k) for k in range(len(labels))]  # normalise "1","2".. to A,B..
        opts = "\n".join(f"{L}. {t}" for L, t in zip(letters, r["choices"]["text"]))
        yield {"id": f"arc-{r['id']}", "source": "arc", "prompt": f"{r['question']}\n\n{opts}",
               "answer": letters[labels.index(r["answerKey"])]}


def math500(rng):
    """Hard math: MATH-500 levels 4-5, graded on the final \\boxed{} answer."""
    ds = [r for r in load_dataset("HuggingFaceH4/MATH-500", split="test") if int(r["level"]) >= 4]
    for r in rng.sample(ds, N["math"]):
        yield {"id": "math-" + r["unique_id"].replace("test/", "").replace(".json", "").replace("/", "-"),
               "source": "math", "prompt": r["problem"], "answer": r["answer"],
               "meta": {"level": int(r["level"]), "subject": r["subject"]}}


def mmlu_pro(rng):
    """Hard multiple choice: MMLU-Pro (up to 10 options)."""
    ds = load_dataset("TIGER-Lab/MMLU-Pro", split="test")
    for i in rng.sample(range(len(ds)), N["mmlu_pro"]):
        r = ds[i]
        opts = "\n".join(f"{chr(ord('A') + k)}. {o}" for k, o in enumerate(r["options"]))
        yield {"id": f"mmlu_pro-{r['question_id']}", "source": "mmlu_pro", "prompt": f"{r['question']}\n\n{opts}",
               "answer": r["answer"], "meta": {"category": r["category"]}}


def mbpp_rows(splits):
    rows = []
    for s in splits:
        rows += list(load_dataset("google-research-datasets/mbpp", "full", split=s))
    return rows


def mbpp_prompt(r):
    return f"{r['text']}\nYour code should pass these tests:\n" + "\n".join(r["test_list"])


def check_reference(rows):
    """Keep only MBPP rows whose reference solution passes its own tests."""
    def ok(r):
        rec = {"tests": r["test_list"], "test_setup": r["test_setup_code"]}
        return run_python(tests_program(r["code"], rec))[0]
    with ThreadPoolExecutor(8) as ex:
        flags = list(ex.map(ok, rows))
    return [r for r, f in zip(rows, flags) if f]


def mbpp(rng):
    rows = check_reference(mbpp_rows(["test"]))
    for r in rng.sample(rows, N["mbpp"]):
        yield {"id": f"mbpp-{r['task_id']}", "source": "mbpp", "prompt": mbpp_prompt(r),
               "answer": None, "tests": r["test_list"], "test_setup": r["test_setup_code"]}


# ---------------------------------------------------------------- bug injection

_OP_SWAP = {ast.Add: ast.Sub, ast.Sub: ast.Add, ast.Mult: ast.Add, ast.FloorDiv: ast.Mult,
            ast.Mod: ast.FloorDiv, ast.Lt: ast.Gt, ast.Gt: ast.Lt, ast.LtE: ast.GtE,
            ast.GtE: ast.LtE, ast.Eq: ast.NotEq, ast.NotEq: ast.Eq, ast.And: ast.Or, ast.Or: ast.And}


def _sites(tree, kind):
    out = []
    for node in ast.walk(tree):
        if kind == "off_by_one" and isinstance(node, ast.Constant) and type(node.value) is int:
            out.append(node)
        elif kind == "wrong_operator" and (
                (isinstance(node, ast.BinOp) and type(node.op) in _OP_SWAP)
                or (isinstance(node, ast.Compare) and type(node.ops[0]) in _OP_SWAP)
                or (isinstance(node, ast.BoolOp) and type(node.op) in _OP_SWAP)):
            out.append(node)
        elif kind == "inverted_condition" and isinstance(node, (ast.If, ast.While, ast.IfExp)):
            out.append(node)
        elif kind == "wrong_return" and isinstance(node, ast.Return) and node.value is not None:
            out.append(node)
    return out


def mutate(code, kind, rng):
    """Return mutated source for one injected bug of `kind`, or None if no site.
    kind "two_bugs" applies two different semantic mutations in sequence."""
    if kind == "two_bugs":
        k1, k2 = rng.sample(["off_by_one", "wrong_operator", "inverted_condition", "wrong_return"], 2)
        first = mutate(code, k1, rng)
        return mutate(first, k2, rng) if first else None
    if kind == "syntax_error":
        lines = code.split("\n")
        cands = [i for i, l in enumerate(lines) if l.rstrip().endswith(":")
                 and l.strip().split(" ")[0] in ("def", "if", "for", "while", "elif", "else:", "else")]
        if not cands:
            return None
        i = rng.choice(cands)
        lines[i] = lines[i].rstrip()[:-1]
        return "\n".join(lines)
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return None
    sites = _sites(tree, kind)
    if not sites:
        return None
    node = rng.choice(sites)
    if kind == "off_by_one":
        node.value = node.value + rng.choice([-1, 1])
    elif kind == "wrong_operator":
        if isinstance(node, ast.Compare):
            node.ops[0] = _OP_SWAP[type(node.ops[0])]()
        else:
            node.op = _OP_SWAP[type(node.op)]()
    elif kind == "inverted_condition":
        node.test = ast.UnaryOp(op=ast.Not(), operand=node.test)
    elif kind == "wrong_return":
        v = node.value
        if isinstance(v, ast.Constant) and isinstance(v.value, bool):
            v.value = not v.value
        else:
            node.value = ast.Constant(value=None)
    return ast.unparse(ast.fix_missing_locations(tree))


def inject(rows, kinds_quota, rng):
    """Produce (row, kind, buggy_code, test_output) with buggy code that really fails tests."""
    cands = []
    for kind, q in kinds_quota.items():
        pool = rows[:]
        rng.shuffle(pool)
        for r in pool[: q * 3]:  # oversample, failures get dropped
            b = mutate(r["code"], kind, random.Random(f"{SEED}-{r['task_id']}-{kind}"))
            if b and b.strip() != r["code"].strip():
                cands.append((r, kind, b))

    def run(c):
        r, kind, b = c
        ok, out = run_python(tests_program(b, {"tests": r["test_list"], "test_setup": r["test_setup_code"]}))
        out = re.sub(r'File "[^"]*prog\.py"', 'File "prog.py"', out)  # no local temp paths in the dataset
        return None if ok else (r, kind, b, out)

    with ThreadPoolExecutor(8) as ex:
        res = [x for x in ex.map(run, cands) if x]
    picked, used, per = [], set(), Counter()
    for r, kind, b, out in res:
        if per[kind] < kinds_quota[kind] and (r["task_id"], kind) not in used:
            picked.append((r, kind, b, out))
            used.add((r["task_id"], kind))
            per[kind] += 1
    return picked


def alan_slice(rng):
    rows = check_reference(mbpp_rows(["train", "validation", "prompt"]))
    # harder slice: only the longer half of MBPP functions (more code to read, more places to hide a bug)
    med = sorted(len(r["code"]) for r in rows)[len(rows) // 2]
    rows = [r for r in rows if len(r["code"]) >= med]
    rng.shuffle(rows)
    half = len(rows) // 2
    fix_rows, tri_rows = rows[:half], rows[half:]  # disjoint functions per sub-slice

    bug_kinds = [k for k in TRIAGE_LABELS if k != "syntax_error"]
    n_two = N["alan_bugfix"] // 2  # half the bug-fix prompts carry two independent bugs
    q = (N["alan_bugfix"] - n_two) // len(bug_kinds)
    for r, kind, b, _ in inject(fix_rows, {**{k: q for k in bug_kinds}, "two_bugs": n_two}, rng):
        n_bugs = "two independent bugs" if kind == "two_bugs" else "exactly one bug"
        yield {"id": f"alan_bugfix-{r['task_id']}-{kind}", "source": "alan_bugfix",
               "prompt": (f"This function is supposed to: {r['text']}\n"
                          f"It contains {n_bugs}. Fix it and return the full corrected function.\n\n"
                          f"```python\n{b}\n```\n\nIt must pass, for example:\n{r['test_list'][0]}"),
               "answer": None, "tests": r["test_list"], "test_setup": r["test_setup_code"],
               "meta": {"bug_kind": kind}}

    q = N["alan_triage"] // len(TRIAGE_LABELS)
    for r, kind, b, out in inject(tri_rows, {k: q for k in TRIAGE_LABELS}, rng):
        yield {"id": f"alan_triage-{r['task_id']}-{kind}", "source": "alan_triage",
               "prompt": (f"A CI run failed. The function under test was meant to: {r['text']}\n\n"
                          f"```python\n{b}\n```\n\nTest output:\n```\n{out.strip()[-600:]}\n```\n\n"
                          f"Classify the single injected bug as exactly one of: {', '.join(TRIAGE_LABELS)}."),
               "answer": kind, "meta": {"bug_kind": kind}}


# ---------------------------------------------------------------- split + write

def split(records, rng):
    fr = CFG["data"]["split"]
    by_src = {}
    for r in records:
        by_src.setdefault(r["source"], []).append(r)
    for src, rs in by_src.items():
        rs.sort(key=lambda r: r["id"])
        rng.shuffle(rs)
        n_tr, n_va = round(len(rs) * fr[0]), round(len(rs) * fr[1])
        for i, r in enumerate(rs):
            r["split"] = "train" if i < n_tr else "val" if i < n_tr + n_va else "test"
    return records


def main():
    recs = []
    for name, fn in [("gsm8k", gsm8k), ("math", math500), ("arc", arc), ("mmlu_pro", mmlu_pro), ("mbpp", mbpp),
                     ("alan", alan_slice)]:
        got = list(fn(random.Random(f"{SEED}-{name}")))
        print(f"{name}: {len(got)}", flush=True)
        recs += got
    recs = split(recs, random.Random(SEED))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        for r in recs:
            f.write(json.dumps(r) + "\n")
    c = Counter((r["source"], r["split"]) for r in recs)
    print(f"\nwrote {len(recs)} prompts to {OUT.relative_to(ROOT)} (seed={SEED})")
    for src in sorted({r['source'] for r in recs}):
        print(f"  {src:12s} train={c[(src,'train')]:4d} val={c[(src,'val')]:4d} test={c[(src,'test')]:4d}")


if __name__ == "__main__":
    main()
