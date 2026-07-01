import { useAuthSessionQuery } from "../../../lib/api/apiQueries";

export function useAuthUser() {
  return useAuthSessionQuery().data?.user ?? null;
}
