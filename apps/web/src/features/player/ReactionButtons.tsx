import { ThumbsDown, ThumbsUp } from "lucide-react";

type ReactionButtonsProps = {
  dislikes: number;
  likes: number;
  userReaction: boolean | null;
  onReaction: (isLike: boolean) => void;
};

export function ReactionButtons({
  dislikes,
  likes,
  onReaction,
  userReaction,
}: ReactionButtonsProps) {
  return (
    <div className="flex items-center gap-2 bg-synth-surface rounded-full border border-synth-border p-1">
      <button
        onClick={() => onReaction(true)}
        className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${userReaction === true ? "bg-synth-primary/20 text-synth-primary shadow-glow-primary-sm" : "text-gray-400 hover:bg-synth-elevated hover:text-white"}`}
      >
        <ThumbsUp
          className={`w-4 h-4 ${userReaction === true ? "fill-current" : ""}`}
        />
        <span className="font-bold text-sm">{likes}</span>
      </button>
      <div className="w-px h-6 bg-synth-border" />
      <button
        onClick={() => onReaction(false)}
        className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${userReaction === false ? "bg-red-500/20 text-red-400" : "text-gray-400 hover:bg-synth-elevated hover:text-white"}`}
      >
        <span className="font-bold text-sm">{dislikes}</span>
        <ThumbsDown
          className={`w-4 h-4 ${userReaction === false ? "fill-current" : ""}`}
        />
      </button>
    </div>
  );
}
