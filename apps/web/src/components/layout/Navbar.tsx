import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  LogOut,
  Code,
  Loader2,
  ScrollText,
} from "lucide-react";
import { supabase } from "../../lib/auth/supabaseClient";
import type { User } from "@supabase/supabase-js";
import { getAuthSession } from "../../lib/api/apiClient";
import { usePermissionsQuery } from "../../lib/api/apiQueries";
import { queryKeys } from "../../lib/api/queryClient";
import { Avatar } from "../ui/Avatar";
import { ENGINE_PAIRING_EVENT, hasEngineToken } from "../../lib/engine/engineAuth";
import { PixelIcon } from "../ui/PixelIcon";

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isEnginePaired, setIsEnginePaired] = useState(hasEngineToken);
  const [isSessionLoading, setIsSessionLoading] = useState(true);

  const navigate = useNavigate();
  const location = useLocation();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const isKickingOut = useRef(false);

  useEffect(() => {
    const syncUser = (sessionUser: User | null) => {
      setUser(sessionUser);
      setIsSessionLoading(false);
    };

    getAuthSession().then((session) => {
      syncUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.permissions() });
      syncUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  const permissionsQuery = usePermissionsQuery({
    enabled: Boolean(user),
  });

  useEffect(() => {
    const data = permissionsQuery.data;
    if (!user || !data) return;

    if (data.profile.is_banned) {
      if (isKickingOut.current) return;
      isKickingOut.current = true;

      supabase.auth.signOut().then(() => {
        setUser(null);
        alert("Your account has been permanently suspended.");
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      });
      return;
    }
  }, [permissionsQuery.data, user]);

  useEffect(() => {
    const refreshEnginePairing = () => setIsEnginePaired(hasEngineToken());
    window.addEventListener(ENGINE_PAIRING_EVENT, refreshEnginePairing);
    return () =>
      window.removeEventListener(ENGINE_PAIRING_EVENT, refreshEnginePairing);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setIsDropdownOpen(false);
    navigate("/");
  };

  const handleFavoritesClick = (e: React.MouseEvent) => {
    if (!user) {
      e.preventDefault();
      alert("Please sign in to save and view your favorite games!");
      navigate("/login");
    }
  };

  const isFavoritesPage = location.pathname === "/favorites";
  const isIntroPage = location.pathname === "/";
  const isEnginePage = location.pathname === "/engine";
  const isLocalPage = location.pathname === "/local";
  const isMultiplayerPage = location.pathname === "/multiplayer";
  const isPublishPage = location.pathname === "/publish";
  const profile = permissionsQuery.data?.profile;
  const dbUsername = profile?.username || null;
  const dbAvatarUrl = profile?.avatar_url || null;
  const userRole = profile?.role || null;
  const isDeveloper = Boolean(profile?.is_developer);
  const isIdentityLoading =
    isSessionLoading || (Boolean(user) && permissionsQuery.isLoading);
  const getNavIconClass = (isActive: boolean) =>
    `inline-flex h-10 w-10 items-center justify-center rounded-md border transition-colors ${
      isActive
        ? "border-synth-border bg-synth-surface text-white"
        : "border-transparent text-gray-400 hover:border-synth-border/70 hover:bg-synth-surface/60 hover:text-white"
    }`;

  return (
    <nav className="fixed top-0 w-full z-50 bg-synth-bg border-b border-synth-border/60 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <Link
              to="/home"
              className="group flex min-h-10 items-center gap-2"
            >
              <PixelIcon
                className="h-7 w-7 text-synth-secondary transition-colors group-hover:text-white"
                name="brand"
              />
              <span className="text-xl font-extrabold tracking-widest text-white">
                PIXELATED
              </span>
              <span className="hidden text-[10px] font-bold uppercase tracking-[0.22em] text-synth-secondary sm:inline">
                Studio
              </span>
            </Link>

            <Link
              to="/"
              title="Intro Guide"
              className={getNavIconClass(isIntroPage)}
            >
              <ScrollText className="h-5 w-5" />
            </Link>

            <Link
              to="/engine"
              title={isEnginePaired ? "Engine Connected" : "Connect Engine"}
              className={`relative ${getNavIconClass(isEnginePage)}`}
            >
              <PixelIcon
                className={`h-6 w-6 ${
                  isEnginePaired ? "text-[#9B0048]" : "text-gray-400"
                }`}
                name={isEnginePaired ? "engine-on" : "engine-off"}
              />
              <span
                className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-synth-bg ${
                  isEnginePaired ? "bg-[#9B0048]" : "bg-amber-400"
                }`}
              />
            </Link>
          </div>

          <div className="flex items-center gap-4 sm:gap-6">
            {isIdentityLoading ? (
              <span
                aria-label="Loading game submission permissions"
                className="flex h-5 w-5 items-center justify-center text-gray-500"
                role="status"
                title="Loading permissions"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
              </span>
            ) : userRole !== "super_admin" ? (
              <Link
                to="/publish"
                title="Submit a Game"
                className={getNavIconClass(isPublishPage)}
              >
                <PixelIcon className="h-5 w-5" name="mail" />
              </Link>
            ) : null}

            {/* LOCAL VAULT LINK */}
            <Link
              to="/multiplayer"
              title="Multiplayer"
              className={getNavIconClass(isMultiplayerPage)}
            >
              <PixelIcon className="h-6 w-6" name="multiplayer" />
            </Link>

            <Link
              to="/local"
              title="Local Vault"
              className={getNavIconClass(isLocalPage)}
            >
              <PixelIcon className="h-6 w-6" name="publish" />
            </Link>

            {/* FAVORITES LINK */}
            <Link
              to="/favorites"
              onClick={handleFavoritesClick}
              title="Cloud Favorites"
              className={getNavIconClass(isFavoritesPage)}
            >
              <PixelIcon className="h-6 w-6" name="favorites" />
            </Link>

            {user ? (
              <div className="flex items-center gap-3">
                {isDeveloper && (
                  <span className="hidden sm:flex items-center gap-1 rounded-md border border-synth-border bg-synth-surface px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-widest text-white cursor-default">
                    <Code className="w-3 h-3" /> Dev
                  </span>
                )}

                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="flex items-center gap-2 focus:outline-none"
                  >
                    <Avatar
                      alt="User Avatar"
                      className="border-2 border-transparent transition-colors ring-0 hover:border-synth-border"
                      loading="eager"
                      name={dbUsername || user.email}
                      src={dbAvatarUrl}
                    />
                  </button>

                  {isDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-48 rounded-lg border border-synth-border bg-synth-surface py-2 shadow-card z-50">
                      <span
                        aria-hidden="true"
                        className="absolute -top-2 right-3 h-4 w-4 rotate-45 border-l border-t border-synth-border bg-synth-surface"
                      />
                      <div className="px-4 py-2 border-b border-synth-border mb-2">
                        <p className="text-sm text-synth-secondary truncate">
                          Signed in as
                        </p>
                        <p className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                          {dbUsername || user.email}
                        </p>
                      </div>

                      {/* ADMIN PANEL*/}
                      {(userRole === "admin" || userRole === "super_admin") && (
                        <Link
                          to="/admin"
                          onClick={() => setIsDropdownOpen(false)}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-synth-elevated hover:text-white transition-colors"
                        >
                          <PixelIcon className="w-4 h-4" name="admin" /> Admin Panel
                        </Link>
                      )}

                      <Link
                        to="/profile"
                        onClick={() => setIsDropdownOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-synth-elevated hover:text-white transition-colors"
                      >
                        <PixelIcon className="w-4 h-4" name="profile" /> Profile
                      </Link>

                      <button
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-synth-elevated hover:text-red-300 transition-colors text-left"
                      >
                        <LogOut className="w-4 h-4" /> Sign Out
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <Link
                to="/login"
                className="flex items-center gap-3 rounded-md border border-synth-border bg-synth-surface py-1.5 pl-1.5 pr-4 transition-colors group hover:bg-synth-elevated"
              >
                <div className="w-8 h-8 rounded bg-synth-elevated flex items-center justify-center">
                  <PixelIcon className="w-4 h-4 text-white" name="profile" />
                </div>
                <span className="text-sm font-medium text-white">
                  Sign In
                </span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
