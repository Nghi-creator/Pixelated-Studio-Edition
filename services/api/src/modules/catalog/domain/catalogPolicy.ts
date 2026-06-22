type FeaturedGame = { play_count?: number | null };

export function isAdminRole(role: string | null | undefined) {
  return role === "admin" || role === "super_admin";
}

export function getCatalogCacheKey(
  page: number,
  pageSize: number,
  search?: string,
) {
  return JSON.stringify({
    page,
    pageSize,
    search: search?.toLowerCase() || "",
  });
}

export function getPageRange(page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return { end: start + pageSize - 1, start };
}

export function selectFeaturedGames<T extends FeaturedGame>(rows: T[]) {
  const hasAnyPlays = rows.some(
    (game) => typeof game.play_count === "number" && game.play_count > 0,
  );
  return (hasAnyPlays ? rows : shuffleRows(rows)).slice(0, 5);
}

function shuffleRows<T>(rows: T[]) {
  const shuffled = [...rows];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const currentRow = shuffled[index];
    const swapRow = shuffled[swapIndex];
    if (currentRow === undefined || swapRow === undefined) continue;
    shuffled[index] = swapRow;
    shuffled[swapIndex] = currentRow;
  }
  return shuffled;
}
