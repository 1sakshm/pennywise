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
    """ARC (A-E) / MMLU-Pro (A-J): single letter option after 'Answer:'."""
    line = extract_final_answer_line(raw)
    m = re.search(r"\b([A-J])\b", line.upper())
    return bool(m) and m.group(1) == rec["answer"]


def last_boxed(text: str):
    r"""Content of the last \boxed{...} (brace-matched), or None."""
    i = text.rfind(r"\boxed")
    j = text.find("{", i) if i >= 0 else -1
    if j < 0:
        return None
    depth = 0
    for k in range(j, len(text)):
        if text[k] == "{":
            depth += 1
        elif text[k] == "}":
            depth -= 1
            if depth == 0:
                return text[j + 1:k]
    return None


_DROP = [r"\left", r"\right", r"\!", r"\,", r"\;", r"\:", "^\\circ", "^{\\circ}", r"\%", "%", r"\$", "$", r"\displaystyle"]


def norm_math(a: str) -> str:
    """Conservative LaTeX answer normalisation for MATH-style answers (see DECISIONS.md)."""
    a = a.strip()
    a = re.sub(r"\\(?:text|mathrm|textbf|mbox)\{([^}]*)\}", r"\1", a)
    for t in _DROP:
        a = a.replace(t, "")
    a = a.replace(r"\dfrac", r"\frac").replace(r"\tfrac", r"\frac")
    a = re.sub(r"\\frac(\d)(\d)", r"\\frac{\1}{\2}", a)
    a = re.sub(r"\\sqrt(\d)", r"\\sqrt{\1}", a)
    a = re.sub(r"\s+", "", a).rstrip(".")
    a = re.sub(r"^[a-zA-Z]=", "", a)  # "x=5" -> "5"
    if re.fullmatch(r"-?\d+\.0+", a):
        a = a.split(".")[0]
    return a


def _as_number(a: str):
    m = re.fullmatch(r"(-?)\\frac\{(-?\d+)\}\{(-?\d+)\}", a)
    try:
        if m:
            v = int(m.group(2)) / int(m.group(3))
            return -v if m.group(1) else v
        if re.fullmatch(r"-?\d+/\d+", a):
            n, d = a.split("/")
            return int(n) / int(d)
        return float(a.replace(",", ""))
    except (ValueError, ZeroDivisionError):
        return None


def grade_math(rec, raw: str) -> bool:
    pred = last_boxed(raw)
    if pred is None:
        pred = extract_final_answer_line(raw)
    p, g = norm_math(pred), norm_math(rec["answer"])
    if p == g:
        return True
    pn, gn = _as_number(p), _as_number(g)
    return pn is not None and gn is not None and abs(pn - gn) < 1e-6 * max(1, abs(gn))


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
    "mmlu_pro": grade_choice,
    "math": grade_math,
    "mbpp": grade_code,
    "alan_bugfix": grade_code,
    "alan_triage": grade_triage,
}


def grade(rec, raw: str) -> bool:
    try:
        return bool(GRADERS[rec["source"]](rec, raw or ""))
    except Exception:
        return False
