from __future__ import annotations

import re
from urllib.parse import parse_qs, unquote, urlparse

from bs4 import BeautifulSoup

from ..htmlutil import sanitize

STUB_MARKERS = (
    "접근하지 못했",
    "지문을 찾지 못했",
    "지문을 아직 찾지",
    "본문을 아직 찾지",
    "난이도와 유형은 solved.ac",
)


def statement_incomplete(html: str) -> bool:
    raw = html or ""
    if any(m in raw for m in STUB_MARKERS):
        return True
    text = _plain(raw)
    return len(text) < 60


def looks_like_statement(html: str) -> bool:
    if statement_incomplete(html):
        return False
    text = _plain(html)
    hits = sum(1 for k in ("입력", "출력", "예제") if k in text)
    return hits >= 2


_CF_SECTIONS = {
    "input": "입력",
    "output": "출력",
    "note": "노트",
    "notes": "노트",
    "interaction": "인터랙션",
    "hint": "힌트",
}


def normalize_statement_html(html: str, drop_samples: bool = False) -> str:
    raw = html or ""
    if "problem-statement" not in raw and "section-title" not in raw:
        return raw
    soup = BeautifulSoup(raw, "lxml")
    for node in soup.select(".header"):
        node.decompose()
    if drop_samples:
        for node in soup.select(".sample-tests"):
            node.decompose()
    for title in soup.select(".section-title"):
        label = _plain(title.get_text(" ", strip=True)).lower()
        h = soup.new_tag("h3")
        h.string = _CF_SECTIONS.get(label, title.get_text(" ", strip=True) or "구간")
        title.replace_with(h)
    root = soup.select_one(".problem-statement")
    if root is not None:
        first = next((c for c in root.children if getattr(c, "name", None)), None)
        if first is not None and first.name != "h3":
            h = soup.new_tag("h3")
            h.string = "문제"
            first.insert_before(h)
    out = soup.body.decode_contents() if soup.body else str(soup)
    return out.strip()


def _plain(html: str) -> str:
    text = re.sub(r"<[^>]+>", " ", html or "")
    return re.sub(r"\s+", " ", text).strip()


def _inner(el) -> str:
    if el is None:
        return ""
    return "".join(str(c) for c in el.contents)


def parse_boj_html(html: str) -> tuple[str, list[dict], int, int]:
    soup = BeautifulSoup(html, "lxml")
    body = ""
    tests: list[dict] = []
    time_ms = 0
    mem_mb = 0

    desc = soup.select_one("#problem_description")
    inp = soup.select_one("#problem_input")
    out = soup.select_one("#problem_output")
    hint = soup.select_one("#problem_hint")
    if desc and _plain(_inner(desc)):
        body += f"<h3>문제</h3>{_inner(desc)}"
    if inp and _plain(_inner(inp)):
        body += f"<h3>입력</h3>{_inner(inp)}"
    if out and _plain(_inner(out)):
        body += f"<h3>출력</h3>{_inner(out)}"
    if hint and _plain(_inner(hint)):
        body += f"<h3>힌트</h3>{_inner(hint)}"

    tests = samples_from_boj(soup)

    info = soup.select_one("#problem-info")
    if info:
        text = info.get_text(" ", strip=True)
        tm = re.search(r"(\d+(?:\.\d+)?)\s*초", text)
        mm = re.search(r"(\d+)\s*MB", text, re.I)
        if tm:
            time_ms = int(float(tm.group(1)) * 1000)
        if mm:
            mem_mb = int(mm.group(1))
    return body, tests, time_ms, mem_mb


def samples_from_boj(soup: BeautifulSoup) -> list[dict]:
    tests: list[dict] = []
    i = 1
    while True:
        sin = soup.select_one(f"#sample-input-{i}")
        sout = soup.select_one(f"#sample-output-{i}")
        if not sin or not sout:
            break
        tests.append(
            {
                "input": sin.get_text().replace("\r\n", "\n"),
                "output": sout.get_text().replace("\r\n", "\n"),
                "hidden": False,
            }
        )
        i += 1
    return tests


def unwrap_href(href: str) -> str:
    if not href:
        return ""
    href = href.strip()
    parsed = urlparse(href)
    qs = parse_qs(parsed.query)
    for key in ("uddg", "u", "url", "q", "ru", "linkUrl"):
        vals = qs.get(key) or []
        if not vals:
            continue
        cand = unquote(vals[0])
        if cand.startswith("http://") or cand.startswith("https://"):
            return cand
    return href


def prefer_readable(url: str) -> str:
    p = urlparse(url)
    host = p.netloc.lower()
    if "blog.naver.com" in host and not host.startswith("m."):
        return url.replace("://blog.naver.com", "://m.blog.naver.com", 1).replace(
            "://www.blog.naver.com", "://m.blog.naver.com", 1
        )
    return url


PREFERRED_HOSTS = (
    "tistory.com",
    "blog.naver.com",
    "velog.io",
    "github.io",
    "github.com",
    "blogspot.com",
    "medium.com",
    "codeplus.kr",
)


def host_of(url: str) -> str:
    host = urlparse(url).netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    return host


def is_preferred_host(host: str) -> bool:
    return any(host == d or host.endswith("." + d) for d in PREFERRED_HOSTS)


def looks_like_article(url: str) -> bool:
    parsed = urlparse(url)
    host = host_of(url)
    path = parsed.path.strip("/")
    qs = parse_qs(parsed.query)
    low = path.lower()
    if low.endswith((".java", ".py", ".cpp", ".c", ".cc", ".kt", ".js", ".ts", ".cs")):
        return False
    if "blog.naver.com" in host:
        if qs.get("logNo"):
            return True
        parts = [x for x in path.split("/") if x and x.lower() not in {"postview.naver", "postview.nhn"}]
        return len(parts) >= 2 and parts[-1].isdigit()
    if host.endswith("tistory.com") and host != "tistory.com":
        return bool(path)
    if "velog.io" in host:
        parts = [x for x in path.split("/") if x]
        return bool(parts) and "tags" not in parts
    if "gist.github.com" in host:
        return bool(path)
    if "github.com" in host:
        return "/blob/" in parsed.path or "/wiki/" in parsed.path
    if host.endswith("github.io"):
        parts = [x for x in path.split("/") if x]
        return len(parts) >= 1 and "tags" not in parts and "categories" not in parts
    return bool(path) and path.count("/") >= 1


def allowed_mirror(url: str) -> bool:
    if not url.startswith(("http://", "https://")):
        return False
    host = host_of(url)
    blocked_exact = {
        "acmicpc.net",
        "solved.ac",
        "youtube.com",
        "youtu.be",
        "facebook.com",
        "instagram.com",
        "twitter.com",
        "x.com",
        "duckduckgo.com",
        "bing.com",
        "google.com",
        "google.co.kr",
        "search.naver.com",
        "m.search.naver.com",
        "search.daum.net",
        "nid.naver.com",
        "adcr.naver.com",
        "naver.com",
        "whale.naver.com",
        "shopping.naver.com",
        "dict.naver.com",
        "map.naver.com",
        "help.naver.com",
        "news.naver.com",
        "comic.naver.com",
        "mail.naver.com",
        "tv.naver.com",
        "nid.naver.com",
    }
    if host in blocked_exact:
        return False
    if host.endswith(".acmicpc.net") or host.endswith(".solved.ac"):
        return False
    if "google." in host or "gstatic." in host or "youtube." in host:
        return False
    if host.endswith(".bing.com") or host.endswith(".duckduckgo.com"):
        return False
    path = urlparse(url).path.strip("/")
    if is_preferred_host(host):
        if host == "tistory.com":
            return False
        return looks_like_article(url)
    if host == "naver.com" or host.endswith(".naver.com"):
        return False
    if host == "daum.net" or host.endswith(".daum.net"):
        return False
    return path.count("/") >= 1 and len(path) > 6


def extract_blog_statement(html: str, problem_no: int) -> tuple[str, list[dict]]:
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "nav", "footer", "iframe", "noscript"]):
        tag.decompose()

    official, tests, _, _ = parse_boj_html(html)
    if looks_like_statement(official):
        return official, tests

    for sel in (
        ".sidebar",
        ".area_sidebar",
        "#aside",
        ".reply",
        ".comment",
        ".comments",
        "#disqus_thread",
        ".btn_wrap",
    ):
        for n in soup.select(sel):
            n.decompose()

    root = (
        soup.select_one(".se-main-container")
        or soup.select_one("#postViewArea")
        or soup.select_one(".tt_article_useless_p_margin")
        or soup.select_one(".contents_style")
        or soup.select_one("div.atom-one")
        or soup.select_one(".entry-content")
        or soup.select_one("article")
        or soup.select_one("#content")
        or soup.select_one(".post-content")
        or soup.body
    )
    if root is None:
        return "", []

    text_blob = root.get_text("\n", strip=True)
    marker = str(problem_no)
    if marker not in text_blob and "백준" not in text_blob and "BOJ" not in text_blob:
        if len(text_blob) < 200:
            return "", []

    clipped = clip_problem_root(root)
    body = sanitize(str(clipped))
    if not tests:
        tests = samples_from_soup(clipped)
    if looks_like_statement(body):
        return body, tests

    full = sanitize(str(root))
    if not tests:
        tests = samples_from_soup(root)
    if looks_like_statement(full):
        return full, tests
    return "", []


def clip_problem_root(root):
    html = str(root)
    html = re.split(
        r"<h[1-6][^>]*>\s*(?:풀이|해법|해설|접근\s*방법|소스\s*코드)",
        html,
        maxsplit=1,
        flags=re.I,
    )[0]
    html = re.split(
        r"<(?:p|div|strong|b)[^>]*>\s*(?:풀이|해법|해설|소스\s*코드)\s*<",
        html,
        maxsplit=1,
        flags=re.I,
    )[0]
    soup = BeautifulSoup(html, "lxml")
    return soup.body or soup


def samples_from_soup(root) -> list[dict]:
    tests: list[dict] = []
    pres = root.find_all("pre") if root else []
    texts = [p.get_text().replace("\r\n", "\n") for p in pres]
    i = 0
    while i + 1 < len(texts):
        a, b = texts[i], texts[i + 1]
        if "def " in a or "import " in a or "class " in a or "#include" in a:
            i += 1
            continue
        if 0 < len(a) < 4000 and 0 < len(b) < 4000:
            tests.append({"input": a, "output": b, "hidden": False})
            i += 2
        else:
            i += 1
        if len(tests) >= 3:
            break
    if tests:
        return tests

    blob = root.get_text("\n") if root else ""
    blocks = re.split(r"예제\s*입력\s*\d*", blob)
    outs = re.split(r"예제\s*출력\s*\d*", blob)
    if len(blocks) > 1 and len(outs) > 1:
        for inp, out in zip(blocks[1:], outs[1:]):
            inn = inp.split("예제")[0].strip()
            ou = out.split("예제")[0].strip()
            if inn and ou:
                tests.append(
                    {
                        "input": inn + ("" if inn.endswith("\n") else "\n"),
                        "output": ou + ("" if ou.endswith("\n") else "\n"),
                        "hidden": False,
                    }
                )
            if len(tests) >= 3:
                break
    return tests
