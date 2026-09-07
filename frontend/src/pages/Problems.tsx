import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AuthUser, api, ProblemListItem } from "../api";
import Select from "../components/Select";
import Difficulty from "../components/Difficulty";

function join(values: string[]) {
  return values.length ? values.join(", ") : "–";
}

const BOJ_TIERS = ["브론즈", "실버", "골드", "플래티넘", "다이아몬드", "루비"];

function difficultyRank(p: ProblemListItem): number | null {
  const d = (p.source_difficulty || "").trim();
  if (!d || d === "언레이티드" || d === "–") return null;
  if (d === "Easy") return 8;
  if (d === "Medium") return 16;
  if (d === "Hard") return 24;
  if (/^\d+$/.test(d)) return Number(d) / 80;
  const m = d.match(/^(브론즈|실버|골드|플래티넘|다이아몬드|루비)\s*([1-5])$/);
  if (m) {
    const i = BOJ_TIERS.indexOf(m[1]);
    return i * 5 + (6 - Number(m[2]));
  }
  return null;
}

type DiffSort = "off" | "asc" | "desc";

export default function Problems({
  user: _user,
  onLogout: _onLogout,
}: {
  user: AuthUser;
  onLogout: () => void;
}) {
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<ProblemListItem[]>([]);
  const [catalogTypes, setCatalogTypes] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [src, setSrc] = useState("all");
  const our = params.get("type") || "all";
  const [err, setErr] = useState("");
  const [diffSort, setDiffSort] = useState<DiffSort>("off");

  function setOur(value: string) {
    const next = new URLSearchParams(params);
    if (!value || value === "all") next.delete("type");
    else next.set("type", value);
    setParams(next, { replace: true });
  }

  useEffect(() => {
    api
      .problems()
      .then((r) => {
        setItems(r.items);
        setCatalogTypes(r.catalog_types || []);
      })
      .catch((e) => setErr(e.message));
  }, []);

  const filtered = useMemo(() => {
    const rows = items.filter((p) => {
      if (src !== "all" && p.source !== src) return false;
      if (our !== "all" && !(p.our_types || []).includes(our)) return false;
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      return (
        p.title.toLowerCase().includes(s) ||
        p.id.toLowerCase().includes(s) ||
        (p.source_difficulty || "").toLowerCase().includes(s) ||
        (p.source_tags || []).some((t) => t.toLowerCase().includes(s)) ||
        (p.our_types || []).some((t) => t.toLowerCase().includes(s))
      );
    });
    if (diffSort === "off") return rows;
    const dir = diffSort === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const ra = difficultyRank(a);
      const rb = difficultyRank(b);
      if (ra == null && rb == null) return 0;
      if (ra == null) return 1;
      if (rb == null) return -1;
      if (ra !== rb) return (ra - rb) * dir;
      return a.title.localeCompare(b.title, "ko");
    });
  }, [items, q, src, our, diffSort]);

  function cycleDiffSort() {
    setDiffSort((s) => (s === "off" ? "asc" : s === "asc" ? "desc" : "off"));
  }

  return (
    <div className="page problems-page">
      <main className="list-main problems-main" aria-label="Problems">
        <div className="filters">
          <input type="search" aria-label="검색" placeholder="제목, 유형 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select
            ariaLabel="출처"
            value={src}
            onChange={setSrc}
            options={[
              { value: "all", label: "출처 전체" },
              { value: "boj", label: "백준" },
              { value: "leetcode", label: "LeetCode" },
              { value: "codeforces", label: "Codeforces" },
            ]}
          />
          <Select
            ariaLabel="목차 유형"
            value={our}
            onChange={setOur}
            options={[
              { value: "all", label: "목차 유형 전체" },
              ...catalogTypes.map((t) => ({ value: t, label: t })),
            ]}
          />
        </div>
        {err ? <div className="error">{err}</div> : null}
        <div className="mobile-problem-tools">
          <span role="status">{filtered.length} problems</span>
          <button type="button" onClick={cycleDiffSort}>
            난이도 {diffSort === "asc" ? "낮은 순 ↑" : diffSort === "desc" ? "높은 순 ↓" : "정렬 ↕"}
          </button>
        </div>
        <ul className="problem-cards" aria-label="문제 목록">
          {filtered.map((p) => (
            <li key={p.id}>
              <Link className="problem-card" to={`/problems/${p.id}`}>
                <span className="problem-card-meta">
                  <span className="src">{p.source_label}</span>
                  <Difficulty source={p.source} label={p.source_difficulty} />
                  <span className={`st st-${p.status}`}>
                    {p.status === "solved" ? "맞음" : p.status === "tried" ? "시도" : "미풀이"}
                  </span>
                </span>
                <strong>{p.title}<span aria-hidden="true">›</span></strong>
                <span className="problem-card-topics">{join(p.our_types || [])}</span>
                {p.source_tags?.length ? <span className="problem-card-tags">사이트 유형 · {join(p.source_tags)}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
        <div className="table-shell" tabIndex={0} role="region" aria-label="문제 목록">
          <table className="prob-table">
            <thead>
              <tr>
                <th>상태</th>
                <th>출처</th>
                <th>
                  <span className="th-diff">
                    사이트 난이도
                    <button
                      type="button"
                      className={`sort-btn${diffSort !== "off" ? ` ${diffSort}` : ""}`}
                      onClick={cycleDiffSort}
                      aria-label={
                        diffSort === "off"
                          ? "난이도 낮은 순으로 정렬"
                          : diffSort === "asc"
                            ? "난이도 높은 순으로 정렬"
                            : "난이도 정렬 해제"
                      }
                      title={
                        diffSort === "off"
                          ? "낮은 순"
                          : diffSort === "asc"
                            ? "높은 순"
                            : "정렬 해제"
                      }
                    >
                      <span className="sort-stack" aria-hidden="true">
                        <i className={diffSort === "asc" ? "on" : undefined}>▲</i>
                        <i className={diffSort === "desc" ? "on" : undefined}>▼</i>
                      </span>
                    </button>
                  </span>
                </th>
                <th>사이트 유형</th>
                <th>목차 유형</th>
                <th>제목</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className={`st st-${p.status}`}>
                      {p.status === "solved" ? "맞음" : p.status === "tried" ? "시도" : "–"}
                    </span>
                  </td>
                  <td>
                    <span className="src">{p.source_label}</span>
                  </td>
                  <td><Difficulty source={p.source} label={p.source_difficulty} /></td>
                  <td className="tags">{join(p.source_tags || [])}</td>
                  <td className="tags">{join(p.our_types || [])}</td>
                  <td>
                    <Link to={`/problems/${p.id}`}>{p.title}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 ? (
          <p className="muted empty-hint">
            {items.length ? "검색 조건에 맞는 문제가 없습니다." : "No problems yet."}
          </p>
        ) : null}
      </main>
    </div>
  );
}
