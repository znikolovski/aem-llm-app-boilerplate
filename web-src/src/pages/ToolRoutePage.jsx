import { Link, useParams } from "react-router-dom";
import brand from "../brand.json";
import { useExperienceSessions } from "../context/ExperienceSessionsContext.jsx";
import { toolNameFromPath, toolRouteByName } from "../lib/toolRouting.js";
import { renderUI } from "../renderers/uiRenderer.jsx";

/**
 * Bookmarkable view for a single tool route; mirrors active sessions from the parallel stack.
 */
export function ToolRoutePage() {
  const { toolPath } = useParams();
  const tool = toolNameFromPath(brand.toolRoutes, toolPath);
  const meta = tool ? toolRouteByName(brand.toolRoutes, tool) : null;
  const { sessions } = useExperienceSessions();
  const subset = tool ? sessions.filter((s) => s.tool === tool) : [];

  if (!tool || !meta) {
    return (
      <div>
        <h2>Experience</h2>
        <p className="muted">Unknown route.</p>
        <Link to="/">Back home</Link>
      </div>
    );
  }

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        <Link to="/">← Overview</Link>
      </p>
      <h2>{meta.label}</h2>
      <p className="muted">
        Route <code>/{meta.path}</code> is registered for tool <code>{tool}</code>. Panels also appear in the live stack
        beside chat.
      </p>
      {!subset.length ? (
        <p className="muted">No active sessions for this tool yet — use chat to invoke it.</p>
      ) : (
        subset.map((s) => (
          <section key={s.id} className="panel" style={{ marginBottom: 12 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              {s.id} · {s.phase}
            </div>
            {s.phase === "ready" && s.blocks?.length ? <div className="card-grid">{renderUI(s.blocks)}</div> : null}
            {s.phase === "error" ? <p className="err">{s.error}</p> : null}
            {(s.phase === "skeleton" || s.phase === "fetching") ? (
              <p className="muted">Still streaming or loading… check the stack above.</p>
            ) : null}
          </section>
        ))
      )}
    </div>
  );
}
