import { useEffect } from "react";
import { BrowserRouter, HashRouter } from "react-router-dom";
import brand from "./brand.json";
import { LLM_SPA_BASENAME } from "./llmSpaBasename.generated.js";
import { AppRoutes } from "./router.jsx";

export function App() {
  useEffect(() => {
    const t = brand.theme || {};
    if (t.accent) {
      document.documentElement.style.setProperty("--accent", t.accent);
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = mq.matches;
      if (dark && t.accentDark) {
        document.documentElement.style.setProperty("--accent", t.accentDark);
      } else if (t.accent) {
        document.documentElement.style.setProperty("--accent", t.accent);
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const Router = brand.useHashRouter ? HashRouter : BrowserRouter;
  // HashRouter: routes live in the fragment (`#/recommendation`). Package prefix is only in the
  // document URL (`…/<package>/index.html`), not Router basename. BrowserRouter uses basename for Model B.
  const routerBasename = brand.useHashRouter ? undefined : LLM_SPA_BASENAME || undefined;
  return (
    <Router basename={routerBasename}>
      <AppRoutes />
    </Router>
  );
}
