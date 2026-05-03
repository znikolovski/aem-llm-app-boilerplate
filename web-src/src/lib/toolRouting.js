/**
 * Normalize `brand.toolRoutes` entries: either a path string or `{ path, label }`.
 * @param {Record<string, string | { path: string; label?: string }>} toolRoutes
 * @returns {{ name: string; path: string; label: string }[]}
 */
export function listToolRoutes(toolRoutes) {
  if (!toolRoutes || typeof toolRoutes !== "object") {
    return [];
  }
  return Object.entries(toolRoutes)
    .map(([name, value]) => {
      if (typeof value === "string") {
        const path = value.replace(/^\//, "");
        return { name, path, label: humanize(name) };
      }
      if (value && typeof value === "object" && typeof value.path === "string") {
        return {
          name,
          path: value.path.replace(/^\//, ""),
          label: typeof value.label === "string" && value.label.trim() ? value.label.trim() : humanize(name)
        };
      }
      return null;
    })
    .filter((r) => r && r.path.length > 0);
}

export function toolRouteByName(toolRoutes, toolName) {
  return listToolRoutes(toolRoutes).find((r) => r.name === toolName);
}

export function toolNameFromPath(toolRoutes, pathSegment) {
  const normalized = String(pathSegment || "").replace(/^\//, "");
  const hit = listToolRoutes(toolRoutes).find((r) => r.path === normalized);
  return hit?.name ?? null;
}

function humanize(name) {
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : "";
}
