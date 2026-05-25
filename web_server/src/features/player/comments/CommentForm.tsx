import { Loader2, Send } from "lucide-react";

type CommentFormProps = {
  isSubmittingComment: boolean;
  newComment: string;
  onPostComment: (event: React.FormEvent<HTMLFormElement>) => void;
  onSignIn: () => void;
  setNewComment: (comment: string) => void;
  signedIn: boolean;
};

export function CommentForm({
  isSubmittingComment,
  newComment,
  onPostComment,
  onSignIn,
  setNewComment,
  signedIn,
}: CommentFormProps) {
  if (!signedIn) {
    return (
      <div className="mb-10 p-6 bg-synth-surface/50 border border-synth-border rounded-xl text-center">
        <p className="text-gray-400">
          Please{" "}
          <button
            onClick={onSignIn}
            className="text-synth-primary hover:text-synth-secondary-hover hover:underline font-medium"
          >
            sign in
          </button>{" "}
          to leave a comment.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onPostComment} className="mb-10 flex gap-4">
      <div className="flex-grow relative">
        <input
          type="text"
          value={newComment}
          onChange={(event) => setNewComment(event.target.value)}
          placeholder="Add a comment..."
          className="w-full bg-synth-surface border border-synth-border text-white rounded-xl pl-4 pr-12 py-4 focus:outline-none focus:border-synth-primary focus:ring-1 focus:ring-synth-primary transition-all"
          maxLength={500}
        />
        <button
          type="submit"
          disabled={!newComment.trim() || isSubmittingComment}
          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-synth-primary disabled:opacity-50 transition-colors"
        >
          {isSubmittingComment ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>
    </form>
  );
}
