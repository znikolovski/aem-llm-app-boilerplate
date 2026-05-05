import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { invokeSpotlightFromRecommendOrNavigate } from "../lib/mcpAppsBridge.js";

/**
 * Primary CTA on recommend cards: `window.openai.callTool('spotlight', { topic })` when embedded,
 * plus in-app navigation to the same `POST /spotlight` flow as the MCP tool.
 */
export function RecommendSpotlightCta({ className, spotlightPath, topic, children }) {
  const navigate = useNavigate();
  const search = new URLSearchParams({ topic }).toString();
  const inAppTo = `/${spotlightPath}?${search}`;

  const onClick = useCallback(
    (e) => {
      e.preventDefault();
      invokeSpotlightFromRecommendOrNavigate(topic, () => navigate(inAppTo));
    },
    [topic, navigate, inAppTo]
  );

  return (
    <a className={className} href={inAppTo} onClick={onClick}>
      {children}
    </a>
  );
}
