import { Fragment, type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AuthUser, CommentItem, HistoryItem, SubmissionDetail, api } from "../api";
import PageHeader from "../components/PageHeader";
import { verdictLabel } from "../lib/verdicts";

const LANG_LABEL: Record<string, string> = {
  python: "Python",
  cpp: "C++",
  java: "Java",
};

function when(iso: string) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso : new Date(t).toLocaleString();
}

function Comments({
  submissionId,
  userId,
}: {
  submissionId: number;
  userId: string;
}) {
  const [items, setItems] = useState<CommentItem[]>([]);
  const [draft, setDraft] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    const r = await api.comments(submissionId);
    setItems(r.items);
  }

  useEffect(() => {
    reload().catch((e) => setErr(e instanceof Error ? e.message : "Could not load comments"));
  }, [submissionId]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await api.addComment(submissionId, draft);
      setDraft("");
      await reload();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not post comment");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: number) {
    setBusy(true);
    setErr("");
    try {
      await api.updateComment(id, editBody);
      setEditId(null);
      await reload();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not edit comment");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!window.confirm("Delete this comment?")) return;
    setBusy(true);
    setErr("");
    try {
      await api.deleteComment(id);
      await reload();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not delete comment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="hist-comments" aria-label="Comments">
      <h4>Comments</h4>
      {err ? <p className="error">{err}</p> : null}
      {items.length === 0 ? <p className="muted">No comments yet.</p> : null}
      <ul className="comment-list">
        {items.map((c) => {
          const mine = c.user_id === userId;
          const edited = c.updated_at && c.updated_at !== c.created_at;
          return (
            <li key={c.id} className="comment-item">
              <div className="comment-meta">
                <strong>{c.nickname}</strong>
                <time dateTime={c.created_at}>{when(c.created_at)}</time>
                {edited ? <span className="muted">edited</span> : null}
              </div>
              {editId === c.id ? (
                <div className="comment-edit">
                  <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} maxLength={4000} />
                  <div className="comment-actions">
                    <button type="button" className="primary" disabled={busy} onClick={() => saveEdit(c.id)}>
                      Save
                    </button>
                    <button type="button" disabled={busy} onClick={() => setEditId(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="comment-body">{c.body}</p>
              )}
              {mine && editId !== c.id ? (
                <div className="comment-actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setEditId(c.id);
                      setEditBody(c.body);
                    }}
                  >
                    Edit
                  </button>
                  <button type="button" disabled={busy} onClick={() => remove(c.id)}>
                    Delete
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <form className="comment-form" onSubmit={add}>
        <label>
          <span className="io-label">Comment</span>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={4000}
            rows={3}
            placeholder="Leave a comment"
          />
        </label>
        <button type="submit" className="primary" disabled={busy || !draft.trim()}>
          Post
        </button>
      </form>
    </section>
  );
}

function Detail({
  id,
  userId,
}: {
  id: number;
  userId: string;
}) {
  const [row, setRow] = useState<SubmissionDetail | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .submission(id)
      .then((d) => {
        if (!cancelled) setRow(d);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Could not load submission");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (err) return <p className="error">{err}</p>;
  if (!row) return <p className="muted">Loading...</p>;

  return (
    <div className="hist-detail">
      <p className="hist-origin">Results are based on sample tests.</p>
      <p className="hist-summary">
        {verdictLabel(row.verdict, row.origin)} ({row.passed}/{row.total})
        {row.time_ms ? ` · ${row.time_ms} ms` : ""}
      </p>
      {row.cases.length ? (
        <table className="case-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Result</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {row.cases.map((c) => (
              <tr key={c.index}>
                <td>{c.index}</td>
                <td>{verdictLabel(c.verdict, row.origin)}</td>
                <td>{c.time_ms} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {row.compile_log ? (
        <section className="output-channel">
          <h4>Compiler output</h4>
          <pre className="output-text">{row.compile_log}</pre>
        </section>
      ) : null}
      <section className="output-channel">
        <h4>Source</h4>
        <pre className="output-text hist-source">{row.source}</pre>
      </section>
      <Comments submissionId={id} userId={userId} />
    </div>
  );
}

export default function History({
  user,
  onLogout: _onLogout,
}: {
  user: AuthUser;
  onLogout: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    setErr("");
    api
      .submissions(filter)
      .then((r) => setItems(r.items))
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load history"));
  }, [filter]);

  return (
    <div className="page">
      <PageHeader title="History" />
      <main className="list-main history-main">
        <div className="filters hist-filters" role="tablist" aria-label="Submission filter">
          <button
            type="button"
            className={filter === "all" ? "seg on" : "seg"}
            aria-selected={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            className={filter === "mine" ? "seg on" : "seg"}
            aria-selected={filter === "mine"}
            onClick={() => setFilter("mine")}
          >
            Mine
          </button>
        </div>
        {err ? <div className="error">{err}</div> : null}
        <div className="table-shell">
          <table className="prob-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Problem</th>
                <th>Language</th>
                <th>Result</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => {
                const open = openId === s.id;
                return (
                  <Fragment key={s.id}>
                    <tr
                      className={open ? "hist-row is-open" : "hist-row"}
                      tabIndex={0}
                      onClick={() => setOpenId(open ? null : s.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setOpenId(open ? null : s.id);
                        }
                      }}
                    >
                      <td>{s.nickname}</td>
                      <td>
                        <Link to={`/problems/${s.problem_id}`} onClick={(e) => e.stopPropagation()}>
                          {s.problem_title}
                        </Link>
                      </td>
                      <td>{LANG_LABEL[s.language] || s.language}</td>
                      <td>
                        <span className={`st ${s.verdict === "AC" ? "st-solved" : "st-tried"}`}>
                          {verdictLabel(s.verdict, s.origin)} ({s.passed}/{s.total})
                        </span>
                      </td>
                      <td>{when(s.created_at)}</td>
                    </tr>
                    {open ? (
                      <tr className="hist-expand">
                        <td colSpan={5}>
                          <Detail id={s.id} userId={user.id} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {items.length === 0 && !err ? <p className="muted empty-hint">No public submissions yet. Run is not recorded.</p> : null}
      </main>
    </div>
  );
}
