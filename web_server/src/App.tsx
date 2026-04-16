import {
  BrowserRouter as Router,
  Routes,
  Route,
  Outlet,
} from "react-router-dom";
import Navbar from "./components/layout/Navbar";
import Footer from "./components/layout/Footer";
import AdminLayout from "./components/layout/AdminLayout";

import Landing from "./pages/user/Landing";
import Player from "./pages/user/Player";
import Auth from "./pages/user/Auth";
import Favorites from "./pages/user/Favorites";
import Profile from "./pages/user/Profile";
import ResetPassword from "./pages/user/ResetPassword";
import Publish from "./pages/user/Publish";

import UserManagement from "./pages/admin/UserManagement";
import Dashboard from "./pages/admin/Dashboard";
import LocalVault from "./pages/user/LocalVault";

// 1. Define the Standard Layout
const StandardLayout = () => {
  return (
    <div className="min-h-screen bg-synth-bg text-white font-sans antialiased flex flex-col relative">
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_100%_55%_at_50%_-20%,rgba(255,77,143,0.12),transparent_55%),radial-gradient(ellipse_85%_45%_at_100%_0%,rgba(255,159,67,0.08),transparent_48%),radial-gradient(ellipse_70%_40%_at_0%_100%,rgba(109,40,217,0.07),transparent_50%)]"
        aria-hidden
      />
      <Navbar />
      <main className="relative z-10 flex-grow pt-16">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
};

export default function App() {
  return (
    <Router>
      <Routes>
        {/* ADMIN ROUTES */}
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<Dashboard />} />
          <Route path="/admin/users" element={<UserManagement />} />
        </Route>

        {/* STANDARD ROUTES */}
        <Route element={<StandardLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/play/:id" element={<Player />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/local" element={<LocalVault />} />
          <Route path="/publish" element={<Publish />} />
        </Route>
      </Routes>
    </Router>
  );
}
