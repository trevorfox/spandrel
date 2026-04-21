import type { GraphStore } from "../storage/graph-store.js";
import type { Graph } from "../web/types.js";

/**
 * Serialize a compiled GraphStore into the wire-format `Graph` consumed by
 * the web viewer. This is the only place that flattens the in-memory
 * `linkTypes` Map into an array — everywhere else treats the graph as a
 * graph, not a document.
 *
 * Nothing about the viewer leaks into the compiler or the store. The store
 * is read, a plain object is returned, and the caller decides what to do
 * with it (serve it live, write it to disk, pipe it somewhere else).
 */
export async function emitGraph(store: GraphStore): Promise<Graph> {
  const [nodes, edges, linkTypesMap, warnings] = await Promise.all([
    store.getAllNodes(),
    store.getEdges(),
    store.getLinkTypes(),
    store.getWarnings(),
  ]);

  // Strip content at the wire boundary. graph.json is the structural index;
  // bodies live in the per-node files (`<path>/index.json`, `<path>.md`)
  // and are fetched on demand by the SPA or any other consumer that needs
  // them. Keeps the initial payload small and scales as the graph grows.
  const wireNodes = nodes.map(({ content: _content, ...rest }) => rest);

  return {
    nodes: wireNodes,
    edges,
    linkTypes: Array.from(linkTypesMap.values()),
    warnings,
  };
}
