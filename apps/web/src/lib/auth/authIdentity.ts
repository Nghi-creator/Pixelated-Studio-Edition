import type { User } from "@supabase/supabase-js";

export function isAnonymousUser(user: User | null | undefined) {
  return user?.is_anonymous === true;
}

export function isPermanentUser(user: User | null | undefined) {
  return Boolean(user && !isAnonymousUser(user));
}
