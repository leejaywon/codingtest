from __future__ import annotations

import re

from bs4 import BeautifulSoup

from ..config import HTTP_TIMEOUT_SEC
from ..htmlutil import sanitize
from .boj import HEADERS, client


def fetch_leetcode(slug: str) -> dict:
    url = f"https://leetcode.com/problems/{slug}/"
    query = """
    query questionData($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionId
        questionFrontendId
        title
        titleSlug
        content
        difficulty
        topicTags { name slug }
        sampleTestCase
        exampleTestcases
      }
    }
    """
    with client() as c:
        r = c.post(
            "https://leetcode.com/graphql",
            json={"query": query, "variables": {"titleSlug": slug}},
            headers={**HEADERS, "Content-Type": "application/json", "Referer": url},
            timeout=HTTP_TIMEOUT_SEC,
        )
        r.raise_for_status()
        q = (r.json().get("data") or {}).get("question")
    if not q or not q.get("content"):
        raise RuntimeError(f"LeetCode 문항을 가져오지 못했습니다: {slug}")

    tests = _parse_examples(q["content"])
    source_tags = [t["name"] for t in q.get("topicTags") or [] if t.get("name")]
    if not source_tags:
        source_tags = [t["slug"] for t in q.get("topicTags") or [] if t.get("slug")]
    diff = q.get("difficulty") or ""
    fid = q.get("questionFrontendId") or q.get("questionId")
    title = q.get("title") or slug
    html = sanitize(q["content"], "https://leetcode.com/")
    html = (
        "<p class='source-note'>리트코드는 원래 함수형 문제입니다. "
        "예제가 파싱되면 stdin/stdout 채점을 시도하고, 아니면 실행으로 직접 검증하세요.</p>"
        + html
    )
    return {
        "id": f"lc-{slug}",
        "source": "leetcode",
        "source_id": slug,
        "source_url": url,
        "title": f"{fid}. {title}",
        "source_difficulty": diff,
        "difficulty": diff,
        "source_tags": source_tags,
        "tags": source_tags,
        "time_limit_ms": 2000,
        "memory_limit_mb": 256,
        "statement_html": html,
        "notes": "출처: LeetCode. 원문 저작권은 LeetCode에 있습니다.",
        "tests": tests,
        "judge_mode": "stdin" if tests else "none",
    }


def _parse_examples(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    tests: list[dict] = []
    for pre in soup.select("pre"):
        text = pre.get_text("\n")
        inp = _extract(text, "Input")
        out = _extract(text, "Output")
        if inp is None or out is None:
            continue
        tests.append({"input": inp + "\n", "output": out + "\n", "hidden": False})
    return tests


def _extract(text: str, label: str) -> str | None:
    m = re.search(
        rf"{label}\s*:\s*(.+?)(?=(?:Input|Output|Explanation|설명)\s*:|$)",
        text,
        re.I | re.S,
    )
    if not m:
        return None
    return m.group(1).strip()
