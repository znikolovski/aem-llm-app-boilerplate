import { Outlet } from "react-router-dom";
import brand from "../brand.json";
import { ExperienceSessionsProvider } from "../context/ExperienceSessionsContext.jsx";
import { ToolParallelStack } from "../components/ToolParallelStack.jsx";
import { Chat } from "../pages/Chat.jsx";

export function AppShell() {
  return (
    <ExperienceSessionsProvider>
      <div className="shell">
        <header className="shell-header">
          <div className="kicker">{brand.kicker}</div>
          <h1 style={{ margin: "4px 0 0", fontSize: "clamp(22px, 4vw, 32px)" }}>{brand.appTitle}</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {brand.appSubtitle}
          </p>
        </header>
        <div className="shell-body split-chat-experience">
          <Chat />
          <div className="experience-column">
            <div className="experience-column-head split-pane-title">
              <span className="kicker">Experience</span>
              <span className="muted" style={{ fontSize: 13 }}>
                Parallel tool panels + routed views
              </span>
            </div>
            <div className="experience-column-body">
              <ToolParallelStack />
              <section className="experience-outlet panel">
                <Outlet />
              </section>
            </div>
          </div>
        </div>
      </div>
    </ExperienceSessionsProvider>
  );
}
