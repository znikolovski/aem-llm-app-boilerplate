import { Outlet, useLocation } from "react-router-dom";
import brand from "../brand.json";
import { DeepLinkSessionSync } from "../components/DeepLinkSessionSync.jsx";
import { ExperienceSessionsProvider } from "../context/ExperienceSessionsContext.jsx";
import { ToolParallelStack } from "../components/ToolParallelStack.jsx";
import { Chat } from "../pages/Chat.jsx";
import { toolNameFromPath, toolRouteByName } from "../lib/toolRouting.js";

export function AppShell() {
  const location = useLocation();
  const pathSeg = String(location.pathname || "")
    .replace(/^\//, "")
    .trim();
  const activeTool = pathSeg ? toolNameFromPath(brand.toolRoutes, pathSeg) : null;
  const toolEmbedFocus = activeTool === "recommend" || activeTool === "spotlight";
  const toolMeta = activeTool ? toolRouteByName(brand.toolRoutes, activeTool) : null;
  const experienceKicker = toolMeta?.label || "Experience";
  const experienceHint = toolEmbedFocus
    ? "Branded panels from tool actions"
    : "Parallel tool panels + routed views";

  const embedBarePage = activeTool === "spotlight" || activeTool === "recommend";

  return (
    <ExperienceSessionsProvider>
      <DeepLinkSessionSync />
      <div className="shell">
        {!embedBarePage ? (
          <header className="shell-header">
            {typeof brand.logoUrl === "string" && brand.logoUrl.trim() ? (
              <div className="brand-head-row">
                <div className="brand-logo-plate">
                  <img className="brand-logo-plate__img" src={brand.logoUrl.trim()} alt="" />
                </div>
                <div className="brand-text-block">
                  <div className="kicker">{brand.kicker}</div>
                  <h1 style={{ margin: "4px 0 0", fontSize: "clamp(22px, 4vw, 32px)" }}>{brand.appTitle}</h1>
                  <p className="muted" style={{ margin: "6px 0 0" }}>
                    {brand.appSubtitle}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="kicker">{brand.kicker}</div>
                <h1 style={{ margin: "4px 0 0", fontSize: "clamp(22px, 4vw, 32px)" }}>{brand.appTitle}</h1>
                <p className="muted" style={{ margin: "6px 0 0" }}>
                  {brand.appSubtitle}
                </p>
              </>
            )}
          </header>
        ) : null}
        <div
          className={["shell-body", "split-chat-experience", toolEmbedFocus ? "tool-route-embed" : ""]
            .filter(Boolean)
            .join(" ")}
        >
          <Chat />
          <div className={`experience-column${embedBarePage ? " experience-column--embed-bare" : ""}`}>
            {!embedBarePage ? (
              <div className="experience-column-head split-pane-title">
                <span className="kicker">{experienceKicker}</span>
                <span className="muted" style={{ fontSize: 13 }}>
                  {experienceHint}
                </span>
              </div>
            ) : null}
            <div className="experience-column-body">
              <ToolParallelStack />
              {!embedBarePage ? (
                <section className="experience-outlet panel">
                  <Outlet />
                </section>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </ExperienceSessionsProvider>
  );
}
