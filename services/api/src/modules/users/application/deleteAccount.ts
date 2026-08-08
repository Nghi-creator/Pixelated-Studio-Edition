import {
  canSelfDeleteAccount,
  hasRecentSignIn,
} from "../domain/accountDeletionPolicy.js";

export type OwnedAccountStorage = { bucket: string; paths: string[] };

export type DeleteAccountDependencies = {
  deleteIdentity(userId: string): Promise<void>;
  findOwnedStorage(userId: string): Promise<OwnedAccountStorage[]>;
  findRole(userId: string): Promise<string | null>;
  removeOwnedStorage(
    storage: OwnedAccountStorage[],
  ): Promise<{ bucket: string | undefined; error: unknown }[]>;
};

export class DeleteAccountError extends Error {
  constructor(
    readonly stage: "authorize" | "delete_identity" | "inspect_storage",
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

    let ownedStorage: OwnedAccountStorage[];
    try {
      ownedStorage = await dependencies.findOwnedStorage(input.userId);
    } catch (error) {
      throw new DeleteAccountError("inspect_storage", error);
    }

    try {
      await dependencies.deleteIdentity(input.userId);
    } catch (error) {
      throw new DeleteAccountError("delete_identity", error);
    }

    const cleanupFailures = await dependencies.removeOwnedStorage(ownedStorage);
    return cleanupFailures.length > 0
      ? { cleanupFailures, status: "deleted_with_incomplete_cleanup" } as const
      : { status: "deleted" } as const;
  };
}
