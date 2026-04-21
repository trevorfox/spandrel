import { describe, it, expect } from "vitest";
import { emitGraph } from "../src/compiler/emit-graph.js";
import { InMemoryGraphStore } from "../src/storage/in-memory-graph-store.js";
import type { SpandrelNode, SpandrelEdge, ValidationWarning } from "../src/compiler/types.js";

function node(partial: Partial<SpandrelNode> & { path: string; name: string }): SpandrelNode {
  return {
    description: "",
    nodeType: "leaf",
    depth: partial.path.split("/").filter(Boolean).length,
    parent: null,
    children: [],
    content: "",
    frontmatter: {},
    created: null,
    updated: null,
    author: null,
    ...partial,
  };
}

describe("emitGraph", () => {
  it("returns the full wire shape with arrays for nodes, edges, linkTypes, warnings", async () => {
    const store = new InMemoryGraphStore();
    await store.setNode(node({ path: "/", name: "Root", description: "root", nodeType: "composite", depth: 0 }));
    await store.setNode(node({ path: "/a", name: "A", description: "node a", parent: "/" }));
    await store.setNode(node({ path: "/b", name: "B", description: "node b", parent: "/" }));
    await store.setNode(
      node({
        path: "/linkTypes/owns",
        name: "Owns",
        description: "Source owns target.",
        parent: "/linkTypes",
      })
    );

    const edges: SpandrelEdge[] = [
      { from: "/", to: "/a", type: "hierarchy" },
      { from: "/", to: "/b", type: "hierarchy" },
      { from: "/a", to: "/b", type: "link", linkType: "owns" },
    ];
    await store.replaceEdges(edges);

    const warnings: ValidationWarning[] = [
      { path: "/a", type: "missing_description", message: "missing" },
    ];
    await store.replaceWarnings(warnings);

    const graph = await emitGraph(store);

    expect(Array.isArray(graph.nodes)).toBe(true);
    expect(Array.isArray(graph.edges)).toBe(true);
    expect(Array.isArray(graph.linkTypes)).toBe(true);
    expect(Array.isArray(graph.warnings)).toBe(true);

    expect(graph.nodes).toHaveLength(4);
    expect(graph.nodes.map((n) => n.path).sort()).toEqual(["/", "/a", "/b", "/linkTypes/owns"]);
    expect(graph.edges).toEqual(edges);
    expect(graph.warnings).toEqual(warnings);

    expect(graph.linkTypes).toHaveLength(1);
    expect(graph.linkTypes[0]).toEqual({
      name: "Owns",
      description: "Source owns target.",
      path: "/linkTypes/owns",
    });
  });

  it("returns empty arrays (not undefined) for an empty store", async () => {
    const store = new InMemoryGraphStore();
    const graph = await emitGraph(store);

    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
    expect(graph.linkTypes).toEqual([]);
    expect(graph.warnings).toEqual([]);
  });

  it("strips the content field from every node — graph.json is a skeleton, bodies travel separately", async () => {
    const store = new InMemoryGraphStore();
    await store.setNode(
      node({
        path: "/",
        name: "Root",
        description: "the root",
        content: "# Hello\n\nBody that must NOT appear in graph.json.",
      }),
    );
    await store.setNode(
      node({
        path: "/a",
        name: "A",
        content: "Another body that must not leak.",
      }),
    );

    const graph = await emitGraph(store);

    for (const n of graph.nodes) {
      expect(n).not.toHaveProperty("content");
    }
    // Structural fields stay.
    expect(graph.nodes.find((n) => n.path === "/")?.name).toBe("Root");
    expect(graph.nodes.find((n) => n.path === "/a")?.description).toBe("");
  });

  it("flattens the linkTypes Map into an array preserving each entry's shape", async () => {
    const store = new InMemoryGraphStore();
    await store.setNode(
      node({ path: "/linkTypes/owns", name: "Owns", description: "owns desc", parent: "/linkTypes" })
    );
    await store.setNode(
      node({
        path: "/linkTypes/depends-on",
        name: "Depends On",
        description: "depends-on desc",
        parent: "/linkTypes",
      })
    );

    const graph = await emitGraph(store);

    expect(graph.linkTypes).toHaveLength(2);
    const byPath = Object.fromEntries(graph.linkTypes.map((l) => [l.path, l]));
    expect(byPath["/linkTypes/owns"].name).toBe("Owns");
    expect(byPath["/linkTypes/depends-on"].description).toBe("depends-on desc");
  });
});
