import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import Wordmark from "./Wordmark";

export default function TopBar({
  showNav,
}: {
  showNav: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();

  useEffect(() => { setMenuOpen(false); }, [location]);

  useEffect(() => {
    if (!menuOpen) return;
    function dismiss(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    }
    const desktop = window.matchMedia("(min-width: 761px)");
    const close = () => setMenuOpen(false);
    desktop.addEventListener("change", close);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      desktop.removeEventListener("change", close);
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);

  return (
    <header ref={headerRef} className={`topbar${menuOpen ? " menu-open" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setMenuOpen(false);
      }}>
      <div className="brand">
        <Link to={showNav ? "/" : "/login"} className="brand-lockup">
          <Wordmark />
        </Link>
      </div>
      {showNav ? (
        <>
        <button ref={toggleRef} type="button" className="menu-toggle"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen} aria-controls="main-navigation"
          onClick={() => setMenuOpen((open) => !open)}>
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d={menuOpen ? "M6 6l12 12M6 18L18 6" : "M4 6h16M4 12h16M4 18h16"} />
          </svg>
          <span>Menu</span>
        </button>
        <nav id="main-navigation" className="nav-pills" aria-label="주 메뉴" onClick={() => setMenuOpen(false)}>
          <NavLink to="/concepts">Concepts</NavLink>
          <NavLink to="/" end>
            Problems
          </NavLink>
          <NavLink to="/history">History</NavLink>
          <NavLink to="/settings">
            Profile
          </NavLink>
        </nav>
        </>
      ) : (
        <div className="online-pill">
          <i className="led led-ok" />
          Online
        </div>
      )}
    </header>
  );
}
