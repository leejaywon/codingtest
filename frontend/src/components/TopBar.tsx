import { Link, NavLink } from "react-router-dom";
import Wordmark from "./Wordmark";

export default function TopBar({
  showNav,
}: {
  showNav: boolean;
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <Link to={showNav ? "/" : "/login"} className="brand-lockup">
          <Wordmark />
        </Link>
      </div>
      {showNav ? (
        <nav className="nav-pills" aria-label="주 메뉴">
          <NavLink to="/concepts">Concepts</NavLink>
          <NavLink to="/" end>
            Problems
          </NavLink>
          <NavLink to="/history">History</NavLink>
          <NavLink to="/settings">
            Profile
          </NavLink>
        </nav>
      ) : (
        <div className="online-pill">
          <i className="led led-ok" />
          Online
        </div>
      )}
    </header>
  );
}
