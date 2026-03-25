import { Play, Plus } from "lucide-react";

export default function HeroBanner() {
  return (
    <div className="relative w-full h-[500px] md:h-[600px]">
      <div className="absolute inset-0 bg-gradient-to-r from-[#0B0F19] via-[#0B0F19]/80 to-transparent z-10"></div>
      <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F19] via-transparent to-transparent z-10"></div>
      <img
        className="absolute inset-0 w-full h-full object-cover opacity-50"
        src="https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=2070&auto=format&fit=crop"
        alt="Hero Background"
      />

      <div className="absolute top-1/2 left-0 transform -translate-y-1/2 z-20 w-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <span className="px-3 py-1 rounded-full bg-[#00f2fe]/20 text-[#00f2fe] text-xs font-bold uppercase tracking-wide border border-[#00f2fe]/50 mb-4 inline-block">
              Featured Native Port
            </span>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-4 drop-shadow-lg text-white">
              Retro Odyssey
            </h1>
            <p className="text-lg text-gray-300 mb-8 drop-shadow-md">
              Jump back into the classic platformer. Zero latency. Instant play.
              Hosted directly on your AWS Edge nodes.
            </p>

            <div className="flex flex-wrap gap-4">
              <button className="bg-[#00f2fe] hover:bg-blue-400 text-black font-bold py-3 px-8 rounded-lg shadow-[0_0_15px_rgba(0,242,254,0.4)] transition-all flex items-center gap-2">
                <Play className="w-5 h-5 fill-black" /> Play Now
              </button>
              <button className="bg-[#111827] hover:bg-gray-800 border border-gray-700 text-white font-bold py-3 px-8 rounded-lg transition-all flex items-center gap-2">
                <Plus className="w-5 h-5" /> Add to List
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
