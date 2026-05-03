import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./layout/AppShell.jsx";
import { ExperienceHome } from "./pages/ExperienceHome.jsx";
import { Recommendation } from "./pages/Recommendation.jsx";
import brand from "./brand.json";

export function AppRoutes() {
  const rec = brand.toolRoutes?.recommend || "/recommendation";
  return (
    <Routes>
      <Route path="/" element={<AppShell />}>
        <Route index element={<ExperienceHome />} />
        <Route path={rec.replace(/^\//, "")} element={<Recommendation />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
