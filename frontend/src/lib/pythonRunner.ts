import { compareOutput } from "./verdicts";

export type RunOnceResult = {
  verdict: string;
  time_ms: number;
  peak_rss_kb: number;
  stdout: string;
  stderr: string;
  compile_log: string;
  stdin: string;
  expected: string | null;
  sample_match: boolean | null;
};

export type SubmitCase = {
  index: number;
  hidden: boolean;
  verdict: string;
  time_ms: number;
  peak_rss_kb: number;
  stdout: string;
  expected: string;
  stderr: string;
};

export type SubmitResult = {
  verdict: string;
  passed: number;
  total: number;
  time_ms: number;
  peak_rss_kb: number;
  compile_log: string;
  cases: SubmitCase[];
};

type WorkerOk = {
  type: "ready";
  version: string;
};

type WorkerResult = {
  type: "result";
  id: number;
  verdict: string;
  time_ms: number;
  peak_rss_kb: number;
  stdout: string;
  stderr: string;
  compile_log: string;
};

type WorkerErr = {
  type: "error";
  id?: number;
  message: string;
};

type WorkerMsg = WorkerOk | WorkerResult | WorkerErr;

const INIT_MS = 90_000;

class PythonRunner {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private seq = 0;
  version = "3.12";

  private spawn() {
    const worker = new Worker("/pyodide-worker.js", { type: "module" });
    this.worker = worker;
    this.ready = new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        reject(new Error("Python runtime failed to load"));
      }, INIT_MS);
      const onMessage = (event: MessageEvent<WorkerMsg>) => {
        if (event.data.type !== "ready") return;
        window.clearTimeout(timer);
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        this.version = event.data.version || this.version;
        resolve();
      };
      const onError = () => {
        window.clearTimeout(timer);
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        reject(new Error("Python worker failed"));
      };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      worker.postMessage({ type: "init" });
    });
  }

  private kill() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
  }

  async ensure() {
    if (!this.worker || !this.ready) this.spawn();
    await this.ready;
  }

  async run(source: string, stdin: string, timeLimitMs: number): Promise<Omit<RunOnceResult, "stdin" | "expected" | "sample_match">> {
    await this.ensure();
    const worker = this.worker;
    if (!worker) throw new Error("실행 환경을 준비하지 못했습니다");
    const id = ++this.seq;
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        worker.removeEventListener("message", onMessage);
        this.kill();
        resolve({
          verdict: "TLE",
          time_ms: timeLimitMs,
          peak_rss_kb: 0,
          stdout: "",
          stderr: "Time limit exceeded",
          compile_log: "",
        });
      }, Math.max(200, timeLimitMs));

      const onMessage = (event: MessageEvent<WorkerMsg>) => {
        const msg = event.data;
        if (msg.type === "ready") return;
        if (msg.type === "error" && (msg.id === undefined || msg.id === id)) {
          window.clearTimeout(timer);
          worker.removeEventListener("message", onMessage);
          resolve({
            verdict: "RE",
            time_ms: 0,
            peak_rss_kb: 0,
            stdout: "",
            stderr: msg.message,
            compile_log: "",
          });
          return;
        }
        if (msg.type === "result" && msg.id === id) {
          window.clearTimeout(timer);
          worker.removeEventListener("message", onMessage);
          resolve({
            verdict: msg.verdict,
            time_ms: msg.time_ms,
            peak_rss_kb: msg.peak_rss_kb,
            stdout: msg.stdout,
            stderr: msg.stderr,
            compile_log: msg.compile_log,
          });
        }
      };
      worker.addEventListener("message", onMessage);
      worker.postMessage({ type: "run", id, source, stdin });
    });
  }
}

let runner: PythonRunner | null = null;

export function getPythonRunner() {
  if (!runner) runner = new PythonRunner();
  return runner;
}

export function preloadPython() {
  return getPythonRunner().ensure();
}

export async function runPython(source: string, stdin: string, timeLimitMs: number, expected?: string | null): Promise<RunOnceResult> {
  const raw = await getPythonRunner().run(source, stdin, timeLimitMs);
  const sample_match =
    raw.verdict === "OK" && expected != null && expected !== undefined ? compareOutput(raw.stdout, expected) : null;
  return {
    ...raw,
    stdin,
    expected: expected ?? null,
    sample_match,
  };
}

export async function judgeSamples(
  source: string,
  samples: Array<{ input: string; output: string }>,
  timeLimitMs: number,
): Promise<SubmitResult> {
  const cases: SubmitCase[] = [];
  let passed = 0;
  let peak = 0;
  let compile_log = "";
  let overall = "AC";
  let totalTime = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i];
    const raw = await getPythonRunner().run(source, sample.input, timeLimitMs);
    totalTime += raw.time_ms;
    peak = Math.max(peak, raw.peak_rss_kb);
    if (raw.compile_log) compile_log = raw.compile_log;
    let verdict = raw.verdict;
    if (verdict === "OK") verdict = compareOutput(raw.stdout, sample.output) ? "AC" : "WA";
    if (verdict === "AC") passed += 1;
    else if (overall === "AC") overall = verdict;
    cases.push({
      index: i + 1,
      hidden: false,
      verdict,
      time_ms: raw.time_ms,
      peak_rss_kb: raw.peak_rss_kb,
      stdout: raw.stdout,
      expected: sample.output,
      stderr: raw.stderr,
    });
    if (verdict === "TLE" || verdict === "CE") break;
  }

  return {
    verdict: samples.length ? overall : "WA",
    passed,
    total: samples.length,
    time_ms: totalTime,
    peak_rss_kb: peak,
    compile_log,
    cases,
  };
}
