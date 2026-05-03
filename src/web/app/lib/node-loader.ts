/**
 * Lazy content fetcher. Delegates to the active data source.
 *
 * `graph.json` (or its REST equivalent) carries only the structural
 * skeleton — node bodies are fetched lazily per path. When the route
 * changes, fetch the current node's markdown body and cache it. The
 * content component reads from the cache and renders a loading state
 * while the fetch is in flight.
 */

import { contentCache$, currentPath$ } from "../state.js";
import { getDataSource } from "../graph-data.js";

const inflight = new Set<string>();

export async function ensureContent(nodePath: string): Promise<void> {
  if (contentCache$.get().has(nodePath)) return;
  if (inflight.has(nodePath)) return;
  inflight.add(nodePath);
  try {
    const body = await getDataSource().fetchNodeContent(nodePath);
    const next = new Map(contentCache$.get());
    next.set(nodePath, body);
    contentCache$.set(next);
  } catch {
    // Network error — leave cache empty so a retry is possible on the next
    // route change. The content component already handles missing.
  } finally {
    inflight.delete(nodePath);
  }
}

/**
 * Wire the loader: auto-fetch whenever the route changes. Called from the
 * mount entry during init. Keeps the loader's side effects out of module-load
 * order, which matters when the SPA is embedded in other contexts.
 */
export function startNodeLoader(): void {
  const initial = currentPath$.get();
  if (initial) void ensureContent(initial);
  currentPath$.subscribe((p) => {
    void ensureContent(p);
  });
}
