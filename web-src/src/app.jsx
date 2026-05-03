import { useEffect } from "react";
import { BrowserRouter } from "react-router-dom";
import brand from "./brand.json";
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

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
