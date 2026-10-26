"""Agent coding tasks for the router benchmark (Pennywise vs. Alan Code Auto Router).

Each task is a tiny repo: source file(s) with a bug or a stub, a pytest suite, and one instruction.
"Merged" = the suite passes after the agent's edit and the test file is unchanged.
Difficulty is spread on purpose (easy -> hard) so routing decisions matter.
"""

TASKS = {
    # ---- easy: a small model should handle these
    "off_by_one": {
        "level": "easy",
        "files": {"mathx.py": 'def sum_to(n):\n    """Return 1 + 2 + ... + n."""\n    return sum(range(1, n))\n',
                  "test_mathx.py": "from mathx import sum_to\n\ndef test_sum():\n    assert sum_to(1) == 1\n    assert sum_to(4) == 10\n    assert sum_to(0) == 0\n"},
        "ask": "The tests in test_mathx.py fail. Fix the bug in mathx.py so `python -m pytest -q` passes. Do not edit the tests.",
    },
    "slugify": {
        "level": "easy",
        "files": {"text.py": "def slugify(s):\n    raise NotImplementedError\n",
                  "test_text.py": "from text import slugify\n\ndef test_slug():\n    assert slugify('Hello World') == 'hello-world'\n"
                                  "    assert slugify('  Many   spaces  ') == 'many-spaces'\n    assert slugify('C++ & Rust!') == 'c-rust'\n"},
        "ask": "Implement slugify in text.py (lowercase, words joined by single hyphens, non-alphanumerics removed) so `python -m pytest -q` passes. Do not edit the tests.",
    },
    "palindrome": {
        "level": "easy",
        "files": {"pal.py": "def is_palindrome(s):\n    return s == s[::-1]\n",
                  "test_pal.py": "from pal import is_palindrome\n\ndef test_pal():\n    assert is_palindrome('A man, a plan, a canal: Panama')\n"
                                 "    assert not is_palindrome('hello')\n    assert is_palindrome('')\n"},
        "ask": "Make is_palindrome in pal.py ignore case and non-alphanumeric characters so `python -m pytest -q` passes. Do not edit the tests.",
    },
    # ---- medium
    "parse_kv": {
        "level": "medium",
        "files": {"kv.py": "def parse_kv(line):\n    \"\"\"Parse 'a=1;b=2' into a dict of strings.\"\"\"\n    out = {}\n    for part in line.split(';'):\n"
                           "        k, v = part.split('=')\n        out[k.strip()] = v.strip()\n    return out\n",
                  "test_kv.py": "from kv import parse_kv\n\ndef test_basic():\n    assert parse_kv('a=1;b=2') == {'a': '1', 'b': '2'}\n\n"
                                "def test_equals_in_value():\n    assert parse_kv('url=http://x?y=1') == {'url': 'http://x?y=1'}\n\n"
                                "def test_trailing():\n    assert parse_kv('a=1;') == {'a': '1'}\n"},
        "ask": "test_kv.py fails: values may contain '=' and lines may end with ';'. Fix kv.py so `python -m pytest -q` passes. Do not edit the tests.",
    },
    "merge_intervals": {
        "level": "medium",
        "files": {"intervals.py": "def merge(intervals):\n    \"\"\"Merge overlapping [start, end] intervals; return them sorted.\"\"\"\n    out = []\n"
                                  "    for s, e in intervals:\n        if out and s < out[-1][1]:\n            out[-1][1] = e\n        else:\n            out.append([s, e])\n    return out\n",
                  "test_intervals.py": "from intervals import merge\n\ndef test_merge():\n    assert merge([[1, 3], [2, 6], [8, 10]]) == [[1, 6], [8, 10]]\n"
                                       "    assert merge([[1, 4], [4, 5]]) == [[1, 5]]\n    assert merge([[5, 7], [1, 2]]) == [[1, 2], [5, 7]]\n"
                                       "    assert merge([[1, 10], [2, 3]]) == [[1, 10]]\n    assert merge([]) == []\n"},
        "ask": "merge() in intervals.py has several bugs (unsorted input, touching intervals, contained intervals). Fix it so `python -m pytest -q` passes. Do not edit the tests.",
    },
    "roman": {
        "level": "medium",
        "files": {"roman.py": "def to_roman(n):\n    raise NotImplementedError\n\n\ndef from_roman(s):\n    raise NotImplementedError\n",
                  "test_roman.py": "import pytest\nfrom roman import to_roman, from_roman\n\n"
                                   "@pytest.mark.parametrize('n,s', [(1, 'I'), (4, 'IV'), (9, 'IX'), (14, 'XIV'), (40, 'XL'), (90, 'XC'), (400, 'CD'), (1994, 'MCMXCIV'), (3999, 'MMMCMXCIX')])\n"
                                   "def test_both(n, s):\n    assert to_roman(n) == s\n    assert from_roman(s) == n\n\n"
                                   "def test_roundtrip():\n    assert all(from_roman(to_roman(i)) == i for i in range(1, 4000))\n\n"
                                   "def test_invalid():\n    with pytest.raises(ValueError):\n        to_roman(0)\n    with pytest.raises(ValueError):\n        from_roman('IIII')\n"},
        "ask": "Implement to_roman and from_roman in roman.py (1..3999, standard subtractive form; raise ValueError for out-of-range numbers and non-canonical numerals) so `python -m pytest -q` passes. Do not edit the tests.",
    },
    # ---- hard: needs careful reasoning; a strong model should win here
    "lru_cache": {
        "level": "hard",
        "files": {"lru.py": "class LRUCache:\n    \"\"\"Fixed-capacity least-recently-used cache with O(1) get/put.\"\"\"\n\n    def __init__(self, capacity):\n        raise NotImplementedError\n\n"
                            "    def get(self, key):\n        \"\"\"Return the value or -1; marks key as recently used.\"\"\"\n        raise NotImplementedError\n\n"
                            "    def put(self, key, value):\n        \"\"\"Insert/update; evict the least recently used key when over capacity.\"\"\"\n        raise NotImplementedError\n",
                  "test_lru.py": "from lru import LRUCache\n\ndef test_basic():\n    c = LRUCache(2)\n    c.put(1, 1); c.put(2, 2)\n    assert c.get(1) == 1\n    c.put(3, 3)\n"
                                 "    assert c.get(2) == -1\n    c.put(4, 4)\n    assert c.get(1) == -1\n    assert c.get(3) == 3\n    assert c.get(4) == 4\n\n"
                                 "def test_update_refreshes():\n    c = LRUCache(2)\n    c.put(1, 1); c.put(2, 2); c.put(1, 10); c.put(3, 3)\n    assert c.get(1) == 10\n    assert c.get(2) == -1\n\n"
                                 "def test_capacity_one():\n    c = LRUCache(1)\n    c.put(1, 1); c.put(2, 2)\n    assert c.get(1) == -1 and c.get(2) == 2\n\n"
                                 "def test_no_ordereddict():\n    import inspect, lru\n    src = inspect.getsource(lru)\n    assert 'OrderedDict' not in src and 'functools' not in src\n"},
        "ask": "Implement LRUCache in lru.py with O(1) get and put using a hash map plus a doubly linked list (no OrderedDict, no functools) so `python -m pytest -q` passes. Do not edit the tests.",
    },
    "expr_eval": {
        "level": "hard",
        "files": {"calc.py": "def evaluate(expr):\n    \"\"\"Evaluate +, -, *, / and parentheses on integers with correct precedence.\n    Division is true division. Unary minus is allowed. Do not use eval().\"\"\"\n    raise NotImplementedError\n",
                  "test_calc.py": "import pytest\nfrom calc import evaluate\n\n"
                                  "@pytest.mark.parametrize('e,v', [('1+2*3', 7), ('(1+2)*3', 9), ('10/4', 2.5), ('-3+5', 2), ('2*-3', -6), ('-(2+3)*2', -10), ('2-3-4', -5), ('8/2/2', 2), (' 7 ', 7), ('((2))', 2)])\n"
                                  "def test_eval(e, v):\n    assert evaluate(e) == pytest.approx(v)\n\n"
                                  "def test_no_eval():\n    import inspect, calc\n    assert 'eval(' not in inspect.getsource(calc).replace('def evaluate(', '')\n\n"
                                  "def test_errors():\n    for bad in ['1+', '(1+2', '2**3', '']:\n        with pytest.raises(ValueError):\n            evaluate(bad)\n"},
        "ask": "Implement evaluate in calc.py as a recursive-descent parser (no eval) supporting + - * / parentheses and unary minus, left-associative, raising ValueError on malformed input, so `python -m pytest -q` passes. Do not edit the tests.",
    },
    "dijkstra_bug": {
        "level": "hard",
        "files": {"graph.py": "import heapq\n\n\ndef shortest_path(graph, src, dst):\n    \"\"\"graph: {node: [(neighbor, weight), ...]} with non-negative weights.\n"
                              "    Return (distance, path) or (float('inf'), []) if unreachable.\"\"\"\n"
                              "    dist = {src: 0}\n    prev = {}\n    pq = [(0, src)]\n    seen = set()\n    while pq:\n        d, u = heapq.heappop(pq)\n"
                              "        seen.add(u)\n        for v, w in graph.get(u, []):\n            if v in seen:\n                continue\n"
                              "            nd = d + w\n            if nd < dist.get(v, float('inf')):\n                dist[v] = nd\n                heapq.heappush(pq, (nd, v))\n"
                              "    if dst not in dist:\n        return float('inf'), []\n    path = [dst]\n    while path[-1] != src:\n        path.append(prev[path[-1]])\n    return dist[dst], path\n",
                  "test_graph.py": "from graph import shortest_path\n\nG = {'a': [('b', 1), ('c', 4)], 'b': [('c', 2), ('d', 6)], 'c': [('d', 1)], 'd': []}\n\n"
                                   "def test_path():\n    assert shortest_path(G, 'a', 'd') == (4, ['a', 'b', 'c', 'd'])\n\n"
                                   "def test_same():\n    assert shortest_path(G, 'a', 'a') == (0, ['a'])\n\n"
                                   "def test_unreachable():\n    assert shortest_path(G, 'd', 'a') == (float('inf'), [])\n\n"
                                   "def test_stale_entries():\n    H = {'s': [('x', 5), ('y', 1)], 'y': [('x', 1)], 'x': [('t', 1)], 't': []}\n    assert shortest_path(H, 's', 't') == (3, ['s', 'y', 'x', 't'])\n"},
        "ask": "shortest_path in graph.py is broken (path reconstruction and stale heap entries). Fix it so `python -m pytest -q` passes, keeping Dijkstra's algorithm. Do not edit the tests.",
    },
    "csv_quotes": {
        "level": "hard",
        "files": {"csvline.py": "def split_csv_line(line):\n    \"\"\"Split one CSV line into fields (RFC 4180 quoting). Do not use the csv module.\"\"\"\n    return line.split(',')\n",
                  "test_csvline.py": "import pytest\nfrom csvline import split_csv_line as s\n\n"
                                     "@pytest.mark.parametrize('line,out', [('a,b,c', ['a', 'b', 'c']), ('\"a,b\",c', ['a,b', 'c']), ('\"he said \"\"hi\"\"\",x', ['he said \"hi\"', 'x']),\n"
                                     "    ('a,,c', ['a', '', 'c']), (',', ['', '']), ('\"\"', ['']), ('a,\"\"', ['a', ''])])\n"
                                     "def test_split(line, out):\n    assert s(line) == out\n\n"
                                     "def test_unterminated():\n    with pytest.raises(ValueError):\n        s('\"abc')\n\n"
                                     "def test_no_csv_module():\n    import inspect, csvline\n    assert 'import csv' not in inspect.getsource(csvline)\n"},
        "ask": "split_csv_line in csvline.py must follow RFC 4180 quoting (quoted fields, doubled quotes, empty fields; ValueError on an unterminated quote) without the csv module. Fix it so `python -m pytest -q` passes. Do not edit the tests.",
    },
}
