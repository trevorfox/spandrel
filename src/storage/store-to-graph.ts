import type { SpandrelGraph } from "../compiler/types.js";
import type { GraphStore } from "./graph-store.js";

/**
 * Build a SpandrelGraph snapshot from a GraphStore.
 *
 * Several mutation operations (moveThing, deleteThingWithReferrers) expect a
 * Map-keyed SpandrelGraph (the in-process graph type), but compile() returns a
 * GraphStore (the async storage interface). This helper bridges the two without
 * modifying the GraphStore interface — keeping it lean for future Postgres-backed
 * implementations that should not be burdened with snapshot semantics.
 *
 * The four reads are issued in parallel; callers pay one round-trip regardless
 * of graph size.
 */
export async function storeToGraph(store: GraphStore): Promise<SpandrelGraph> {
  const [nodes, edges, warnings, linkTypes] = await Promise.all([
    store.getAllNodes(),
    store.getEdges(),
    store.getWarnings(),
    store.getLinkTypes(),
  ]);
  return {
    nodes: new Map(nodes.map((n) => [n.path, n])),
    edges,
    warnings,
    linkTypes,
  };
}
