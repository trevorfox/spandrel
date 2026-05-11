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

  it("emits a stub_marker warning with author_todo subkind when the body contains TBD", async () => {
    // Item #7 from SPANDREL-FEEDBACK.md split stub_marker into subkinds:
    // `author_todo` (TBD/TODO/WIP), `framework_scaffold`
    // (`(auto-generated stub)`), `template_placeholder` (`[placeholder]`).
    // The message prefix is `[stub_marker.<subkind>]`.
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
    expect(stub?.message).toContain("[stub_marker.author_todo]");
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

  // ---------------------------------------------------------------------------
  // Item #2 — mentions-edge redundancy suppression
  // ---------------------------------------------------------------------------

  it("suppresses weak_edge_description on a mentions edge whose target has a described typed edge (item #2)", async () => {
    // Definite-style fixture from SPANDREL-FEEDBACK.md §2: a scenario node
    // declares a typed `manifests-in` edge with a substantive description,
    // then the body prose references the same target as an inline link
    // (extracted as a `mentions` edge). The detector should not fire — the
    // relationship is already described.
    const source = makeNode({
      path: "/scenarios/outgrown",
      name: "Outgrown spreadsheets",
      description:
        "A scenario describing the moment a team outgrows ad-hoc spreadsheet analysis",
      content:
        "Tool-stage: [`patchwork`](/icp/patchwork) primarily, sometimes other choices.",
    });
    const target = makeNode({
      path: "/icp/patchwork",
      name: "Patchwork",
      description: "Patchwork tool-stage — duct-taped BI on a starter analytics stack",
    });
    const edges: SpandrelEdge[] = [
      // Typed frontmatter edge with description — substantive.
      {
        from: source.path,
        to: target.path,
        type: "link",
        linkType: "manifests-in",
        description: "Outgrown scenarios most often manifest in patchwork stacks",
      },
      // Same source, same target, mentions edge from body — no description.
      {
        from: source.path,
        to: target.path,
        type: "link",
        linkType: "mentions",
        description: "patchwork",
      },
    ];
    const store = await storeWithNodes([source, target], edges);

    await runAuditPass(store);

    const warnings = await store.getWarnings();
    const edgeFindings = warnings.filter(
      (w) =>
        w.path === source.path && w.type === "weak_edge_description",
    );
    // No findings should fire on the mentions edge — typed edge already
    // described.
    expect(edgeFindings).toEqual([]);
  });

  it("still fires weak_edge_description.missing on mentions edges that don't duplicate a described typed edge (item #2 isn't over-suppressing)", async () => {
    const source = makeNode({
      path: "/scenarios/a",
      name: "A",
      description: "A scenario whose body mentions a topic with no typed declaration",
      content: "We touched on [analytics](/topics/analytics) briefly.",
    });
    const target = makeNode({
      path: "/topics/analytics",
      name: "Analytics",
      description: "Analytics — what teams want when they want better dashboards",
    });
    const edges: SpandrelEdge[] = [
      // ONLY the mentions edge, with no description. No same-target typed
      // edge — so suppression doesn't apply.
      {
        from: source.path,
        to: target.path,
        type: "link",
        linkType: "mentions",
        description: undefined,
      },
    ];
    const store = await storeWithNodes([source, target], edges);

    await runAuditPass(store);

    const warnings = await store.getWarnings();
    const missing = warnings.find(
      (w) =>
        w.path === source.path &&
        w.type === "weak_edge_description" &&
        w.message.includes("[weak_edge_description.missing]"),
    );
    expect(missing).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Item #3 — TOC heading-aware body-link suppression
  // ---------------------------------------------------------------------------

  it("suppresses weak_edge_description on a mentions edge sitting under a `## Contents` heading (item #3)", async () => {
    const parent = makeNode({
      path: "/product/capabilities",
      name: "Capabilities",
      description: "Product capabilities — the things the product can do for an end user",
      content:
        "Some intro paragraph that doesn't list children explicitly.\n\n" +
        "## Contents\n\n" +
        "- [ai-agent](/product/capabilities/ai-agent)\n" +
        "- [connector-library](/product/capabilities/connector-library)\n",
    });
    const child1 = makeNode({
      path: "/product/capabilities/ai-agent",
      name: "AI agent",
      description: "AI agent that reads, writes, and acts on the analytics stack",
    });
    const child2 = makeNode({
      path: "/product/capabilities/connector-library",
      name: "Connector library",
      description: "Library of pre-built data connectors covering common SaaS sources",
    });
    const edges: SpandrelEdge[] = [
      // Mentions edges as the compiler would extract them from the body —
      // anchor text is the leaf slug (TOC convention).
      {
        from: parent.path,
        to: child1.path,
        type: "link",
        linkType: "mentions",
        description: "ai-agent",
      },
      {
        from: parent.path,
        to: child2.path,
        type: "link",
        linkType: "mentions",
        description: "connector-library",
      },
    ];
    const store = await storeWithNodes([parent, child1, child2], edges);

    await runAuditPass(store);

    const warnings = await store.getWarnings();
    const tocFindings = warnings.filter(
      (w) =>
        w.path === parent.path && w.type === "weak_edge_description",
    );
    expect(tocFindings).toEqual([]);
  });

  it("still fires weak_edge_description on body links outside a TOC heading section (item #3 isn't over-suppressing)", async () => {
    const parent = makeNode({
      path: "/product/capabilities",
      name: "Capabilities",
      description: "Product capabilities — the things the product can do for an end user",
      content:
        "Some intro paragraph that mentions [ai-agent](/product/capabilities/ai-agent) in prose, not under a TOC heading.",
    });
    const child = makeNode({
      path: "/product/capabilities/ai-agent",
      name: "AI agent",
      description: "AI agent that reads, writes, and acts on the analytics stack",
    });
    const edges: SpandrelEdge[] = [
      {
        from: parent.path,
        to: child.path,
        type: "link",
        linkType: "mentions",
        description: "ai-agent",
      },
    ];
    const store = await storeWithNodes([parent, child], edges);

    await runAuditPass(store);

    const warnings = await store.getWarnings();
    // The mentions edge sits in prose (not under a TOC heading), so
    // weak_edge_description.tautologous still fires — the description
    // equals the target stem.
    const proseFindings = warnings.filter(
      (w) =>
        w.path === parent.path && w.type === "weak_edge_description",
    );
    expect(proseFindings.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Item #8 — container-composite suppression for thin_body + weak_description.thin
  // ---------------------------------------------------------------------------

  it("suppresses thin_body on a container composite with ≥3 substantive children (item #8)", async () => {
    // A 0-word body composite with 4 children whose descriptions average ≥8
    // words is a valid coordinator pattern; thin_body should not fire.
    const parent = makeNode({
      path: "/core/identity",
      name: "Identity",
      description:
        "Mission, values, vision, and the public-facing story of the practice — short on body, deep in children",
      children: [
        "/core/identity/mission",
        "/core/identity/values",
        "/core/identity/vision",
        "/core/identity/story",
      ],
      content: "",
    });
    const children = ["mission", "values", "vision", "story"].map((slug) =>
      makeNode({
        path: `/core/identity/${slug}`,
        name: slug,
        parent: parent.path,
        description: `The ${slug} of the practice — twelve word minimum statement that anchors authoring choices and review`,
      }),
    );
    const store = await storeWithNodes([parent, ...children]);

    await runAuditPass(store);

    const warnings = await store.getWarnings();
    const thinBody = warnings.find(
      (w) => w.path === parent.path && w.type === "thin_body",
    );
    expect(thinBody).toBeUndefined();
  });

  it("still fires thin_body on a leaf with 0-word body (item #8 isn't over-suppressing leaves)", async () => {
    const leaf = makeNode({
      path: "/notes/empty",
      name: "Empty note",
      description: "An empty note with body deliberately stubbed and a long-enough description here",
      content: "",
      children: [],
    });
    const store = await storeWithNodes([leaf]);

    await runAuditPass(store);

    const warnings = await store.getWarnings();
    const thinBody = warnings.find(
      (w) => w.path === leaf.path && w.type === "thin_body",
    );
    expect(thinBody).toBeDefined();
  });

  it("still fires thin_body on a composite whose children's descriptions are themselves thin", async () => {
    const parent = makeNode({
      path: "/core/identity",
      name: "Identity",
      description: "Identity coordinator with thin children whose descriptions don't carry the weight either",
      children: [
        "/core/identity/mission",
        "/core/identity/values",
        "/core/identity/vision",
      ],
      content: "",
    });
    const children = ["mission", "values", "vision"].map((slug) =>
      makeNode({
        path: `/core/identity/${slug}`,
        name: slug,
        parent: parent.path,
        description: "stub",
      }),
    );
    const store = await storeWithNodes([parent, ...children]);

    await runAuditPass(store);

    const warnings = await store.getWarnings();
    const thinBody = warnings.find(
      (w) => w.path === parent.path && w.type === "thin_body",
    );
    expect(thinBody).toBeDefined();
  });
});
