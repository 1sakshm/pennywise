"""Fast unit checks (no network, no GPU): graders, bug injection, sticky-session keys, reward/oracle.
    python -m tests.test_units
"""
import random
import sys

import numpy as np

from data.build_prompts import mutate
from data.graders import grade, run_python
from router.data import Table
from server.state import Sessions

fails = 0


def check(name, cond):
    global fails
    print(("PASS " if cond else "FAIL ") + name)
    fails += not cond


# ---- graders
check("gsm8k: final 'Answer:' number", grade({"source": "gsm8k", "answer": "18"}, "16-3-4=9, 9*2=18\nAnswer: $18"))
check("gsm8k: comma thousands", grade({"source": "gsm8k", "answer": "1200"}, "Answer: 1,200"))
check("gsm8k: wrong number rejected", not grade({"source": "gsm8k", "answer": "18"}, "Answer: 17"))
check("arc: letter after Answer:", grade({"source": "arc", "answer": "C"}, "Reasoning...\nAnswer: C"))
check("arc: wrong letter rejected", not grade({"source": "arc", "answer": "C"}, "Answer: B"))
check("triage: exact label", grade({"source": "alan_triage", "answer": "off_by_one"}, "Answer: off_by_one"))
check("triage: spaced label", grade({"source": "alan_triage", "answer": "wrong_operator"}, "Answer: wrong operator"))
check("triage: two labels = wrong", not grade({"source": "alan_triage", "answer": "off_by_one"}, "Answer: off_by_one or wrong_return"))
rec = {"source": "mbpp", "tests": ["assert add(2, 3) == 5"], "test_setup": ""}
check("code: passing solution", grade(rec, "```python\ndef add(a, b):\n    return a + b\n```"))
check("code: failing solution", not grade(rec, "```python\ndef add(a, b):\n    return a - b\n```"))
check("code: infinite loop times out", not grade(rec, "```python\ndef add(a, b):\n    while True: pass\n```"))
check("code: network blocked in sandbox", not run_python("import socket\nsocket.create_connection(('example.com', 80))")[0])

# ---- bug injection
src = "def f(xs):\n    total = 0\n    for i in range(len(xs)):\n        if xs[i] > 0:\n            total += xs[i]\n    return total\n"
for kind in ("off_by_one", "wrong_operator", "inverted_condition", "wrong_return", "syntax_error"):
    m = mutate(src, kind, random.Random(0))
    check(f"mutate {kind}: changes the code", m is not None and m.strip() != src.strip())

# ---- sticky session keys
a = [{"role": "system", "content": "S"}, {"role": "user", "content": "fix bug"}]
b = a + [{"role": "assistant", "content": None, "tool_calls": [{"id": "1"}]}, {"role": "tool", "tool_call_id": "1", "content": "x"}]
check("session key stable across tool turns", Sessions.key(a) == Sessions.key(b))
check("session key differs for new conversation", Sessions.key(a) != Sessions.key([{"role": "user", "content": "other"}]))
check("explicit session header wins", Sessions.key(a, "abc") == "h:abc")

# ---- oracle / reward
t = Table(ids=np.array(["a", "b", "c"]), prompts=["", "", ""], source=np.array(["x"] * 3), split=np.array(["train"] * 3),
          correct=np.array([[1, 1, 1], [0, 1, 1], [0, 0, 0]], bool), cost=np.array([[1, 2, 4]] * 3, float), cost_ref=4.0)
check("oracle = cheapest correct, large if none", t.oracle().tolist() == [0, 1, 2])
check("reward = correct - lam*cost/ref", np.allclose(t.reward([0, 2, 2], 1.0), [1 - 0.25, 1 - 1.0, 0 - 1.0]))

print("ALL PASSED" if not fails else f"{fails} FAILED")
sys.exit(1 if fails else 0)
