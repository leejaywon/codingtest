export const OUR_TYPES = [
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
] as const;

export const SOURCE_LABEL: Record<string, string> = {
  boj: "백준",
  leetcode: "LeetCode",
  codeforces: "Codeforces",
};

export const PYTHON_STARTER = `import sys

def main():
    data = sys.stdin.read().split()
    # TODO: 문제를 푸세요
    print()

if __name__ == "__main__":
    main()
`;

export const PYTHON_LANGUAGE = {
  id: "python",
  label: "Python",
  standard: "3.12",
  available: true,
  runtime: "python",
};

export const STUB_MARKERS = [
  "접근하지 못했",
  "지문을 찾지 못했",
  "지문을 아직 찾지",
  "본문을 아직 찾지",
  "난이도와 유형은 solved.ac",
];

export function statementIncomplete(html: string) {
  const raw = html || "";
  if (STUB_MARKERS.some((m) => raw.includes(m))) return true;
  const text = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length < 60;
}
