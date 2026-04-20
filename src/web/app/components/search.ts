/** Client-side search index.
 *
 * Hand-rolled. Scores by substring-ness in name then description, with a
 * small bonus for name-prefix matches. Case-insensitive, diacritics-naive.
 */

import type { SpandrelNode } from "../../types.js";

export interface SearchEntry {
  path: string;
  name: string;
  description: string;
  nameLc: string;
  descLc: string;
}

export interface SearchIndex {
  entries: SearchEntry[];
  search(query: string, limit?: number): SearchHit[];
}

export interface SearchHit {
  entry: SearchEntry;
  score: number;
}

export function buildSearchIndex(nodes: SpandrelNode[]): SearchIndex {
  const entries: SearchEntry[] = nodes.map((n) => ({
    path: n.path,
    name: n.name ?? n.path,
    description: n.description ?? "",
    nameLc: (n.name ?? n.path).toLowerCase(),
    descLc: (n.description ?? "").toLowerCase(),
  }));

  return {
    entries,
    search(query: string, limit = 12) {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      const hits: SearchHit[] = [];
      for (const entry of entries) {
        const score = scoreEntry(entry, q);
        if (score > 0) hits.push({ entry, score });
      }
      hits.sort((a, b) => b.score - a.score || a.entry.nameLc.localeCompare(b.entry.nameLc));
      return hits.slice(0, limit);
    },
  };
}

function scoreEntry(entry: SearchEntry, q: string): number {
  let score = 0;
  if (entry.nameLc === q) score += 100;
  else if (entry.nameLc.startsWith(q)) score += 60;
  else if (entry.nameLc.includes(q)) score += 30;

  if (entry.descLc.includes(q)) score += 10;

  // Path hit (fuzzy-ish for things like "acme" matching "/clients/acme-corp").
  const pathLc = entry.path.toLowerCase();
  if (pathLc.includes(q)) score += 15;

  // Light subsequence bonus — rewards queries whose characters appear in
  // order within the name. Cheap heuristic; not a full fuzzy engine.
  if (score === 0 && hasSubsequence(entry.nameLc, q)) score += 5;

  return score;
}

function hasSubsequence(haystack: string, needle: string): boolean {
  let i = 0;
  for (const ch of haystack) {
    if (ch === needle[i]) {
      i += 1;
      if (i === needle.length) return true;
    }
  }
  return false;
}
