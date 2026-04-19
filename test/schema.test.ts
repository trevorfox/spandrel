import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { graphql } from "graphql";
import { compile } from "../src/compiler/compiler.js";
import { createSchema } from "../src/schema/schema.js";

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "spandrel-gql-test-"));
}

function writeIndex(dir: string, frontmatter: Record<string, unknown>, content = "") {
  fs.mkdirSync(dir, { recursive: true });
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        return `${k}:\n${v.map((item) => {
          if (typeof item === "object") {
            const entries = Object.entries(item as Record<string, unknown>)
              .map(([ik, iv]) => `    ${ik}: ${JSON.stringify(iv)}`)
              .join("\n");
            return `  -\n${entries}`;
          }
          return `  - ${JSON.stringify(item)}`;
        }).join("\n")}`;
      }
      return `${k}: ${JSON.stringify(v)}`;
    })
    .join("\n");
  fs.writeFileSync(
    path.join(dir, "index.md"),
    `---\n${fm}\n---\n\n${content}\n`
  );
}

function rmrf(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe("GraphQL Schema", () => {
  let root: string;

  beforeEach(() => {
    root = createTempDir();
    writeIndex(root, { name: "Root", description: "The root node" }, "Welcome to the root. See [Clients](/clients) and [Projects](/projects).");
    writeIndex(path.join(root, "clients"), { name: "Clients", description: "All client accounts" }, "Our clients including [Acme](/clients/acme).");
    writeIndex(path.join(root, "clients", "acme"), {
      name: "Acme Corp",
      description: "Our biggest client",
      links: [{ to: "/projects/alpha", type: "active_project", description: "Main project" }],
      author: "/people/jane",
    }, "Acme Corporation is a key account.");
    writeIndex(path.join(root, "projects"), { name: "Projects", description: "All projects" }, "Current projects.");
    writeIndex(path.join(root, "projects", "alpha"), {
      name: "Project Alpha",
      description: "The alpha project",
      links: [{ to: "/clients/acme", type: "client", description: "Client for this project" }],
    }, "Alpha is in progress.");
  });

  afterEach(() => {
    rmrf(root);
  });

  async function query(source: string, variables?: Record<string, unknown>) {
    const store = await compile(root);
    const schema = createSchema(store);
    return graphql({ schema, source, variableValues: variables });
  }

  it("node query returns correct node with name, description, nodeType", async () => {
    const result = await query(`{
      node(path: "/") {
        path name description nodeType depth parent
      }
    }`);
    expect(result.errors).toBeUndefined();
    const node = result.data!.node;
    expect(node.path).toBe("/");
    expect(node.name).toBe("Root");
    expect(node.description).toBe("The root node");
    expect(node.nodeType).toBe("composite");
    expect(node.depth).toBe(0);
    expect(node.parent).toBeNull();
  });

  it("node query returns children with names and descriptions", async () => {
    const result = await query(`{
      node(path: "/") {
        children { path name description }
      }
    }`);
    expect(result.errors).toBeUndefined();
    const children = result.data!.node.children;
    expect(children.length).toBe(2);
    expect(children.map((c: { name: string }) => c.name).sort()).toEqual(["Clients", "Projects"]);
  });

  it("node query with depth=2 returns grandchild paths", async () => {
    const result = await query(`{
      node(path: "/", depth: 2) {
        children { path name children }
      }
    }`);
    expect(result.errors).toBeUndefined();
    const children = result.data!.node.children;
    const clients = children.find((c: { name: string }) => c.name === "Clients");
    expect(clients).toBeDefined();
    expect(clients.children).toContain("/clients/acme");
  });

  it("node query returns outgoing links", async () => {
    const result = await query(`{
      node(path: "/clients/acme") {
        links { to type description }
      }
    }`);
    expect(result.errors).toBeUndefined();
    const links = result.data!.node.links;
    expect(links).toHaveLength(1);
    expect(links[0].to).toBe("/projects/alpha");
    expect(links[0].type).toBe("active_project");
  });

  it("node query returns incoming backlinks (referencedBy)", async () => {
    const result = await query(`{
      node(path: "/clients/acme") {
        referencedBy { to type description }
      }
    }`);
    expect(result.errors).toBeUndefined();
    const backlinks = result.data!.node.referencedBy;
    // /projects/alpha links to /clients/acme
    expect(backlinks.some((b: { to: string }) => b.to === "/projects/alpha")).toBe(true);
  });

  it("node query with includeContent returns content inline", async () => {
    const result = await query(`{
      node(path: "/clients/acme", includeContent: true) {
        name content
      }
    }`);
    expect(result.errors).toBeUndefined();
    expect(result.data!.node.content).toContain("key account");
  });

  it("node query without includeContent returns null content", async () => {
    const result = await query(`{
      node(path: "/clients/acme") { content }
    }`);
    expect(result.errors).toBeUndefined();
    expect(result.data!.node.content).toBeNull();
  });

  it("content query returns full markdown body", async () => {
    const result = await query(`{
      content(path: "/clients/acme")
    }`);
    expect(result.errors).toBeUndefined();
    expect(result.data!.content).toContain("Acme Corporation is a key account");
  });

  it("context query returns everything in one call", async () => {
    const result = await query(`{
      context(path: "/clients/acme") {
        path name description content
        outgoing { path name linkType direction }
        incoming { path name linkType direction }
      }
    }`);
    expect(result.errors).toBeUndefined();
    const ctx = result.data!.context;
    expect(ctx.name).toBe("Acme Corp");
    expect(ctx.content).toContain("key account");
    // Outgoing: acme -> alpha
    expect(ctx.outgoing.some((r: { path: string }) => r.path === "/projects/alpha")).toBe(true);
    expect(ctx.outgoing[0].direction).toBe("outgoing");
    // Incoming: alpha -> acme
    expect(ctx.incoming.some((r: { path: string }) => r.path === "/projects/alpha")).toBe(true);
    expect(ctx.incoming[0].direction).toBe("incoming");
  });

  it("context query includes target node names", async () => {
    const result = await query(`{
      context(path: "/clients/acme") {
        outgoing { path name description }
      }
    }`);
    expect(result.errors).toBeUndefined();
    const outgoing = result.data!.context.outgoing;
    const alpha = outgoing.find((r: { path: string }) => r.path === "/projects/alpha");
    expect(alpha.name).toBe("Project Alpha");
    expect(alpha.description).toBe("The alpha project");
  });

  it("references query defaults to outgoing", async () => {
    const result = await query(`{
      references(path: "/clients/acme") {
        nodes { path name direction }
        pageInfo { hasNextPage endCursor }
      }
    }`);
    expect(result.errors).toBeUndefined();
    const refs = result.data!.references.nodes;
    expect(refs.every((r: { direction: string }) => r.direction === "outgoing")).toBe(true);
    expect(result.data!.references.pageInfo.hasNextPage).toBe(false);
  });

  it("references query with direction=incoming returns backlinks", async () => {
    const result = await query(`{
      references(path: "/clients/acme", direction: incoming) {
        nodes { path name direction }
      }
    }`);
    expect(result.errors).toBeUndefined();
    const refs = result.data!.references.nodes;
    expect(refs.some((r: { path: string }) => r.path === "/projects/alpha")).toBe(true);
    expect(refs.every((r: { direction: string }) => r.direction === "incoming")).toBe(true);
  });

  it("references query with direction=both returns all links", async () => {
    const result = await query(`{
      references(path: "/clients/acme", direction: both) {
        nodes { path direction }
      }
    }`);
    expect(result.errors).toBeUndefined();
    const refs = result.data!.references.nodes;
    expect(refs.some((r: { direction: string }) => r.direction === "outgoing")).toBe(true);
    expect(refs.some((r: { direction: string }) => r.direction === "incoming")).toBe(true);
  });

  it("search ranks name matches above content matches", async () => {
    const result = await query(`{
      search(query: "Acme") {
        path name score
      }
    }`);
    expect(result.errors).toBeUndefined();
    const results = result.data!.search;
    expect(results.length).toBeGreaterThan(0);
    // Acme Corp (name contains "Acme") should rank higher than Clients (content mentions "Acme")
    const acme = results.find((r: { path: string }) => r.path === "/clients/acme");
    const clients = results.find((r: { path: string }) => r.path === "/clients");
    expect(acme).toBeDefined();
    if (clients) {
      expect(acme.score).toBeGreaterThan(clients.score);
    }
  });

  it("search scopes to subtree with path parameter", async () => {
    const result = await query(`{
      search(query: "Alpha", path: "/projects") {
        path name
      }
    }`);
    expect(result.errors).toBeUndefined();
    const results = result.data!.search;
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.path.startsWith("/projects")).toBe(true);
    }
  });

  it("search returns content snippets", async () => {
    const result = await query(`{
      search(query: "key account") {
        path snippet
      }
    }`);
    expect(result.errors).toBeUndefined();
    expect(result.data!.search.length).toBeGreaterThan(0);
    expect(result.data!.search[0].snippet).toContain("key account");
  });

  it("navigate returns children and linked neighbors", async () => {
    const result = await query(`{
      navigate(path: "/clients/acme") {
        path name
        neighbors { path name relation linkType linkDescription }
      }
    }`);
    expect(result.errors).toBeUndefined();
    const nav = result.data!.navigate;
    expect(nav.name).toBe("Acme Corp");
    // Should have link to alpha (outgoing takes priority, deduplicated)
    expect(nav.neighbors.some((n: { path: string }) => n.path === "/projects/alpha")).toBe(true);
    // Alpha appears once (deduped), with linkType from the outgoing edge
    const alphaNeighbors = nav.neighbors.filter((n: { path: string }) => n.path === "/projects/alpha");
    expect(alphaNeighbors.length).toBe(1);
    expect(alphaNeighbors[0].linkType).toBe("active_project");
  });

  it("navigate filters by edgeType", async () => {
    const result = await query(`{
      navigate(path: "/clients/acme", edgeType: "active_project") {
        neighbors { path linkType relation }
      }
    }`);
    expect(result.errors).toBeUndefined();
    const neighbors = result.data!.navigate.neighbors;
    // Only active_project edges, no children
    expect(neighbors.length).toBeGreaterThan(0);
    expect(neighbors.every((n: { linkType: string }) => n.linkType === "active_project")).toBe(true);
    expect(neighbors.every((n: { relation: string }) => n.relation !== "child")).toBe(true);
  });

  it("navigate filters by keyword", async () => {
    const result = await query(`{
      navigate(path: "/", keyword: "project") {
        neighbors { path name relation }
      }
    }`);
    expect(result.errors).toBeUndefined();
    const neighbors = result.data!.navigate.neighbors;
    expect(neighbors.some((n: { path: string }) => n.path === "/projects")).toBe(true);
  });

  it("navigate returns null for nonexistent path", async () => {
    const result = await query(`{
      navigate(path: "/nonexistent") {
        path
      }
    }`);
    expect(result.errors).toBeUndefined();
    expect(result.data!.navigate).toBeNull();
  });

  it("search matches edge linkType", async () => {
    const result = await query(`{
      search(query: "active_project") {
        path name score snippet
      }
    }`);
    expect(result.errors).toBeUndefined();
    const results = result.data!.search;
    expect(results.length).toBeGreaterThan(0);
    // Should surface both nodes connected by the edge
    const paths = results.map((r: { path: string }) => r.path);
    expect(paths).toContain("/clients/acme");
    expect(paths).toContain("/projects/alpha");
  });

  it("search matches edge description", async () => {
    const result = await query(`{
      search(query: "Main project") {
        path name score snippet
      }
    }`);
    expect(result.errors).toBeUndefined();
    const results = result.data!.search;
    expect(results.length).toBeGreaterThan(0);
    // The edge description "Main project" should surface the connected nodes
    const paths = results.map((r: { path: string }) => r.path);
    expect(paths).toContain("/clients/acme");
  });

  it("search edge matches respect subtree scope", async () => {
    const result = await query(`{
      search(query: "active_project", path: "/projects") {
        path name
      }
    }`);
    expect(result.errors).toBeUndefined();
    const results = result.data!.search;
    // Should only include the /projects side of the edge
    expect(results.every((r: { path: string }) => r.path.startsWith("/projects"))).toBe(true);
  });

  it("search deduplicates when node matches both text and edge", async () => {
    // "Acme" matches the node name AND appears in edge snippets
    const result = await query(`{
      search(query: "Acme") {
        path name score
      }
    }`);
    expect(result.errors).toBeUndefined();
    const results = result.data!.search;
    // No duplicate paths
    const paths = results.map((r: { path: string }) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("graph query returns nodes and edges", async () => {
    const result = await query(`{
      graph {
        nodes { path name }
        edges { from to type }
      }
    }`);
    expect(result.errors).toBeUndefined();
    expect(result.data!.graph.nodes.length).toBe(5);
    expect(result.data!.graph.edges.length).toBeGreaterThan(0);
  });

  it("graph query with path scopes to subtree", async () => {
    const result = await query(`{
      graph(path: "/clients", depth: 1) {
        nodes { path }
      }
    }`);
    expect(result.errors).toBeUndefined();
    const paths = result.data!.graph.nodes.map((n: { path: string }) => n.path);
    expect(paths).toContain("/clients");
    expect(paths).toContain("/clients/acme");
    expect(paths).not.toContain("/projects");
  });

  it("validate query returns warnings", async () => {
    const result = await query(`{
      validate { path type message }
    }`);
    expect(result.errors).toBeUndefined();
    expect(result.data!.validate.length).toBeGreaterThan(0);
  });

  it("validate query with path scopes to subtree", async () => {
    const result = await query(`{
      validate(path: "/clients") {
        path type message
      }
    }`);
    expect(result.errors).toBeUndefined();
    for (const w of result.data!.validate) {
      expect(w.path.startsWith("/clients")).toBe(true);
    }
  });

  it("history query returns empty array (git not wired in tests)", async () => {
    const result = await query(`{
      history(path: "/") { hash date author message }
    }`);
    expect(result.errors).toBeUndefined();
    expect(result.data!.history).toEqual([]);
  });

  it("node query returns null for nonexistent path", async () => {
    const result = await query(`{
      node(path: "/does/not/exist") { path name }
    }`);
    expect(result.errors).toBeUndefined();
    expect(result.data!.node).toBeNull();
  });

  it("content query returns null for nonexistent path", async () => {
    const result = await query(`{
      content(path: "/nonexistent")
    }`);
    expect(result.errors).toBeUndefined();
    expect(result.data!.content).toBeNull();
  });

  it("children query returns NodeConnection with pageInfo", async () => {
    const result = await query(`{
      children(path: "/") {
        nodes { path name }
        pageInfo { hasNextPage endCursor }
      }
    }`);
    expect(result.errors).toBeUndefined();
    const conn = result.data!.children;
    expect(conn.nodes.length).toBe(2);
    expect(conn.pageInfo.hasNextPage).toBe(false);
    expect(conn.pageInfo.endCursor).toBeDefined();
  });

  it("graph query includes pageInfo", async () => {
    const result = await query(`{
      graph {
        nodes { path name }
        edges { from to type }
        pageInfo { hasNextPage endCursor }
      }
    }`);
    expect(result.errors).toBeUndefined();
    expect(result.data!.graph.nodes.length).toBe(5);
    expect(result.data!.graph.pageInfo.hasNextPage).toBe(false);
  });

  it("graph query with depth > 10 returns error", async () => {
    const result = await query(`{
      graph(depth: 11) {
        nodes { path }
      }
    }`);
    expect(result.errors).toBeDefined();
    expect(result.errors![0].message).toContain("exceeds maximum allowed depth");
  });

  it("graph query respects first/after cursor pagination", async () => {
    // Get first page with first=1
    const page1 = await query(`{
      graph(first: 1) {
        nodes { path }
        pageInfo { hasNextPage endCursor }
      }
    }`);
    expect(page1.errors).toBeUndefined();
    expect(page1.data!.graph.nodes.length).toBe(1);
    expect(page1.data!.graph.pageInfo.hasNextPage).toBe(true);
    const cursor = page1.data!.graph.pageInfo.endCursor;

    // Get second page
    const page2 = await query(`{
      graph(first: 1, after: "${cursor}") {
        nodes { path }
        pageInfo { hasNextPage endCursor }
      }
    }`);
    expect(page2.errors).toBeUndefined();
    expect(page2.data!.graph.nodes.length).toBe(1);
    // Pages should not overlap
    expect(page2.data!.graph.nodes[0].path).not.toBe(page1.data!.graph.nodes[0].path);
  });

  it("graph with injected cycle does not cause infinite recursion", async () => {
    const store = await compile(root);

    // Inject a back-edge cycle: /clients/acme -> /clients (parent)
    const acmeNode = (await store.getNode("/clients/acme"))!;
    acmeNode.children = ["/clients"];

    const schema = createSchema(store);
    const result = await graphql({ schema, source: `{ graph { nodes { path } } }` });
    expect(result.errors).toBeUndefined();
    // Should still return nodes without stack overflow
    expect(result.data!.graph.nodes.length).toBeGreaterThan(0);
  });
});

describe("GraphQL Schema — /linkTypes/ vocabulary", () => {
  let root: string;

  beforeEach(() => {
    root = createTempDir();
    writeIndex(root, { name: "Root", description: "Root" }, "See [Clients](/clients).");
    writeIndex(path.join(root, "clients"), { name: "Clients", description: "Clients" }, "Clients list.");
    writeIndex(path.join(root, "clients", "acme"), {
      name: "Acme Corp",
      description: "Key client",
      links: [
        { to: "/projects/alpha", type: "active_project", description: "Main project" },
        { to: "/clients/globex", type: "owns", description: "Acquired 2024" },
      ],
    }, "Acme details.");
    writeIndex(path.join(root, "clients", "globex"), { name: "Globex", description: "Subsidiary" });
    writeIndex(path.join(root, "projects"), { name: "Projects", description: "Projects" });
    writeIndex(path.join(root, "projects", "alpha"), {
      name: "Alpha",
      description: "Alpha project",
    });
    writeIndex(path.join(root, "linkTypes"), {
      name: "Link Types",
      description: "Declared relationship vocabulary",
    });
    fs.writeFileSync(
      path.join(root, "linkTypes", "owns.md"),
      "---\nname: owns\ndescription: The source entity has operational or legal control of the target.\n---\n\n# owns\n\nDetails.\n"
    );
    fs.writeFileSync(
      path.join(root, "linkTypes", "active_project.md"),
      "---\nname: active_project\ndescription: The target is a project the source is currently engaged on.\n---\n"
    );
  });

  afterEach(() => {
    rmrf(root);
  });

  async function query(source: string, variables?: Record<string, unknown>) {
    const { compile } = await import("../src/compiler/compiler.js");
    const store = await compile(root);
    const schema = createSchema(store);
    return graphql({ schema, source, variableValues: variables });
  }

  it("exposes linkTypes query returning declared vocabulary", async () => {
    const result = await query(`{
      linkTypes { name description path }
    }`);
    expect(result.errors).toBeUndefined();
    const types = result.data!.linkTypes as Array<{ name: string; description: string; path: string }>;
    const byName = new Map(types.map((t) => [t.name, t]));
    expect(types.length).toBe(2);
    expect(byName.get("owns")).toEqual({
      name: "owns",
      description: "The source entity has operational or legal control of the target.",
      path: "/linkTypes/owns",
    });
    expect(byName.get("active_project")).toEqual({
      name: "active_project",
      description: "The target is a project the source is currently engaged on.",
      path: "/linkTypes/active_project",
    });
  });

  it("linkTypes returns empty array when graph has no /linkTypes/ collection", async () => {
    // Build a fresh graph without a /linkTypes/ collection
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), "spandrel-no-linktypes-"));
    try {
      writeIndex(bare, { name: "Bare", description: "No linkTypes here" });
      const { compile } = await import("../src/compiler/compiler.js");
      const store = await compile(bare);
      const schema = createSchema(store);
      const result = await graphql({ schema, source: `{ linkTypes { name } }` });
      expect(result.errors).toBeUndefined();
      expect(result.data!.linkTypes).toEqual([]);
    } finally {
      rmrf(bare);
    }
  });

  it("context query populates linkTypeDescription on outgoing edges when declared", async () => {
    const result = await query(`{
      context(path: "/clients/acme") {
        outgoing { path linkType linkTypeDescription }
      }
    }`);
    expect(result.errors).toBeUndefined();
    const outgoing = result.data!.context.outgoing as Array<{
      path: string;
      linkType: string | null;
      linkTypeDescription: string | null;
    }>;
    const owns = outgoing.find((r) => r.linkType === "owns");
    const active = outgoing.find((r) => r.linkType === "active_project");
    expect(owns?.linkTypeDescription).toBe(
      "The source entity has operational or legal control of the target."
    );
    expect(active?.linkTypeDescription).toBe(
      "The target is a project the source is currently engaged on."
    );
  });

  it("context query returns null linkTypeDescription for undeclared linkType", async () => {
    // /clients links to /clients/acme via hierarchy; add a frontmatter
    // link with an undeclared linkType to /clients/acme and re-compile.
    const acmePath = path.join(root, "clients", "acme");
    fs.writeFileSync(
      path.join(acmePath, "index.md"),
      "---\n" +
      "name: Acme Corp\n" +
      "description: Key client\n" +
      "links:\n" +
      "  -\n" +
      "    to: \"/projects/alpha\"\n" +
      "    type: \"undeclared_linktype\"\n" +
      "    description: \"no matching /linkTypes/ entry\"\n" +
      "---\n\nAcme details.\n"
    );

    const result = await query(`{
      context(path: "/clients/acme") {
        outgoing { linkType linkTypeDescription }
      }
    }`);
    expect(result.errors).toBeUndefined();
    const outgoing = result.data!.context.outgoing as Array<{
      linkType: string | null;
      linkTypeDescription: string | null;
    }>;
    const undeclared = outgoing.find((r) => r.linkType === "undeclared_linktype");
    expect(undeclared).toBeDefined();
    expect(undeclared!.linkTypeDescription).toBeNull();
  });

  it("node.links carries linkTypeDescription when declared", async () => {
    const result = await query(`{
      node(path: "/clients/acme") {
        links { to type description linkTypeDescription }
      }
    }`);
    expect(result.errors).toBeUndefined();
    const links = result.data!.node.links as Array<{
      to: string;
      type: string | null;
      description: string | null;
      linkTypeDescription: string | null;
    }>;
    const owns = links.find((l) => l.type === "owns");
    expect(owns?.linkTypeDescription).toBe(
      "The source entity has operational or legal control of the target."
    );
  });

  it("references query populates linkTypeDescription", async () => {
    const result = await query(`{
      references(path: "/clients/acme") {
        nodes { linkType linkTypeDescription }
      }
    }`);
    expect(result.errors).toBeUndefined();
    const nodes = result.data!.references.nodes as Array<{
      linkType: string | null;
      linkTypeDescription: string | null;
    }>;
    const owns = nodes.find((n) => n.linkType === "owns");
    expect(owns?.linkTypeDescription).toBe(
      "The source entity has operational or legal control of the target."
    );
  });

  it("edges with linkType null return linkTypeDescription null", async () => {
    // The graph query surfaces hierarchy edges with no linkType
    const result = await query(`{
      graph { edges { type linkType linkTypeDescription } }
    }`);
    expect(result.errors).toBeUndefined();
    const edges = result.data!.graph.edges as Array<{
      type: string;
      linkType: string | null;
      linkTypeDescription: string | null;
    }>;
    const hierarchyEdges = edges.filter((e) => e.type === "hierarchy");
    expect(hierarchyEdges.length).toBeGreaterThan(0);
    for (const edge of hierarchyEdges) {
      expect(edge.linkType).toBeNull();
      expect(edge.linkTypeDescription).toBeNull();
    }
  });
});
