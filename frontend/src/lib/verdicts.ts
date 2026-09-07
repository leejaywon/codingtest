export function normalizeOutput(s: string) {
  const lines = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").map((line) => line.replace(/[ \t]+$/g, ""));
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

export function compareOutput(actual: string, expected: string) {
  return normalizeOutput(actual) === normalizeOutput(expected);
}

export function verdictLabel(verdict: string, origin = "browser_sample") {
  const sample: Record<string, string> = {
    AC: "Sample passed",
    WA: "Sample mismatch",
    TLE: "Time limit",
    MLE: "Memory limit",
    RE: "Runtime error",
    CE: "Compile error",
    OK: "Finished",
  };
  if (origin === "browser_sample") return sample[verdict] || verdict;
  const official: Record<string, string> = {
    AC: "Accepted",
    WA: "Wrong answer",
    TLE: "Time limit",
    MLE: "Memory limit",
    RE: "Runtime error",
    CE: "Compile error",
  };
  return official[verdict] || verdict;
}
