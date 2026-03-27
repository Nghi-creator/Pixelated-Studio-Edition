import { Heart } from "lucide-react";
import { Link } from "react-router-dom";

interface GameCardProps {
  id: string;
  title: string;
  coverUrl: string;
}

export default function GameCard({ id, title, coverUrl }: GameCardProps) {
  return (
    <Link
      to={`/play/${id}`}
      className="group relative block rounded-xl overflow-hidden bg-[#111827] border border-gray-800 hover:border-[#00f2fe]/50 transition-all cursor-pointer"
    >
      <img
        src={coverUrl}
        alt={title}
        className="w-full h-64 md:h-72 object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300"
      />

      <div className="absolute top-2 right-2 bg-[#0B0F19]/80 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:text-[#00f2fe]">
        <Heart className="w-5 h-5" />
      </div>

      <div className="absolute bottom-0 w-full p-4 bg-gradient-to-t from-[#0B0F19] via-[#0B0F19]/90 to-transparent">
        <h3 className="font-bold text-lg truncate text-white">{title}</h3>
      </div>
    </Link>
  );
}
