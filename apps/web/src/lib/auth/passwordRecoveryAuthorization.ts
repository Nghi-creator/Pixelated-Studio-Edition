import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

const PASSWORD_RECOVERY_AUTHORIZATION_MS = 10 * 60 * 1000;

type RecoveryAuthorization = {
  accessToken: string;
  observedAt: number;
};

export function isPotentialPasswordRecoveryCallback({
  hash,
  search,
}: {
  hash: string;
  search: string;
}) {
  const hashParameters = new URLSearchParams(hash.replace(/^#/, ""));
  const searchParameters = new URLSearchParams(search);
  return (
    hashParameters.get("type") === "recovery" ||
    searchParameters.get("type") === "recovery" ||
    searchParameters.has("code")
  );
}

export function createPasswordRecoveryAuthorization() {
  let authorization: RecoveryAuthorization | null = null;

  return {
    clear() {
      authorization = null;
    },
    observe(event: AuthChangeEvent, session: Session | null, now = Date.now()) {
      if (event === "SIGNED_OUT") {
        authorization = null;
        return false;
      }
      if (event !== "PASSWORD_RECOVERY" || !session?.access_token) return false;

      authorization = {
        accessToken: session.access_token,
        observedAt: now,
      };
      return true;
    },
    permits(session: Session | null, now = Date.now()) {
      if (
        !authorization ||
        !session?.access_token ||
        now - authorization.observedAt > PASSWORD_RECOVERY_AUTHORIZATION_MS
      ) {
        authorization = null;
        return false;
      }
      return authorization.accessToken === session.access_token;
    },
  };
}
