import { useEffect, useMemo, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthUser } from "../api";
import PageHeader from "../components/PageHeader";
import Select from "../components/Select";
import {
  CONCEPT_GROUPS,
  CONCEPTS,
  RANK_META,
  type Concept,
  type ConceptSection,
} from "../data/concepts";

function problemsHref(c: Concept) {
  if (!c.catalogName) return "/";
  return `/?type=${encodeURIComponent(c.catalogName)}`;
}

function Text({ value }: { value: string }) {
  const parts = value.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("`") && part.endsWith("`") ? <code key={i}>{part.slice(1, -1)}</code> : part,
      )}
    </>
  );
}

function Section({ section }: { section: ConceptSection }) {
  return (
    <section>
      <h4>{section.heading}</h4>
      {section.paragraphs?.map((p) => (
        <p key={p}>
          <Text value={p} />
        </p>
      ))}
      {section.items?.length ? (
        <ul>
          {section.items.map((item) => (
            <li key={item}>
              <Text value={item} />
            </li>
          ))}
        </ul>
      ) : null}
      {section.code ? <pre>{section.code}</pre> : null}
    </section>
  );
}

export default function Concepts({
  user: _user,
  onLogout: _onLogout,
}: {
  user: AuthUser;
  onLogout: () => void;
}) {
  const loc = useLocation();
  const navigate = useNavigate();
  const articleRef = useRef<HTMLElement>(null);
  const selected = useMemo(() => {
    const id = decodeURIComponent((loc.hash || "").replace(/^#/, ""));
    return CONCEPTS.find((c) => c.id === id) || CONCEPTS[0];
  }, [loc.hash]);

  useEffect(() => {
    if (window.matchMedia("(min-width: 961px)").matches) {
      articleRef.current?.scrollTo(0, 0);
      document.querySelector(".concepts-toc a.on")?.scrollIntoView({ block: "nearest" });
    }
  }, [selected.id]);

  return (
    <div className="page concepts-page">
      <PageHeader title="Concepts" />
      <div className="mobile-concept-picker">
        <span>개념 목차</span>
        <Select
          ariaLabel="개념 목차"
          value={selected.id}
          onChange={(id) => navigate(`/concepts#${id}`, { replace: true })}
          options={CONCEPT_GROUPS.flatMap((group) =>
            group.items.map((concept) => ({ value: concept.id, label: concept.title })),
          )}
        />
      </div>
      <div className="concepts-split">
        <nav className="concepts-toc" aria-label="개념 목차">
          {CONCEPT_GROUPS.map((g) => (
            <div key={g.rank} className="toc-group">
              <div className="toc-group-label">
                {RANK_META[g.rank].label}
                <span>{RANK_META[g.rank].hint}</span>
              </div>
              {g.items.map((c, i) => (
                <Link
                  key={c.id}
                  to={{ pathname: "/concepts", hash: `#${c.id}` }}
                  replace
                  preventScrollReset
                  className={c.id === selected.id ? "on" : undefined}
                  aria-current={c.id === selected.id ? "location" : undefined}
                >
                  <em>{String(i + 1).padStart(2, "0")}</em>
                  {c.title}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <article className="concepts-article" ref={articleRef}>
          <h3>{selected.title}</h3>
          {selected.sections.map((section) => (
            <Section key={section.heading} section={section} />
          ))}
          {selected.laterRows ? (
            <section>
              <h4>목록</h4>
              <div className="table-shell">
                <table className="prob-table later-table" role="table" aria-label="후순위 유형">
                  <thead>
                    <tr>
                      <th>유형</th>
                      <th>언제</th>
                      <th>메모</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.laterRows.map((row) => (
                      <tr key={row.name}>
                        <td>{row.name}</td>
                        <td data-label="언제">{row.when}</td>
                        <td data-label="메모">{row.advice}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
          {selected.catalogName ? (
            <Link className="concept-cta" to={problemsHref(selected)}>
              이 유형 문제 보기
            </Link>
          ) : null}
        </article>
      </div>
    </div>
  );
}
