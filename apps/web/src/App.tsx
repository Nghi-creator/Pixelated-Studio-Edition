import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import { LoaderCircle } from "lucide-react";
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

import { RequireEngineConnection } from "./features/local-engine/RequireEngineConnection";

const AccessLogs = lazy(() => import("./pages/admin/AccessLogs"));
const CatalogCandidates = lazy(() => import("./pages/admin/CatalogCandidates"));
const Dashboard = lazy(() => import("./pages/admin/Dashboard"));
const Submissions = lazy(() => import("./pages/admin/Submissions"));
const UserManagement = lazy(() => import("./pages/admin/UserManagement"));
const Auth = lazy(() => import("./pages/user/Auth"));
const EngineConnection = lazy(() => import("./pages/user/EngineConnection"));
const Favorites = lazy(() => import("./pages/user/Favorites"));
const Home = lazy(() => import("./pages/user/Home"));
const Landing = lazy(() => import("./pages/user/Landing"));
const LocalVault = lazy(() => import("./pages/user/LocalVault"));
const Multiplayer = lazy(() => import("./pages/user/Multiplayer"));
const Player = lazy(() => import("./pages/user/Player"));
const Profile = lazy(() => import("./pages/user/Profile"));
const Publish = lazy(() => import("./pages/user/Publish"));
const ResetPassword = lazy(() => import("./pages/user/ResetPassword"));

function RouteLoading() {
  return (
    <div
      aria-live="polite"
      className="flex min-h-[50vh] items-center justify-center px-6 text-center text-slate-300"
      role="status"
    >
      <span className="inline-flex items-center gap-2">
        <LoaderCircle aria-hidden className="h-5 w-5 animate-spin" />
        Loading page…
      </span>
    </div>
  );
}

function lazyRoute(Page: LazyExoticComponent<ComponentType>) {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Page />
    </Suspense>
  );
}

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
          <Route path="/admin" element={lazyRoute(Dashboard)} />
          <Route path="/admin/submissions" element={lazyRoute(Submissions)} />
          <Route
            path="/admin/catalog-candidates"
            element={lazyRoute(CatalogCandidates)}
          />
          <Route path="/admin/users" element={lazyRoute(UserManagement)} />
          <Route path="/admin/logs" element={lazyRoute(AccessLogs)} />
        </Route>

        {/* STANDARD ROUTES */}
        <Route element={<StandardLayout />}>
          <Route path="/" element={lazyRoute(Landing)} />
          <Route path="/home" element={lazyRoute(Home)} />
          <Route path="/login" element={lazyRoute(Auth)} />
          <Route path="/reset-password" element={lazyRoute(ResetPassword)} />
          <Route path="/favorites" element={lazyRoute(Favorites)} />
          <Route path="/profile" element={lazyRoute(Profile)} />
          <Route path="/engine" element={lazyRoute(EngineConnection)} />
          <Route element={<RequireEngineConnection />}>
            <Route path="/play/:id" element={lazyRoute(Player)} />
            <Route path="/local" element={lazyRoute(LocalVault)} />
            <Route path="/multiplayer" element={lazyRoute(Multiplayer)} />
          </Route>
          <Route path="/publish" element={lazyRoute(Publish)} />
        </Route>
      </Routes>
    </Router>
  );
}
