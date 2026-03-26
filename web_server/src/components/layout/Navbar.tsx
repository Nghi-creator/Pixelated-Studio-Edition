import { Search, Gamepad2, Heart, Settings } from "lucide-react";

export default function Navbar() {
  return (
    <nav className="fixed w-full z-50 bg-[#0B0F19]/90 backdrop-blur-md border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex-shrink-0 flex items-center gap-2 cursor-pointer">
            <Gamepad2 className="text-[#00f2fe] w-8 h-8" />
            <span className="font-bold text-xl tracking-wider text-white">
              CLOUD<span className="text-[#00f2fe]">101</span>
            </span>
          </div>

          {/* Right Nav Controls */}
          <div className="flex items-center space-x-6">
            <button className="text-gray-300 hover:text-[#00f2fe] transition-colors">
              <Heart className="w-5 h-5" />
            </button>
            <button className="text-gray-300 hover:text-[#00f2fe] transition-colors">
              <Settings className="w-5 h-5" />
            </button>
            {/* User Avatar Placeholder */}
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#00f2fe] to-blue-600 cursor-pointer border-2 border-transparent hover:border-white transition-all"></div>
          </div>
        </div>
      </div>
    </nav>
  );
}
