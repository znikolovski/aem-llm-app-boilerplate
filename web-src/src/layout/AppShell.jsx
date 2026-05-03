import { Outlet } from "react-router-dom";
import brand from "../brand.json";
import { Chat } from "../pages/Chat.jsx";

export function AppShell() {
  return (
    <div className="shell">
      <header className="shell-header">
        <div className="kicker">{brand.kicker}</div>
        <h1 style={{ margin: "4px 0 0", fontSize: "clamp(22px, 4vw, 32px)" }}>{brand.appTitle}</h1>
        <p className="muted" style={{ margin: "6px 0 0" }}>
          {brand.appSubtitle}
        </p>
      </header>
      <div className="shell-body">
        <Chat />
        <main className="experience">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
