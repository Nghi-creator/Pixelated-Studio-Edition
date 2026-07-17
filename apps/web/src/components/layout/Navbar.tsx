import { Link, useNavigate, useLocation } from "react-router-dom";
import { Loader2, ScrollText } from "lucide-react";
import { PixelIcon } from "../ui/PixelIcon";
import { NavbarAccount } from "./navbar/NavbarAccount";
import { useNavbarIdentity } from "./navbar/useNavbarIdentity";

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    avatarUrl,
    isDeveloper,
    isEnginePaired,
    isIdentityLoading,
    role,
    user,
    username,
  } = useNavbarIdentity();

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
            ) : role !== "super_admin" ? (
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

            <NavbarAccount
              avatarUrl={avatarUrl}
              isDeveloper={isDeveloper}
              role={role}
              user={user}
              username={username}
            />
          </div>
        </div>
      </div>
    </nav>
  );
}
