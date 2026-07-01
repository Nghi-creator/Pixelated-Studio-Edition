import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/api/queryClient";
import {
  fetchLocalVaultFilenames,
  getLocalVaultUserId,
  toLocalVaultGames,
} from "../local-vault/localVaultClient";

export function useLocalMultiplayerGamesQuery({
  enabled,
}: {
  enabled: boolean;
}) {
  return useQuery({
    enabled,
    queryKey: queryKeys.localMultiplayerGames(),
    queryFn: async () => {
      const userId = await getLocalVaultUserId();
      return toLocalVaultGames(await fetchLocalVaultFilenames(userId));
    },
  });
}
