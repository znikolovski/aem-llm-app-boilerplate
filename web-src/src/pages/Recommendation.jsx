import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { renderUI } from "../renderers/uiRenderer.jsx";
import { recommend } from "../services/api.js";

const skeletonBlocks = [
  { type: "card", title: "Loading…", body: "Fetching structured results for this location.", skeleton: true },
  { type: "card", title: "Loading…", body: "More options will appear here.", skeleton: true }
];

export function Recommendation() {
  const { state } = useLocation();
  const phase = state?.phase;
  const location = typeof state?.location === "string" ? state.location : "";
  const [blocks, setBlocks] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (phase !== "ready" || !location) {
      setBlocks([]);
      setError("");
      return;
    }

    let cancelled = false;
    setError("");
    recommend({ location })
      .then((data) => {
        if (!cancelled && data?.ui) {
          setBlocks(data.ui);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load recommendations.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [phase, location]);

  if (phase === "skeleton") {
    return (
      <div>
        <h2>Recommendations</h2>
        <p className="muted">Tool intent detected — showing skeleton UI while the stream finishes.</p>
        <div className="card-grid">{renderUI(skeletonBlocks)}</div>
      </div>
    );
  }

  if (phase === "ready" && location && !error && blocks.length === 0) {
    return (
      <div>
        <h2>Recommendations</h2>
        <p className="muted">Loading results for {location}…</p>
        <div className="card-grid">{renderUI(skeletonBlocks)}</div>
      </div>
    );
  }

  if (!phase && !location) {
    return (
      <div>
        <h2>Recommendations</h2>
        <p className="muted">Ask the assistant for hotels or travel ideas in a city to open this view.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h2>Recommendations</h2>
        <p className="err">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <h2>Recommendations</h2>
      {location ? (
        <p className="muted">
          Location: <strong>{location}</strong>
        </p>
      ) : null}
      <div className="card-grid">{renderUI(blocks)}</div>
    </div>
  );
}
