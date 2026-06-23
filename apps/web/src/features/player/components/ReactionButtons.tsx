import { Loader2, ThumbsDown, ThumbsUp } from "lucide-react";

type ReactionButtonsProps = {
  dislikes: number;
  error: string;
  isLoading: boolean;
  likes: number;
  userReaction: boolean | null;
  onReaction: (isLike: boolean) => void;
  onRetry: () => void;
};

export function ReactionButtons({
  dislikes,
  error,
  isLoading,
  likes,
  onReaction,
  onRetry,
  userReaction,
}: ReactionButtonsProps) {
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2 bg-synth-surface rounded-full border border-synth-border p-1">
        <button
          aria-label="Like game"
          disabled={isLoading}
          onClick={() => onReaction(true)}
          className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all disabled:cursor-wait disabled:opacity-50 ${userReaction === true ? "bg-synth-primary/20 text-synth-primary shadow-card" : "text-gray-400 hover:bg-synth-elevated hover:text-white"}`}
        >
          <ThumbsUp
            className={`w-4 h-4 ${userReaction === true ? "fill-current" : ""}`}
          />
          <span className="font-bold text-sm">{likes}</span>
        </button>
        <div className="w-px h-6 bg-synth-border" />
        <button
          aria-label="Dislike game"
          disabled={isLoading}
          onClick={() => onReaction(false)}
          className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all disabled:cursor-wait disabled:opacity-50 ${userReaction === false ? "bg-red-500/20 text-red-400" : "text-gray-400 hover:bg-synth-elevated hover:text-white"}`}
        >
          <span className="font-bold text-sm">{dislikes}</span>
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ThumbsDown
              className={`w-4 h-4 ${userReaction === false ? "fill-current" : ""}`}
            />
          )}
        </button>
      </div>
      {error && (
        <button
          className="text-xs font-medium text-red-300 hover:text-red-200"
          onClick={onRetry}
          type="button"
        >
          {error} Retry
        </button>
      )}
    </div>
  );
}
