import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthUser, api, nicknameIsLocked, nicknameLockedUntil } from "../api";
import PageHeader from "../components/PageHeader";

export default function Nickname({
  user,
  onSaved,
  onLogout,
}: {
  user: AuthUser;
  onSaved: (u: AuthUser) => void;
  onLogout: () => void | Promise<void>;
}) {
  const nav = useNavigate();
  const [nickname, setNickname] = useState(user.nickname || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const locked = nicknameIsLocked(user.nickname_changed_at);
  const lockedUntil = nicknameLockedUntil(user.nickname_changed_at);

  async function logout() {
    setErr("");
    setSaved(false);
    setLoggingOut(true);
    try {
      await onLogout();
      nav("/login", { replace: true });
    } catch {
      setErr("Could not log out. Please try again.");
      setLoggingOut(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setSaved(false);
    setBusy(true);
    try {
      const r = await api.setNickname(nickname);
      setNickname(r.user.nickname);
      onSaved(r.user);
      setSaved(true);
    } catch (ex) {
      const message = ex instanceof Error ? ex.message : "Could not save your nickname.";
      setErr(
        message === "이미 쓰는 닉네임입니다"
          ? "This nickname is already taken."
          : message === "닉네임은 한글·영문·숫자·밑줄 2~16자입니다"
            ? "Use 2–16 Korean or English letters, numbers, or underscores."
            : message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page profile-page">
      <PageHeader title="Profile" />
      <main className="profile-main">
        <section className="profile-card" aria-label="Profile settings">
          <div className="profile-identity">
            <div className="profile-avatar" aria-hidden="true">{Array.from(user.nickname)[0]?.toUpperCase()}</div>
            <h3>{user.nickname}</h3>
          </div>
          <div className="profile-edit">
            <form onSubmit={submit}>
              <label>
                Nickname
                <input
                  value={nickname}
                  onChange={(e) => { setNickname(e.target.value); setSaved(false); setErr(""); }}
                  maxLength={16}
                  minLength={2}
                  required
                  disabled={busy || loggingOut || locked}
                  placeholder="Your nickname"
                  autoComplete="nickname"
                  aria-describedby="nickname-hint"
                />
              </label>
              <p className="field-hint" id="nickname-hint">
                {locked && lockedUntil
                  ? `직접 바꾼 뒤에는 3일간 잠깁니다. ${lockedUntil.toLocaleString()} 이후에 다시 바꿀 수 있습니다.`
                  : "첫 닉네임은 자동으로 배정됩니다. 직접 바꾸면 3일 동안 다시 바꿀 수 없습니다. 2–16자, 한글·영문·숫자·밑줄."}
              </p>
              {err ? <div className="error" role="alert">{err}</div> : null}
              <div className="profile-save-row">
                <span className="save-status" role="status">{saved ? "Saved." : ""}</span>
                <button type="submit" className="primary" disabled={busy || loggingOut || locked}>
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
          <footer className="profile-foot">
            <button type="button" className="logout-button" disabled={busy || loggingOut} onClick={logout}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M9 3H3V17H9M7 10H17M13 6L17 10L13 14" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
              {loggingOut ? "Logging out…" : "Logout"}
            </button>
          </footer>
        </section>
      </main>
    </div>
  );
}
