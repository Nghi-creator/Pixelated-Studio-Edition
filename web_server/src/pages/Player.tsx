import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, ThumbsUp, ThumbsDown, Send } from "lucide-react";
import { useWebRTC } from "../lib/useWebRTC";
import { supabase } from "../lib/supabaseClient";
import type { User } from "@supabase/supabase-js";

interface GameComment {
  id: string;
  content: string;
  created_at: string;
  profiles: {
    username: string | null;
    avatar_url: string | null;
  } | null;
}

export default function Player() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);

  const { stream, status } = useWebRTC(id || "");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [gameTitle, setGameTitle] = useState<string>("");

  // Reaction State
  const [likes, setLikes] = useState(0);
  const [dislikes, setDislikes] = useState(0);
  const [userReaction, setUserReaction] = useState<boolean | null>(null); // true = like, false = dislike
  const [isReactionLoading, setIsReactionLoading] = useState(false);

  // Comments State
  const [comments, setComments] = useState<GameComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMoreComments, setHasMoreComments] = useState(true);

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

  // 3. Fetch Reactions (Likes/Dislikes)
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
          id, content, created_at,
          profiles ( username, avatar_url )
        `,
        )
        .eq("game_id", id)
        .order("created_at", { ascending: false })
        .range(pageNum * 10, (pageNum + 1) * 10 - 1);

      if (error) return console.error(error);

      if (data.length < 10) setHasMoreComments(false);

      const typedData = data as unknown as GameComment[];

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

  // Handle Like/Dislike Button Clicks
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

  // Handle Submitting a new comment
  const handlePostComment = async (e: React.FormEvent) => {
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
      setHasMoreComments(true);
      await fetchComments(0, true);
    } catch (err) {
      console.error(err);
      alert("Failed to post comment.");
    } finally {
      setIsSubmittingComment(false);
    }
  };

  return (
    <div className="flex flex-col items-center pt-24 pb-24 px-4 min-h-screen">
      {/* Top Controls Bar */}
      <div className="w-full max-w-5xl flex flex-col mb-6">
        {/* Row 1: Back Button */}
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-gray-400 hover:text-[#00f2fe] transition-colors w-fit mb-4"
        >
          <ArrowLeft className="w-5 h-5" /> Back to Library
        </button>

        {/* Row 2: Title and Status Pill */}
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            {gameTitle || "Loading Game..."}
          </h1>

          <div className="flex items-center gap-2 bg-[#111827] px-4 py-2 rounded-full border border-gray-800">
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
      <div className="relative w-full max-w-5xl aspect-video bg-black border border-gray-800 rounded-xl overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.5)] flex items-center justify-center">
        {status === "connecting" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0B0F19]/90 backdrop-blur-sm">
            <Loader2 className="w-12 h-12 text-[#00f2fe] animate-spin mb-4" />
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

      {/* Under-Player Action Bar (Instructions + Likes) */}
      <div className="w-full max-w-5xl mt-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        {/* Left: Keyboard Instructions */}
        <div className="flex flex-wrap items-center gap-4 text-gray-400 text-sm">
          <p>Click video to focus.</p>
          <p className="border-l border-gray-700 pl-4">
            Move:{" "}
            <kbd className="bg-gray-800 px-2 py-1 rounded text-gray-200 ml-1 font-mono">
              ARROWS
            </kbd>
          </p>
          <p className="border-l border-gray-700 pl-4">
            Action:{" "}
            <kbd className="bg-gray-800 px-2 py-1 rounded text-gray-200 ml-1 font-mono">
              Z
            </kbd>{" "}
            /{" "}
            <kbd className="bg-gray-800 px-2 py-1 rounded text-gray-200 ml-1 font-mono">
              X
            </kbd>
          </p>
        </div>

        {/* Right: Likes & Dislikes */}
        <div className="flex items-center gap-2 bg-[#111827] rounded-full border border-gray-800 p-1">
          <button
            onClick={() => handleReaction(true)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${userReaction === true ? "bg-[#00f2fe]/20 text-[#00f2fe]" : "text-gray-400 hover:bg-gray-800 hover:text-white"}`}
          >
            <ThumbsUp
              className={`w-4 h-4 ${userReaction === true ? "fill-current" : ""}`}
            />
            <span className="font-bold text-sm">{likes}</span>
          </button>

          <div className="w-px h-6 bg-gray-700"></div>

          <button
            onClick={() => handleReaction(false)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${userReaction === false ? "bg-red-500/20 text-red-400" : "text-gray-400 hover:bg-gray-800 hover:text-white"}`}
          >
            <span className="font-bold text-sm">{dislikes}</span>
            <ThumbsDown
              className={`w-4 h-4 ${userReaction === false ? "fill-current" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* --- COMMENTS SECTION --- */}
      <div className="w-full max-w-5xl mt-12 border-t border-gray-800 pt-8">
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
                className="w-full bg-[#111827] border border-gray-800 text-white rounded-xl pl-4 pr-12 py-4 focus:outline-none focus:border-[#00f2fe] focus:ring-1 focus:ring-[#00f2fe] transition-all"
                maxLength={500}
              />
              <button
                type="submit"
                disabled={!newComment.trim() || isSubmittingComment}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-[#00f2fe] disabled:opacity-50 transition-colors"
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
          <div className="mb-10 p-6 bg-[#111827]/50 border border-gray-800 rounded-xl text-center">
            <p className="text-gray-400">
              Please{" "}
              <button
                onClick={() => navigate("/login")}
                className="text-[#00f2fe] hover:underline font-medium"
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
                `https://ui-avatars.com/api/?name=${displayName}&background=00f2fe&color=000000&bold=true`;

              return (
                <div key={comment.id} className="flex gap-4 group">
                  <img
                    src={avatar}
                    alt="Avatar"
                    className="w-10 h-10 rounded-full object-cover border border-gray-800"
                  />
                  <div>
                    <div className="flex items-center gap-2 mb-1">
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
                    <p className="text-gray-300 text-sm leading-relaxed">
                      {comment.content}
                    </p>
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
            className="mt-8 w-full py-3 border border-gray-800 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-all font-medium"
          >
            Load More Comments
          </button>
        )}
      </div>
    </div>
  );
}
