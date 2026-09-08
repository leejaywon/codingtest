import { OUR_TYPES, PYTHON_LANGUAGE, PYTHON_STARTER, SOURCE_LABEL, statementIncomplete } from "./data/catalog";
import { judgeSamples, preloadPython, runPython, type RunOnceResult, type SubmitResult } from "./lib/pythonRunner";
import { requireSupabase, supabase, supabaseConfigured } from "./lib/supabase";

export type AuthUser = {
  id: string;
  email: string;
  nickname: string;
  nickname_changed_at: string | null;
  picture: string;
};

export const NICKNAME_LOCK_MS = 3 * 24 * 60 * 60 * 1000;

export function nicknameLockedUntil(changedAt: string | null): Date | null {
  if (!changedAt) return null;
  const t = Date.parse(changedAt);
  if (Number.isNaN(t)) return null;
  return new Date(t + NICKNAME_LOCK_MS);
}

export function nicknameIsLocked(changedAt: string | null) {
  const until = nicknameLockedUntil(changedAt);
  return Boolean(until && until.getTime() > Date.now());
}

export type LanguageOption = {
  id: string;
  label: string;
  standard?: string;
  available: boolean;
  runtime?: string;
};

export type ProblemListItem = {
  id: string;
  title: string;
  difficulty: string;
  source_difficulty: string;
  source_tags: string[];
  our_types: string[];
  tags: string[];
  time_limit_ms: number;
  memory_limit_mb: number;
  source: string;
  source_label: string;
  source_url: string;
  status: string;
  judge_mode: string;
  favorite: boolean;
};

export type Sample = { input: string; output: string; hidden?: boolean };

export type ProblemDetail = ProblemListItem & {
  statement_html: string;
  input_spec: string;
  output_spec: string;
  notes: string;
  samples: Sample[];
  starter: Record<string, string>;
  languages: LanguageOption[];
  source_id: string;
  statement_incomplete?: boolean;
};

export type HistoryItem = {
  id: number;
  user_id: string;
  problem_id: string;
  problem_title: string;
  nickname: string;
  language: string;
  verdict: string;
  passed: number;
  total: number;
  origin: string;
  created_at: string;
};

export type SubmissionDetail = HistoryItem & {
  source: string;
  compile_log: string;
  time_ms: number;
  peak_rss_kb: number;
  cases: SubmitResult["cases"];
};

export type CommentItem = {
  id: number;
  submission_id: number;
  user_id: string;
  nickname: string;
  body: string;
  created_at: string;
  updated_at: string;
};

type ProblemRow = {
  id: string;
  source: string;
  source_id: string;
  source_url: string;
  title: string;
  difficulty: string;
  source_difficulty: string;
  source_tags: string[] | null;
  tags: string[] | null;
  our_types: string[] | null;
  time_limit_ms: number;
  memory_limit_mb: number;
  statement_html?: string;
  input_spec?: string;
  output_spec?: string;
  notes?: string;
  samples_json?: Sample[] | null;
  judge_mode: string;
};

const NICKNAME_RE = /^[가-힣a-zA-Z0-9_]{2,16}$/;
const MAX_SOURCE = 200_000;

type ProfileRow = {
  id: string;
  nickname: string;
  picture: string;
  nickname_changed_at: string | null;
};

function randomNickname() {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const pick = (alphabet: string, n: number) =>
    Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `${pick(letters, 4)}${pick(digits, 4)}`;
}

function toAuthUser(
  row: ProfileRow,
  email: string,
): AuthUser {
  return {
    id: row.id,
    email,
    nickname: row.nickname,
    nickname_changed_at: row.nickname_changed_at,
    picture: row.picture || "",
  };
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
}

function codeforcesTitle(row: ProblemRow) {
  const raw = row.source_id || row.id.replace(/^cf-/, "");
  const m = raw.match(/^(\d+)[-_]?([A-Za-z]\d*)$/);
  if (!m) return row.title;
  const official = `${m[1]}${m[2].toUpperCase()}`;
  if (row.title.toUpperCase().startsWith(official)) return row.title;
  return `${official}. ${row.title.replace(/^[A-Z]\d*\.\s*/i, "").trim() || row.title}`;
}

function mapListItem(row: ProblemRow, status = "todo", favorite = false): ProblemListItem {
  const source_tags = asStringList(row.source_tags).length ? asStringList(row.source_tags) : asStringList(row.tags);
  return {
    id: row.id,
    title: row.source === "codeforces" ? codeforcesTitle(row) : row.title,
    difficulty: row.source_difficulty || row.difficulty || "",
    source_difficulty: row.source_difficulty || row.difficulty || "",
    source_tags,
    our_types: asStringList(row.our_types),
    tags: source_tags,
    time_limit_ms: row.time_limit_ms,
    memory_limit_mb: row.memory_limit_mb,
    source: row.source,
    source_label: SOURCE_LABEL[row.source] || row.source,
    source_url: row.source_url || "",
    status,
    judge_mode: row.judge_mode || "stdin",
    favorite,
  };
}

function mapDetail(row: ProblemRow, status = "todo", favorite = false): ProblemDetail {
  const samples = (row.samples_json || []).filter((s) => !s.hidden);
  const html = row.statement_html || "";
  return {
    ...mapListItem(row, status, favorite),
    statement_html: html,
    input_spec: row.input_spec || "",
    output_spec: row.output_spec || "",
    notes: row.notes || "",
    samples,
    starter: { python: PYTHON_STARTER },
    languages: [{ ...PYTHON_LANGUAGE }],
    source_id: row.source_id,
    statement_incomplete: statementIncomplete(html),
  };
}

function fail(message: string): never {
  throw new Error(message);
}

function failUnknown(): never {
  fail("요청을 처리하지 못했습니다");
}

async function currentSessionUser() {
  const sb = requireSupabase();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) fail("로그인이 필요합니다");
  return data.user;
}

async function ensureProfile(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): Promise<AuthUser> {
  const sb = requireSupabase();
  const picture = String(user.user_metadata?.picture || user.user_metadata?.avatar_url || "");
  const email = user.email || "";

  async function load() {
    return sb
      .from("profiles")
      .select("id, nickname, picture, nickname_changed_at")
      .eq("id", user.id)
      .maybeSingle();
  }

  let { data, error } = await load();
  if (error) failUnknown();

  if (!data) {
    for (let i = 0; i < 8; i += 1) {
      const inserted = await sb
        .from("profiles")
        .insert({ id: user.id, picture, nickname: randomNickname() })
        .select("id, nickname, picture, nickname_changed_at")
        .single();
      if (inserted.data) {
        data = inserted.data;
        break;
      }
      if (inserted.error?.code !== "23505") fail("프로필을 만들지 못했습니다");
      const again = await load();
      if (again.error) failUnknown();
      if (again.data) {
        data = again.data;
        break;
      }
    }
  }
  if (!data) fail("프로필을 만들지 못했습니다");

  if (!data.nickname) {
    for (let i = 0; i < 8; i += 1) {
      const patched = await sb
        .from("profiles")
        .update({ nickname: randomNickname() })
        .eq("id", user.id)
        .select("id, nickname, picture, nickname_changed_at")
        .single();
      if (patched.data) {
        data = patched.data;
        break;
      }
      if (patched.error?.code !== "23505") fail("닉네임을 만들지 못했습니다");
    }
  }
  if (!data?.nickname) fail("닉네임을 만들지 못했습니다");

  if (picture && picture !== data.picture) {
    const updated = await sb
      .from("profiles")
      .update({ picture })
      .eq("id", user.id)
      .select("id, nickname, picture, nickname_changed_at")
      .single();
    if (!updated.error && updated.data) data = updated.data;
    else data.picture = picture;
  }
  return toAuthUser(data, email);
}

async function solvedMap(userId: string): Promise<Record<string, string>> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("submissions").select("problem_id, verdict").eq("user_id", userId);
  if (error) failUnknown();
  const out: Record<string, string> = {};
  for (const row of data || []) {
    if (row.verdict === "AC") out[row.problem_id] = "solved";
    else if (!out[row.problem_id]) out[row.problem_id] = "tried";
  }
  return out;
}

function nicknameFromJoin(value: unknown) {
  if (Array.isArray(value)) return String(value[0]?.nickname || "");
  if (value && typeof value === "object" && "nickname" in value) return String((value as { nickname?: string }).nickname || "");
  return "";
}

function titleFromJoin(value: unknown) {
  if (Array.isArray(value)) return String(value[0]?.title || "");
  if (value && typeof value === "object" && "title" in value) return String((value as { title?: string }).title || "");
  return "";
}

export const api = {
  configured: () => supabaseConfigured,

  me: async () => {
    if (!supabase) return { user: null as AuthUser | null, progress: {} as Record<string, string> };
    const { data } = await supabase.auth.getUser();
    if (!data.user) return { user: null, progress: {} };
    const user = await ensureProfile(data.user);
    const progress = await solvedMap(user.id);
    return { user, progress };
  },

  authConfig: async () => ({ google: supabaseConfigured }),

  signInGoogle: async () => {
    const sb = requireSupabase();
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/login` },
    });
    if (error) failUnknown();
  },

  logout: async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) failUnknown();
  },

  setNickname: async (nickname: string) => {
    const name = nickname.trim();
    if (!NICKNAME_RE.test(name)) fail("닉네임은 한글·영문·숫자·밑줄 2~16자입니다");
    const sessionUser = await currentSessionUser();
    const sb = requireSupabase();
    const current = await sb
      .from("profiles")
      .select("nickname, nickname_changed_at")
      .eq("id", sessionUser.id)
      .single();
    if (current.error) failUnknown();
    if (current.data.nickname === name) {
      const { data } = await sb
        .from("profiles")
        .select("id, nickname, picture, nickname_changed_at")
        .eq("id", sessionUser.id)
        .single();
      if (!data) fail("프로필을 찾지 못했습니다");
      return { user: toAuthUser(data, sessionUser.email || "") };
    }
    if (nicknameIsLocked(current.data.nickname_changed_at)) {
      const until = nicknameLockedUntil(current.data.nickname_changed_at);
      fail(`닉네임은 3일에 한 번만 바꿀 수 있습니다. ${until?.toLocaleString() ?? ""} 이후에 다시 시도하세요.`);
    }
    const { data, error } = await sb
      .from("profiles")
      .update({ nickname: name })
      .eq("id", sessionUser.id)
      .select("id, nickname, picture, nickname_changed_at")
      .single();
    if (error) {
      if (error.code === "23505") fail("이미 쓰는 닉네임입니다");
      if (error.code === "23514") fail("닉네임은 한글·영문·숫자·밑줄 2~16자입니다");
      if (error.code === "P0001" || /NICKNAME_LOCKED/i.test(error.message || "")) {
        fail("닉네임은 3일에 한 번만 바꿀 수 있습니다");
      }
      failUnknown();
    }
    return { user: toAuthUser(data, sessionUser.email || "") };
  },

  problems: async () => {
    const sessionUser = await currentSessionUser();
    const sb = requireSupabase();
    const [problemResult, progress, favoriteResult] = await Promise.all([
      sb
        .from("problems")
        .select(
          "id, source, source_id, source_url, title, difficulty, source_difficulty, source_tags, tags, our_types, time_limit_ms, memory_limit_mb, judge_mode",
        )
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true }),
      solvedMap(sessionUser.id),
      sb.from("problem_favorites").select("problem_id").eq("user_id", sessionUser.id),
    ]);
    if (problemResult.error || favoriteResult.error) failUnknown();
    const favoriteIds = new Set((favoriteResult.data || []).map((row) => row.problem_id));
    const items = (problemResult.data || []).map((row) =>
      mapListItem(row as ProblemRow, progress[row.id] || "todo", favoriteIds.has(row.id)),
    );
    return { items, languages: [{ ...PYTHON_LANGUAGE }], catalog_types: [...OUR_TYPES] };
  },

  setProblemFavorite: async (problemId: string, favorite: boolean) => {
    const sessionUser = await currentSessionUser();
    const sb = requireSupabase();
    const result = favorite
      ? await sb
          .from("problem_favorites")
          .insert({ user_id: sessionUser.id, problem_id: problemId })
      : await sb
          .from("problem_favorites")
          .delete()
          .eq("user_id", sessionUser.id)
          .eq("problem_id", problemId);
    if (result.error && !(favorite && result.error.code === "23505")) {
      fail("즐겨찾기를 저장하지 못했습니다. 다시 시도해 주세요.");
    }
  },

  problem: async (id: string) => {
    const sessionUser = await currentSessionUser();
    const sb = requireSupabase();
    const { data, error } = await sb.from("problems").select("*").eq("id", id).maybeSingle();
    if (error) failUnknown();
    if (!data) fail("문제를 찾을 수 없습니다");
    const [progress, favoriteResult] = await Promise.all([
      solvedMap(sessionUser.id),
      sb
        .from("problem_favorites")
        .select("problem_id")
        .eq("user_id", sessionUser.id)
        .eq("problem_id", id)
        .maybeSingle(),
    ]);
    if (favoriteResult.error) failUnknown();
    return mapDetail(data as ProblemRow, progress[id] || "todo", Boolean(favoriteResult.data));
  },

  run: async (body: { problem_id: string; language: string; source: string; stdin: string }): Promise<RunOnceResult> => {
    if (body.language !== "python") fail("지금은 Python만 사용할 수 있습니다");
    if (!body.source.trim()) fail("코드를 입력하세요");
    if (body.source.length > MAX_SOURCE) fail("소스 코드가 너무 깁니다");
    const problem = await api.problem(body.problem_id);
    let stdin = body.stdin;
    let expected: string | null = null;
    if (stdin === "") {
      const first = problem.samples[0];
      if (first) stdin = first.input;
    }
    const match = problem.samples.find((s) => s.input === stdin);
    if (match) expected = match.output;
    return runPython(body.source, stdin, problem.time_limit_ms, expected);
  },

  submit: async (body: { problem_id: string; language: string; source: string }): Promise<SubmitResult & { id: number }> => {
    if (body.language !== "python") fail("지금은 Python만 제출할 수 있습니다");
    if (!body.source.trim()) fail("코드를 입력하세요");
    if (body.source.length > MAX_SOURCE) fail("소스 코드가 너무 깁니다");
    const sessionUser = await currentSessionUser();
    const problem = await api.problem(body.problem_id);
    if (!problem.samples.length || problem.judge_mode === "none") {
      fail("이 문제는 예제로 채점할 수 없습니다. Run으로 확인하세요.");
    }
    const judged = await judgeSamples(body.source, problem.samples, problem.time_limit_ms);
    const sb = requireSupabase();
    const { data, error } = await sb
      .from("submissions")
      .insert({
        user_id: sessionUser.id,
        problem_id: body.problem_id,
        language: "python",
        source: body.source,
        verdict: judged.verdict,
        passed: judged.passed,
        total: judged.total,
        time_ms: judged.time_ms,
        peak_rss_kb: judged.peak_rss_kb,
        compile_log: judged.compile_log || null,
        detail_json: judged.cases,
        origin: "browser_sample",
        problem_title: problem.title,
      })
      .select("id")
      .single();
    if (error) failUnknown();
    return { id: data.id, ...judged };
  },

  submissions: async (filter: "all" | "mine" = "all"): Promise<{ items: HistoryItem[] }> => {
    const sessionUser = await currentSessionUser();
    const sb = requireSupabase();
    let query = sb
      .from("submissions")
      .select("id, user_id, problem_id, problem_title, language, verdict, passed, total, origin, created_at, profiles(nickname), problems(title)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (filter === "mine") query = query.eq("user_id", sessionUser.id);
    const { data, error } = await query;
    if (error) failUnknown();
    const items: HistoryItem[] = (data || []).map((row) => ({
      id: row.id,
      user_id: row.user_id,
      problem_id: row.problem_id,
      problem_title: row.problem_title || titleFromJoin(row.problems) || row.problem_id,
      nickname: nicknameFromJoin(row.profiles) || "익명",
      language: row.language,
      verdict: row.verdict,
      passed: row.passed,
      total: row.total,
      origin: row.origin || "browser_sample",
      created_at: row.created_at,
    }));
    return { items };
  },

  submission: async (id: number): Promise<SubmissionDetail> => {
    await currentSessionUser();
    const sb = requireSupabase();
    const { data, error } = await sb
      .from("submissions")
      .select(
        "id, user_id, problem_id, problem_title, language, source, verdict, passed, total, time_ms, peak_rss_kb, compile_log, detail_json, origin, created_at, profiles(nickname), problems(title)",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) failUnknown();
    if (!data) fail("제출을 찾을 수 없습니다");
    return {
      id: data.id,
      user_id: data.user_id,
      problem_id: data.problem_id,
      problem_title: data.problem_title || titleFromJoin(data.problems) || data.problem_id,
      nickname: nicknameFromJoin(data.profiles) || "익명",
      language: data.language,
      verdict: data.verdict,
      passed: data.passed,
      total: data.total,
      origin: data.origin || "browser_sample",
      created_at: data.created_at,
      source: data.source,
      compile_log: data.compile_log || "",
      time_ms: data.time_ms || 0,
      peak_rss_kb: data.peak_rss_kb || 0,
      cases: Array.isArray(data.detail_json) ? data.detail_json : [],
    };
  },

  comments: async (submissionId: number): Promise<{ items: CommentItem[] }> => {
    await currentSessionUser();
    const sb = requireSupabase();
    const { data, error } = await sb
      .from("comments")
      .select("id, submission_id, user_id, body, created_at, updated_at, profiles(nickname)")
      .eq("submission_id", submissionId)
      .order("created_at", { ascending: true });
    if (error) failUnknown();
    return {
      items: (data || []).map((row) => ({
        id: row.id,
        submission_id: row.submission_id,
        user_id: row.user_id,
        nickname: nicknameFromJoin(row.profiles) || "익명",
        body: row.body,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
    };
  },

  addComment: async (submissionId: number, body: string) => {
    const text = body.trim();
    if (!text) fail("댓글을 입력하세요");
    const sessionUser = await currentSessionUser();
    const sb = requireSupabase();
    const { error } = await sb.from("comments").insert({
      submission_id: submissionId,
      user_id: sessionUser.id,
      body: text,
    });
    if (error) failUnknown();
  },

  updateComment: async (id: number, body: string) => {
    const text = body.trim();
    if (!text) fail("댓글을 입력하세요");
    const sessionUser = await currentSessionUser();
    const sb = requireSupabase();
    const { error } = await sb.from("comments").update({ body: text }).eq("id", id).eq("user_id", sessionUser.id);
    if (error) failUnknown();
  },

  deleteComment: async (id: number) => {
    const sessionUser = await currentSessionUser();
    const sb = requireSupabase();
    const { error } = await sb.from("comments").delete().eq("id", id).eq("user_id", sessionUser.id);
    if (error) failUnknown();
  },

  preloadRuntime: () => preloadPython(),
};
