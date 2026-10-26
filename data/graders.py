"""Per-source answer checking. Every grader takes (record, raw_output) -> bool."""
import os
import re
import subprocess
import sys
import tempfile

TIMEOUT_S = 5

# Prelude for sandboxed code: blocks sockets so tested code can't reach the network.
# (Windows has no cheap network namespace; this plus `python -I` in a temp dir is the
# conservative option. Documented in docs/DECISIONS.md.)
_SANDBOX_PRELUDE = """
import socket as _s
def _blocked(*a, **k):
    raise OSError("network disabled in grader sandbox")
_s.socket = _blocked
_s.create_connection = _blocked
"""

TRIAGE_LABELS = ["syntax_error", "off_by_one", "wrong_operator", "inverted_condition", "wrong_return"]


def _last_number(text: str):
    nums = re.findall(r"-?\d[\d,]*\.?\d*", text)
    if not nums:
        return None
    try:
        return float(nums[-1].replace(",", "").rstrip("."))
    except ValueError:
        return None


def extract_final_answer_line(raw: str) -> str:
    """Text after the last 'Answer:' marker, else the whole output."""
    m = re.findall(r"answer\s*[:：]\s*(.+)", raw, flags=re.IGNORECASE)
    return m[-1].strip() if m else raw


def grade_gsm8k(rec, raw: str) -> bool:
    pred = _last_number(extract_final_answer_line(raw))
    return pred is not None and abs(pred - float(rec["answer"])) < 1e-6


def grade_choice(rec, raw: str) -> bool:
    """ARC: single letter option."""
    line = extract_final_answer_line(raw)
    m = re.search(r"\b([A-E])\b", line.upper())
    return bool(m) and m.group(1) == rec["answer"]


def grade_triage(rec, raw: str) -> bool:
    line = extract_final_answer_line(raw).lower()
    hits = [lab for lab in TRIAGE_LABELS if lab in line or lab.replace("_", " ") in line]
    return len(hits) == 1 and hits[0] == rec["answer"]


def extract_code(raw: str) -> str:
    blocks = re.findall(r"```(?:python|py)?\s*\n(.*?)```", raw, flags=re.DOTALL)
    if blocks:
        return max(blocks, key=len)
    return raw


def run_python(code: str, timeout: float = TIMEOUT_S):
    """Run code in a temp dir with an isolated interpreter. Returns (ok, output)."""
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "prog.py")
        with open(path, "w", encoding="utf-8") as f:
            f.write(_SANDBOX_PRELUDE + "\n" + code)
        try:
            p = subprocess.run(
                [sys.executable, "-I", path], cwd=d, capture_output=True, text=True,
                timeout=timeout, env={"PATH": os.environ.get("PATH", ""), "SYSTEMROOT": os.environ.get("SYSTEMROOT", "")},
            )
        except subprocess.TimeoutExpired:
            return False, "TIMEOUT"
        return p.returncode == 0, (p.stdout + p.stderr)[-2000:]


def tests_program(code: str, rec) -> str:
    return "\n".join([rec.get("test_setup", ""), code, "", *rec["tests"]])


def grade_code(rec, raw: str) -> bool:
    ok, _ = run_python(tests_program(extract_code(raw), rec))
    return ok


GRADERS = {
    "gsm8k": grade_gsm8k,
    "arc": grade_choice,
    "mbpp": grade_code,
    "alan_bugfix": grade_code,
    "alan_triage": grade_triage,
}


def grade(rec, raw: str) -> bool:
    try:
        return bool(GRADERS[rec["source"]](rec, raw or ""))
    except Exception:
        return False
