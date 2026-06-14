type SearchableGame = {
  title?: string | null;
};

type RankedGame<TGame> = {
  game: TGame;
  score: number;
};

function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compactSearchText(value: string) {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

function getInitials(value: string) {
  return normalizeSearchText(value)
    .split(" ")
    .filter(Boolean)
    .map((token) => token[0])
    .join("");
}

function isSubsequence(needle: string, haystack: string) {
  if (!needle) return true;
  let needleIndex = 0;
  for (const character of haystack) {
    if (character === needle[needleIndex]) needleIndex += 1;
    if (needleIndex === needle.length) return true;
  }
  return false;
}

function getFuzzyDistanceLimit(token: string) {
  if (token.length < 3) return 0;
  if (token.length <= 4) return 1;
  if (token.length <= 8) return 2;
  return 3;
}

function boundedLevenshtein(left: string, right: string, maxDistance: number) {
  if (Math.abs(left.length - right.length) > maxDistance) {
    return maxDistance + 1;
  }

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMinimum = current[0] || 0;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const nextValue = Math.min(
        (previous[rightIndex] || 0) + 1,
        (current[rightIndex - 1] || 0) + 1,
        (previous[rightIndex - 1] || 0) + cost,
      );
      current[rightIndex] = nextValue;
      rowMinimum = Math.min(rowMinimum, nextValue);
    }

    if (rowMinimum > maxDistance) return maxDistance + 1;
    previous = current;
  }

  return previous[right.length] || 0;
}

function getBestFuzzyTokenDistance(queryToken: string, titleTokens: string[]) {
  const limit = getFuzzyDistanceLimit(queryToken);
  if (!limit) return Number.POSITIVE_INFINITY;

  return Math.min(
    ...titleTokens.map((titleToken) => {
      if (queryToken[0] !== titleToken[0]) return limit + 1;
      return boundedLevenshtein(queryToken, titleToken, limit);
    }),
  );
}

export function getGameSearchScore(game: SearchableGame, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 0;

  const normalizedTitle = normalizeSearchText(game.title || "");
  if (!normalizedTitle) return null;

  const compactQuery = compactSearchText(query);
  const compactTitle = compactSearchText(game.title || "");
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const titleTokens = normalizedTitle.split(" ").filter(Boolean);

  if (normalizedTitle === normalizedQuery) return 0;
  if (normalizedTitle.startsWith(normalizedQuery)) return 10;
  if (normalizedTitle.includes(normalizedQuery)) {
    return 20 + normalizedTitle.indexOf(normalizedQuery) / 100;
  }
  if (compactTitle.includes(compactQuery)) return 25;
  if (
    queryTokens.every((queryToken) =>
      titleTokens.some((titleToken) => titleToken.startsWith(queryToken)),
    )
  ) {
    return 30;
  }
  if (
    queryTokens.every((queryToken) =>
      titleTokens.some((titleToken) => titleToken.includes(queryToken)),
    )
  ) {
    return 40;
  }
  if (compactQuery.length >= 2 && getInitials(game.title || "").startsWith(compactQuery)) {
    return 50;
  }
  if (
    compactQuery.length >= 4 &&
    compactQuery.length / Math.max(compactTitle.length, 1) >= 0.45 &&
    isSubsequence(compactQuery, compactTitle)
  ) {
    return 65;
  }

  let fuzzyDistance = 0;
  for (const queryToken of queryTokens) {
    const bestDistance = getBestFuzzyTokenDistance(queryToken, titleTokens);
    if (bestDistance > getFuzzyDistanceLimit(queryToken)) return null;
    fuzzyDistance += bestDistance;
  }

  return 80 + fuzzyDistance * 5;
}

export function searchAndRankGames<TGame extends SearchableGame>(
  games: TGame[],
  query: string | undefined,
) {
  if (!query?.trim()) return games;

  return games
    .map((game): RankedGame<TGame> | null => {
      const score = getGameSearchScore(game, query);
      return score === null ? null : { game, score };
    })
    .filter((entry): entry is RankedGame<TGame> => Boolean(entry))
    .sort((left, right) => {
      if (left.score !== right.score) return left.score - right.score;
      return String(left.game.title || "").localeCompare(
        String(right.game.title || ""),
      );
    })
    .map((entry) => entry.game);
}
