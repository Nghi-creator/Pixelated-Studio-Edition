import {
  BrowserRouter as Router,
  Routes,
  Route,
  Outlet,
} from "react-router-dom";
import Navbar from "./components/layout/Navbar";
import Footer from "./components/layout/Footer";
import AdminLayout from "./components/layout/AdminLayout";

// Page Imports
import Landing from "./pages/Landing";
import Player from "./pages/Player";
import Auth from "./pages/Auth";
import Favorites from "./pages/Favorites";
import Profile from "./pages/Profile";
import ResetPassword from "./pages/ResetPassword";
import UserManagement from "./pages/admin/UserManagement";
import Dashboard from "./pages/admin/Dashboard";

// 1. Define the Standard Layout
const StandardLayout = () => {
  return (
    <div className="min-h-screen bg-[#0B0F19] text-white font-sans antialiased flex flex-col selection:bg-[#00f2fe] selection:text-black">
      <Navbar />
      <main className="flex-grow pt-16">
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
        </Route>
      </Routes>
    </Router>
  );
}
