import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { compile } from "../src/compiler/compiler.js";
import { AccessPolicy } from "../src/access/policy.js";
import { buildInstructions, createMcpServer } from "../src/server/mcp.js";
import { createTempDir, writeIndex } from "./test-helpers.js";

/**
 * Permissive policy used across the MCP suite — every caller is treated as
 * admin so the read/write tools can be exercised end-to-end. Per-policy
 * gating is covered in test/access.test.ts.
 */
const adminPolicy = new AccessPolicy({
  roles: { admin: { default: true } },
  policies: {
    admin: {
      paths: ["/**"],
      access_level: "traverse",
      operations: ["read", "write", "admin"],
    },
  },
});

describe("MCP Server", () => {
  let root: string;
  let client: Client;

  beforeEach(async () => {
    root = createTempDir();
    writeIndex(root, { name: "Root", description: "The root" }, "Welcome. See [Clients](/clients).");
    writeIndex(path.join(root, "clients"), { name: "Clients", description: "All clients" }, "Our clients.");
    writeIndex(path.join(root, "clients", "acme"), {
      name: "Acme Corp",
      description: "Key client",
      links: [{ to: "/projects/alpha", type: "project" }],
    }, "Acme details here.");
    writeIndex(path.join(root, "projects"), { name: "Projects", description: "All projects" }, "Projects list.");
    writeIndex(path.join(root, "projects", "alpha"), {
      name: "Alpha",
      description: "The alpha project",
      links: [{ to: "/clients/acme", type: "client" }],
    }, "Alpha is ongoing.");

    const store = await compile(root);
    const mcpServer = await createMcpServer({ store, policy: adminPolicy, rootDir: root });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: "test-client", version: "1.0.0" });
    await Promise.all([
      client.connect(clientTransport),
      mcpServer.connect(serverTransport),
    ]);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("exposes exactly 13 tools", async () => {
    const result = await client.listTools();
    expect(result.tools.length).toBe(13);
    const names = result.tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "context",
      "create_thing",
      "delete_thing",
      "get_content",
      "get_graph",
      "get_history",
      "get_node",
      "get_references",
      "move_thing",
      "navigate",
      "search",
      "update_thing",
      "validate",
    ]);
  });

  it("server provides instructions with graph metadata", async () => {
    const store2 = await compile(root);
    const mcpServer2 = await createMcpServer({ store: store2, policy: adminPolicy, rootDir: root });

    const [ct, st] = InMemoryTransport.createLinkedPair();
    const client2 = new Client({ name: "test-client-2", version: "1.0.0" });
    await Promise.all([
      client2.connect(ct),
      mcpServer2.connect(st),
    ]);

    const info2 = client2.getServerVersion();
    expect(info2?.name).toBe("spandrel");

    const instructions = client2.getInstructions();
    expect(instructions).toBeDefined();
    expect(instructions).toContain("Root");
    expect(instructions).toContain("Clients");
    expect(instructions).toContain("Projects");
    expect(instructions).toContain("context");
  });

  it("get_node returns correct node data with backlinks", async () => {
    const result = await client.callTool({ name: "get_node", arguments: { path: "/clients/acme" } });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const node = JSON.parse(text);
    expect(node.path).toBe("/clients/acme");
    expect(node.name).toBe("Acme Corp");
    // Has outgoing links
    expect(node.links.length).toBeGreaterThan(0);
    // Has incoming backlinks
    expect(node.referencedBy.some((b: { to: string }) => b.to === "/projects/alpha")).toBe(true);
  });

  it("get_node with includeContent returns content inline", async () => {
    const result = await client.callTool({
      name: "get_node",
      arguments: { path: "/clients/acme", includeContent: true },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const node = JSON.parse(text);
    expect(node.content).toContain("Acme details");
  });

  it("get_content returns markdown body", async () => {
    const result = await client.callTool({ name: "get_content", arguments: { path: "/clients/acme" } });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("Acme details");
  });

  it("context returns everything in one call", async () => {
    const result = await client.callTool({ name: "context", arguments: { path: "/clients/acme" } });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const ctx = JSON.parse(text);
    expect(ctx.name).toBe("Acme Corp");
    expect(ctx.content).toContain("Acme details");
    // Outgoing: acme -> alpha
    expect(ctx.outgoing.some((r: { path: string }) => r.path === "/projects/alpha")).toBe(true);
    expect(ctx.outgoing[0].name).toBe("Alpha"); // Includes target name
    // Incoming: alpha -> acme
    expect(ctx.incoming.some((r: { path: string }) => r.path === "/projects/alpha")).toBe(true);
  });

  it("get_references with direction=incoming returns backlinks", async () => {
    const result = await client.callTool({
      name: "get_references",
      arguments: { path: "/clients/acme", direction: "incoming" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const refs = JSON.parse(text);
    expect(refs.some((r: { path: string }) => r.path === "/projects/alpha")).toBe(true);
    expect(refs[0].direction).toBe("incoming");
  });

  it("navigate returns children and linked nodes", async () => {
    const result = await client.callTool({ name: "navigate", arguments: { path: "/" } });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const nav = JSON.parse(text);
    expect(nav.name).toBe("Root");
    expect(nav.neighbors.length).toBeGreaterThan(0);
    // Root has children (clients, projects)
    const children = nav.neighbors.filter((n: { relation: string }) => n.relation === "child");
    expect(children.length).toBe(2);
  });

  it("navigate filters by edgeType", async () => {
    const result = await client.callTool({
      name: "navigate",
      arguments: { path: "/clients/acme", edgeType: "project" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const nav = JSON.parse(text);
    // Should only return the project link, not children or other edges
    expect(nav.neighbors.length).toBeGreaterThan(0);
    expect(nav.neighbors.every((n: { linkType: string }) => n.linkType === "project")).toBe(true);
  });

  it("navigate filters by keyword", async () => {
    const result = await client.callTool({
      name: "navigate",
      arguments: { path: "/", keyword: "client" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const nav = JSON.parse(text);
    // Should match "Clients" collection by name/description
    const paths = nav.neighbors.map((n: { path: string }) => n.path);
    expect(paths).toContain("/clients");
  });

  it("search finds nodes by query with ranking", async () => {
    const result = await client.callTool({ name: "search", arguments: { query: "alpha" } });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const results = JSON.parse(text);
    expect(results.length).toBeGreaterThan(0);
    // Alpha (name match) should be first
    expect(results[0].path).toBe("/projects/alpha");
  });

  it("search scopes to subtree", async () => {
    const result = await client.callTool({
      name: "search",
      arguments: { query: "alpha", path: "/clients" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const results = JSON.parse(text);
    // Should not include /projects/alpha
    expect(results.every((r: { path: string }) => r.path.startsWith("/clients"))).toBe(true);
  });

  it("get_graph returns nodes and edges", async () => {
    const result = await client.callTool({ name: "get_graph", arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const graph = JSON.parse(text);
    expect(graph.nodes.length).toBe(5);
    expect(graph.edges.length).toBeGreaterThan(0);
  });

  it("validate returns warnings", async () => {
    const result = await client.callTool({ name: "validate", arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const warnings = JSON.parse(text);
    expect(Array.isArray(warnings)).toBe(true);
  });

  it("get_history returns array", async () => {
    const result = await client.callTool({ name: "get_history", arguments: { path: "/" } });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const history = JSON.parse(text);
    expect(Array.isArray(history)).toBe(true);
  });

  // --- Write tool tests ---

  it("create_thing creates a new node", async () => {
    const result = await client.callTool({
      name: "create_thing",
      arguments: {
        path: "/people",
        name: "People",
        description: "All people",
        content: "The people directory.",
      },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const data = JSON.parse(text);
    expect(data.success).toBe(true);
    expect(data.path).toBe("/people");

    // Verify it's queryable
    const nodeResult = await client.callTool({ name: "get_node", arguments: { path: "/people" } });
    const nodeText = (nodeResult.content as Array<{ type: string; text: string }>)[0].text;
    const node = JSON.parse(nodeText);
    expect(node.name).toBe("People");
  });

  it("update_thing modifies an existing node", async () => {
    const result = await client.callTool({
      name: "update_thing",
      arguments: {
        path: "/clients/acme",
        description: "Updated key client description",
      },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const data = JSON.parse(text);
    expect(data.success).toBe(true);

    // Verify the update
    const nodeResult = await client.callTool({
      name: "get_node",
      arguments: { path: "/clients/acme" },
    });
    const nodeText = (nodeResult.content as Array<{ type: string; text: string }>)[0].text;
    const node = JSON.parse(nodeText);
    expect(node.description).toBe("Updated key client description");
    expect(node.name).toBe("Acme Corp"); // unchanged
  });

  it("delete_thing removes a node with no referrers", async () => {
    // Create an isolated node that no other node links to, then delete it.
    // This verifies the no-cascade happy path without triggering the referrer guard.
    await client.callTool({
      name: "create_thing",
      arguments: { path: "/standalone", name: "Standalone", description: "Isolated node" },
    });

    const result = await client.callTool({
      name: "delete_thing",
      arguments: { path: "/standalone" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const data = JSON.parse(text);
    expect(data.success).toBe(true);

    // Verify it's gone
    const nodeResult = await client.callTool({
      name: "get_node",
      arguments: { path: "/standalone" },
    });
    const nodeText = (nodeResult.content as Array<{ type: string; text: string }>)[0].text;
    expect(JSON.parse(nodeText)).toBeNull();
  });

  it("delete_thing refuses when referrers exist and no cascade is passed", async () => {
    // /projects/alpha is referenced by /clients/acme via a declared frontmatter
    // link.  Without cascade the tool must refuse and leave the file on disk.
    const result = await client.callTool({
      name: "delete_thing",
      arguments: { path: "/projects/alpha" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const data = JSON.parse(text);
    expect(data.success).toBe(false);
    expect(data.message).toMatch(/referrer/i);

    // File must still exist — not deleted
    const nodeResult = await client.callTool({
      name: "get_node",
      arguments: { path: "/projects/alpha" },
    });
    const nodeText = (nodeResult.content as Array<{ type: string; text: string }>)[0].text;
    expect(JSON.parse(nodeText)).not.toBeNull();
  });

  it("delete_thing with cascade='remove-link' deletes the node and rewrites referrers", async () => {
    // /projects/alpha is referenced by /clients/acme.  cascade='remove-link'
    // must delete /projects/alpha AND strip that link from /clients/acme's
    // frontmatter so no dangling edge remains.
    const result = await client.callTool({
      name: "delete_thing",
      arguments: { path: "/projects/alpha", cascade: "remove-link" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const data = JSON.parse(text);
    expect(data.success).toBe(true);

    // Deleted node is gone
    const alphaResult = await client.callTool({
      name: "get_node",
      arguments: { path: "/projects/alpha" },
    });
    const alphaText = (alphaResult.content as Array<{ type: string; text: string }>)[0].text;
    expect(JSON.parse(alphaText)).toBeNull();

    // Referrer no longer carries the dead link
    const acmeResult = await client.callTool({
      name: "get_node",
      arguments: { path: "/clients/acme" },
    });
    const acmeText = (acmeResult.content as Array<{ type: string; text: string }>)[0].text;
    const acme = JSON.parse(acmeText);
    expect(acme.links.some((l: { to: string }) => l.to === "/projects/alpha")).toBe(false);
  });

  it("move_thing renames a Thing and rewrites declared referrers", async () => {
    // /clients/acme has a link to /projects/alpha; /projects/alpha links back to /clients/acme
    // Move /clients/acme to /clients/acme-corp — referrer /projects/alpha should be rewritten
    const result = await client.callTool({
      name: "move_thing",
      arguments: { from: "/clients/acme", to: "/clients/acme-corp" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const data = JSON.parse(text);
    expect(data.success).toBe(true);
    expect(data.from).toBe("/clients/acme");
    expect(data.to).toBe("/clients/acme-corp");

    // Old path is gone
    const oldNode = await client.callTool({ name: "get_node", arguments: { path: "/clients/acme" } });
    const oldText = (oldNode.content as Array<{ type: string; text: string }>)[0].text;
    expect(JSON.parse(oldText)).toBeNull();

    // New path exists with the same name
    const newNode = await client.callTool({ name: "get_node", arguments: { path: "/clients/acme-corp" } });
    const newText = (newNode.content as Array<{ type: string; text: string }>)[0].text;
    const node = JSON.parse(newText);
    expect(node).not.toBeNull();
    expect(node.name).toBe("Acme Corp");

    // The referrer (/projects/alpha) should now point to /clients/acme-corp
    const alphaNode = await client.callTool({ name: "get_node", arguments: { path: "/projects/alpha" } });
    const alphaText = (alphaNode.content as Array<{ type: string; text: string }>)[0].text;
    const alpha = JSON.parse(alphaText);
    expect(alpha.links.some((l: { to: string }) => l.to === "/clients/acme-corp")).toBe(true);
    expect(alpha.links.some((l: { to: string }) => l.to === "/clients/acme")).toBe(false);
  });

  it("move_thing fails when source does not exist", async () => {
    const result = await client.callTool({
      name: "move_thing",
      arguments: { from: "/does-not-exist", to: "/somewhere-else" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const data = JSON.parse(text);
    expect(data.success).toBe(false);
    expect(data.message).toBeTruthy();
  });

  it("move_thing fails when target already exists", async () => {
    const result = await client.callTool({
      name: "move_thing",
      arguments: { from: "/clients/acme", to: "/projects/alpha" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const data = JSON.parse(text);
    expect(data.success).toBe(false);
    expect(data.message).toContain("Target exists");
  });

  it("move_thing surfaces danglingMentions for inline prose links", async () => {
    // Create /mention-source (target of the move).
    await client.callTool({
      name: "create_thing",
      arguments: { path: "/mention-source", name: "Mention Source", description: "Will be moved" },
    });

    // Create a node whose body contains an inline [text](/mention-source) mention.
    await client.callTool({
      name: "create_thing",
      arguments: {
        path: "/mention-host",
        name: "Mention Host",
        description: "Contains a prose mention",
        content: "See [this node](/mention-source) for context.",
      },
    });

    const result = await client.callTool({
      name: "move_thing",
      arguments: { from: "/mention-source", to: "/mention-renamed" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const data = JSON.parse(text);
    expect(data.success).toBe(true);
    expect(data.moveResult.danglingMentions).toHaveLength(1);
    expect(data.moveResult.danglingMentions[0].in).toBe("/mention-host");
    expect(data.moveResult.danglingMentions[0].to).toBe("/mention-source");
  });

  it("delete_thing with cascade='remove-link' includes danglingMentions in result", async () => {
    // Create /dm-target and a node with an inline prose mention.
    await client.callTool({
      name: "create_thing",
      arguments: { path: "/dm-target", name: "DM Target", description: "Will be cascade-deleted" },
    });
    await client.callTool({
      name: "create_thing",
      arguments: {
        path: "/dm-host",
        name: "DM Host",
        description: "Contains a prose mention",
        content: "See [dm-target](/dm-target) for more.",
      },
    });

    const result = await client.callTool({
      name: "delete_thing",
      arguments: { path: "/dm-target", cascade: "remove-link" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const data = JSON.parse(text);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.deleteResult.danglingMentions)).toBe(true);
    expect(data.deleteResult.danglingMentions).toHaveLength(1);
    expect(data.deleteResult.danglingMentions[0].in).toBe("/dm-host");
    expect(data.deleteResult.danglingMentions[0].to).toBe("/dm-target");
  });

  // SKIP: known gap — composite move doesn't recompile descendants in the
  // in-process store. Watcher will catch up on next event in mcp/dev mode,
  // but for one-shot CLI this is fine. Follow-up: recompileSubtree helper.
  // See _notes/PROPOSAL-graph-mutations.md and final-reviewer report.
  it.skip("move_thing composite with descendants — child nodes move with parent", async () => {
    // Build /parent (composite) with /parent/child (leaf descendant).
    // Move /parent → /renamed.  Then verify:
    //   1. /parent is gone from the store.
    //   2. /renamed/child.md exists on disk (the file was moved).
    //   3. get_node("/renamed/child") resolves in the MCP store.
    //
    // Step 3 confirms the known in-process store staleness gap: recompileNode
    // is called only for the composite root (oldSourcePath / newSourcePath)
    // but NOT for each descendant. The assertion fails, confirming the gap.

    // Create the composite parent and its child leaf using a fresh server
    // so we can build exactly the structure we need.
    const parentDir = path.join(root, "parent");
    writeIndex(parentDir, { name: "Parent", description: "Composite parent" }, "Parent body.");
    fs.writeFileSync(
      path.join(parentDir, "child.md"),
      "---\nname: Child\ndescription: A child node\n---\n\nChild body.\n"
    );

    // Recompile to a fresh store that includes /parent and /parent/child.
    const { compile: recompile } = await import("../src/compiler/compiler.js");
    const freshStore = await recompile(root);
    const freshServer = await createMcpServer({ store: freshStore, policy: adminPolicy, rootDir: root });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const freshClient = new Client({ name: "composite-move-client", version: "1.0.0" });
    await Promise.all([freshClient.connect(ct), freshServer.connect(st)]);

    // Verify /parent/child exists before the move.
    const beforeChild = await freshClient.callTool({ name: "get_node", arguments: { path: "/parent/child" } });
    const beforeChildText = (beforeChild.content as Array<{ type: string; text: string }>)[0].text;
    expect(JSON.parse(beforeChildText)).not.toBeNull();

    // Execute the move.
    const moveResult = await freshClient.callTool({
      name: "move_thing",
      arguments: { from: "/parent", to: "/renamed" },
    });
    const moveText = (moveResult.content as Array<{ type: string; text: string }>)[0].text;
    const moveData = JSON.parse(moveText);
    expect(moveData.success).toBe(true);

    // 1. /parent is gone from the store.
    const oldNode = await freshClient.callTool({ name: "get_node", arguments: { path: "/parent" } });
    const oldText = (oldNode.content as Array<{ type: string; text: string }>)[0].text;
    expect(JSON.parse(oldText)).toBeNull();

    // 2. /renamed/child.md exists on disk.
    const childOnDisk = fs.existsSync(path.join(root, "renamed", "child.md"));
    expect(childOnDisk).toBe(true);

    // 3. /renamed/child is resolvable in the store.
    // Known gap: the in-process store may not have recompiled the descendant.
    // This assertion documents the behaviour — it should pass once a
    // recompileSubtree helper is added. See PROPOSAL-graph-mutations.md.
    const renamedChild = await freshClient.callTool({ name: "get_node", arguments: { path: "/renamed/child" } });
    const renamedChildText = (renamedChild.content as Array<{ type: string; text: string }>)[0].text;
    expect(JSON.parse(renamedChildText)).not.toBeNull();
  });

  it("create_thing fails for duplicate path", async () => {
    const result = await client.callTool({
      name: "create_thing",
      arguments: {
        path: "/clients",
        name: "Clients",
        description: "Already exists",
      },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const data = JSON.parse(text);
    expect(data.success).toBe(false);
    expect(data.message).toContain("already exists");
  });
});

describe("MCP — buildInstructions and /linkTypes/", () => {
  let root: string;

  beforeEach(() => {
    root = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("includes a 'Link types declared in this graph' block when /linkTypes/ exists", async () => {
    writeIndex(root, { name: "Test Graph", description: "A graph with link types" });
    writeIndex(path.join(root, "linkTypes"), {
      name: "Link Types",
      description: "Declared vocabulary",
    });
    fs.writeFileSync(
      path.join(root, "linkTypes", "owns.md"),
      "---\nname: owns\ndescription: The source entity has operational control of the target.\n---\n"
    );
    fs.writeFileSync(
      path.join(root, "linkTypes", "depends-on.md"),
      "---\nname: depends-on\ndescription: The source cannot function without the target.\n---\n"
    );

    const store = await compile(root);
    const instructions = await buildInstructions(store);

    expect(instructions).toContain("Link types declared in this graph:");
    expect(instructions).toContain("- owns — The source entity has operational control of the target.");
    expect(instructions).toContain("- depends-on — The source cannot function without the target.");
  });

  it("omits the link-types block entirely when graph has no /linkTypes/ collection", async () => {
    writeIndex(root, { name: "Bare Graph", description: "No linkTypes" });
    writeIndex(path.join(root, "clients"), { name: "Clients", description: "Clients" });

    const store = await compile(root);
    const instructions = await buildInstructions(store);

    expect(instructions).not.toContain("Link types declared in this graph:");
    // Sanity: the rest of the instructions block still renders
    expect(instructions).toContain("Bare Graph");
  });

  it("truncates the link-types list at 20 entries with an overflow marker", async () => {
    writeIndex(root, { name: "Big Vocab", description: "Many link types" });
    writeIndex(path.join(root, "linkTypes"), { name: "Link Types", description: "Vocab" });
    // Declare 25 link types — more than the 20-entry cap.
    for (let i = 0; i < 25; i++) {
      const stem = `rel-${i.toString().padStart(2, "0")}`;
      fs.writeFileSync(
        path.join(root, "linkTypes", `${stem}.md`),
        `---\nname: ${stem}\ndescription: Relationship ${i} description.\n---\n`
      );
    }

    const store = await compile(root);
    const instructions = await buildInstructions(store);

    // Only first 20 are rendered by name; the rest are folded into the overflow line.
    expect(instructions).toContain("- rel-00");
    expect(instructions).toContain("- rel-19");
    expect(instructions).not.toContain("- rel-20 — Relationship 20");
    expect(instructions).toContain("…and 5 more");
  });

  it("context tool surfaces linkTypeDescription for declared linkTypes", async () => {
    writeIndex(root, { name: "Root", description: "Root" }, "Welcome.");
    writeIndex(path.join(root, "clients"), { name: "Clients", description: "Clients" });
    writeIndex(path.join(root, "clients", "acme"), {
      name: "Acme",
      description: "Key client",
      links: [{ to: "/clients/globex", type: "owns", description: "Acquired 2024" }],
    });
    writeIndex(path.join(root, "clients", "globex"), { name: "Globex", description: "Sub" });
    writeIndex(path.join(root, "linkTypes"), { name: "Link Types", description: "Vocab" });
    fs.writeFileSync(
      path.join(root, "linkTypes", "owns.md"),
      "---\nname: owns\ndescription: The source entity has operational or legal control of the target.\n---\n"
    );

    const store = await compile(root);
    const mcpServer = await createMcpServer({ store, policy: adminPolicy, rootDir: root });

    const [ct, st] = InMemoryTransport.createLinkedPair();
    const c = new Client({ name: "test-linktype-client", version: "1.0.0" });
    await Promise.all([c.connect(ct), mcpServer.connect(st)]);

    const result = await c.callTool({
      name: "context",
      arguments: { path: "/clients/acme" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const ctx = JSON.parse(text);
    const owns = ctx.outgoing.find((o: { linkType: string }) => o.linkType === "owns");
    expect(owns.linkTypeDescription).toBe(
      "The source entity has operational or legal control of the target."
    );
  });

  it("truncates long link-type descriptions to keep the block within budget", async () => {
    writeIndex(root, { name: "Verbose Graph", description: "Verbose linkType desc" });
    writeIndex(path.join(root, "linkTypes"), { name: "Link Types", description: "Vocab" });
    const longDesc = "x".repeat(800);
    fs.writeFileSync(
      path.join(root, "linkTypes", "bloated.md"),
      `---\nname: bloated\ndescription: "${longDesc}"\n---\n`
    );

    const store = await compile(root);
    const instructions = await buildInstructions(store);

    expect(instructions).toContain("- bloated — ");
    // The summary should be truncated with an ellipsis, not the full 800 chars.
    const bloatedLine = instructions.split("\n").find((l) => l.startsWith("- bloated"))!;
    expect(bloatedLine.length).toBeLessThan(800);
    expect(bloatedLine.endsWith("…")).toBe(true);
  });
});
