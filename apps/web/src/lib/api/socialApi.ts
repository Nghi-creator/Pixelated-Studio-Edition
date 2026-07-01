type SocialApiDependencies = {
  apiRequest: <T>(path: string, options?: RequestInit & { authenticated?: boolean; timeoutMs?: number }) => Promise<T>;
};

export function createSocialApi({ apiRequest }: SocialApiDependencies) {
  return {
    deleteComment: (commentId: string) =>
      apiRequest<void>(`/comments/${commentId}`, {
        method: "DELETE",
      }),
    gameComments: <TComment>(gameId: string, page: number) =>
      apiRequest<{ comments: TComment[]; hasMore: boolean }>(
        `/games/${gameId}/comments?page=${page}`,
        { authenticated: false },
      ),
    gameReactions: (gameId: string) =>
      apiRequest<{ reactions: { is_like: boolean; user_id: string }[] }>(
        `/games/${gameId}/reactions`,
        { authenticated: false },
      ),
    postComment: (gameId: string, content: string) =>
      apiRequest<{ success: true }>(`/games/${gameId}/comments`, {
        body: JSON.stringify({ content }),
        method: "POST",
      }),
    reportComment: (commentId: string, reason: string) =>
      apiRequest<{ success: true }>(
        `/moderation/comments/${commentId}/report`,
        {
          body: JSON.stringify({ reason }),
          method: "POST",
        },
      ),
    setCommentReaction: (commentId: string, isLike: boolean | null) =>
      apiRequest<{ reactions: { is_like: boolean; user_id: string }[] }>(
        `/comments/${commentId}/reaction`,
        {
          body: JSON.stringify({ isLike }),
          method: "PUT",
        },
      ),
    setGameReaction: (gameId: string, isLike: boolean | null) =>
      apiRequest<{ success: true }>(`/games/${gameId}/reaction`, {
        body: JSON.stringify({ isLike }),
        method: "PUT",
      }),
  };
}
