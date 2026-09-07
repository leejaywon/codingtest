"""자체 목차 유형. 사이트 태그(백준/리트코드/코드포스)와 별개다."""

from __future__ import annotations

# docs/코딩테스트-유형.md 1순위 → 2순위 순서
OUR_TYPES: list[str] = [
    "구현 · 시뮬레이션",
    "완전탐색 · 백트래킹",
    "그래프 탐색 (DFS/BFS)",
    "해시 · 맵 · 셋",
    "문자열 처리 · 파싱",
    "정렬 · 그리디",
    "이분탐색 · 파라메트릭 서치",
    "스택 · 큐 · 덱 · 힙",
    "동적 계획법",
    "투포인터 · 슬라이딩 윈도우",
    "누적합 · 차분",
    "최단경로",
    "트리",
    "위상정렬",
    "유니온 파인드",
    "비트마스크",
    "TSP",
    "트라이",
    "조합론 · 순열조합",
    "MST",
    "그리디 + 자료구조 혼합",
    "재귀 · 분할정복",
]

_CANON = {name: name for name in OUR_TYPES}

# 시드·로컬 JSON에 쓰던 짧은 이름 → 목차 정식명
_ALIASES: dict[str, str] = {
    "구현": "구현 · 시뮬레이션",
    "시뮬레이션": "구현 · 시뮬레이션",
    "시뮬": "구현 · 시뮬레이션",
    "완전탐색": "완전탐색 · 백트래킹",
    "백트래킹": "완전탐색 · 백트래킹",
    "dfs": "그래프 탐색 (DFS/BFS)",
    "bfs": "그래프 탐색 (DFS/BFS)",
    "그래프": "그래프 탐색 (DFS/BFS)",
    "그래프탐색": "그래프 탐색 (DFS/BFS)",
    "해시": "해시 · 맵 · 셋",
    "맵": "해시 · 맵 · 셋",
    "셋": "해시 · 맵 · 셋",
    "문자열": "문자열 처리 · 파싱",
    "파싱": "문자열 처리 · 파싱",
    "그리디": "정렬 · 그리디",
    "정렬": "정렬 · 그리디",
    "이분탐색": "이분탐색 · 파라메트릭 서치",
    "파라메트릭": "이분탐색 · 파라메트릭 서치",
    "스택": "스택 · 큐 · 덱 · 힙",
    "큐": "스택 · 큐 · 덱 · 힙",
    "덱": "스택 · 큐 · 덱 · 힙",
    "힙": "스택 · 큐 · 덱 · 힙",
    "dp": "동적 계획법",
    "동적계획법": "동적 계획법",
    "lis": "동적 계획법",
    "투포인터": "투포인터 · 슬라이딩 윈도우",
    "슬라이딩윈도우": "투포인터 · 슬라이딩 윈도우",
    "슬라이딩 윈도우": "투포인터 · 슬라이딩 윈도우",
    "누적합": "누적합 · 차분",
    "차분": "누적합 · 차분",
    "다익스트라": "최단경로",
    "플로이드": "최단경로",
    "최단경로": "최단경로",
    "트리": "트리",
    "위상정렬": "위상정렬",
    "유니온파인드": "유니온 파인드",
    "유니온 파인드": "유니온 파인드",
    "분리집합": "유니온 파인드",
    "비트마스크": "비트마스크",
    "tsp": "TSP",
    "외판원": "TSP",
    "트라이": "트라이",
    "trie": "트라이",
    "조합론": "조합론 · 순열조합",
    "순열조합": "조합론 · 순열조합",
    "mst": "MST",
    "크루스칼": "MST",
    "프림": "MST",
    "분할정복": "재귀 · 분할정복",
    "재귀": "재귀 · 분할정복",
}


def _lookup(raw: str) -> str | None:
    s = (raw or "").strip()
    if not s:
        return None
    if s in _CANON:
        return s
    key = s.casefold().replace(" ", "").replace("·", "").replace("/", "")
    if s in _ALIASES:
        return _ALIASES[s]
    compact = s.casefold().replace(" ", "")
    if compact in _ALIASES:
        return _ALIASES[compact]
    if key in _ALIASES:
        return _ALIASES[key]
    return None


def normalize_our_types(values: list[str] | None) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in values or []:
        name = _lookup(str(raw))
        if not name or name in seen:
            continue
        seen.add(name)
        out.append(name)
    return out


def split_legacy_tags(tags: list[str] | None) -> tuple[list[str], list[str]]:
    """옛 tags_json이 목차+사이트 태그를 섞은 경우 분리한다."""
    our: list[str] = []
    source: list[str] = []
    seen_our: set[str] = set()
    for raw in tags or []:
        name = _lookup(str(raw))
        if name:
            if name not in seen_our:
                seen_our.add(name)
                our.append(name)
        else:
            source.append(str(raw))
    return our, source
