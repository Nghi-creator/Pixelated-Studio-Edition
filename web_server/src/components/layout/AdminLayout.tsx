import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  ArrowLeft,
  LogOut,
  ShieldAlert,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const navItems = [
    { name: "Moderation Queue", path: "/admin", icon: LayoutDashboard },
    { name: "User Management", path: "/admin/users", icon: Users },
  ];

  return (
    <div className="flex h-screen bg-[#0B0F19] text-white overflow-hidden">
      {/* 1. The Sidebar */}
      <aside className="w-64 bg-[#111827] border-r border-gray-800 flex flex-col flex-shrink-0">
        {/* Brand Header */}
        <div className="h-20 flex items-center px-6 border-b border-gray-800">
          <ShieldAlert className="w-6 h-6 text-[#00f2fe] mr-3" />
          <span className="text-xl font-extrabold tracking-wider text-white">
            MOD PANEL
          </span>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 py-6 px-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive
                    ? "bg-[#00f2fe]/10 text-[#00f2fe] font-bold"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white font-medium"
                }`}
              >
                <Icon
                  className={`w-5 h-5 ${isActive ? "fill-current opacity-20" : ""}`}
                />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Actions (Exit/Logout) */}
        <div className="p-4 border-t border-gray-800 space-y-2">
          <Link
            to="/"
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:bg-gray-800 hover:text-white transition-all font-medium"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Main Site
          </Link>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-all font-medium"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* 2. The Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-[#0B0F19]">
        <div className="p-8 max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
