/**
 * Lazy content fetcher. Delegates to the active data source.
 *
 * `graph.json` (or its REST equivalent) carries only the structural
 * skeleton — node bodies are fetched lazily per path. When the route
 * changes, fetch the current node's markdown body and cache it. The
 * content component reads from the cache and renders a loading state
 * while the fetch is in flight.
 *
 * Inflight tracking is module-level — it dedupes concurrent fetches for
 * the same path across all viewer mounts (multi-mount viewers visiting
 * the same node only fetch once). Each mount's `contentCache$` still
 * holds a fresh copy because the data source is global; the per-mount
 * caches stay independent.
 */

import type { ViewerState } from "../state.js";
import { getDataSource } from "../graph-data.js";

const inflight = new Set<string>();

export async function ensureContent(
  state: ViewerState,
  nodePath: string,
): Promise<void> {
  const { contentCache$ } = state;
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
export function startNodeLoader(state: ViewerState): void {
  const { currentPath$ } = state;
  const initial = currentPath$.get();
  if (initial) void ensureContent(state, initial);
  currentPath$.subscribe((p) => {
    void ensureContent(state, p);
  });
}
