import { isAdminRole } from "../domain/catalogPolicy.js";

export function createCatalogSocialUseCases(dependencies: {
  deleteComment(commentId: string, ownerId?: string): Promise<void>;
  findCommentAuthor(commentId: string): Promise<string | null>;
  findRole(userId: string): Promise<string | null>;
  hasLivePlay(input: { clientEdition: "studio" | "user"; gameId: string; runtimeKind: "wasm" | "webrtc" | "native"; userId: string }): Promise<boolean>;
  recordPlay(input: { clientEdition: "studio" | "user"; eventId: string; gameId: string; runtimeKind: "wasm" | "webrtc" | "native"; userId: string }): Promise<void>;
  saveCommentReaction(input: { commentId: string; isLike: boolean | null; userId: string }): Promise<unknown>;
}) {
  return {
    deleteComment: async (commentId: string, userId: string) => {
      const role = await dependencies.findRole(userId);
      await dependencies.deleteComment(commentId, isAdminRole(role) ? undefined : userId);
    },
    reactToComment: async (input: { commentId: string; isLike: boolean | null; userId: string }) => {
      const authorId = await dependencies.findCommentAuthor(input.commentId);
      if (!authorId || authorId === input.userId) return { status: "forbidden" } as const;
      return { status: "ok", reactions: await dependencies.saveCommentReaction(input) } as const;
    },
    recordPlay: async (input: { clientEdition: "studio" | "user"; eventId: string; gameId: string; runtimeKind: "wasm" | "webrtc" | "native"; userId: string }) => {
      if (!(await dependencies.hasLivePlay(input))) return { status: "missing_evidence" } as const;
      await dependencies.recordPlay(input);
      return { status: "ok" } as const;
    },
  };
}
