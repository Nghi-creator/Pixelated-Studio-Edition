import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Heart,
  LogOut,
  User as UserIcon,
  ShieldAlert,
  HardDrive,
  UploadCloud,
  Code,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import type { User } from "@supabase/supabase-js";

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [dbUsername, setDbUsername] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isDeveloper, setIsDeveloper] = useState<boolean>(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isKickingOut = useRef(false);

  useEffect(() => {
    const fetchUserAndProfile = async (sessionUser: User | null) => {
      setUser(sessionUser);
      if (sessionUser) {
        const { data } = await supabase
          .from("profiles")
          .select("username, role, is_banned, is_developer")
          .eq("id", sessionUser.id)
          .single();

        if (data?.is_banned) {
          if (isKickingOut.current) return;
          isKickingOut.current = true;

          await supabase.auth.signOut();
          setUser(null);
          alert("Your account has been permanently suspended.");
          if (window.location.pathname !== "/login") {
            window.location.href = "/login";
          }
          return;
        }

        if (data) {
          setDbUsername(data.username);
          setUserRole(data.role);
          setIsDeveloper(data.is_developer || false);
        }
      } else {
        setDbUsername(null);
        setUserRole(null);
        setIsDeveloper(false);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      fetchUserAndProfile(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      fetchUserAndProfile(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
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

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase.channel(`ban-listener-${user.id}`).on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "profiles",
        filter: `id=eq.${user.id}`,
      },
      async (payload) => {
        if (payload.new.is_banned === true) {
          await supabase.auth.signOut();
          alert("Your account has been permanently suspended.");
          window.location.href = "/login";
        }
      },
    );

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

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

  const avatarUrl =
    user?.user_metadata?.avatar_url ||
    (user?.email
      ? `https://ui-avatars.com/api/?name=${user.email}&background=FF4D8F&color=000000&bold=true`
      : null);

  const isFavoritesPage = location.pathname === "/favorites";
  const isLocalPage = location.pathname === "/local";
  const isPublishPage = location.pathname === "/publish";

  return (
    <nav className="fixed top-0 w-full z-50 bg-synth-bg/90 backdrop-blur-md border-b border-synth-border/70 transition-all shadow-[0_1px_0_rgba(255,77,143,0.06)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 group">
            <span className="text-xl font-extrabold tracking-widest bg-gradient-to-r from-synth-primary to-synth-secondary bg-clip-text text-transparent">
              PIXELATED
            </span>
          </Link>

          <div className="flex items-center gap-4 sm:gap-6">
            {user && userRole !== "super_admin" && (
              <Link
                to="/publish"
                title="Publish a Game"
                className={`transition-colors ${
                  isPublishPage
                    ? "text-synth-secondary drop-shadow-[0_0_8px_rgba(255,159,67,0.4)]"
                    : "text-gray-400 hover:text-synth-secondary"
                }`}
              >
                <UploadCloud
                  className={`w-5 h-5 ${isPublishPage ? "fill-synth-secondary/20" : ""}`}
                />
              </Link>
            )}

            {/* LOCAL VAULT LINK */}
            <Link
              to="/local"
              title="Local Vault"
              className={`transition-colors ${
                isLocalPage
                  ? "text-synth-secondary drop-shadow-[0_0_8px_rgba(255,159,67,0.4)]"
                  : "text-gray-400 hover:text-synth-secondary"
              }`}
            >
              <HardDrive
                className={`w-6 h-6 ${isLocalPage ? "fill-synth-secondary/20" : ""}`}
              />
            </Link>

            {/* FAVORITES LINK */}
            <Link
              to="/favorites"
              onClick={handleFavoritesClick}
              title="Cloud Favorites"
              className={`transition-colors ${
                isFavoritesPage
                  ? "text-synth-primary drop-shadow-[0_0_8px_rgba(255,77,143,0.4)]"
                  : "text-gray-400 hover:text-synth-primary"
              }`}
            >
              <Heart
                className={`w-6 h-6 ${isFavoritesPage ? "fill-synth-primary" : ""}`}
              />
            </Link>

            {user ? (
              <div className="flex items-center gap-3">
                {isDeveloper && (
                  <span className="hidden sm:flex items-center gap-1 bg-synth-primary/10 border border-synth-primary/30 text-synth-primary px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest cursor-default">
                    <Code className="w-3 h-3" /> Dev
                  </span>
                )}

                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="flex items-center gap-2 focus:outline-none"
                  >
                    <img
                      src={avatarUrl as string}
                      alt="User Avatar"
                      className="w-10 h-10 rounded-full border-2 border-transparent hover:border-synth-primary transition-all object-cover ring-0 hover:shadow-glow-primary-sm"
                    />
                  </button>

                  {isDropdownOpen && (
                    <div className="absolute right-0 mt-1 w-48 bg-synth-surface border border-synth-border rounded-xl shadow-glow-card py-2 z-50 backdrop-blur-xl">
                      <div className="px-4 py-2 border-b border-synth-border mb-2">
                        <p className="text-sm text-gray-400 truncate">
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
                          <ShieldAlert className="w-4 h-4" /> Admin Panel
                        </Link>
                      )}

                      <Link
                        to="/profile"
                        onClick={() => setIsDropdownOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-synth-elevated hover:text-white transition-colors"
                      >
                        <UserIcon className="w-4 h-4" /> Profile
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
                className="flex items-center gap-3 bg-synth-surface hover:bg-synth-elevated border border-synth-border hover:border-synth-primary/45 py-1.5 pl-1.5 pr-4 rounded-full transition-all group shadow-glow-primary-sm hover:shadow-glow-primary"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-synth-primary to-synth-secondary flex items-center justify-center shadow-glow-primary-sm">
                  <UserIcon className="w-4 h-4 text-black" />
                </div>
                <span className="text-sm font-medium text-gray-300 group-hover:text-white">
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
