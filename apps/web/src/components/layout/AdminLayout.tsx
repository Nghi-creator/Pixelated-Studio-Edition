import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  ArrowLeft,
  LogOut,
  ShieldAlert,
  Activity,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [roleChecked, setRoleChecked] = useState(false);

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        navigate("/login");
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

      if (!data || (data.role !== "admin" && data.role !== "super_admin")) {
        navigate("/");
        return;
      }

      setRoleChecked(true);
    };

    checkAccess();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const navItems = [
    { name: "Moderation Queue", path: "/admin", icon: LayoutDashboard },
    { name: "User Management", path: "/admin/users", icon: Users },
    { name: "Access Logs", path: "/admin/logs", icon: Activity },
  ];

  if (!roleChecked) {
    return (
      <div className="h-screen bg-synth-bg flex items-center justify-center">
        <div className="text-gray-400 font-bold animate-pulse text-lg">Authenticating Access...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-synth-bg text-white overflow-hidden">
      {/* 1. The Sidebar */}
      <aside className="w-64 bg-synth-surface border-r border-synth-border flex flex-col flex-shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.25)]">
        {/* Brand Header */}
        <div className="h-20 flex items-center px-6 border-b border-synth-border">
          <ShieldAlert className="w-6 h-6 text-synth-secondary mr-3 drop-shadow-[0_0_10px_rgba(255,159,67,0.5)]" />
          <span className="text-xl font-extrabold tracking-wider bg-gradient-to-r from-white to-synth-secondary/90 bg-clip-text text-transparent">
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
                    ? "bg-synth-primary/15 text-synth-primary font-bold shadow-glow-primary-sm border border-synth-primary/25"
                    : "text-gray-400 hover:bg-synth-elevated hover:text-white font-medium border border-transparent"
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
        <div className="p-4 border-t border-synth-border space-y-2">
          <Link
            to="/"
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:bg-synth-elevated hover:text-white transition-all font-medium"
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
      <main className="flex-1 overflow-y-auto bg-synth-bg relative">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_90%_10%,rgba(255,77,143,0.08),transparent_50%),radial-gradient(ellipse_60%_40%_at_10%_90%,rgba(255,159,67,0.06),transparent_48%)]"
          aria-hidden
        />
        <div className="relative z-10 p-8 max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
