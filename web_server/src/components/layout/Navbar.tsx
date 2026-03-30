import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Gamepad2, Heart, LogOut, User as UserIcon } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import type { User } from "@supabase/supabase-js";

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [dbUsername, setDbUsername] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchUserAndProfile = async (sessionUser: User | null) => {
      setUser(sessionUser);
      if (sessionUser) {
        const { data } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", sessionUser.id)
          .single();

        if (data?.username) {
          setDbUsername(data.username);
        }
      } else {
        setDbUsername(null);
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
      ? `https://ui-avatars.com/api/?name=${user.email}&background=00f2fe&color=000000&bold=true`
      : null);

  const isFavoritesPage = location.pathname === "/favorites";

  return (
    <nav className="fixed top-0 w-full z-50 bg-[#0B0F19]/90 backdrop-blur-md border-b border-gray-800 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 group">
            <Gamepad2 className="w-8 h-8 text-[#00f2fe] group-hover:animate-pulse" />
            <span className="text-xl font-extrabold tracking-widest text-white">
              CLOUD<span className="text-[#00f2fe]">101</span>
            </span>
          </Link>

          <div className="flex items-center gap-6">
            <Link
              to="/favorites"
              onClick={handleFavoritesClick}
              className={`transition-colors ${
                isFavoritesPage
                  ? "text-[#00f2fe]"
                  : "text-gray-400 hover:text-[#00f2fe]"
              }`}
            >
              <Heart
                className={`w-6 h-6 ${isFavoritesPage ? "fill-[#00f2fe]" : ""}`}
              />
            </Link>

            {user ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center gap-2 focus:outline-none"
                >
                  <img
                    src={avatarUrl as string}
                    alt="User Avatar"
                    className="w-10 h-10 rounded-full border-2 border-transparent hover:border-[#00f2fe] transition-all object-cover"
                  />
                </button>

                {isDropdownOpen && (
                  <div className="absolute right-0 mt-1 w-48 bg-[#111827] border border-gray-700 rounded-xl shadow-xl py-2 z-50">
                    <div className="px-4 py-2 border-b border-gray-700 mb-2">
                      <p className="text-sm text-gray-400 truncate">
                        Signed in as
                      </p>

                      <p className="text-sm font-bold text-white truncate">
                        {dbUsername || user.email}
                      </p>
                    </div>
                    <Link
                      to="/profile"
                      onClick={() => setIsDropdownOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-[#00f2fe] transition-colors"
                    >
                      <UserIcon className="w-4 h-4" /> Profile
                    </Link>
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-gray-800 hover:text-red-300 transition-colors text-left"
                    >
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                to="/login"
                className="flex items-center gap-3 bg-[#111827] hover:bg-gray-800 border border-gray-700 hover:border-[#00f2fe]/50 py-1.5 pl-1.5 pr-4 rounded-full transition-all group"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#00f2fe] to-blue-600 flex items-center justify-center">
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
