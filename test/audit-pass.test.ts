import { describe, expect, it } from "vitest";
import type { SpandrelEdge, SpandrelNode } from "../src/compiler/types.js";
import { InMemoryGraphStore } from "../src/storage/in-memory-graph-store.js";
import { runAuditPass } from "../src/compiler/audit-pass.js";

// --- Tiny in-memory fixture helpers -----------------------------------------
//
// The audit pass is a pure transformation over a `GraphStore` — we don't need
// the compiler, the filesystem, or git. These helpers construct just enough of
// a graph to exercise each detector in isolation.

function makeNode(overrides: Partial<SpandrelNode>): SpandrelNode {
  return {
    path: "/",
    name: "Root",
    description: "Root description that is plenty long for the thinness check",
    nodeType: "leaf",
    depth: 0,
    parent: null,
    children: [],
    content: "Body content with enough words to satisfy the thin-body threshold for a leaf node which is twenty words minimum so this is twenty words.",
    frontmatter: {},
    created: null,
    updated: null,
    author: null,
    ...overrides,
  };
}

async function storeWithNodes(
  nodes: SpandrelNode[],
  edges: SpandrelEdge[] = [],
): Promise<InMemoryGraphStore> {
  const store = new InMemoryGraphStore();
  for (const node of nodes) await store.setNode(node);
  await store.replaceEdges(edges);
  await store.replaceWarnings([]);
  return store;
}

describe("runAuditPass", () => {
  it("emits a weak_description warning with toc_overlap in the message for TOC-style descriptions", async () => {
    const parent = makeNode({
      path: "/content-model",
      name: "Content Model",
      description:
        "How Spandrel knowledge graphs are shaped — nodes, links, paths, and companion files",
      children: ["/content-model/nodes", "/content-model/links", "/content-model/paths", "/content-model/companion-files"],
    });
    const children = [
      makeNode({ path: "/content-model/nodes", name: "Nodes", parent: "/content-model", description: "Things in the graph — every markdown file becomes a node" }),
      makeNode({ path: "/content-model/links", name: "Links", parent: "/content-model", description: "Typed edges between things — declared in frontmatter" }),
      makeNode({ path: "/content-model/paths", name: "Paths", parent: "/content-model", description: "Addresses for nodes — the file path is the graph address" }),
      makeNode({ path: "/content-model/companion-files", name: "Companion files", parent: "/content-model", description: "Files that ride along with a node but aren't compiled" }),
    ];
    const store = await storeWithNodes([parent, ...children]);

    await runAuditPass(store);

    const warnings = await store.getWarnings();
    const tocWarning = warnings.find(
      (w) => w.path === "/content-model" && w.type === "weak_description",
    );
    expect(tocWarning).toBeDefined();
    // Node-level Finding kinds carry the kind in brackets; multi-subkind
    // Finding families (weak_edge_description, staleness) carry kind.subkind.
    // toc_overlap is node-level → `[toc_overlap]`.
    expect(tocWarning?.message).toContain("[toc_overlap]");
  });

  it("emits a weak_edge_description warning with .missing subkind for typed edges with no description", async () => {
    const node = makeNode({
      path: "/clients/acme",
      name: "Acme",
      description: "A client we work with — long enough to avoid the thinness detector firing here",
      parent: "/clients",
    });
    const edges: SpandrelEdge[] = [
      // led-by has no description and isn't a self-evident type → fires "missing"
      { from: "/clients/acme", to: "/people/alice", type: "link", linkType: "led-by" },
    ];
    const store = await storeWithNodes([node], edges);

    await runAuditPass(store);

    const warnings = await store.getWarnings();
    const edgeWarning = warnings.find(
      (w) => w.type === "weak_edge_description" && w.path === "/clients/acme",
    );
    expect(edgeWarning).toBeDefined();
    expect(edgeWarning?.message).toContain("[weak_edge_description.missing]");
  });

  it("emits a stub_marker warning when the body contains TBD", async () => {
    const node = makeNode({
      path: "/notes/draft",
      name: "Draft note",
      description: "A draft note with content still being figured out as we work through it",
      content: "TBD — fill this in once we finish the analysis.",
    });
    const store = await storeWithNodes([node]);

    await runAuditPass(store);

    const warnings = await store.getWarnings();
    const stub = warnings.find((w) => w.type === "stub_marker");
    expect(stub).toBeDefined();
    expect(stub?.message).toContain("[stub_marker]");
    expect(stub?.message.toLowerCase()).toContain("tbd");
  });

  it("emits a staleness.absolute warning when `updated` is older than the threshold relative to `now`", async () => {
    const node = makeNode({
      path: "/old-doc",
      name: "Old Doc",
      description: "A document that has not been touched in a long time and is showing its age now",
      updated: "2024-01-01T00:00:00Z",
    });
    const store = await storeWithNodes([node]);

    // Inject a fixed `now` 400 days after `updated` so the default 180-day
    // threshold fires deterministically.
    const fixedNow = "2025-02-04T00:00:00Z"; // 400 days after 2024-01-01
    await runAuditPass(store, fixedNow);

    const warnings = await store.getWarnings();
    const staleness = warnings.find(
      (w) => w.type === "staleness" && w.message.includes("absolute"),
    );
    expect(staleness).toBeDefined();
    expect(staleness?.message).toContain("[staleness.absolute]");
  });

  it("produces zero audit warnings for a clean node", async () => {
    const node = makeNode({
      path: "/clean",
      name: "Clean Node",
      description:
        "A description with enough substance and no vague qualifiers or topic-style framing that would trip detectors",
      content:
        "Body content with enough words to satisfy the thin-body threshold for a leaf node which is twenty words minimum so this is fine.",
      // Recent timestamp so freshness never fires.
      updated: "2026-05-01T00:00:00Z",
    });
    const store = await storeWithNodes([node]);

    await runAuditPass(store, "2026-05-10T00:00:00Z");

    const warnings = await store.getWarnings();
    // Filter to audit warning types — there should be none.
    const auditTypes = new Set([
      "weak_description",
      "weak_edge_description",
      "stub_marker",
      "thin_body",
      "overlong_body",
      "staleness",
    ]);
    const auditWarnings = warnings.filter((w) => auditTypes.has(w.type));
    expect(auditWarnings).toEqual([]);
  });

  it("mutates the store's warnings array without throwing, preserving pre-existing warnings", async () => {
    const node = makeNode({
      path: "/x",
      name: "X",
      description: "Various different things related to relevant stuff", // vague qualifiers
    });
    const store = await storeWithNodes([node]);
    await store.replaceWarnings([
      { path: "/x", type: "missing_index", message: "pre-existing" },
    ]);

    await expect(runAuditPass(store)).resolves.toBeUndefined();

    const warnings = await store.getWarnings();
    expect(warnings.some((w) => w.message === "pre-existing")).toBe(true);
    expect(
      warnings.some(
        (w) =>
          w.type === "weak_description" &&
          w.message.includes("[vague_qualifiers]"),
      ),
    ).toBe(true);
  });

  it("is deterministic when `now` is injected", async () => {
    const node = makeNode({
      path: "/old",
      name: "Old",
      description:
        "A long-enough description that exists only to anchor the freshness check below",
      updated: "2024-01-01T00:00:00Z",
    });
    const store1 = await storeWithNodes([node]);
    const store2 = await storeWithNodes([{ ...node }]);

    const fixedNow = "2025-02-04T00:00:00Z";
    await runAuditPass(store1, fixedNow);
    await runAuditPass(store2, fixedNow);

    const w1 = (await store1.getWarnings()).map((w) => `${w.type}:${w.path}:${w.message}`);
    const w2 = (await store2.getWarnings()).map((w) => `${w.type}:${w.path}:${w.message}`);
    expect(w1).toEqual(w2);
  });

  it("skips companion documents (kind=document) so default DESIGN/SKILL descriptions don't flag", async () => {
    const parent = makeNode({
      path: "/architecture",
      name: "Architecture",
      description: "How the system is structured — written for agents and humans both",
      children: ["/architecture/DESIGN"],
    });
    const companion: SpandrelNode = {
      ...makeNode({}),
      path: "/architecture/DESIGN",
      name: "Design",
      // Default description from `defaultDescription("DESIGN")` — would
      // normally trigger no audit, but mark kind=document to be safe.
      description: "Design and implementation notes for the containing node",
      kind: "document",
      navigable: false,
      parent: "/architecture",
      content: "TBD", // would fire stub_marker if not skipped
    };
    const store = await storeWithNodes([parent, companion]);

    await runAuditPass(store);

    const warnings = await store.getWarnings();
    expect(
      warnings.some((w) => w.path === "/architecture/DESIGN"),
    ).toBe(false);
  });

  it("counts incoming `link` edges as inDegree (not hierarchy or authored_by)", async () => {
    // Build a node with 6 incoming link edges (above the high-fanin
    // threshold of 5) and an old `updated`; expect a staleness.high_fanin
    // warning fires alongside any other staleness findings.
    const hub = makeNode({
      path: "/hub",
      name: "Hub",
      description:
        "A heavily referenced hub node that the rest of the graph leans on — described properly",
      updated: "2024-01-01T00:00:00Z",
    });
    const referrers = Array.from({ length: 6 }, (_, i) =>
      makeNode({
        path: `/ref${i}`,
        name: `Ref ${i}`,
        description: `Referrer ${i} description, long enough not to trip the thinness detector here`,
      }),
    );
    const edges: SpandrelEdge[] = referrers.map((r) => ({
      from: r.path,
      to: hub.path,
      type: "link",
      linkType: "depends-on",
      description: "depends on the hub",
    }));
    // A hierarchy edge to the hub should NOT count toward inDegree.
    edges.push({ from: "/", to: hub.path, type: "hierarchy" });

    const store = await storeWithNodes([hub, ...referrers], edges);

    await runAuditPass(store, "2025-02-04T00:00:00Z");

    const warnings = await store.getWarnings();
    const highFanin = warnings.find(
      (w) =>
        w.path === "/hub" &&
        w.type === "staleness" &&
        w.message.includes("high_fanin"),
    );
    expect(highFanin).toBeDefined();
    expect(highFanin?.message).toContain("[staleness.high_fanin]");
  });
});
