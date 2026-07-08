import { Wifi } from "lucide-react";
import { Pagination } from "../../components/ui/Pagination";
import {
  CloudGameCard,
  LocalGameCard,
} from "./MultiplayerGameCards";

type MultiplayerCatalog = ReturnType<
  typeof import("./useMultiplayerCatalog").useMultiplayerCatalog
>;

export function CloudCatalogContent({
  catalog,
}: {
  catalog: MultiplayerCatalog;
}) {
  const {
    changeCatalogPage,
    cloudGames,
    cloudPageStart,
    cloudTotal,
    cloudTotalPages,
    safeCloudPage,
    searchQuery,
  } = catalog;

  if (cloudGames.length === 0) {
    return (
      <div className="rounded-lg border border-synth-border bg-synth-bg px-4 py-16 text-center text-gray-500">
        {searchQuery
          ? `No cloud games match "${searchQuery}".`
          : "No cloud games are available."}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
        {cloudGames.map((game) => (
          <CloudGameCard game={game} key={game.id} />
        ))}
      </div>

      {cloudTotalPages > 1 && (
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-white">
            Showing {cloudPageStart + 1}-
            {Math.min(cloudPageStart + cloudGames.length, cloudTotal)} of{" "}
            {cloudTotal}
          </p>

          <Pagination
            berryArrows
            currentPage={safeCloudPage}
            onPageChange={(page) => changeCatalogPage(page, "cloud")}
            totalPages={cloudTotalPages}
          />
        </div>
      )}
    </>
  );
}

export function LocalCatalogContent({
  catalog,
}: {
  catalog: MultiplayerCatalog;
}) {
  const {
    changeCatalogPage,
    filteredLocalGames,
    isEnginePaired,
    localPageSlice,
  } = catalog;

  if (filteredLocalGames.length === 0) {
    return (
      <div className="rounded-lg border border-synth-border bg-synth-bg px-4 py-16 text-center text-gray-500">
        <Wifi className="mx-auto mb-3 h-8 w-8 opacity-40" />
        {isEnginePaired
          ? "No Local Vault games are available."
          : "Pair the engine to view Local Vault games."}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
        {localPageSlice.items.map((game) => (
          <LocalGameCard game={game} key={game.id} />
        ))}
      </div>

      {localPageSlice.totalPages > 1 && (
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-white">
            Showing {localPageSlice.pageStart + 1}-
            {Math.min(
              localPageSlice.pageStart + localPageSlice.items.length,
              filteredLocalGames.length,
            )}{" "}
            of {filteredLocalGames.length}
          </p>
          <Pagination
            berryArrows
            currentPage={localPageSlice.safeCurrentPage}
            onPageChange={(page) => changeCatalogPage(page, "local")}
            totalPages={localPageSlice.totalPages}
          />
        </div>
      )}
    </>
  );
}
