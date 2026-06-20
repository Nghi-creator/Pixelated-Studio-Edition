import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  LogOut,
  ShieldAlert,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { supabase } from "../../lib/auth/supabaseClient";
import { api, getAuthSession } from "../../lib/api/apiClient";
import { PixelIcon } from "../ui/PixelIcon";

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [roleChecked, setRoleChecked] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const checkAccess = async () => {
      setAccessError("");
      try {
        const session = await getAuthSession();

        if (!session?.user) {
          navigate("/login");
          return;
        }

        const data = await api.permissions();
        if (
          data.profile.role !== "admin" &&
          data.profile.role !== "super_admin"
        ) {
          navigate("/");
          return;
        }

        if (isMounted) setRoleChecked(true);
      } catch (error) {
        console.error("Error checking admin access:", error);
        if (isMounted) {
          setAccessError("Could not verify admin access. Try again.");
        }
      }
    };

    void checkAccess();
    return () => {
      isMounted = false;
    };
  }, [navigate, retryKey]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const navItems = [
    { name: "Moderation Queue", path: "/admin", icon: "moderation" as const },
    { name: "User Management", path: "/admin/users", icon: "users" as const },
    { name: "Access Logs", path: "/admin/logs", icon: "logs" as const },
  ];

  if (!roleChecked) {
    return (
      <div className="h-screen bg-synth-bg flex items-center justify-center">
        {accessError ? (
          <div className="max-w-md rounded-2xl border border-red-500/30 bg-synth-surface p-8 text-center text-red-200">
            <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-red-400" />
            <p className="mb-5 text-sm">{accessError}</p>
            <button
              className="mx-auto flex items-center gap-2 rounded-lg border border-red-400/40 px-4 py-2 text-sm font-bold hover:bg-red-500/10"
              onClick={() => setRetryKey((key) => key + 1)}
              type="button"
            >
              <RefreshCw className="h-4 w-4" /> Retry
            </button>
          </div>
        ) : (
          <LoaderCircle
            aria-label="Checking admin access"
            className="h-10 w-10 animate-spin text-white"
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-synth-bg text-white overflow-hidden">
      {/* 1. The Sidebar */}
      <aside className="w-64 bg-[#2B1720] border-r border-synth-border flex flex-col flex-shrink-0 shadow-panel">
        {/* Brand Header */}
        <div className="h-20 flex items-center px-6 border-b border-synth-border">
          <PixelIcon className="w-6 h-6 text-synth-secondary mr-3" name="admin" />
          <span className="text-xl font-extrabold tracking-wider text-white">
            MOD PANEL
          </span>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 py-6 px-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive
                    ? "border border-[#C02066] bg-[#9B0048] text-white font-bold"
                    : "text-white hover:bg-synth-elevated/70 font-medium border border-transparent"
                }`}
              >
                <PixelIcon className="w-5 h-5" name={item.icon} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Actions (Exit/Logout) */}
        <div className="p-4 border-t border-synth-border space-y-2">
          <Link
            to="/"
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-white hover:bg-synth-elevated/70 transition-all font-medium"
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
      <main className="flex-1 overflow-y-auto bg-synth-bg">
        <div className="p-8 max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
