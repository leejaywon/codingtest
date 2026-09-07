import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { AuthUser, api } from "./api";
import Chassis from "./components/Chassis";
import Auth from "./pages/Auth";
import Concepts from "./pages/Concepts";
import History from "./pages/History";
import Nickname from "./pages/Nickname";
import Problems from "./pages/Problems";
import Solve from "./pages/Solve";
import { supabase } from "./lib/supabase";

export default function App() {
  const { pathname } = useLocation();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

  useEffect(() => {
    if (window.matchMedia("(max-width: 760px)").matches) window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;

    async function applySession() {
      try {
        const r = await api.me();
        if (!cancelled) setUser(r.user);
      } catch {
        if (!cancelled) setUser(null);
      }
    }

    void applySession();
    if (!supabase) {
      return () => {
        cancelled = true;
      };
    }

    const { data } = supabase.auth.onAuthStateChange(() => {
      void applySession();
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  async function logout() {
    try {
      await api.logout();
    } catch {
      /* still clear local session view */
    }
    setUser(null);
  }

  if (user === undefined) {
    return (
      <Chassis>
        <div className="boot">Loading...</div>
      </Chassis>
    );
  }

  return (
    <Chassis user={user}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Auth />} />
        <Route
          path="/nickname"
          element={<Navigate to={user ? "/settings" : "/login"} replace />}
        />
        <Route
          path="/settings"
          element={
            user ? (
              <Nickname user={user} onSaved={setUser} onLogout={logout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/concepts"
          element={
            user ? (
              <Concepts user={user} onLogout={logout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/"
          element={
            user ? (
              <Problems user={user} onLogout={logout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/problems/:id"
          element={
            user ? (
              <Solve user={user} onLogout={logout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/history"
          element={
            user ? (
              <History user={user} onLogout={logout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </Chassis>
  );
}
