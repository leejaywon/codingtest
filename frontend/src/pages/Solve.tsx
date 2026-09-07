import Editor, { type BeforeMount } from "@monaco-editor/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AuthUser, api, ProblemDetail } from "../api";
import EditorSplit from "../components/EditorSplit";
import AutoGrowTextarea from "../components/AutoGrowTextarea";
import Difficulty from "../components/Difficulty";
import { PYTHON_LANGUAGE } from "../data/catalog";
import { verdictLabel } from "../lib/verdicts";

const prepareEditor: BeforeMount = (monaco) => {
  monaco.editor.defineTheme("codingtest", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#151b21",
      "editor.foreground": "#dce2e8",
      "editorGutter.background": "#202830",
      "editorLineNumber.foreground": "#8b98a4",
      "editorLineNumber.activeForeground": "#c6e394",
      "editor.lineHighlightBackground": "#202b30",
      "editor.lineHighlightBorder": "#35434a",
      "editor.selectionBackground": "#486136",
      "editorCursor.foreground": "#c6e394",
      "editorWidget.background": "#242d36",
      "editorWidget.border": "#7b8894",
      "scrollbar.shadow": "#00000000",
      "scrollbarSlider.background": "#8996a4aa",
      "scrollbarSlider.hoverBackground": "#b5c0cddd",
      "scrollbarSlider.activeBackground": "#a7c77ddd",
    },
  });
};

function englishSectionLabels(html: string) {
  const document = new DOMParser().parseFromString(html, "text/html");
  const labels: Record<string, string> = {
    "문제": "Problem", "입력": "Input", "출력": "Output", "예제": "Examples",
    "힌트": "Hint", "노트": "Notes", "제한": "Constraints", "인터랙션": "Interaction",
  };
  document.querySelectorAll("h1, h2, h3, h4, h5, h6, .section-title").forEach((heading) => {
    const label = heading.textContent?.trim().replace(/\s+/g, " ") || "";
    const sample = label.match(/^예제\s*(입력|출력)\s*(\d*)$/);
    const translated = labels[label] || (sample ? `Sample ${sample[1] === "입력" ? "input" : "output"}${sample[2] ? ` ${sample[2]}` : ""}` : null);
    if (translated) heading.textContent = translated;
  });
  return document.body.innerHTML;
}

function OutputChannel({ label, text }: { label: string; text: string }) {
  return (
    <section className="output-channel" aria-label={label}>
      <h4>{label}</h4>
      <pre className="output-text">{text}</pre>
    </section>
  );
}

function TypeChips({ values }: { values: string[] }) {
  if (!values.length) return <span className="type-empty">None</span>;
  return (
    <>
      {values.map((t) => (
        <span key={t} className="type-chip">
          {t}
        </span>
      ))}
    </>
  );
}

export default function Solve({
  user: _user,
  onLogout: _onLogout,
}: {
  user: AuthUser;
  onLogout: () => void;
}) {
  const { id = "" } = useParams();
  const [p, setP] = useState<ProblemDetail | null>(null);
  const [code, setCode] = useState("");
  const [stdin, setStdin] = useState("");
  const [busy, setBusy] = useState(false);
  const [mobilePane, setMobilePane] = useState<"problem" | "code">("problem");
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [err, setErr] = useState("");
  const [runResult, setRunResult] = useState<Awaited<ReturnType<typeof api.run>> | null>(null);
  const [judge, setJudge] = useState<Awaited<ReturnType<typeof api.submit>> | null>(null);

  useLayoutEffect(() => {
    const workspace = workspaceRef.current;
    if (workspace && window.matchMedia("(max-width: 760px)").matches && workspace.getBoundingClientRect().top < 0) {
      window.scrollTo(0, window.scrollY + workspace.getBoundingClientRect().top);
    }
  }, [mobilePane]);

  useEffect(() => {
    api.preloadRuntime()
      .then(() => setRuntimeReady(true))
      .catch(() => setRuntimeReady(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setJudge(null);
    setRunResult(null);
    setErr("");
    setP(null);
    setMobilePane("problem");
    api.problem(id).then((d) => {
      if (cancelled) return;
      setP(d);
      setCode(d.starter.python || "");
      setStdin(d.samples[0]?.input || "");
    }).catch((e) => {
      if (!cancelled) setErr(e instanceof Error ? e.message : "Could not load the problem");
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const statementHtml = useMemo(() => englishSectionLabels(p?.statement_html || ""), [p?.statement_html]);

  async function run() {
    if (!p) return;
    setBusy(true);
    setErr("");
    setJudge(null);
    setRunResult(null);
    try {
      const r = await api.run({ problem_id: p.id, language: "python", source: code, stdin });
      setRunResult(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Run failed");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!p) return;
    setBusy(true);
    setErr("");
    setRunResult(null);
    setJudge(null);
    try {
      const r = await api.submit({ problem_id: p.id, language: "python", source: code });
      setJudge(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setBusy(false);
    }
  }

  if (!p && err) return <div className="boot error">{err}</div>;
  if (!p) return <div className="boot">Loading problem…</div>;

  const missing = Boolean(p.statement_incomplete);

  return (
    <div ref={workspaceRef} className={`page exam mobile-pane-${mobilePane}`}>
      <div className="solve-tabs" role="group" aria-label="Workspace view">
        <button type="button" aria-pressed={mobilePane === "problem"} aria-controls="problem-statement" onClick={() => setMobilePane("problem")}>Problem</button>
        <button type="button" aria-pressed={mobilePane === "code"} aria-controls="code-workspace" onClick={() => setMobilePane("code")}>Code &amp; results</button>
      </div>
      <div className="exam-body">
        <aside id="problem-statement" className="problem-pane" tabIndex={0} aria-label="Problem statement">
          <div className="brief-head">
            <div className="brief-chips">
              <span className="chip chip-src">{p.source_label}</span>
              {p.source_difficulty ? <Difficulty source={p.source} label={p.source_difficulty} /> : null}
              <span className="chip chip-limit">Time {p.time_limit_ms}ms</span>
              <span className="chip chip-limit">Memory {p.memory_limit_mb}MB</span>
            </div>
            <h1>{p.title}</h1>
            <div className="type-block">
              <div className="type-row">
                <span className="type-k">Source tags</span>
                <div className="type-v">
                  <TypeChips values={p.source_tags || []} />
                </div>
              </div>
              <div className="type-row">
                <span className="type-k">Topics</span>
                <div className="type-v">
                  <TypeChips values={p.our_types || []} />
                </div>
              </div>
            </div>
          </div>

          {missing ? (
            <div className="stmt-miss">
              <p>Could not load the problem statement.</p>
            </div>
          ) : (
            <div
              className={p.samples.length ? "statement has-samples" : "statement"}
              dangerouslySetInnerHTML={{ __html: statementHtml }}
            />
          )}

          {p.samples.length ? (
            <div className="samples">
              <h3>Examples</h3>
              {p.samples.map((s, i) => (
                <div key={i} className="sample">
                  <div>
                    <b>Sample input {i + 1}</b>
                    <pre>{s.input}</pre>
                  </div>
                  <div>
                    <b>Sample output {i + 1}</b>
                    <pre>{s.output}</pre>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {p.source_url ? (
            <p className="source-line">
              출처 {p.source_label}
              {" · "}
              <a href={p.source_url} target="_blank" rel="noreferrer">
                {p.source_url.replace(/^https?:\/\//, "")}
              </a>
              . 원문 저작권은 해당 사이트/출제자에게 있습니다.
            </p>
          ) : null}
        </aside>
        <section id="code-workspace" className="ide" aria-label="Code workspace">
          <div className="ide-bar">
            <span className="ide-label">EDITOR</span>
            <span className="lang-pill">{PYTHON_LANGUAGE.label}</span>
            <button type="button" disabled={busy} onClick={run}>
              Run
            </button>
            <button type="button" className="primary" disabled={busy} onClick={submit}>
              Submit
            </button>
            <Link to="/" className="ghost-link">
              Problems
            </Link>
          </div>
          <EditorSplit editor={<div className="editor">
            <Editor
              height="100%"
              language="python"
              theme="codingtest"
              beforeMount={prepareEditor}
              value={code}
              onChange={(v) => setCode(v || "")}
              options={{
                fontSize: 16,
                automaticLayout: true,
                lineNumbersMinChars: 3,
                glyphMargin: false,
                scrollBeyondLastLine: false,
                minimap: { enabled: false },
                overviewRulerLanes: 0,
                overviewRulerBorder: false,
                hideCursorInOverviewRuler: true,
                tabSize: 4,
                padding: { top: 12, bottom: 12 },
                scrollbar: { verticalScrollbarSize: 12, horizontalScrollbarSize: 12 },
              }}
            />
          </div>
          } output={<div className="io" id="editor-io">
            <p className="runtime-note">
              {runtimeReady
                ? "Only Submit is saved to History."
                : "Preparing the runner..."}
            </p>
            <label>
              <span className="io-label">Standard input</span>
              <AutoGrowTextarea value={stdin} onChange={(e) => setStdin(e.target.value)} />
            </label>
            <div className="result">
              {err ? <div className="error" role="alert">{err}</div> : null}
              {judge ? (
                <div>
                  <div className="result-summary" role="status">
                    <strong className={`v-${judge.verdict}`}>{verdictLabel(judge.verdict)}</strong>
                    <span>{judge.passed}/{judge.total} samples</span>
                    <span>{judge.time_ms} ms</span>
                    <span className="sample-status">Sample</span>
                  </div>
                  <table className="case-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Verdict</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {judge.cases.map((c) => (
                        <tr key={c.index}>
                          <td>{c.index}</td>
                          <td>{verdictLabel(c.verdict)}</td>
                          <td>{c.time_ms} ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {judge.compile_log ? <OutputChannel label="Compiler output" text={judge.compile_log} /> : null}
                </div>
              ) : runResult ? (
                <>
                  <div className="result-summary" role="status">
                    <strong className={`v-${runResult.verdict}`}>{verdictLabel(runResult.verdict === "OK" ? "OK" : runResult.verdict)}</strong>
                    <span>{runResult.time_ms} ms</span>
                    {runResult.sample_match !== null ? (
                      <span className={`sample-status ${runResult.sample_match ? "match" : "mismatch"}`}>
                        {runResult.sample_match ? "Sample match" : "Sample mismatch"}
                      </span>
                    ) : null}
                  </div>
                  <OutputChannel label="Standard output" text={runResult.stdout} />
                  {runResult.stderr ? <OutputChannel label="Standard error" text={runResult.stderr} /> : null}
                  {runResult.compile_log ? <OutputChannel label="Compiler output" text={runResult.compile_log} /> : null}
                </>
              ) : (
                !err && <p className="result-placeholder" role="status">{busy ? "Running…" : "Run or submit to see results."}</p>
              )}
            </div>
          </div>} />
        </section>
      </div>
    </div>
  );
}
