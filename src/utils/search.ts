// Flexible token-based search matching
// Each search token must match the START of at least one word in the text.
// "m green" matches "Matthew Green" — "m" starts "matthew", "green" starts "green"

export function matchesSearch(text: string, query: string): boolean {
  if (!query.trim()) return true;

  const textWords = text.toLowerCase().split(/\s+/);
  const queryTokens = query.toLowerCase().trim().split(/\s+/);

  return queryTokens.every((token) => textWords.some((word) => word.startsWith(token)));
}
