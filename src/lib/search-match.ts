import { normalizeSearch } from "@/lib/normalize-search";

const collapseSpaces = (value: string) =>
  (normalizeSearch(value) ?? "").replace(/[\s\u00a0]+/g, " ").trim();

export function matchesSearch(
  haystack: string,
  query: string | null | undefined,
): boolean {
  const needle = collapseSpaces(query ?? "");

  if (!needle) {
    return true;
  }

  return collapseSpaces(haystack).includes(needle);
}
