import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { graphql } from "graphql";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { compile } from "./compiler.js";
import { createSchema } from "./schema.js";
import { createMcpServer } from "./mcp.js";
import type { GraphQLSchema } from "graphql";

/**
 * End-to-end tests running Spandrel on itself.
 * The repo IS a Spandrel instance — these tests compile the actual
 * repo content and query it through GraphQL and MCP.
 */

const ROOT_DIR = path.resolve(import.meta.dirname, "..");

describe("E2E: Spandrel on Spandrel", () => {
  let schema: GraphQLSchema;

  beforeAll(() => {
    const graph = compile(ROOT_DIR);
    schema = createSchema(graph);

    expect(graph.nodes.size).toBeGreaterThan(20);
    expect(graph.warnings).toHaveLength(0);
  });

  describe("GraphQL — progressive disclosure navigation", () => {
    it("can start at root and see top-level structure", async () => {
      const result = await graphql({
        schema,
        source: `{
          node(path: "/") {
            name description nodeType
            children { path name description }
          }
        }`,
      });
      expect(result.errors).toBeUndefined();
      const root = result.data!.node;
      expect(root.name).toBe("Spandrel");
      expect(root.nodeType).toBe("composite");
      expect(root.children.length).toBeGreaterThanOrEqual(6);

      const childNames = root.children.map((c: { name: string }) => c.name);
      expect(childNames).toContain("Philosophy");
      expect(childNames).toContain("Primitives");
      expect(childNames).toContain("Architecture");
      expect(childNames).toContain("Interfaces");
      expect(childNames).toContain("Conventions");
      expect(childNames).toContain("User Journeys");
    });

    it("can drill into a Collection and see its children", async () => {
      const result = await graphql({
        schema,
        source: `{
          node(path: "/primitives") {
            name description
            children { path name description }
          }
        }`,
      });
      expect(result.errors).toBeUndefined();
      const node = result.data!.node;
      expect(node.name).toBe("Primitives");
      const childNames = node.children.map((c: { name: string }) => c.name);
      expect(childNames).toContain("Things");
      expect(childNames).toContain("Collections");
      expect(childNames).toContain("Tags");
      expect(childNames).toContain("Governance");
    });

    it("can read full content of a leaf node", async () => {
      const result = await graphql({
        schema,
        source: `{ content(path: "/primitives/things") }`,
      });
      expect(result.errors).toBeUndefined();
      expect(result.data!.content).toContain("atomic unit of knowledge");
    });

    it("can get node with content inline", async () => {
      const result = await graphql({
        schema,
        source: `{
          node(path: "/primitives/things", includeContent: true) {
            name content
          }
        }`,
      });
      expect(result.errors).toBeUndefined();
      expect(result.data!.node.content).toContain("atomic unit");
    });
  });

  describe("GraphQL — backlinks and cross-references", () => {
    it("Things node has outgoing links to frontmatter and paths", async () => {
      const result = await graphql({
        schema,
        source: `{
          node(path: "/primitives/things") {
            links { to type }
          }
        }`,
      });
      expect(result.errors).toBeUndefined();
      const targets = result.data!.node.links.map((l: { to: string }) => l.to);
      expect(targets).toContain("/conventions/frontmatter");
      expect(targets).toContain("/conventions/paths");
    });

    it("frontmatter has incoming backlinks from Things", async () => {
      const result = await graphql({
        schema,
        source: `{
          node(path: "/conventions/frontmatter") {
            referencedBy { to type }
          }
        }`,
      });
      expect(result.errors).toBeUndefined();
      const backlinks = result.data!.node.referencedBy;
      expect(backlinks.some((b: { to: string }) => b.to === "/primitives/things")).toBe(true);
    });

    it("context query returns full picture with named references", async () => {
      const result = await graphql({
        schema,
        source: `{
          context(path: "/interfaces/mcp") {
            name content
            outgoing { path name linkType }
            incoming { path name linkType }
          }
        }`,
      });
      expect(result.errors).toBeUndefined();
      const ctx = result.data!.context;
      expect(ctx.name).toBe("MCP Server");
      // Outgoing: MCP wraps GraphQL
      const graphqlRef = ctx.outgoing.find((r: { path: string }) => r.path === "/interfaces/graphql");
      expect(graphqlRef).toBeDefined();
      expect(graphqlRef.name).toBe("GraphQL"); // Rich reference includes name
      // Incoming: user journeys reference MCP
      expect(ctx.incoming.length).toBeGreaterThan(0);
    });

    it("references query with direction=both works", async () => {
      const result = await graphql({
        schema,
        source: `{
          references(path: "/interfaces/graphql", direction: both) {
            path name direction
          }
        }`,
      });
      expect(result.errors).toBeUndefined();
      const refs = result.data!.references;
      expect(refs.some((r: { direction: string }) => r.direction === "outgoing")).toBe(true);
      expect(refs.some((r: { direction: string }) => r.direction === "incoming")).toBe(true);
    });
  });

  describe("GraphQL — search", () => {
    it("finds nodes by keyword with ranking", async () => {
      const result = await graphql({
        schema,
        source: `{
          search(query: "Things") {
            path name score
          }
        }`,
      });
      expect(result.errors).toBeUndefined();
      const results = result.data!.search;
      expect(results.length).toBeGreaterThan(0);
      // Exact name match should be first
      expect(results[0].path).toBe("/primitives/things");
      expect(results[0].score).toBe(100);
    });

    it("search scoped to subtree", async () => {
      const result = await graphql({
        schema,
        source: `{
          search(query: "GraphQL", path: "/interfaces") {
            path name
          }
        }`,
      });
      expect(result.errors).toBeUndefined();
      for (const r of result.data!.search) {
        expect(r.path.startsWith("/interfaces")).toBe(true);
      }
    });
  });

  describe("GraphQL — graph and validation", () => {
    it("returns full graph with nodes and edges", async () => {
      const result = await graphql({
        schema,
        source: `{
          graph {
            nodes { path name nodeType }
            edges { from to type }
          }
        }`,
      });
      expect(result.errors).toBeUndefined();
      expect(result.data!.graph.nodes.length).toBeGreaterThan(20);
      expect(result.data!.graph.edges.length).toBeGreaterThan(50);
    });

    it("reports zero warnings for the reference instance", async () => {
      const result = await graphql({
        schema,
        source: `{ validate { path type message } }`,
      });
      expect(result.errors).toBeUndefined();
      expect(result.data!.validate).toHaveLength(0);
    });
  });

  describe("MCP — agent navigation on live graph", () => {
    let client: Client;

    beforeAll(async () => {
      const graph = compile(ROOT_DIR);
      const mcpSchema = createSchema(graph);
      const mcpServer = createMcpServer(mcpSchema);
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      client = new Client({ name: "e2e-test", version: "1.0.0" });
      await Promise.all([
        client.connect(clientTransport),
        mcpServer.connect(serverTransport),
      ]);
    });

    it("can navigate from root to a leaf via get_node", async () => {
      const rootResult = await client.callTool({ name: "get_node", arguments: { path: "/" } });
      const root = JSON.parse((rootResult.content as Array<{ text: string }>)[0].text);
      expect(root.name).toBe("Spandrel");

      const primitivesChild = root.children.find((c: { name: string }) => c.name === "Primitives");
      expect(primitivesChild).toBeDefined();

      const primResult = await client.callTool({ name: "get_node", arguments: { path: primitivesChild.path } });
      const primitives = JSON.parse((primResult.content as Array<{ text: string }>)[0].text);
      expect(primitives.children.length).toBe(4);
    });

    it("can get full context in one call", async () => {
      const result = await client.callTool({ name: "context", arguments: { path: "/primitives/things" } });
      const ctx = JSON.parse((result.content as Array<{ text: string }>)[0].text);
      expect(ctx.name).toBe("Things");
      expect(ctx.content).toContain("atomic unit");
      expect(ctx.outgoing.length).toBeGreaterThan(0);
      expect(ctx.incoming.length).toBeGreaterThan(0);
      // Incoming refs include the source node's name
      expect(ctx.incoming[0].name).toBeDefined();
      expect(ctx.incoming[0].name.length).toBeGreaterThan(0);
    });

    it("can discover backlinks via get_references", async () => {
      const result = await client.callTool({
        name: "get_references",
        arguments: { path: "/conventions/frontmatter", direction: "incoming" },
      });
      const refs = JSON.parse((result.content as Array<{ text: string }>)[0].text);
      expect(refs.some((r: { path: string }) => r.path === "/primitives/things")).toBe(true);
    });

    it("can search and find results ranked by relevance", async () => {
      const result = await client.callTool({ name: "search", arguments: { query: "GraphQL" } });
      const results = JSON.parse((result.content as Array<{ text: string }>)[0].text);
      expect(results.length).toBeGreaterThan(0);
      // The exact name match should rank highest
      expect(results[0].path).toBe("/interfaces/graphql");
    });

    it("validate returns clean via MCP", async () => {
      const result = await client.callTool({ name: "validate", arguments: {} });
      const warnings = JSON.parse((result.content as Array<{ text: string }>)[0].text);
      expect(warnings).toHaveLength(0);
    });
  });
});
