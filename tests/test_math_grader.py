"""Math / MMLU-Pro grader checks.  python -m tests.test_math_grader"""
import sys

from data.graders import grade

CASES = [  # (gold, model output, expected)
    (r"\left( 3, \frac{\pi}{2} \right)", r"so the point is \boxed{(3,\frac{\pi}{2})}", True),
    (r"\frac{14}{3}", r"Answer: \boxed{\dfrac{14}{3}}", True),
    ("0.5", r"\boxed{\frac12}", True),
    ("10", r"the angle is \boxed{10^\circ}", True),
    ("5", r"\boxed{x=5}", True),
    (r"\text{(C)}", r"\boxed{\text{(C)}}", True),
    ("2\\sqrt{3}", r"\boxed{2\sqrt3}", True),
    ("3", r"\boxed{4}", False),
    (r"\frac{1}{2}", r"no box here, Answer: 1/2", True),
    ("3", r"\boxed{3} and later \boxed{5}", False),  # last box counts
]
fails = 0
for gold, out, want in CASES:
    got = grade({"source": "math", "answer": gold}, out)
    ok = got == want
    fails += not ok
    print(("PASS " if ok else "FAIL ") + f"math {gold!r} vs {out!r} -> {got}")
for out, want in [("reasoning... Answer: I", True), ("Answer: J", False), ("Answer: (I)", True)]:
    got = grade({"source": "mmlu_pro", "answer": "I"}, out)
    fails += got != want
    print(("PASS " if got == want else "FAIL ") + f"mmlu_pro {out!r} -> {got}")
print("ALL PASSED" if not fails else f"{fails} FAILED")
sys.exit(1 if fails else 0)
