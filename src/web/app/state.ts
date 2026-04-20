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

/** Normalize a hash fragment to a graph path.
 *  "" or "#" or "#/" → "/"
 *  "#/foo/bar"       → "/foo/bar"
 *  strips trailing "/" except for the root.
 */
export function hashToPath(hash: string): string {
  let h = hash || "";
  if (h.startsWith("#")) h = h.slice(1);
  if (!h || h === "/") return "/";
  if (h.length > 1 && h.endsWith("/")) h = h.slice(0, -1);
  if (!h.startsWith("/")) h = "/" + h;
  return h;
}

export function pathToHash(path: string): string {
  return `#${path}`;
}

// ──────────────────────────────────────────────────────────────────────────
// Store
// ──────────────────────────────────────────────────────────────────────────

export interface DerivedMaps {
  nodeByPath: Map<string, SpandrelNode>;
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
export const error$ = new Signal<string | null>(null);
export const derived$ = new Signal<DerivedMaps | null>(null);

/** Rebuild derived maps when the graph changes. */
graph$.subscribe((g) => {
  if (!g) {
    derived$.set(null);
    return;
  }
  derived$.set(buildDerived(g));
});

function buildDerived(g: Graph): DerivedMaps {
  const nodeByPath = new Map<string, SpandrelNode>();
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
