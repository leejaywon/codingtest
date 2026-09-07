from __future__ import annotations

from bs4 import BeautifulSoup

from ..config import HTTP_TIMEOUT_SEC
from ..htmlutil import sanitize
from .htmlparse import parse_boj_html, statement_incomplete
from .web_fallback import fetch_web_statement

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)
HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
}

_SOLVED_TIERS = ["브론즈", "실버", "골드", "플래티넘", "다이아몬드", "루비"]


def client():
    import httpx

    return httpx.Client(headers=HEADERS, timeout=HTTP_TIMEOUT_SEC, follow_redirects=True)


def fetch_boj(problem_no: int) -> dict:
    url = f"https://www.acmicpc.net/problem/{problem_no}"
    html = ""
    try:
        with client() as c:
            for cand in (url, f"https://boj.kr/{problem_no}"):
                try:
                    r = c.get(cand)
                except Exception:
                    continue
                if r.status_code == 200 and r.text and "problem_description" in r.text:
                    html = r.text
                    break
                if r.status_code == 200 and r.text and not html:
                    html = r.text
    except Exception:
        html = ""

    title = f"BOJ {problem_no}"
    body = ""
    tests: list[dict] = []
    time_ms = 2000
    mem_mb = 128
    statement_from = ""
    if html:
        soup = BeautifulSoup(html, "lxml")
        title_el = soup.select_one("#problem_title")
        if title_el:
            title = title_el.get_text(strip=True)
        body, tests, parsed_time, parsed_mem = parse_boj_html(html)
        if parsed_time:
            time_ms = parsed_time
        if parsed_mem:
            mem_mb = parsed_mem
        if body:
            statement_from = url

    source_tags: list[str] = []
    source_difficulty = ""
    title_ko = ""
    try:
        with client() as c:
            meta = c.get(
                "https://solved.ac/api/v3/problem/show",
                params={"problemId": problem_no},
                headers={**HEADERS, "Accept": "application/json"},
            )
        if meta.status_code == 200:
            data = meta.json()
            source_tags = [_solved_tag_name(t) for t in data.get("tags") or []]
            source_tags = [t for t in source_tags if t]
            source_difficulty = _solved_level_name(data.get("level"))
            title_ko = data.get("titleKo") or data.get("title") or ""
    except Exception:
        pass

    if title_ko and (not html or title.startswith("BOJ ")):
        title = title_ko

    if statement_incomplete(body):
        web_body, web_tests, origin = fetch_web_statement(problem_no, title)
        if web_body:
            body = web_body
            statement_from = origin or statement_from
            if web_tests and not tests:
                tests = web_tests

    notes = "출처: 백준 온라인 저지. 원문 저작권은 해당 사이트/출제자에게 있습니다."

    return {
        "id": f"boj-{problem_no}",
        "source": "boj",
        "source_id": str(problem_no),
        "source_url": url,
        "title": f"{problem_no}. {title}" if not str(title).startswith(str(problem_no)) else title,
        "source_difficulty": source_difficulty,
        "difficulty": source_difficulty,
        "source_tags": source_tags,
        "tags": source_tags,
        "time_limit_ms": time_ms,
        "memory_limit_mb": mem_mb,
        "statement_html": sanitize(body, statement_from or "https://www.acmicpc.net/"),
        "input_spec": "",
        "output_spec": "",
        "notes": notes,
        "tests": tests,
        "judge_mode": "stdin" if tests else "none",
    }


def _solved_tag_name(tag: dict) -> str:
    for item in tag.get("displayNames") or []:
        if item.get("language") == "ko" and item.get("name"):
            return str(item["name"])
    for item in tag.get("displayNames") or []:
        if item.get("name"):
            return str(item["name"])
    return str(tag.get("key") or "")


def _solved_level_name(level: int | None) -> str:
    if not level:
        return "언레이티드"
    if level < 1 or level > 30:
        return "언레이티드"
    tier = _SOLVED_TIERS[(level - 1) // 5]
    num = 5 - ((level - 1) % 5)
    return f"{tier} {num}"
