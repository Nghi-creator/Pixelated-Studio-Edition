import { Heart } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";

interface GameCardProps {
  id: string;
  title: string;
  coverUrl: string;
}

export default function GameCard({ id, title, coverUrl }: GameCardProps) {
  const [isFavorited, setIsFavorited] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkFavorite = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const { data } = await supabase
        .from("favorites")
        .select("game_id")
        .eq("user_id", session.user.id)
        .eq("game_id", id)
        .maybeSingle();

      if (data) setIsFavorited(true);
    };

    checkFavorite();
  }, [id]);

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      alert("Please sign in to save games to your library!");
      navigate("/login");
      return;
    }

    if (isFavorited) {
      await supabase
        .from("favorites")
        .delete()
        .eq("user_id", session.user.id)
        .eq("game_id", id);
      setIsFavorited(false);
    } else {
      await supabase
        .from("favorites")
        .insert({ user_id: session.user.id, game_id: id });
      setIsFavorited(true);
    }
  };

  return (
    <Link
      to={`/play/${id}`}
      className="group relative block rounded-xl overflow-hidden bg-synth-surface border border-synth-border hover:border-synth-primary/55 hover:shadow-glow-primary-sm transition-all cursor-pointer"
    >
      <img
        src={coverUrl}
        alt={title}
        className="w-full h-64 md:h-72 object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300"
      />

      <button
        onClick={toggleFavorite}
        className="absolute top-2 right-2 bg-synth-bg/85 border border-synth-border/60 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 focus:outline-none z-10 backdrop-blur-sm"
      >
        <Heart
          className={`w-5 h-5 transition-colors ${isFavorited ? "fill-synth-primary text-synth-primary drop-shadow-[0_0_8px_rgba(255,77,143,0.5)]" : "text-white hover:text-synth-primary"}`}
        />
      </button>

      <div className="absolute bottom-0 w-full p-4 bg-gradient-to-t from-synth-bg via-synth-bg/92 to-transparent">
        <h3 className="font-bold text-lg truncate text-white">{title}</h3>
      </div>
    </Link>
  );
}
