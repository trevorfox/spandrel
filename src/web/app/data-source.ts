/**
 * Pluggable data source for the embeddable viewer.
 *
 * The viewer reads exactly two things: the structural graph (`graph.json`) and
 * per-node markdown bodies. Where those come from is the host's choice:
 *
 *   - Static publish bundle  → `createStaticDataSource()` reads relative to
 *                              `document.baseURI` (the existing behavior).
 *   - Live Spandrel REST     → `createRestDataSource({ baseUrl })` hits the
 *                              REST surface at `<baseUrl>/graph` and
 *                              `<baseUrl>/content/{path}`.
 *   - Anything else          → implement the interface against your backend.
 *
 * Read-only consumers don't implement `writeNode` / `deleteNode`. The
 * inline-editing UI (future) is gated on those methods being present.
 */

import type { Graph, SpandrelNode } from "../types.js";

export interface ViewerDataSource {
  /** Fetch the structural graph. Called once on mount and again on subscribe events. */
  fetchGraph(): Promise<Graph>;

  /**
   * Fetch a node's markdown body. Returns the empty string when the node has
   * no body (or the body isn't accessible). Throws on transport failure so
   * callers can decide whether to surface the error.
   */
  fetchNodeContent(nodePath: string): Promise<string>;

  /**
   * Optional. Subscribe to graph-update events from the host. When the
   * callback fires, the viewer refetches the graph. Returns an unsubscribe
   * function. Used by the dev server's SSE channel; static bundles don't
   * implement this.
   */
  subscribe?(onChange: () => void): () => void;

  /**
   * Optional. Present only on writable data sources (dev server, hosted
   * authoring backends). Returns an edit token the source uses to filter its
   * own subsequent change notifications, so the editor doesn't clobber
   * in-flight edits.
   */
  writeNode?(
    nodePath: string,
    body: { content: string; frontmatter: Record<string, unknown> },
  ): Promise<{ editToken: string }>;

  /**
   * Optional. Companion to `writeNode` for the delete case.
   */
  deleteNode?(nodePath: string): Promise<void>;
}

// ── Static bundle ────────────────────────────────────────────────────────

/**
 * Returns a data source that reads `graph.json` and `<path>/index.md` from
 * paths relative to a base URL. The default base resolves at call-time from
 * `document.baseURI`, matching the publish-bundle behavior.
 */
export function createStaticDataSource(options: { baseUrl?: string } = {}): ViewerDataSource {
  const resolve = (rel: string): string => {
    const base = options.baseUrl ?? document.baseURI;
    try {
      return new URL(rel, base).toString();
    } catch {
      return rel;
    }
  };

  return {
    async fetchGraph(): Promise<Graph> {
      // Cache-bust so SSE-triggered reloads always see fresh data.
      const url = resolve(`graph.json?t=${Date.now()}`);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Failed to load graph.json: ${res.status} ${res.statusText}`);
      }
      const json = (await res.json()) as Partial<Graph>;
      return normalizeGraph(json);
    },

    async fetchNodeContent(nodePath: string): Promise<string> {
      const rel =
        nodePath === "/" || nodePath === ""
          ? "index.md"
          : nodePath.replace(/^\/+/, "") + "/index.md";
      const res = await fetch(resolve(rel), { cache: "no-cache" });
      if (!res.ok) return "";
      const raw = await res.text();
      return stripFrontmatter(raw);
    },
  };
}

// ── Spandrel REST ────────────────────────────────────────────────────────

/**
 * Returns a data source that consumes a Spandrel REST surface — any host
 * that satisfies the framework's REST contract (a self-hosted dev server,
 * a multi-tenant SaaS routing tenants under a path prefix, a private
 * deployment behind your own auth). Reads via `/graph` and
 * `/content/{path}`; subscribe uses `/events` SSE if the host serves it.
 *
 * `baseUrl` is the REST root, e.g. `https://example.com/api/my-graph`.
 * `headers` lets the host attach auth tokens or identity headers per request.
 */
export function createRestDataSource(options: {
  baseUrl: string;
  headers?: Record<string, string> | (() => Record<string, string>);
  /** Path of the SSE channel relative to baseUrl. Default `/events`; set to null to opt out. */
  ssePath?: string | null;
}): ViewerDataSource {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");

  const headers = (): Record<string, string> => {
    if (typeof options.headers === "function") return options.headers();
    return options.headers ?? {};
  };

  return {
    async fetchGraph(): Promise<Graph> {
      const res = await fetch(`${baseUrl}/graph`, {
        headers: headers(),
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`Failed to load /graph: ${res.status} ${res.statusText}`);
      }
      const json = (await res.json()) as Partial<Graph>;
      return normalizeGraph(json);
    },

    async fetchNodeContent(nodePath: string): Promise<string> {
      const url =
        nodePath === "/" || nodePath === ""
          ? `${baseUrl}/content`
          : `${baseUrl}/content${nodePath}`;
      const res = await fetch(url, { headers: headers(), cache: "no-cache" });
      if (!res.ok) return "";
      return await res.text();
    },

    subscribe:
      options.ssePath === null
        ? undefined
        : (onChange) => {
            const ssePath = options.ssePath ?? "/events";
            const source = new EventSource(`${baseUrl}${ssePath}`, {
              withCredentials: false,
            });
            const handler = () => onChange();
            source.addEventListener("message", handler);
            return () => {
              source.removeEventListener("message", handler);
              source.close();
            };
          },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function normalizeGraph(g: Partial<Graph>): Graph {
  return {
    nodes: g.nodes ?? [],
    edges: g.edges ?? [],
    linkTypes: g.linkTypes ?? [],
    warnings: g.warnings ?? [],
  };
}

function stripFrontmatter(raw: string): string {
  const m = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? raw.slice(m[0].length) : raw;
}

// ── Type re-export for embedders that don't want SpandrelNode imported transitively ──

export type { SpandrelNode };
