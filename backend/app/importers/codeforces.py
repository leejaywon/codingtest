from __future__ import annotations

import re

from bs4 import BeautifulSoup

from ..htmlutil import sanitize
from .htmlparse import normalize_statement_html
from .boj import HEADERS, client

_cf_index: dict[tuple[int, str], dict] | None = None


def fetch_codeforces(contest_id: int, index: str) -> dict:
    index = index.upper()
    url = f"https://codeforces.com/problemset/problem/{contest_id}/{index}"
    with client() as c:
        r = c.get(url, headers=HEADERS)
        r.raise_for_status()
        html = r.text
    soup = BeautifulSoup(html, "lxml")
    stmt = soup.select_one(".problem-statement")
    if not stmt:
        raise RuntimeError(f"Codeforces 지문을 찾지 못했습니다: {contest_id}{index}")

    title_el = stmt.select_one(".title")
    title = title_el.get_text(" ", strip=True) if title_el else f"{contest_id}{index}"

    time_ms = 2000
    mem_mb = 256
    tl = stmt.select_one(".time-limit")
    ml = stmt.select_one(".memory-limit")
    if tl:
        m = re.search(r"(\d+(?:\.\d+)?)", tl.get_text())
        if m:
            time_ms = int(float(m.group(1)) * 1000)
    if ml:
        m = re.search(r"(\d+)", ml.get_text())
        if m:
            mem_mb = int(m.group(1))

    tests = []
    for block in stmt.select(".sample-test"):
        inputs = block.select(".input pre")
        outputs = block.select(".output pre")
        for a, b in zip(inputs, outputs):
            tests.append(
                {
                    "input": _pre_text(a),
                    "output": _pre_text(b),
                    "hidden": False,
                }
            )

    meta = _cf_meta(contest_id, index)
    rating = meta.get("rating")
    source_difficulty = str(rating) if rating else ""
    source_tags = list(meta.get("tags") or [])

    body = normalize_statement_html(str(stmt), drop_samples=bool(tests))
    return {
        "id": f"cf-{contest_id}{index}",
        "source": "codeforces",
        "source_id": f"{contest_id}{index}",
        "source_url": url,
        "title": title,
        "source_difficulty": source_difficulty,
        "difficulty": source_difficulty,
        "source_tags": source_tags,
        "tags": source_tags,
        "time_limit_ms": time_ms,
        "memory_limit_mb": mem_mb,
        "statement_html": sanitize(body, "https://codeforces.com/"),
        "notes": "출처: Codeforces. 원문 저작권은 Codeforces/출제자에게 있습니다.",
        "tests": tests,
        "judge_mode": "stdin",
    }


def _cf_meta(contest_id: int, index: str) -> dict:
    global _cf_index
    if _cf_index is None:
        _cf_index = {}
        try:
            with client() as c:
                r = c.get("https://codeforces.com/api/problemset.problems", timeout=60)
                r.raise_for_status()
            payload = r.json()
            problems = ((payload.get("result") or {}).get("problems")) or []
            _cf_index = {
                (int(p["contestId"]), str(p["index"]).upper()): p
                for p in problems
                if p.get("contestId") is not None and p.get("index")
            }
        except Exception:
            _cf_index = {}
    return _cf_index.get((contest_id, index.upper()), {})


def _pre_text(el) -> str:
    for br in el.find_all("br"):
        br.replace_with("\n")
    text = el.get_text()
    if not text.endswith("\n"):
        text += "\n"
    return text.replace("\r\n", "\n")
