import { useAuthSessionQuery } from "../../../../hooks/queryHooks";

export function useAuthUser() {
  return useAuthSessionQuery().data?.user ?? null;
}
