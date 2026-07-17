import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Code, LogOut } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/auth/supabaseClient";
import { Avatar } from "../../ui/Avatar";
import { PixelIcon } from "../../ui/PixelIcon";

type NavbarAccountProps = {
  avatarUrl: string | null;
  isDeveloper: boolean;
  role: string | null;
  user: User | null;
  username: string | null;
};

export function NavbarAccount({
  avatarUrl,
  isDeveloper,
  role,
  user,
  username,
}: NavbarAccountProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

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

  if (!user) {
    return (
      <Link
        to="/login"
        className="flex items-center gap-3 rounded-md border border-synth-border bg-synth-surface py-1.5 pl-1.5 pr-4 transition-colors group hover:bg-synth-elevated"
      >
        <div className="w-8 h-8 rounded bg-synth-elevated flex items-center justify-center">
          <PixelIcon className="w-4 h-4 text-white" name="profile" />
        </div>
        <span className="text-sm font-medium text-white">Sign In</span>
      </Link>
    );
  }

  const displayName = username || user.email;

  return (
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
          type="button"
        >
          <Avatar
            alt="User Avatar"
            className="border-2 border-transparent transition-colors ring-0 hover:border-synth-border"
            loading="eager"
            name={displayName}
            src={avatarUrl}
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
                {displayName}
              </p>
            </div>

            {(role === "admin" || role === "super_admin") && (
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
              onClick={() => void handleSignOut()}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-synth-elevated hover:text-red-300 transition-colors text-left"
              type="button"
            >
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
