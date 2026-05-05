import { useEffect } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import brand from "../brand.json";
import { useExperienceSessions } from "../context/ExperienceSessionsContext.jsx";
import { toolNameFromPath } from "../lib/toolRouting.js";

const DEEP_PREFIX = "deep-link";

/**
 * Keeps bookmark / MCP URLs (`/recommendation?location=…`, `/spotlight?topic=…`) in sync with
 * Live tools sessions. Optional legacy query keys: `productType` → recommend, `product` → spotlight.
 */
export function DeepLinkSessionSync() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { beginSession, setSessionParams, dismiss } = useExperienceSessions();

  const pathSeg = String(location.pathname || "")
    .replace(/^\//, "")
    .trim();
  const tool = pathSeg ? toolNameFromPath(brand.toolRoutes, pathSeg) : null;
  const spKey = searchParams.toString();
  const deepId = tool === "recommend" || tool === "spotlight" ? `${DEEP_PREFIX}-${tool}` : null;

  useEffect(() => {
    if (!deepId || (tool !== "recommend" && tool !== "spotlight")) {
      return undefined;
    }
    const locationVal =
      searchParams.get("location")?.trim() || searchParams.get("productType")?.trim();
    const topicVal = searchParams.get("topic")?.trim() || searchParams.get("product")?.trim();
    const valid = tool === "recommend" ? !!locationVal : tool === "spotlight" ? !!topicVal : false;

    if (!valid) {
      dismiss(deepId);
      return undefined;
    }

    beginSession(deepId, tool);
    setSessionParams(deepId, tool, tool === "recommend" ? { location: locationVal } : { topic: topicVal });

    return () => {
      dismiss(deepId);
    };
  }, [tool, deepId, spKey, beginSession, setSessionParams, dismiss]);

  return null;
}
