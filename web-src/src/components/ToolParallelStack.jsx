import { useEffect, useRef } from "react";
import { useExperienceSessions } from "../context/ExperienceSessionsContext.jsx";
import { recommend, spotlight } from "../services/api.js";
import { renderUI } from "../renderers/uiRenderer.jsx";

const skeletonBlocks = [
  { type: "card", title: "Loading…", body: "Resolving tool output.", skeleton: true },
  { type: "card", title: "Loading…", body: "Structured UI will replace this skeleton.", skeleton: true }
];

async function fetchBlocksForTool(tool, params, signal) {
  if (tool === "recommend") {
    const loc = params?.location;
    if (typeof loc !== "string" || !loc.trim()) {
      throw new Error("Missing location for recommend.");
    }
    const data = await recommend({ location: loc.trim() }, { signal });
    return data?.ui || [];
  }
  if (tool === "spotlight") {
    const topic = params?.topic;
    if (typeof topic !== "string" || !topic.trim()) {
      throw new Error("Missing topic for spotlight.");
    }
    const data = await spotlight({ topic: topic.trim() }, { signal });
    return data?.ui || [];
  }
  throw new Error(`No client fetch wired for tool "${tool}".`);
}

export function ToolParallelStack() {
  const { sessions, setSessionResult, dismiss, toolRoutes } = useExperienceSessions();
  const inflight = useRef(new Map());

  useEffect(() => {
    const controllers = [];

    for (const s of sessions) {
      if (s.phase !== "fetching" || !s.params) {
        continue;
      }
      if (inflight.current.get(s.id)) {
        continue;
      }
      inflight.current.set(s.id, true);
      const ac = new AbortController();
      controllers.push(ac);
      const sessionId = s.id;
      const tool = s.tool;
      const params = s.params;

      fetchBlocksForTool(tool, params, ac.signal)
        .then((blocks) => {
          setSessionResult(sessionId, blocks, null);
        })
        .catch((e) => {
          const msg = e instanceof Error ? e.message : "Request failed.";
          setSessionResult(sessionId, null, msg);
        })
        .finally(() => {
          inflight.current.delete(sessionId);
        });
    }

    return () => {
      for (const ac of controllers) {
        ac.abort();
      }
    };
  }, [sessions, setSessionResult]);

  if (!sessions.length) {
    return null;
  }

  const allEmbedTools =
    sessions.length > 0 && sessions.every((s) => s.tool === "spotlight" || s.tool === "recommend");

  return (
    <div className={`tool-stack${allEmbedTools ? " tool-stack--embed-minimal" : ""}`}>
      {!allEmbedTools ? (
        <div className="tool-stack-head">
          <span className="kicker">Live tools</span>
          <span className="muted" style={{ fontSize: 13 }}>
            {sessions.length} panel{sessions.length === 1 ? "" : "s"} — dismiss when done.
          </span>
        </div>
      ) : null}
      <div className="tool-stack-grid">
        {sessions.map((s) => {
          const meta = toolRoutes.find((r) => r.name === s.tool);
          const label = meta?.label || s.tool;
          return (
            <section
              key={s.id}
              className={`tool-panel panel${s.tool === "spotlight" ? " tool-panel--spotlight" : ""}${s.tool === "recommend" ? " tool-panel--recommend" : ""}`}
            >
              {s.tool === "spotlight" || s.tool === "recommend" ? (
                <button
                  type="button"
                  className="btn-dismiss btn-dismiss--embed-floating"
                  onClick={() => dismiss(s.id)}
                  aria-label="Dismiss panel"
                >
                  ×
                </button>
              ) : (
                <header className="tool-panel-head">
                  <div>
                    <div className="tool-panel-title">{label}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {s.tool} · {s.phase}
                    </div>
                  </div>
                  <button type="button" className="btn-dismiss" onClick={() => dismiss(s.id)} aria-label="Dismiss panel">
                    ×
                  </button>
                </header>
              )}
              {s.phase === "skeleton" || s.phase === "fetching" ? (
                <div className="ub-experience-blocks">{renderUI(skeletonBlocks, { tool: s.tool })}</div>
              ) : null}
              {s.phase === "error" ? <p className="err">{s.error}</p> : null}
              {s.phase === "ready" && s.blocks?.length ? (
                <div
                  className={`ub-experience-blocks${s.tool === "spotlight" ? " ub-spotlight-experience" : ""}${s.tool === "recommend" ? " ub-recommend-experience" : ""}`}
                >
                  {renderUI(s.blocks, { tool: s.tool })}
                </div>
              ) : null}
              {s.phase === "ready" && !s.blocks?.length ? <p className="muted">No UI blocks returned.</p> : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
