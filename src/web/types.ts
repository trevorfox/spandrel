/**
 * Shared types for the web viewer subsystem.
 *
 * The viewer is a consumer of the graph — it reads exactly one input,
 * `graph.json`, produced by the compiler and served identically by
 * `spandrel dev` (live) and `spandrel publish` (static).
 *
 * Contract rules (do not change without revving):
 *
 *   1. The SPA always fetches `graph.json` relative to `document.baseURI`.
 *      Never parses `location.pathname`.
 *   2. `index.html` ships with `<base href="/" />`. `spandrel publish`
 *      rewrites the href to `<base href="{--base}" />` when the flag is
 *      passed; otherwise the published bundle uses `"/"`.
 *   3. SSE endpoint lives at `/events`. The server pushes a single literal
 *      message body `reload` when the graph has been recompiled. The SPA
 *      re-fetches `graph.json` on receipt.
 *   4. `graph.json` is served at `/graph.json` in dev, and emitted at
 *      `{out}/graph.json` on publish.
 *   5. The SPA bundle is built to `dist/web/` so `package.json`'s
 *      `"files": ["dist"]` includes it automatically. Publish resolves
 *      the bundle path via `new URL('./web/', import.meta.url)`.
 */

export type {
  SpandrelNode,
  SpandrelEdge,
  ValidationWarning,
  LinkTypeInfo,
} from "../compiler/types.js";

import type {
  SpandrelNode,
  SpandrelEdge,
  ValidationWarning,
  LinkTypeInfo,
} from "../compiler/types.js";

/**
 * The JSON shape served at `/graph.json` and written by `spandrel publish`.
 *
 * Arrays throughout — Maps are for the in-memory store, not the wire format.
 * The SPA can rebuild its own indexes if it needs Map-style lookups.
 */
export interface Graph {
  nodes: SpandrelNode[];
  edges: SpandrelEdge[];
  linkTypes: LinkTypeInfo[];
  warnings: ValidationWarning[];
}
