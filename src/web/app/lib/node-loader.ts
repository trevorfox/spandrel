/**
 * Lazy content fetcher.
 *
 * `graph.json` carries only the structural skeleton — node bodies live in
 * per-path files. When the route changes, fetch the current node's markdown
 * body and cache it. The content component reads from the cache and renders
 * a loading state while the fetch is in flight.
 *
 * We fetch `<path>/index.md` rather than `<path>/index.json` so the
 * response is the node's source-of-truth file: the same bytes an author
 * would see in their editor, the same bytes an agent would `curl`. The
 * content component strips YAML frontmatter and renders the markdown body.
 */

import { contentCache$, currentPath$ } from "../state.js";

const inflight = new Set<string>();

function mdUrlFor(nodePath: string): string {
  // Directory-style index file — guaranteed to exist for every node, and
  // served with `text/markdown` MIME by every host we care about.
  const rel = nodePath === "/" || nodePath === ""
    ? "index.md"
    : nodePath.replace(/^\/+/, "") + "/index.md";
  try {
    return new URL(rel, document.baseURI).toString();
  } catch {
    return rel;
  }
}

export async function ensureContent(nodePath: string): Promise<void> {
  if (contentCache$.get().has(nodePath)) return;
  if (inflight.has(nodePath)) return;
  inflight.add(nodePath);
  try {
    const res = await fetch(mdUrlFor(nodePath), { cache: "no-cache" });
    if (!res.ok) {
      // Cache an empty body so we don't re-fetch a 404 every render.
      const next = new Map(contentCache$.get());
      next.set(nodePath, "");
      contentCache$.set(next);
      return;
    }
    const raw = await res.text();
    const body = stripFrontmatter(raw);
    const next = new Map(contentCache$.get());
    next.set(nodePath, body);
    contentCache$.set(next);
  } catch {
    // Network error — leave cache empty so a retry is possible on the
    // next route change. The content component already handles missing.
  } finally {
    inflight.delete(nodePath);
  }
}

/** Strip a leading YAML frontmatter block if present. */
function stripFrontmatter(raw: string): string {
  const m = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? raw.slice(m[0].length) : raw;
}

/**
 * Wire the loader: auto-fetch whenever the route changes. Called from
 * main.ts during init. Keeps the loader's side effects out of module-load
 * order, which matters when the SPA is embedded in other contexts.
 */
export function startNodeLoader(): void {
  const initial = currentPath$.get();
  if (initial) void ensureContent(initial);
  currentPath$.subscribe((p) => {
    void ensureContent(p);
  });
}
