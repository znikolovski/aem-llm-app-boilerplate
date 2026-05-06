/**
 * If the bundle was opened on a workspace `*.adobeioruntime.net` URL (not under `/api/v1/web/…`),
 * replace with the sibling `*.adobeio-static.net` host so the SPA and hash routes load from the
 * static CDN. See `actions/mcp/resolve-web-base.js` `mapWorkspaceAdobeRuntimeToStaticSpaOrigin`.
 */
export function redirectAdobeRuntimeSpaToStaticHost() {
  if (typeof window === "undefined") return;
  const { location } = window;
  const h = location.hostname.toLowerCase();
  if (!h.endsWith(".adobeioruntime.net")) return;
  if (location.pathname.includes("/api/v1/web/")) return;
  const staticHost = h.replace(/\.adobeioruntime\.net$/i, ".adobeio-static.net");
  if (staticHost === h) return;
  const next = `${location.protocol}//${staticHost}${location.pathname}${location.search}${location.hash}`;
  if (next !== location.href) {
    location.replace(next);
  }
}
