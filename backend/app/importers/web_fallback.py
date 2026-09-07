from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import quote_plus, urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from ..config import HTTP_TIMEOUT_SEC
from .htmlparse import (
    allowed_mirror,
    extract_blog_statement,
    host_of,
    is_preferred_host,
    looks_like_article,
    looks_like_statement,
    parse_boj_html,
    prefer_readable,
    statement_incomplete,
    unwrap_href,
)

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)
HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
}
SEARCH_TIMEOUT = min(12.0, HTTP_TIMEOUT_SEC)
PAGE_TIMEOUT = min(20.0, HTTP_TIMEOUT_SEC)
WAYBACK_BEFORE = "20260415"


def client(timeout: float | None = None) -> httpx.Client:
    return httpx.Client(
        headers=HEADERS,
        timeout=timeout or HTTP_TIMEOUT_SEC,
        follow_redirects=True,
    )


def _get(c: httpx.Client, url: str, timeout: float | None = None) -> str:
    wait = timeout or PAGE_TIMEOUT
    for attempt in range(4):
        try:
            r = c.get(url, headers=HEADERS, timeout=wait)
            if r.status_code == 200 and r.text:
                return r.text
            if r.status_code in {429, 502, 503, 520, 522, 524}:
                time.sleep(1.5 * (attempt + 1))
                continue
        except Exception:
            time.sleep(0.8 * (attempt + 1))
    return ""


def _cdx_timestamps(c: httpx.Client, problem_no: int) -> list[str]:
    stamps: list[str] = []
    try:
        cdx = c.get(
            "https://web.archive.org/cdx/search/cdx",
            params=[
                ("url", f"www.acmicpc.net/problem/{problem_no}"),
                ("output", "json"),
                ("filter", "statuscode:200"),
                ("filter", "mimetype:text/html"),
                ("to", WAYBACK_BEFORE),
                ("limit", "-8"),
                ("fl", "timestamp"),
            ],
            timeout=SEARCH_TIMEOUT,
        )
        if cdx.status_code == 200 and cdx.text:
            rows = cdx.json()
            for row in rows[1:]:
                ts = str(row[0]) if row else ""
                if ts and ts not in stamps:
                    stamps.append(ts)
    except Exception:
        pass
    stamps.sort(reverse=True)
    return stamps


def _try_wayback_ts(c: httpx.Client, problem_no: int, ts: str) -> tuple[str, str]:
    origin = f"https://www.acmicpc.net/problem/{problem_no}"
    raw = f"https://web.archive.org/web/{ts}id_/{origin}"
    html = _get(c, raw, PAGE_TIMEOUT)
    if html and "problem_description" in html:
        return html, raw
    wrapped = f"https://web.archive.org/web/{ts}/{origin}"
    html = _get(c, wrapped, PAGE_TIMEOUT)
    if html and "problem_description" in html:
        return html, wrapped
    return "", ""


def wayback_snapshot(problem_no: int) -> tuple[str, str]:
    try:
        with client(PAGE_TIMEOUT) as c:
            seen: set[str] = set()
            for ts in (
                "20240301000000",
                "20230101000000",
                "20220101000000",
                "20250301000000",
            ):
                seen.add(ts)
                html, url = _try_wayback_ts(c, problem_no, ts)
                if html:
                    return html, url
            try:
                meta = c.get(
                    "https://archive.org/wayback/available",
                    params={
                        "url": f"https://www.acmicpc.net/problem/{problem_no}",
                        "timestamp": "20240301",
                    },
                    timeout=SEARCH_TIMEOUT,
                )
                if meta.status_code == 200:
                    snap = ((meta.json() or {}).get("archived_snapshots") or {}).get("closest") or {}
                    ts = str(snap.get("timestamp") or "")
                    if ts and ts <= WAYBACK_BEFORE and ts not in seen:
                        html, url = _try_wayback_ts(c, problem_no, ts)
                        if html:
                            return html, url
            except Exception:
                pass
            for ts in _cdx_timestamps(c, problem_no):
                if ts in seen:
                    continue
                html, url = _try_wayback_ts(c, problem_no, ts)
                if html:
                    return html, url
    except Exception:
        return "", ""
    return "", ""


def _collect_links(html: str, page_url: str) -> list[str]:
    if not html:
        return []
    soup = BeautifulSoup(html, "lxml")
    preferred: list[str] = []
    other: list[str] = []
    for a in soup.select("a[href]"):
        href = unwrap_href(a.get("href") or "")
        if href.startswith("/"):
            href = urljoin(page_url, href)
            href = unwrap_href(href)
        href = prefer_readable(href)
        if not allowed_mirror(href):
            continue
        if not looks_like_article(href):
            continue
        if is_preferred_host(host_of(href)):
            preferred.append(href)
        else:
            other.append(href)
    return list(dict.fromkeys(preferred + other))[:12]


def search_naver(query: str, where: str = "web") -> list[str]:
    url = (
        f"https://search.naver.com/search.naver?where={where}&query="
        + quote_plus(query)
    )
    try:
        with client(SEARCH_TIMEOUT) as c:
            html = _get(c, url, SEARCH_TIMEOUT)
    except Exception:
        return []
    return _collect_links(html, url)


def search_daum(query: str) -> list[str]:
    url = "https://search.daum.net/search?w=web&q=" + quote_plus(query)
    try:
        with client(SEARCH_TIMEOUT) as c:
            html = _get(c, url, SEARCH_TIMEOUT)
    except Exception:
        return []
    return _collect_links(html, url)


def search_ddg(query: str) -> list[str]:
    html = ""
    try:
        with client(SEARCH_TIMEOUT) as c:
            r = c.post(
                "https://html.duckduckgo.com/html/",
                data={"q": query},
                headers={**HEADERS, "Content-Type": "application/x-www-form-urlencoded"},
                timeout=SEARCH_TIMEOUT,
            )
            if r.status_code == 200:
                html = r.text
    except Exception:
        html = ""
    return _collect_links(html, "https://duckduckgo.com")


def search_bing(query: str) -> list[str]:
    url = "https://www.bing.com/search?q=" + quote_plus(query)
    try:
        with client(SEARCH_TIMEOUT) as c:
            html = _get(c, url, SEARCH_TIMEOUT)
    except Exception:
        return []
    return _collect_links(html, url)


def candidate_urls(problem_no: int, title: str) -> list[str]:
    title = (title or "").split(".", 1)[-1].strip()
    urls: list[str] = []

    def add(more: list[str]) -> None:
        for u in more:
            if u not in urls:
                urls.append(u)

    add(search_ddg(f"site:tistory.com 백준 {problem_no}"))
    add(search_naver(f"백준 {problem_no} {title}", "blog"))
    if len(urls) < 6:
        add(search_naver(f"백준 {problem_no} 문제", "web"))
    if len(urls) < 6:
        add(search_ddg(f"백준 {problem_no} {title} 문제 입력 출력"))
        add(search_ddg(f"site:blog.naver.com 백준 {problem_no}"))
    if len(urls) < 6:
        add(search_daum(f"백준 {problem_no} {title}"))
    if len(urls) < 6:
        add(search_bing(f"백준 {problem_no} 문제 site:tistory.com"))
    return urls[:8]


def _score(html: str, url: str) -> int:
    if not looks_like_statement(html):
        return 0
    text = " ".join(html.split())
    score = 4
    if "입력" in text:
        score += 3
    if "출력" in text:
        score += 3
    if "예제" in text:
        score += 2
    host = urlparse(url).netloc.lower()
    if "tistory.com" in host or "blog.naver.com" in host:
        score += 2
    if "velog.io" in host or "github.io" in host:
        score += 1
    if len(text) > 400:
        score += 1
    return score


def _fetch_one(url: str, problem_no: int) -> tuple[str, list[dict], str, int]:
    try:
        with client(PAGE_TIMEOUT) as c:
            page = _get(c, url, PAGE_TIMEOUT)
    except Exception:
        page = ""
    if not page:
        return "", [], url, 0
    body, tests = extract_blog_statement(page, problem_no)
    return body, tests, url, _score(body, url)


def fetch_web_statement(problem_no: int, title: str) -> tuple[str, list[dict], str]:
    html, snap_url = wayback_snapshot(problem_no)
    if html:
        body, tests, _, _ = parse_boj_html(html)
        if looks_like_statement(body) or (body and not statement_incomplete(body)):
            return body, tests, snap_url or f"https://web.archive.org/web/{problem_no}"
        body, tests = extract_blog_statement(html, problem_no)
        if looks_like_statement(body):
            return body, tests, snap_url

    urls = candidate_urls(problem_no, title)
    if not urls:
        return "", [], ""

    junk = ("너무 피곤", "화이팅해야", "저의 풀이", "오늘은 백준", "목요일, 금요일만")
    best: tuple[str, list[dict], str, int] = ("", [], "", 0)
    with ThreadPoolExecutor(max_workers=4) as pool:
        futs = [pool.submit(_fetch_one, url, problem_no) for url in urls]
        for fut in as_completed(futs):
            try:
                body, tests, origin, score = fut.result()
            except Exception:
                continue
            if any(x in body for x in junk):
                continue
            if score > best[3]:
                best = (body, tests, origin, score)
    if best[3] > 0:
        return best[0], best[1], best[2]
    return "", [], ""
