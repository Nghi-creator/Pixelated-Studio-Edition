import {
  BrowserRouter as Router,
  Routes,
  Route,
  Outlet,
} from "react-router-dom";
import Navbar from "./components/layout/Navbar";
import Footer from "./components/layout/Footer";
import AdminLayout from "./components/layout/AdminLayout";
import { useSessionTracker } from "./lib/session/useSessionTracker";
import { useEngineConnectionMonitor } from "./lib/engine/useEngineConnectionMonitor";
import { useDesktopLaunchPairing } from "./lib/engine/useDesktopLaunchPairing";

import Landing from "./pages/user/Landing";
import Player from "./pages/user/Player";
import Auth from "./pages/user/Auth";
import Favorites from "./pages/user/Favorites";
import Profile from "./pages/user/Profile";
import ResetPassword from "./pages/user/ResetPassword";
import Publish from "./pages/user/Publish";
import Multiplayer from "./pages/user/Multiplayer";
import EngineConnection from "./pages/user/EngineConnection";
import { RequireEngineConnection } from "./features/local-engine/RequireEngineConnection";

import UserManagement from "./pages/admin/UserManagement";
import Dashboard from "./pages/admin/Dashboard";
import AccessLogs from "./pages/admin/AccessLogs";
import CatalogCandidates from "./pages/admin/CatalogCandidates";
import Submissions from "./pages/admin/Submissions";
import LocalVault from "./pages/user/LocalVault";

// 1. Define the Standard Layout
const StandardLayout = () => {
  return (
    <div className="min-h-screen bg-synth-bg text-white font-sans antialiased flex flex-col relative">
      <Navbar />
      <main className="flex-grow pt-16">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
};

const SessionTracker = () => {
  useSessionTracker();
  return null;
};

const EngineConnectionMonitor = () => {
  useEngineConnectionMonitor();
  return null;
};

const DesktopLaunchPairing = () => {
  useDesktopLaunchPairing();
  return null;
};

export default function App() {
  return (
    <Router>
      <SessionTracker />
      <DesktopLaunchPairing />
      <EngineConnectionMonitor />
      <Routes>
        {/* ADMIN ROUTES */}
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<Dashboard />} />
          <Route path="/admin/submissions" element={<Submissions />} />
          <Route path="/admin/catalog-candidates" element={<CatalogCandidates />} />
          <Route path="/admin/users" element={<UserManagement />} />
          <Route path="/admin/logs" element={<AccessLogs />} />
        </Route>

        {/* STANDARD ROUTES */}
        <Route element={<StandardLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/engine" element={<EngineConnection />} />
          <Route element={<RequireEngineConnection />}>
            <Route path="/play/:id" element={<Player />} />
            <Route path="/local" element={<LocalVault />} />
            <Route path="/multiplayer" element={<Multiplayer />} />
          </Route>
          <Route path="/publish" element={<Publish />} />
        </Route>
      </Routes>
    </Router>
  );
}
