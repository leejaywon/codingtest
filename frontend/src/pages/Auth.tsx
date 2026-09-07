import { useEffect, useState } from "react";
import { api } from "../api";
import Wordmark from "../components/Wordmark";

export default function Auth() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.authConfig().then((r) => setReady(r.google)).catch(() => setReady(false));
  }, []);

  async function signIn() {
    setErr("");
    setBusy(true);
    try {
      await api.signInGoogle();
    } catch {
      setErr("Sign-in failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="win-bar">
          <span>Sign in</span>
          <i className="win-grip" aria-hidden="true" />
        </div>
        <div className="auth-body">
          <h1><Wordmark /></h1>
          <p className="muted">Sign in with your Google account.</p>
          {err ? <div className="error">{err}</div> : null}
          {ready === false ? <p className="muted">Sign-in is unavailable right now.</p> : null}
          <button type="button" className="google-btn" disabled={!ready || busy} onClick={signIn}>
            {busy ? "Redirecting…" : "Continue with Google"}
          </button>
        </div>
      </div>
    </div>
  );
}
