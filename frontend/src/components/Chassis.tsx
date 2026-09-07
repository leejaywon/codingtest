import { AuthUser } from "../api";
import TopBar from "./TopBar";

export default function Chassis({
  user,
  children,
}: {
  user?: AuthUser | null;
  children: React.ReactNode;
}) {
  const showNav = Boolean(user);

  return (
    <div className="world">
      <div className={`chassis${showNav ? "" : " chassis-compact"}`}>
        <div className="rivets" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="hazard-bar" aria-hidden="true" />
        <TopBar showNav={showNav} />
        <div className="screen">{children}</div>
        <footer className="chassis-foot">© 2026 Jaewon Lee</footer>
      </div>
    </div>
  );
}
