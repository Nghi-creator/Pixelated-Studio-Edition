import { isAdminRole } from "../domain/catalogPolicy.js";

export function createDeleteComment(dependencies: {
  deleteComment(commentId: string, ownerId?: string): Promise<void>;
  findRole(userId: string): Promise<string | null>;
}) {
  return async (commentId: string, userId: string) => {
    const role = await dependencies.findRole(userId);
    await dependencies.deleteComment(commentId, isAdminRole(role) ? undefined : userId);
  };
}

export function createReactToComment(dependencies: {
  findCommentAuthor(commentId: string): Promise<string | null>;
  saveCommentReaction(input: { commentId: string; isLike: boolean | null; userId: string }): Promise<unknown>;
}) {
  return async (input: { commentId: string; isLike: boolean | null; userId: string }) => {
    const authorId = await dependencies.findCommentAuthor(input.commentId);
    if (!authorId || authorId === input.userId) return { status: "forbidden" } as const;
    return { status: "ok", reactions: await dependencies.saveCommentReaction(input) } as const;
  };
}

type PlayInput = {
  clientEdition: "studio" | "user";
  eventId: string;
  gameId: string;
  runtimeKind: "wasm" | "webrtc" | "native";
  userId: string;
};

export function createRecordPlay(dependencies: {
  hasLivePlay(input: PlayInput): Promise<boolean>;
  recordPlay(input: PlayInput): Promise<void>;
}) {
  return async (input: PlayInput) => {
    if (!(await dependencies.hasLivePlay(input))) return { status: "missing_evidence" } as const;
    await dependencies.recordPlay(input);
    return { status: "ok" } as const;
  };
}
