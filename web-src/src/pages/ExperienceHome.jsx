import { Link } from "react-router-dom";
import brand from "../brand.json";
import { listToolRoutes } from "../lib/toolRouting.js";

export function ExperienceHome() {
  const routes = listToolRoutes(brand.toolRoutes);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Overview</h2>
      <p className="muted">
        The left column streams the model. The right column stacks <strong>parallel tool panels</strong> as calls
        arrive (same turn or across turns). Each tool also has a <strong>bookmarkable route</strong> below the stack.
      </p>
      <h3 style={{ fontSize: 15, marginBottom: 8 }}>Registered tool routes</h3>
      <ul className="route-list muted">
        {routes.map((r) => (
          <li key={r.name}>
            <Link to={`/${r.path}`}>
              /{r.path}
            </Link>
            {" — "}
            <code>{r.name}</code>
            {r.label ? ` (${r.label})` : ""}
          </li>
        ))}
      </ul>
      <p className="muted" style={{ fontSize: 13 }}>
        Add tools in the <code>chat</code> action, matching actions + API paths in <code>app.config.yaml</code>, then
        register paths in <code>web-src/src/brand.json</code> under <code>toolRoutes</code>.
      </p>
    </div>
  );
}
