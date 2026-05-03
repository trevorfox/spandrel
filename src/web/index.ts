/**
 * Public entry for the embeddable viewer.
 *
 * Hosts that want to render a Spandrel graph inside their own application
 * import from here:
 *
 * ```ts
 * import { mountViewer, createRestDataSource } from "spandrel/web";
 * import "spandrel/web/styles.css";
 *
 * mountViewer(document.getElementById("viewer-host"), {
 *   data: createRestDataSource({ baseUrl: "/api/acme/docs" }),
 * });
 * ```
 *
 * Phase A surface (0.5.0): pluggable data source, theme root locality,
 * tokens.css scoped to `[data-theme]` (not `:root[data-theme]`). Phase B
 * (per-mount state, sub-component embeds, write hooks UI) lands when a real
 * second consumer asks for it.
 */

export { mountViewer } from "./app/mount.js";
export type { ViewerOptions, ViewerHandle } from "./app/mount.js";
export {
  createStaticDataSource,
  createRestDataSource,
} from "./app/data-source.js";
export type { ViewerDataSource } from "./app/data-source.js";

// Re-export the underlying graph types so consumers don't have to chase them
// through the package internals.
export type {
  Graph,
  SpandrelNode,
  SpandrelEdge,
  ValidationWarning,
  LinkTypeInfo,
} from "./types.js";

// `renderNodeAsMarkdown` is also re-exported from the top-level barrel; for
// `spandrel/web` consumers it's available here too.
export { renderNodeAsMarkdown } from "./render-node.js";
