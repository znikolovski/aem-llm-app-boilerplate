import { createRoot } from "react-dom/client";
import { App } from "./app.jsx";
import { redirectAdobeRuntimeSpaToStaticHost } from "./lib/adobeSpaHost.js";
import "./styles.css";

redirectAdobeRuntimeSpaToStaticHost();

const el = document.getElementById("root");
if (el) {
  createRoot(el).render(<App />);
}
