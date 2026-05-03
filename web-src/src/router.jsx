import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./layout/AppShell.jsx";
import { ExperienceHome } from "./pages/ExperienceHome.jsx";
import { ToolRoutePage } from "./pages/ToolRoutePage.jsx";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<AppShell />}>
        <Route index element={<ExperienceHome />} />
        <Route path=":toolPath" element={<ToolRoutePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
