import {
  canSelfDeleteAccount,
  hasRecentSignIn,
} from "../domain/accountDeletionPolicy.js";

export type OwnedAccountStorage = { bucket: string; paths: string[] };

export type DeleteAccountDependencies = {
  deleteIdentity(userId: string): Promise<void>;
  beginDeletion(userId: string): Promise<void>;
  findOwnedStorage(userId: string): Promise<OwnedAccountStorage[]>;
  findRole(userId: string): Promise<string | null>;
  removeOwnedStorage(
    storage: OwnedAccountStorage[],
  ): Promise<{ bucket: string | undefined; error: unknown }[]>;
};

export class DeleteAccountError extends Error {
  constructor(
    readonly stage: "authorize" | "delete_identity" | "inspect_storage" | "begin_deletion",
    override readonly cause: unknown,
  ) {
    super(`Account deletion failed during ${stage}`);
  }
}

export function createDeleteAccount(dependencies: DeleteAccountDependencies) {
  return async function deleteAccount(input: {
    lastSignInAt?: string;
    userId: string;
  }) {
    let role: string | null;
    try {
      role = await dependencies.findRole(input.userId);
    } catch (error) {
      throw new DeleteAccountError("authorize", error);
    }

    if (!canSelfDeleteAccount(role)) return { status: "admin_forbidden" } as const;
    if (!hasRecentSignIn(input.lastSignInAt)) {
      return { status: "recent_sign_in_required" } as const;
    }

    // Persist intent before inventory: Storage policies stop new uploads while
    // failures remain retryable through this authenticated endpoint.
    try {
      await dependencies.beginDeletion(input.userId);
    } catch (error) {
      throw new DeleteAccountError("begin_deletion", error);
    }
    let ownedStorage: OwnedAccountStorage[];
    try {
      ownedStorage = await dependencies.findOwnedStorage(input.userId);
    } catch (error) {
      throw new DeleteAccountError("inspect_storage", error);
    }

    const cleanupFailures = await dependencies.removeOwnedStorage(ownedStorage);
    if (cleanupFailures.length > 0) {
      return { cleanupFailures, status: "cleanup_incomplete" } as const;
    }
    try {
      await dependencies.deleteIdentity(input.userId);
    } catch (error) {
      throw new DeleteAccountError("delete_identity", error);
    }

    return { status: "deleted" } as const;
  };
}
