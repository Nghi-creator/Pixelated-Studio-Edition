import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  ThumbsUp,
  ThumbsDown,
  Send,
  Trash2,
  Flag,
  AlertTriangle,
  X,
} from "lucide-react";
import { useWebRTC } from "../../lib/useWebRTC";
import { supabase } from "../../lib/supabaseClient";
import type { User } from "@supabase/supabase-js";

interface GameComment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles: {
    username: string | null;
    avatar_url: string | null;
  } | null;
  comment_likes: {
    user_id: string;
    is_like: boolean;
  }[];
}

export default function Player() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);

  const { stream, status } = useWebRTC(id || "");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [gameTitle, setGameTitle] = useState<string>("");

  // Reaction State (Game)
  const [likes, setLikes] = useState(0);
  const [dislikes, setDislikes] = useState(0);
  const [userReaction, setUserReaction] = useState<boolean | null>(null);
  const [isReactionLoading, setIsReactionLoading] = useState(false);

  // Comments State
  const [comments, setComments] = useState<GameComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMoreComments, setHasMoreComments] = useState(true);

  // Reporting State
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(
    null,
  );
  const [reportReason, setReportReason] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // 1. Fetch Auth Session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUser(session?.user ?? null);
    });
  }, []);

  // 2. Stream Setup & Scroll Lock
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    const gameKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "];

    const preventScroll = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        return;
      }

      if (gameKeys.includes(e.key)) {
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", preventScroll, {
      passive: false,
      capture: true,
    });

    return () =>
      window.removeEventListener("keydown", preventScroll, { capture: true });
  }, []);

  // 3. Fetch Game Reactions
  const fetchReactions = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from("likes")
      .select("user_id, is_like")
      .eq("game_id", id);
    if (error) return console.error(error);

    let lCount = 0;
    let dCount = 0;
    let uReaction = null;

    data.forEach((row) => {
      if (row.is_like) lCount++;
      else dCount++;

      if (currentUser && row.user_id === currentUser.id) {
        uReaction = row.is_like;
      }
    });

    setLikes(lCount);
    setDislikes(dCount);
    setUserReaction(uReaction);
  }, [id, currentUser]);

  useEffect(() => {
    fetchReactions();
  }, [fetchReactions]);

  // 4. Fetch Comments
  const fetchComments = useCallback(
    async (pageNum: number, isInitial = false) => {
      if (!id) return;

      const { data, error } = await supabase
        .from("comments")
        .select(
          `
          id, content, created_at, user_id,
          profiles ( username, avatar_url ),
          comment_likes ( user_id, is_like )
        `,
        )
        .eq("game_id", id)
        .order("created_at", { ascending: false })
        .range(pageNum * 10, (pageNum + 1) * 10);

      if (error) return console.error(error);

      let displayData = data;

      if (data.length > 10) {
        setHasMoreComments(true);
        displayData = data.slice(0, 10);
      } else {
        setHasMoreComments(false);
      }

      const typedData = displayData as unknown as GameComment[];

      if (isInitial) {
        setComments(typedData);
      } else {
        setComments((prev) => [...prev, ...typedData]);
      }
    },
    [id],
  );

  useEffect(() => {
    fetchComments(0, true);
  }, [fetchComments]);

  // Handle Game Reaction
  const handleReaction = async (isLike: boolean) => {
    if (!currentUser) {
      alert("Please sign in to react to this game!");
      return;
    }
    if (isReactionLoading) return;
    setIsReactionLoading(true);

    try {
      if (userReaction === isLike) {
        await supabase
          .from("likes")
          .delete()
          .match({ user_id: currentUser.id, game_id: id });
      } else {
        if (userReaction !== null) {
          await supabase
            .from("likes")
            .delete()
            .match({ user_id: currentUser.id, game_id: id });
        }
        await supabase
          .from("likes")
          .insert({ user_id: currentUser.id, game_id: id, is_like: isLike });
      }
      await fetchReactions();
    } catch (err) {
      console.error(err);
    } finally {
      setIsReactionLoading(false);
    }
  };

  // Fetch Game Details
  useEffect(() => {
    const fetchGameDetails = async () => {
      if (!id) return;
      const { data } = await supabase
        .from("games")
        .select("title")
        .eq("id", id)
        .single();
      if (data?.title) {
        setGameTitle(data.title);
      } else {
        const formattedTitle = id
          .replace(/-/g, " ")
          .replace(/\b\w/g, (char) => char.toUpperCase());
        setGameTitle(formattedTitle);
      }
    };
    fetchGameDetails();
  }, [id]);

  // Post Comment
  const handlePostComment = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentUser || !newComment.trim() || !id) return;

    setIsSubmittingComment(true);
    try {
      const { error } = await supabase.from("comments").insert({
        user_id: currentUser.id,
        game_id: id,
        content: newComment.trim(),
      });
      if (error) throw error;
      setNewComment("");
      setPage(0);
      await fetchComments(0, true);
    } catch (err) {
      console.error(err);
      alert("Failed to post comment.");
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Delete Comment
  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm("Are you sure you want to delete this comment?"))
      return;
    try {
      await supabase.from("comments").delete().eq("id", commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      console.error(err);
      alert("Failed to delete comment.");
    }
  };

  // Submit Report
  const handleSubmitReport = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentUser || !reportingCommentId || !reportReason.trim()) return;

    setIsSubmittingReport(true);
    try {
      const { error } = await supabase.from("reported_comments").insert({
        comment_id: reportingCommentId,
        reporter_id: currentUser.id,
        reason: reportReason.trim(),
      });

      if (error) {
        if (error.code === "23505") {
          alert(
            "You have already reported this comment. Our moderators are reviewing it.",
          );
        } else {
          throw error;
        }
      } else {
        alert(
          "Report submitted successfully. Thank you for keeping the community safe!",
        );
      }
    } catch (err) {
      console.error("Failed to submit report:", err);
      alert("Failed to submit report. Please try again.");
    } finally {
      setIsSubmittingReport(false);
      setReportingCommentId(null);
      setReportReason("");
    }
  };

  // React to Comment
  const handleCommentReaction = async (commentId: string, isLike: boolean) => {
    if (!currentUser) {
      alert("Please sign in to react to comments!");
      return;
    }

    try {
      const targetComment = comments.find((c) => c.id === commentId);
      if (!targetComment) return;

      if (targetComment.user_id === currentUser.id) {
        return;
      }

      const existingReaction = targetComment.comment_likes?.find(
        (l) => l.user_id === currentUser.id,
      );

      if (existingReaction?.is_like === isLike) {
        // Toggle off
        await supabase
          .from("comment_likes")
          .delete()
          .match({ user_id: currentUser.id, comment_id: commentId });
      } else {
        // Switch or new vote
        if (existingReaction) {
          await supabase
            .from("comment_likes")
            .delete()
            .match({ user_id: currentUser.id, comment_id: commentId });
        }
        await supabase.from("comment_likes").insert({
          user_id: currentUser.id,
          comment_id: commentId,
          is_like: isLike,
        });
      }

      const { data } = await supabase
        .from("comment_likes")
        .select("user_id, is_like")
        .eq("comment_id", commentId);

      if (data) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === commentId ? { ...c, comment_likes: data } : c,
          ),
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 5. 30-Second Play Tracker
  useEffect(() => {
    if (!id) return;

    const timer = setTimeout(async () => {
      try {
        const { error } = await supabase.rpc("increment_play_count", {
          game_id: id,
        });

        if (error) throw error;
        console.log("Play successfully counted!");
      } catch (err) {
        console.error("Failed to count play:", err);
      }
    }, 30000);
    return () => clearTimeout(timer);
  }, [id]);

  return (
    <div className="flex flex-col items-center pt-24 pb-24 px-4 min-h-screen">
      {/* Top Controls Bar */}
      <div className="w-full max-w-5xl flex flex-col mb-6">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-gray-400 hover:text-synth-primary transition-colors w-fit mb-4"
        >
          <ArrowLeft className="w-5 h-5" /> Back to Library
        </button>

        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            {gameTitle || "Loading Game..."}
          </h1>

          <div className="flex items-center gap-2 bg-synth-surface px-4 py-2 rounded-full border border-synth-border">
            <div
              className={`w-2.5 h-2.5 rounded-full ${status === "playing" ? "bg-green-500 shadow-[0_0_10px_#22c55e]" : "bg-yellow-500 animate-pulse"}`}
            ></div>
            <span className="text-sm font-medium text-gray-300 uppercase tracking-wider">
              {status === "connecting"
                ? "Connecting to Edge Node..."
                : "Live Stream Active"}
            </span>
          </div>
        </div>
      </div>

      {/* The Player Container */}
      <div className="relative w-full max-w-5xl aspect-video bg-black border border-synth-border rounded-xl overflow-hidden shadow-glow-card ring-1 ring-synth-primary/10 flex items-center justify-center">
        {status === "connecting" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-synth-bg/90 backdrop-blur-sm">
            <Loader2 className="w-12 h-12 text-synth-primary animate-spin mb-4 drop-shadow-[0_0_12px_rgba(255,77,143,0.45)]" />
            <p className="text-lg text-gray-300 font-medium tracking-wide">
              Establishing WebRTC Handshake...
            </p>
          </div>
        )}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-contain"
        />
      </div>

      {/* Under-Player Action Bar */}
      <div className="w-full max-w-5xl mt-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-wrap items-center gap-4 text-gray-400 text-sm">
          <p>
            Move:{" "}
            <kbd className="bg-synth-elevated border border-synth-border px-2 py-1 rounded text-gray-200 ml-1 font-mono">
              ARROWS
            </kbd>
          </p>
          <p className="border-l border-synth-border pl-4">
            Action:{" "}
            <kbd className="bg-synth-elevated border border-synth-border px-2 py-1 rounded text-gray-200 ml-1 font-mono">
              Z
            </kbd>{" "}
            /{" "}
            <kbd className="bg-synth-elevated border border-synth-border px-2 py-1 rounded text-gray-200 ml-1 font-mono">
              X
            </kbd>
          </p>
        </div>

        <div className="flex items-center gap-2 bg-synth-surface rounded-full border border-synth-border p-1">
          <button
            onClick={() => handleReaction(true)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${userReaction === true ? "bg-synth-primary/20 text-synth-primary shadow-glow-primary-sm" : "text-gray-400 hover:bg-synth-elevated hover:text-white"}`}
          >
            <ThumbsUp
              className={`w-4 h-4 ${userReaction === true ? "fill-current" : ""}`}
            />
            <span className="font-bold text-sm">{likes}</span>
          </button>
          <div className="w-px h-6 bg-synth-border"></div>
          <button
            onClick={() => handleReaction(false)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${userReaction === false ? "bg-red-500/20 text-red-400" : "text-gray-400 hover:bg-synth-elevated hover:text-white"}`}
          >
            <span className="font-bold text-sm">{dislikes}</span>
            <ThumbsDown
              className={`w-4 h-4 ${userReaction === false ? "fill-current" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* --- COMMENTS SECTION --- */}
      <div className="w-full max-w-5xl mt-12 border-t border-synth-border pt-8">
        <h3 className="text-xl font-bold text-white mb-6">
          Comments ({comments.length}
          {hasMoreComments ? "+" : ""})
        </h3>

        {/* Comment Input Box */}
        {currentUser ? (
          <form onSubmit={handlePostComment} className="mb-10 flex gap-4">
            <div className="flex-grow relative">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
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
        ) : (
          <div className="mb-10 p-6 bg-synth-surface/50 border border-synth-border rounded-xl text-center">
            <p className="text-gray-400">
              Please{" "}
              <button
                onClick={() => navigate("/login")}
                className="text-synth-primary hover:text-synth-secondary-hover hover:underline font-medium"
              >
                sign in
              </button>{" "}
              to leave a comment.
            </p>
          </div>
        )}

        {/* Comments Feed */}
        <div className="space-y-6">
          {comments.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No comments yet. Be the first to start the discussion!
            </p>
          ) : (
            comments.map((comment) => {
              const displayName =
                comment.profiles?.username || "Anonymous Player";
              const avatar =
                comment.profiles?.avatar_url ||
                `https://ui-avatars.com/api/?name=${displayName}&background=FF4D8F&color=000000&bold=true`;

              let cLikes = 0;
              let cDislikes = 0;
              let cUserReaction = null;

              comment.comment_likes?.forEach((reaction) => {
                if (reaction.is_like) cLikes++;
                else cDislikes++;
                if (currentUser && reaction.user_id === currentUser.id) {
                  cUserReaction = reaction.is_like;
                }
              });

              return (
                <div key={comment.id} className="flex gap-4 group">
                  <img
                    src={avatar}
                    alt="Avatar"
                    className="w-10 h-10 rounded-full object-cover border border-synth-border"
                  />
                  <div className="flex-grow">
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">
                          {displayName}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(comment.created_at).toLocaleDateString(
                            undefined,
                            { month: "short", day: "numeric", year: "numeric" },
                          )}
                        </span>
                      </div>

                      {/* Action Icons: Delete or Report */}
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {currentUser?.id === comment.user_id ? (
                          <button
                            onClick={() => handleDeleteComment(comment.id)}
                            className="text-gray-500 hover:text-red-400 transition-colors"
                            title="Delete Comment"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : (
                          currentUser && (
                            <button
                              onClick={() => setReportingCommentId(comment.id)}
                              className="text-gray-500 hover:text-yellow-500 transition-colors"
                              title="Report Comment"
                            >
                              <Flag className="w-4 h-4" />
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    <p className="text-gray-300 text-sm leading-relaxed mb-3">
                      {comment.content}
                    </p>

                    {/* Comment Reaction Buttons */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleCommentReaction(comment.id, true)}
                        disabled={currentUser?.id === comment.user_id}
                        className={`flex items-center gap-1.5 text-xs font-medium transition-all ${
                          currentUser?.id === comment.user_id
                            ? "text-gray-600 opacity-50 cursor-not-allowed"
                            : cUserReaction === true
                              ? "text-synth-primary"
                              : "text-gray-500 hover:text-white"
                        }`}
                      >
                        <ThumbsUp
                          className={`w-3.5 h-3.5 ${cUserReaction === true ? "fill-current" : ""}`}
                        />
                        {cLikes > 0 && cLikes}
                      </button>

                      <button
                        onClick={() => handleCommentReaction(comment.id, false)}
                        disabled={currentUser?.id === comment.user_id}
                        className={`flex items-center gap-1.5 text-xs font-medium transition-all ${
                          currentUser?.id === comment.user_id
                            ? "text-gray-600 opacity-50 cursor-not-allowed"
                            : cUserReaction === false
                              ? "text-red-400"
                              : "text-gray-500 hover:text-white"
                        }`}
                      >
                        <ThumbsDown
                          className={`w-3.5 h-3.5 ${cUserReaction === false ? "fill-current" : ""}`}
                        />
                        {cDislikes > 0 && cDislikes}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Load More Button */}
        {hasMoreComments && comments.length > 0 && (
          <button
            onClick={() => {
              const nextPage = page + 1;
              setPage(nextPage);
              fetchComments(nextPage, false);
            }}
            className="mt-8 w-full py-3 border border-synth-border rounded-xl text-gray-400 hover:text-white hover:bg-synth-elevated transition-all font-medium"
          >
            Load More Comments
          </button>
        )}
      </div>

      {/* --- REPORT MODAL --- */}
      {reportingCommentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-synth-surface border border-synth-border rounded-2xl w-full max-w-md overflow-hidden shadow-glow-card">
            <div className="flex justify-between items-center p-6 border-b border-synth-border">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <AlertTriangle className="text-yellow-500 w-5 h-5" />
                Report Comment
              </h3>
              <button
                onClick={() => {
                  setReportingCommentId(null);
                  setReportReason("");
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitReport} className="p-6">
              <p className="text-gray-400 text-sm mb-4">
                Why are you reporting this comment? This will be sent directly
                to our moderators for review.
              </p>

              <textarea
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="E.g., Spam, harassment, toxic behavior..."
                className="w-full bg-synth-bg border border-synth-border rounded-xl p-3 text-white focus:outline-none focus:border-synth-secondary focus:ring-1 focus:ring-synth-secondary/40 min-h-[100px] mb-6 resize-none"
                required
              />

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setReportingCommentId(null);
                    setReportReason("");
                  }}
                  className="px-4 py-2 text-gray-400 hover:text-white font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReport || !reportReason.trim()}
                  className="px-6 py-2 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmittingReport && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  {isSubmittingReport ? "Submitting..." : "Submit Report"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
