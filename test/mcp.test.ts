import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { compile } from "../src/compiler/compiler.js";
import { createSchema } from "../src/schema/schema.js";
import { createMcpServer } from "../src/server/mcp.js";
import { createTempDir, writeIndex } from "./test-helpers.js";

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

    const graph = compile(root);
    const schema = createSchema(graph, { rootDir: root });
    const mcpServer = createMcpServer(schema, { graph });

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

  it("exposes exactly 11 tools", async () => {
    const result = await client.listTools();
    expect(result.tools.length).toBe(11);
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
      "search",
      "update_thing",
      "validate",
    ]);
  });

  it("server provides instructions with graph metadata", async () => {
    // The server info should include instructions derived from the graph
    const info = client.getServerCapabilities();
    // We can't directly access instructions from client API, but we can verify
    // the server was created with instructions by creating a fresh connection
    const graph2 = compile(root);
    const schema2 = createSchema(graph2, { rootDir: root });
    const mcpServer2 = createMcpServer(schema2, { graph: graph2 });

    const [ct, st] = InMemoryTransport.createLinkedPair();
    const client2 = new Client({ name: "test-client-2", version: "1.0.0" });
    await Promise.all([
      client2.connect(ct),
      mcpServer2.connect(st),
    ]);

    // The server version and name should be accessible
    const info2 = client2.getServerVersion();
    expect(info2?.name).toBe("spandrel");

    // Verify instructions are set by checking the server's initialize response
    // The MCP SDK exposes instructions via getInstructions() on the client
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

  it("delete_thing removes a node", async () => {
    const result = await client.callTool({
      name: "delete_thing",
      arguments: { path: "/projects/alpha" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const data = JSON.parse(text);
    expect(data.success).toBe(true);

    // Verify it's gone
    const nodeResult = await client.callTool({
      name: "get_node",
      arguments: { path: "/projects/alpha" },
    });
    const nodeText = (nodeResult.content as Array<{ type: string; text: string }>)[0].text;
    expect(JSON.parse(nodeText)).toBeNull();
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
