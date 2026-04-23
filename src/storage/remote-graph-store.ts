/**
 * `GraphStore` implementation that reads from a published static bundle
 * over HTTP. Pairs with the existing MCP server (or any other GraphStore
 * consumer) to expose a read-only, flat-file-backed Spandrel deployment
 * from a Vercel Edge Function, Cloudflare Worker, Netlify Function, or
 * plain Node server.
 *
 * Data sources:
 *   `graph.json`           — skeleton (nodes without content, edges,
 *                            linkTypes, warnings). Fetched once, cached.
 *   `<path>/index.json`    — full `SpandrelNode` for a single path. Fetched
 *                            on demand the first time that node is read
 *                            at full fidelity, then cached.
 *
 * Trade-offs vs. `InMemoryGraphStore`:
 *   + Zero compilation cost at request time — the bundle is pre-compiled.
 *   + Scales to any graph size that fits on a CDN.
 *   + Works behind any static-file auth (Basic, Cloudflare Access, Vercel
 *     middleware) without store-layer changes.
 *   - Read-only. Writes throw. `spandrel publish` is the "write" path.
 *   - Search against `getAllNodes()` sees skeleton nodes only — body text
 *     is not in the returned payload. Callers that need full-text search
 *     across bodies should build a search index at publish time.
 */

import type { GraphStore, EdgeFilter } from "./graph-store.js";
import type {
  SpandrelNode,
  SpandrelEdge,
  ValidationWarning,
  LinkTypeInfo,
} from "../compiler/types.js";
import type { Graph } from "../web/types.js";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RemoteGraphStoreOptions {
  /** Bundle root URL, e.g. `https://host/kb/`. Trailing slash is optional. */
  bundleUrl: string;
  /**
   * Override the fetch implementation. Defaults to the global `fetch`,
   * which is available in all runtimes we care about (Node 18+, Edge,
   * Workers). Injectable for tests.
   */
  fetch?: FetchLike;
  /**
   * Optional request init applied to every outbound fetch — useful for
   * attaching auth headers when the bundle is behind a middleware gate.
   */
  requestInit?: RequestInit;
}

const READ_ONLY_MESSAGE =
  "RemoteGraphStore is read-only. Writes to a published bundle are not supported; regenerate and redeploy via `spandrel publish`.";

export class RemoteGraphStore implements GraphStore {
  private readonly base: string;
  private readonly fetcher: FetchLike;
  private readonly requestInit?: RequestInit;

  private graphPromise?: Promise<Graph>;
  /** Resolved graph.json, cached synchronously once loadGraph() has settled.
   *  Lets the sync `nodeCount` / `edgeCount` getters return real values after
   *  the store has been warmed by any read method. */
  private resolvedGraph: Graph | null = null;
  /** Full-node cache populated on first getNode/getNodes call per path. */
  private readonly nodeCache = new Map<string, Promise<SpandrelNode | undefined>>();

  constructor(opts: RemoteGraphStoreOptions) {
    this.base = opts.bundleUrl.endsWith("/") ? opts.bundleUrl : opts.bundleUrl + "/";
    this.fetcher = opts.fetch ?? (globalThis.fetch as FetchLike);
    this.requestInit = opts.requestInit;
    if (typeof this.fetcher !== "function") {
      throw new Error(
        "RemoteGraphStore requires a global `fetch` or a fetch impl via options.fetch",
      );
    }
  }

  // ── read methods ────────────────────────────────────────────────────

  private async loadGraph(): Promise<Graph> {
    if (!this.graphPromise) {
      this.graphPromise = (async (): Promise<Graph> => {
        const res = await this.fetcher(this.base + "graph.json", this.requestInit);
        if (!res.ok) {
          throw new Error(`Failed to fetch graph.json: ${res.status} ${res.statusText}`);
        }
        const graph = (await res.json()) as Graph;
        this.resolvedGraph = graph;
        return graph;
      })();
    }
    return this.graphPromise;
  }

  private nodeUrl(nodePath: string): string {
    const rel = nodePath === "/" || nodePath === ""
      ? "index.json"
      : nodePath.replace(/^\/+/, "") + "/index.json";
    return this.base + rel;
  }

  async getNode(path: string): Promise<SpandrelNode | undefined> {
    let cached = this.nodeCache.get(path);
    if (!cached) {
      cached = (async (): Promise<SpandrelNode | undefined> => {
        const res = await this.fetcher(this.nodeUrl(path), this.requestInit);
        if (res.status === 404) return undefined;
        if (!res.ok) {
          throw new Error(
            `Failed to fetch node ${path}: ${res.status} ${res.statusText}`,
          );
        }
        return (await res.json()) as SpandrelNode;
      })();
      this.nodeCache.set(path, cached);
    }
    return cached;
  }

  async hasNode(path: string): Promise<boolean> {
    const graph = await this.loadGraph();
    return graph.nodes.some((n) => n.path === path);
  }

  /**
   * Skeleton nodes from `graph.json` — no body content. This is the shape
   * that ships in the wire format; callers that need full content must
   * go through `getNode(path)` which fetches the per-node JSON file.
   */
  async getAllNodes(): Promise<SpandrelNode[]> {
    const graph = await this.loadGraph();
    return graph.nodes.map((n) => ({ ...n, content: "" }) as SpandrelNode);
  }

  async getNodes(paths: string[]): Promise<Map<string, SpandrelNode>> {
    const results = await Promise.all(paths.map((p) => this.getNode(p)));
    const out = new Map<string, SpandrelNode>();
    paths.forEach((p, i) => {
      const node = results[i];
      if (node) out.set(p, node);
    });
    return out;
  }

  async getEdges(filter?: EdgeFilter): Promise<SpandrelEdge[]> {
    const graph = await this.loadGraph();
    if (!filter) return graph.edges;
    return graph.edges.filter((e) => {
      if (filter.from !== undefined && e.from !== filter.from) return false;
      if (filter.to !== undefined && e.to !== filter.to) return false;
      if (filter.type !== undefined && e.type !== filter.type) return false;
      return true;
    });
  }

  async getEdgesBatch(paths: string[]): Promise<Map<string, SpandrelEdge[]>> {
    const graph = await this.loadGraph();
    const want = new Set(paths);
    const out = new Map<string, SpandrelEdge[]>();
    for (const p of paths) out.set(p, []);
    for (const e of graph.edges) {
      if (want.has(e.from)) out.get(e.from)!.push(e);
    }
    return out;
  }

  async getWarnings(): Promise<ValidationWarning[]> {
    const graph = await this.loadGraph();
    return graph.warnings;
  }

  async getLinkTypes(): Promise<Map<string, LinkTypeInfo>> {
    const graph = await this.loadGraph();
    const out = new Map<string, LinkTypeInfo>();
    for (const lt of graph.linkTypes) {
      const stem = lt.path.replace(/^\/linkTypes\//, "").split("/")[0];
      out.set(stem, lt);
    }
    return out;
  }

  // ── write methods — all reject ──────────────────────────────────────

  async setNode(_node: SpandrelNode): Promise<void> {
    throw new Error(READ_ONLY_MESSAGE);
  }
  async deleteNode(_path: string): Promise<void> {
    throw new Error(READ_ONLY_MESSAGE);
  }
  async replaceEdges(_edges: SpandrelEdge[]): Promise<void> {
    throw new Error(READ_ONLY_MESSAGE);
  }
  async replaceWarnings(_warnings: ValidationWarning[]): Promise<void> {
    throw new Error(READ_ONLY_MESSAGE);
  }
  async clear(): Promise<void> {
    throw new Error(READ_ONLY_MESSAGE);
  }

  // ── count properties ────────────────────────────────────────────────
  //
  // The `GraphStore` interface declares these as synchronous readonly
  // fields. We eagerly populate them from the cached graph.json on the
  // first call that kicked off loadGraph(); until then they read as 0.
  // Callers that want accurate counts should await a read method first.

  get nodeCount(): number {
    if (!this.graphPromise) return 0;
    // Optimistically resolve; most usages read after a getAllNodes/getEdges.
    // In strict sync contexts the caller should await loadGraph first.
    return (this.cachedGraph()?.nodes.length) ?? 0;
  }

  get edgeCount(): number {
    if (!this.graphPromise) return 0;
    return (this.cachedGraph()?.edges.length) ?? 0;
  }

  private cachedGraph(): Graph | null {
    return this.resolvedGraph;
  }
}
