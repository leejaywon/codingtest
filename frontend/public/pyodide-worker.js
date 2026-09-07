const INDEX = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";
const MAX_OUTPUT = 1_000_000;

let pyodide = null;
let loading = null;

async function getPyodide() {
  if (pyodide) return pyodide;
  if (!loading) {
    loading = (async () => {
      const mod = await import(`${INDEX}pyodide.mjs`);
      return mod.loadPyodide({ indexURL: INDEX });
    })();
  }
  pyodide = await loading;
  return pyodide;
}

function clip(text) {
  if (!text) return "";
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n…` : text;
}

async function runOnce(runtime, source, stdin) {
  let stdout = "";
  let stderr = "";
  const outDec = new TextDecoder();
  const errDec = new TextDecoder();
  runtime.setStdout({
    write(buf) {
      stdout += outDec.decode(buf, { stream: true });
      return buf.length;
    },
    isatty: false,
  });
  runtime.setStderr({
    write(buf) {
      stderr += errDec.decode(buf, { stream: true });
      return buf.length;
    },
    isatty: false,
  });
  runtime.globals.set("_judge_stdin", stdin ?? "");
  runtime.runPython(`
import sys
from io import StringIO
sys.stdin = StringIO(str(_judge_stdin))
sys.argv = ["main.py"]
`);
  const started = performance.now();
  try {
    await runtime.runPythonAsync(source);
    return {
      verdict: "OK",
      time_ms: Math.max(1, Math.round(performance.now() - started)),
      peak_rss_kb: 0,
      stdout: clip(stdout),
      stderr: clip(stderr),
      compile_log: "",
    };
  } catch (err) {
    const text = String(err && err.message ? err.message : err);
    const compile = /SyntaxError|IndentationError|TabError/.test(text);
    return {
      verdict: compile ? "CE" : "RE",
      time_ms: Math.max(1, Math.round(performance.now() - started)),
      peak_rss_kb: 0,
      stdout: clip(stdout),
      stderr: clip(stderr ? `${stderr}\n${text}` : text),
      compile_log: compile ? text : "",
    };
  }
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  try {
    if (msg.type === "init") {
      const runtime = await getPyodide();
      const version = runtime.runPython("import sys; sys.version.split()[0]");
      self.postMessage({ type: "ready", version });
      return;
    }
    if (msg.type === "run") {
      const runtime = await getPyodide();
      const result = await runOnce(runtime, msg.source || "", msg.stdin || "");
      self.postMessage({ type: "result", id: msg.id, ...result });
    }
  } catch (err) {
    self.postMessage({
      type: "error",
      id: msg.id,
      message: String(err && err.message ? err.message : err),
    });
  }
};
