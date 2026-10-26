"""Reference solutions, used only by bench/validate.py to prove every task is solvable and its tests
are consistent. Never copied into the agent task folders."""

REFERENCE = {
    "off_by_one": {"mathx.py": "def sum_to(n):\n    return sum(range(1, n + 1))\n"},
    "slugify": {"text.py": "import re\n\ndef slugify(s):\n    return '-'.join(re.findall(r'[a-z0-9]+', s.lower()))\n"},
    "palindrome": {"pal.py": "def is_palindrome(s):\n    t = [c.lower() for c in s if c.isalnum()]\n    return t == t[::-1]\n"},
    "parse_kv": {"kv.py": "def parse_kv(line):\n    out = {}\n    for part in line.split(';'):\n        if not part.strip():\n            continue\n"
                          "        k, v = part.split('=', 1)\n        out[k.strip()] = v.strip()\n    return out\n"},
    "merge_intervals": {"intervals.py": "def merge(intervals):\n    out = []\n    for s, e in sorted(intervals):\n        if out and s <= out[-1][1]:\n"
                                        "            out[-1][1] = max(out[-1][1], e)\n        else:\n            out.append([s, e])\n    return out\n"},
    "roman": {"roman.py": "V = [(1000,'M'),(900,'CM'),(500,'D'),(400,'CD'),(100,'C'),(90,'XC'),(50,'L'),(40,'XL'),(10,'X'),(9,'IX'),(5,'V'),(4,'IV'),(1,'I')]\n\n"
                          "def to_roman(n):\n    if not 1 <= n <= 3999:\n        raise ValueError(n)\n    out = ''\n    for v, s in V:\n        while n >= v:\n            out += s; n -= v\n    return out\n\n"
                          "def from_roman(s):\n    m = {'I':1,'V':5,'X':10,'L':50,'C':100,'D':500,'M':1000}\n    if not s or any(c not in m for c in s):\n        raise ValueError(s)\n"
                          "    n = sum(-m[a] if m[a] < m[b] else m[a] for a, b in zip(s, s[1:])) + m[s[-1]]\n"
                          "    if not 1 <= n <= 3999 or to_roman(n) != s:\n        raise ValueError(s)\n    return n\n"},
    "lru_cache": {"lru.py": "class _N:\n    __slots__ = ('k', 'v', 'p', 'n')\n    def __init__(self, k=None, v=None):\n        self.k, self.v, self.p, self.n = k, v, None, None\n\n"
                            "class LRUCache:\n    def __init__(self, capacity):\n        self.cap, self.m = capacity, {}\n        self.h, self.t = _N(), _N()\n        self.h.n, self.t.p = self.t, self.h\n\n"
                            "    def _rm(self, x):\n        x.p.n, x.n.p = x.n, x.p\n\n    def _front(self, x):\n        x.n, x.p = self.h.n, self.h\n        self.h.n.p = x\n        self.h.n = x\n\n"
                            "    def get(self, key):\n        x = self.m.get(key)\n        if x is None:\n            return -1\n        self._rm(x); self._front(x)\n        return x.v\n\n"
                            "    def put(self, key, value):\n        if key in self.m:\n            x = self.m[key]; x.v = value; self._rm(x); self._front(x); return\n"
                            "        x = _N(key, value); self.m[key] = x; self._front(x)\n        if len(self.m) > self.cap:\n            lru = self.t.p; self._rm(lru); del self.m[lru.k]\n"},
    "expr_eval": {"calc.py": "import re\n\ndef evaluate(expr):\n    toks = re.findall(r'\\d+|[-+*/()]|\\S', expr)\n    if not toks:\n        raise ValueError('empty')\n    pos = [0]\n\n"
                             "    def peek():\n        return toks[pos[0]] if pos[0] < len(toks) else None\n\n    def take():\n        t = peek()\n        if t is None:\n            raise ValueError('eof')\n        pos[0] += 1\n        return t\n\n"
                             "    def expr_():\n        v = term()\n        while peek() in ('+', '-'):\n            v = v + term() if take() == '+' else v - term()\n        return v\n\n"
                             "    def term():\n        v = factor()\n        while peek() in ('*', '/'):\n            op = take()\n            if peek() in ('*', '/'):\n                raise ValueError('op')\n"
                             "            v = v * factor() if op == '*' else v / factor()\n        return v\n\n"
                             "    def factor():\n        t = take()\n        if t == '-':\n            return -factor()\n        if t == '(':\n            v = expr_()\n            if take() != ')':\n                raise ValueError('paren')\n            return v\n"
                             "        if t.isdigit():\n            return int(t)\n        raise ValueError(t)\n\n    v = expr_()\n    if peek() is not None:\n        raise ValueError('trailing')\n    return v\n"},
    "dijkstra_bug": {"graph.py": "import heapq\n\ndef shortest_path(graph, src, dst):\n    dist, prev, pq, done = {src: 0}, {}, [(0, src)], set()\n    while pq:\n"
                                 "        d, u = heapq.heappop(pq)\n        if u in done:\n            continue\n        done.add(u)\n        for v, w in graph.get(u, []):\n"
                                 "            nd = d + w\n            if nd < dist.get(v, float('inf')):\n                dist[v], prev[v] = nd, u\n                heapq.heappush(pq, (nd, v))\n"
                                 "    if dst not in dist:\n        return float('inf'), []\n    path = [dst]\n    while path[-1] != src:\n        path.append(prev[path[-1]])\n    return dist[dst], path[::-1]\n"},
    "csv_quotes": {"csvline.py": "def split_csv_line(line):\n    out, cur, i, q = [], '', 0, False\n    while i < len(line):\n        c = line[i]\n        if q:\n"
                                 "            if c == '\"':\n                if i + 1 < len(line) and line[i + 1] == '\"':\n                    cur += '\"'; i += 1\n                else:\n                    q = False\n"
                                 "            else:\n                cur += c\n        elif c == '\"':\n            q = True\n        elif c == ',':\n            out.append(cur); cur = ''\n        else:\n            cur += c\n        i += 1\n"
                                 "    if q:\n        raise ValueError('unterminated quote')\n    out.append(cur)\n    return out\n"},
}
