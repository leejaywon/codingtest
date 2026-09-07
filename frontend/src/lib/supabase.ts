import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

function isBrowserSafeKey(key: string) {
  if (!key || key.startsWith("sb_secret_")) return false;
  return key.startsWith("sb_publishable_") || key.startsWith("eyJ");
}

export const supabaseConfigured = Boolean(url && isBrowserSafeKey(anon));

function isApiKeyBearer(value: string | null) {
  if (!value || !anon) return false;
  const token = value.replace(/^Bearer\s+/i, "");
  return token === anon || token.startsWith("sb_publishable_") || token.startsWith("sb_secret_");
}

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url, anon, {
      global: {
        headers: { apikey: anon },
        fetch: async (input, init) => {
          const headers = new Headers(init?.headers ?? {});
          if (!headers.has("apikey")) headers.set("apikey", anon);
          if (isApiKeyBearer(headers.get("Authorization"))) {
            headers.delete("Authorization");
          }
          return fetch(input, { ...init, headers });
        },
      },
      auth: {
        persistSession: true,
        detectSessionInUrl: true,
        autoRefreshToken: true,
        flowType: "pkce",
      },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error("지금은 서비스를 이용할 수 없습니다.");
  }
  return supabase;
}
