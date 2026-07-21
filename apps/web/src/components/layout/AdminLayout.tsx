import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  LogOut,
  ShieldAlert,
  LoaderCircle,
  Menu,
  RefreshCw,
  X,
} from "lucide-react";
import { supabase } from "../../lib/auth/supabaseClient";
import {
  useAuthSessionQuery,
  usePermissionsQuery,
} from "../../lib/api/apiQueries";
import { PixelIcon } from "../ui/PixelIcon";

export default function AdminLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const sessionQuery = useAuthSessionQuery();
  const permissionsQuery = usePermissionsQuery({
    enabled: Boolean(sessionQuery.data?.user),
  });

  useEffect(() => {
    if (sessionQuery.isLoading) return;
    if (!sessionQuery.data?.user) {
      navigate("/login");
    }
  }, [navigate, sessionQuery.data, sessionQuery.isLoading]);

  useEffect(() => {
    if (!permissionsQuery.data) return;
    if (
      permissionsQuery.data.profile.role !== "admin" &&
      permissionsQuery.data.profile.role !== "super_admin"
    ) {
      navigate("/home");
    }
  }, [navigate, permissionsQuery.data]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const navItems = [
    { name: "Moderation Queue", path: "/admin", icon: "moderation" as const },
    { name: "User Management", path: "/admin/users", icon: "users" as const },
    { name: "Access Logs", path: "/admin/logs", icon: "logs" as const },
    { name: "Submissions", path: "/admin/submissions", icon: "publish" as const },
    {
      name: "Catalog Candidates",
      path: "/admin/catalog-candidates",
      icon: "cube" as const,
    },
  ];

  const roleChecked = Boolean(
    permissionsQuery.data &&
      ["admin", "super_admin"].includes(permissionsQuery.data.profile.role),
  );
  const accessError = permissionsQuery.isError
    ? "Could not verify admin access. Try again."
    : "";

  if (!roleChecked) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-synth-bg">
        {accessError ? (
          <div className="max-w-md rounded-2xl border border-red-500/30 bg-synth-surface p-8 text-center text-red-200">
            <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-red-400" />
            <p className="mb-5 text-sm">{accessError}</p>
            <button
              className="mx-auto flex items-center gap-2 rounded-lg border border-red-400/40 px-4 py-2 text-sm font-bold hover:bg-red-500/10"
              onClick={() => void permissionsQuery.refetch()}
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
    <div className="relative flex h-dvh min-h-dvh overflow-hidden bg-synth-bg text-white">
      {isSidebarOpen && (
        <button
          aria-label="Close admin navigation"
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
          type="button"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-shrink-0 transform flex-col border-r border-synth-border bg-[#2B1720] shadow-panel transition-transform lg:static lg:z-auto lg:w-64 lg:translate-x-0 ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        id="admin-navigation"
      >
        {/* Brand Header */}
        <div className="flex h-20 items-center border-b border-synth-border px-6">
          <PixelIcon className="w-6 h-6 text-synth-secondary mr-3" name="admin" />
          <span className="text-xl font-extrabold tracking-wider text-white">
            MOD PANEL
          </span>
          <button
            aria-label="Close admin navigation"
            className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg border border-synth-border text-gray-300 hover:bg-synth-elevated lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 py-6 px-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsSidebarOpen(false)}
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
            to="/home"
            onClick={() => setIsSidebarOpen(false)}
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

      <main className="min-w-0 flex-1 overflow-y-auto bg-synth-bg">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-synth-border bg-synth-bg/95 px-4 backdrop-blur lg:hidden">
          <button
            aria-controls="admin-navigation"
            aria-expanded={isSidebarOpen}
            aria-label="Open admin navigation"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-synth-border text-gray-300 hover:bg-synth-surface hover:text-white"
            onClick={() => setIsSidebarOpen(true)}
            type="button"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-extrabold uppercase tracking-wider text-white">
            Admin Panel
          </span>
        </header>
        <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
