/** Minimal observable state store.
 *
 * We deliberately do not pull in a framework. A typed signal + a derived
 * cache is enough for the viewer's needs.
 */

import type { Graph, SpandrelNode, SpandrelEdge, LinkTypeInfo } from "../types.js";
import { buildSearchIndex, type SearchIndex } from "./components/search.js";

export type Listener<T> = (value: T) => void;

export class Signal<T> {
  private value: T;
  private listeners = new Set<Listener<T>>();
  constructor(initial: T) {
    this.value = initial;
  }
  get(): T {
    return this.value;
  }
  set(next: T): void {
    // Reference check is enough; we never mutate in place.
    if (Object.is(this.value, next)) return;
    this.value = next;
    for (const fn of this.listeners) fn(next);
  }
  subscribe(fn: Listener<T>): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

/** The three ways to view a node.
 *
 * `rendered` is the default HTML surface; `markdown` and `json` expose the
 * raw shapes used by the CLI's `.md` / `.json` extension routes so the
 * SPA, dev server, and publish bundle all agree on the same three formats.
 */
export type ViewFormat = "rendered" | "markdown" | "json";

/** Parse a hash fragment into `{ path, format }`.
 *
 * Accepts:
 *   ""           → { path: "/",        format: "rendered" }
 *   "#/"         → { path: "/",        format: "rendered" }
 *   "#/.md"      → { path: "/",        format: "markdown" }
 *   "#/.json"    → { path: "/",        format: "json"     }
 *   "#/foo/bar"      → { path: "/foo/bar", format: "rendered" }
 *   "#/foo/bar.md"   → { path: "/foo/bar", format: "markdown" }
 *   "#/foo/bar.json" → { path: "/foo/bar", format: "json"     }
 */
export function parseHash(hash: string): { path: string; format: ViewFormat } {
  let h = hash || "";
  if (h.startsWith("#")) h = h.slice(1);
  if (!h) return { path: "/", format: "rendered" };

  // Normalize to start with "/".
  if (!h.startsWith("/")) h = "/" + h;

  // Format suffix. Recognize ".md" and ".json" at the very end, but only
  // if we're not looking at a path like "/foo.md/" (trailing slash) or
  // something else suspicious.
  let format: ViewFormat = "rendered";
  if (h.endsWith(".md")) {
    format = "markdown";
    h = h.slice(0, -3);
  } else if (h.endsWith(".json")) {
    format = "json";
    h = h.slice(0, -5);
  }

  // After stripping the extension, the root may have collapsed to "".
  if (!h || h === "/") return { path: "/", format };

  // Strip trailing slash (non-root).
  if (h.length > 1 && h.endsWith("/")) h = h.slice(0, -1);

  return { path: h, format };
}

/** Compatibility shim for the path-only callsites. */
export function hashToPath(hash: string): string {
  return parseHash(hash).path;
}

/** Build a hash string for `{ path, format }` suitable for `window.location.hash`. */
export function buildHash(path: string, format: ViewFormat = "rendered"): string {
  const suffix = format === "markdown" ? ".md" : format === "json" ? ".json" : "";
  if (path === "/" || path === "") return `#/${suffix}`;
  return `#${path}${suffix}`;
}

export function pathToHash(path: string): string {
  return buildHash(path, "rendered");
}

// ──────────────────────────────────────────────────────────────────────────
// Store
// ──────────────────────────────────────────────────────────────────────────

/**
 * Skeleton nodes in `graph.json` have no `content` field — bodies are
 * fetched lazily per path. This alias keeps the SPA honest about what it
 * actually has from the structural payload.
 */
export type WireNode = Omit<SpandrelNode, "content">;

export interface DerivedMaps {
  nodeByPath: Map<string, WireNode>;
  linkTypeByStem: Map<string, LinkTypeInfo>;
  outgoingLinks: Map<string, SpandrelEdge[]>;
  hierarchyChildren: Map<string, string[]>;
  /** Top-level collection path for each node (e.g. /clients/acme → /clients). */
  collectionOf: Map<string, string>;
  warningsByPath: Map<string, Graph["warnings"]>;
  searchIndex: SearchIndex;
}

export const graph$ = new Signal<Graph | null>(null);
export const currentPath$ = new Signal<string>("/");
export const viewFormat$ = new Signal<ViewFormat>("rendered");
export const error$ = new Signal<string | null>(null);
export const derived$ = new Signal<DerivedMaps | null>(null);

/**
 * Body content by node path, populated lazily when a node is visited.
 * Separate from `graph$` so the structural payload stays small and
 * navigation doesn't force a content fetch for nodes the user never
 * opens. `undefined` means "not yet loaded"; empty string means "loaded,
 * node has no body". See `lib/node-loader.ts`.
 */
export const contentCache$ = new Signal<Map<string, string>>(new Map());

/** Rebuild derived maps when the graph changes. */
graph$.subscribe((g) => {
  if (!g) {
    derived$.set(null);
    return;
  }
  derived$.set(buildDerived(g));
});

function buildDerived(g: Graph): DerivedMaps {
  const nodeByPath = new Map<string, WireNode>();
  for (const n of g.nodes) nodeByPath.set(n.path, n);

  const linkTypeByStem = new Map<string, LinkTypeInfo>();
  for (const lt of g.linkTypes) {
    const stem = stemOf(lt.path);
    linkTypeByStem.set(stem, lt);
  }

  const outgoingLinks = new Map<string, SpandrelEdge[]>();
  const hierarchyChildren = new Map<string, string[]>();
  for (const e of g.edges) {
    if (e.type === "link") {
      const list = outgoingLinks.get(e.from) ?? [];
      list.push(e);
      outgoingLinks.set(e.from, list);
    } else if (e.type === "hierarchy") {
      const list = hierarchyChildren.get(e.from) ?? [];
      list.push(e.to);
      hierarchyChildren.set(e.from, list);
    }
  }

  const collectionOf = new Map<string, string>();
  for (const n of g.nodes) {
    collectionOf.set(n.path, collectionOfPath(n.path));
  }

  const warningsByPath = new Map<string, Graph["warnings"]>();
  for (const w of g.warnings) {
    const list = warningsByPath.get(w.path) ?? [];
    list.push(w);
    warningsByPath.set(w.path, list);
  }

  const searchIndex = buildSearchIndex(g.nodes);

  return {
    nodeByPath,
    linkTypeByStem,
    outgoingLinks,
    hierarchyChildren,
    collectionOf,
    warningsByPath,
    searchIndex,
  };
}

function stemOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(idx + 1) : path;
}

/** "/clients/acme/team" → "/clients". Root stays as "/". */
export function collectionOfPath(path: string): string {
  if (path === "/" || path === "") return "/";
  const segs = path.split("/").filter(Boolean);
  if (segs.length === 0) return "/";
  return "/" + segs[0];
}
