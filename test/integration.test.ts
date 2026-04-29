import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { compile } from "../src/compiler/compiler.js";
import { AccessPolicy } from "../src/access/policy.js";
import { createMcpServer } from "../src/server/mcp.js";
import { shapeNodeAsJson } from "../src/rest/shape.js";
import {
  resolveSearch,
  resolveGraph,
} from "../src/graph-ops.js";
import { createTempDir, writeIndex } from "./test-helpers.js";

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

function createFixture(): string {
  const root = createTempDir();

  const write = (rel: string, frontmatter: Record<string, unknown>, content = "") => {
    writeIndex(path.join(root, rel), frontmatter, content);
  };

  // Root
  write("", {
    name: "Test Graph",
    description: "A self-contained test knowledge graph",
  }, "This graph covers Primitives, Conventions, Architecture, Patterns, Skills, User Journeys, and a guide.");

  // --- Primitives collection ---
  write("primitives", {
    name: "Primitives",
    description: "Core building blocks of the system",
  }, "The fundamental concepts: Things, Collections, Tags, and Governance.");

  write("primitives/things", {
    name: "Things",
    description: "The atomic unit of knowledge",
    links: [
      { to: "/conventions/frontmatter", type: "defines" },
      { to: "/conventions/paths", type: "defines" },
    ],
  }, "A Thing is a directory with an index.md. It is the atomic unit of knowledge in the graph.");

  write("primitives/collections", {
    name: "Collections",
    description: "Things that contain other Things",
    links: [
      { to: "/primitives/things", type: "extends" },
    ],
  }, "Collections are composite nodes — directories with children.");

  write("primitives/tags", {
    name: "Tags",
    description: "Labels for cross-cutting concerns",
  }, "Tags enable filtering and deny rules.");

  write("primitives/governance", {
    name: "Governance",
    description: "Access control and policy enforcement",
    links: [
      { to: "/primitives/tags", type: "uses" },
    ],
  }, "Governance controls who sees what.");

  // --- Conventions collection ---
  write("conventions", {
    name: "Conventions",
    description: "How things are structured and named",
  }, "Conventions ensure consistency: Frontmatter and Paths.");

  write("conventions/frontmatter", {
    name: "Frontmatter",
    description: "YAML metadata at the top of every index.md",
    links: [
      { to: "/primitives/things", type: "describes" },
    ],
  }, "Every Thing requires name and description in frontmatter.");

  write("conventions/paths", {
    name: "Paths",
    description: "How Things are addressed in the graph",
    links: [
      { to: "/primitives/things", type: "describes" },
    ],
  }, "Paths are both filesystem paths and graph addresses.");

  // --- Architecture collection ---
  write("architecture", {
    name: "Architecture",
    description: "System design and technical decisions",
  }, "How the system is built: Compiler, REST, and MCP Server.");

  write("architecture/compiler", {
    name: "Compiler",
    description: "Transforms markdown files into an in-memory graph",
    links: [
      { to: "/primitives/things", type: "processes" },
      { to: "/architecture/rest", type: "feeds" },
    ],
  }, "The compiler walks the file tree, parses frontmatter, builds nodes and edges.");

  write("architecture/rest", {
    name: "REST",
    description: "The HTTP wire surface, gated by the access policy",
    links: [
      { to: "/architecture/mcp", type: "peer-of" },
    ],
  }, "REST exposes nodes as path-addressed resources. Every response routes through the access policy.");

  write("architecture/mcp", {
    name: "MCP Server",
    description: "Agent-optimized tool interface",
    links: [
      { to: "/architecture/rest", type: "peer-of" },
    ],
  }, "MCP provides 12 tools for navigation, search, and write operations.");

  // --- Patterns collection ---
  write("patterns", {
    name: "Patterns",
    description: "Reusable structural patterns",
  }, "Patterns guide how to organize knowledge: Placement, Collections, Linking, and Progressive Disclosure.");

  write("patterns/placement", {
    name: "Placement",
    description: "Where to put new Things in the graph",
  }, "Place Things near what they relate to most.");

  write("patterns/collections", {
    name: "Collections",
    description: "How to design and organize collections",
    links: [
      { to: "/primitives/collections", type: "explains" },
    ],
  }, "A collection should represent a single entity type.");

  write("patterns/linking", {
    name: "Linking",
    description: "How to create meaningful cross-references",
    links: [
      { to: "/conventions/frontmatter", type: "uses" },
    ],
  }, "Links connect related Things across the hierarchy.");

  write("patterns/progressive-disclosure", {
    name: "Progressive Disclosure",
    description: "Names orient, descriptions decide, content delivers",
    links: [
      { to: "/primitives/things", type: "applies-to" },
    ],
  }, "Read names first, descriptions to decide relevance, content when you need details.");

  // --- Skills collection ---
  write("skills", {
    name: "Skills",
    description: "Agent roles for working with the graph",
  }, "Skills define how different agents interact: Information Architect, Context Engineer, and Analyst.");

  write("skills/information-architect", {
    name: "Information Architect",
    description: "Designs and evaluates graph structure",
    links: [
      { to: "/primitives/collections", type: "manages" },
      { to: "/patterns/placement", type: "applies" },
    ],
  }, "The IA ensures structural integrity and coherent organization.");

  write("skills/context-engineer", {
    name: "Context Engineer",
    description: "Maintains content quality and completeness",
    links: [
      { to: "/primitives/things", type: "maintains" },
      { to: "/conventions/frontmatter", type: "enforces" },
    ],
  }, "The CE keeps descriptions accurate and links current.");

  write("skills/analyst", {
    name: "Analyst",
    description: "Explores and extracts insights from the graph",
    links: [
      { to: "/patterns/progressive-disclosure", type: "follows" },
    ],
  }, "The Analyst navigates the graph to answer questions.");

  // --- Guide collection ---
  write("guide", {
    name: "User Journeys",
    description: "Onboarding paths for different actors",
    links: [
      { to: "/skills", type: "references" },
    ],
  }, "Start here to understand how to use this graph. See Getting Started.");

  write("guide/getting-started", {
    name: "Getting Started",
    description: "First steps for new users",
    links: [
      { to: "/primitives/things", type: "introduces" },
      { to: "/conventions/frontmatter", type: "introduces" },
    ],
  }, "Read the root, explore collections, drill into what matters.");

  return root;
}

describe("E2E: Self-contained knowledge graph", () => {
  let root: string;
  let store: Awaited<ReturnType<typeof compile>>;

  beforeAll(async () => {
    root = createFixture();
    store = await compile(root);

    // Verify the fixture compiled as expected
    expect(store.nodeCount).toBeGreaterThan(20);
    expect(await store.getWarnings()).toHaveLength(0);
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe("REST shape — progressive disclosure navigation", () => {
    const anonymous = { tier: "anonymous" as const };

    it("can start at root and see top-level structure", async () => {
      const r = await shapeNodeAsJson(store, adminPolicy, anonymous, "/");
      expect(r).not.toBeNull();
      expect(r!.name).toBe("Test Graph");
      expect(r!.nodeType).toBe("composite");
      expect(r!.children!.length).toBe(6);

      const childNames = r!.children!.map((c) => c.name);
      expect(childNames).toContain("Primitives");
      expect(childNames).toContain("Architecture");
      expect(childNames).toContain("Conventions");
      expect(childNames).toContain("Patterns");
      expect(childNames).toContain("Skills");
      expect(childNames).toContain("User Journeys");
    });

    it("can drill into a Collection and see its children", async () => {
      const node = await shapeNodeAsJson(store, adminPolicy, anonymous, "/primitives");
      expect(node!.name).toBe("Primitives");
      const childNames = node!.children!.map((c) => c.name);
      expect(childNames).toContain("Things");
      expect(childNames).toContain("Collections");
      expect(childNames).toContain("Tags");
      expect(childNames).toContain("Governance");
    });

    it("can read full content of a leaf node with includeContent", async () => {
      const node = await shapeNodeAsJson(store, adminPolicy, anonymous, "/primitives/things", {
        includeContent: true,
      });
      expect(node!.content).toContain("atomic unit");
    });

    it("HAL _links are present on every response", async () => {
      const node = await shapeNodeAsJson(store, adminPolicy, anonymous, "/primitives/things");
      expect(node!._links.self.href).toBe("/node/primitives/things");
      expect(node!._links.parent!.href).toBe("/node/primitives");
      expect(node!._links.content!.href).toBe("/content/primitives/things");
    });
  });

  describe("REST shape — backlinks and cross-references", () => {
    const anonymous = { tier: "anonymous" as const };

    it("Things node has outgoing links to frontmatter and paths", async () => {
      const node = await shapeNodeAsJson(store, adminPolicy, anonymous, "/primitives/things");
      const targets = node!.outgoing!.map((l) => l.path);
      expect(targets).toContain("/conventions/frontmatter");
      expect(targets).toContain("/conventions/paths");
    });

    it("frontmatter has incoming backlinks from Things", async () => {
      const node = await shapeNodeAsJson(store, adminPolicy, anonymous, "/conventions/frontmatter");
      const backlinks = node!.incoming!.map((l) => l.path);
      expect(backlinks).toContain("/primitives/things");
    });
  });

  describe("graph-ops — search", () => {
    it("finds nodes by keyword with ranking", async () => {
      const results = await resolveSearch(store, "Things");
      expect(results.length).toBeGreaterThan(0);
      // Exact name match should be first
      expect(results[0].path).toBe("/primitives/things");
      expect(results[0].score).toBe(100);
    });

    it("search scoped to subtree", async () => {
      const results = await resolveSearch(store, "REST", "/architecture");
      for (const r of results) {
        expect(r.path.startsWith("/architecture")).toBe(true);
      }
    });
  });

  describe("graph-ops — graph traversal", () => {
    it("returns full graph with nodes and edges", async () => {
      const result = await resolveGraph(store, "/", 10);
      expect(result.nodes.length).toBeGreaterThan(20);
      expect(result.edges.length).toBeGreaterThan(20);
    });
  });

  describe("MCP — agent navigation on live graph", () => {
    let client: Client;

    beforeAll(async () => {
      const graph = await compile(root);
      const mcpServer = await createMcpServer({
        store: graph,
        policy: adminPolicy,
        rootDir: root,
      });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      client = new Client({ name: "e2e-test", version: "1.0.0" });
      await Promise.all([
        client.connect(clientTransport),
        mcpServer.connect(serverTransport),
      ]);
    });

    it("can navigate from root to a leaf via get_node", async () => {
      const rootResult = await client.callTool({ name: "get_node", arguments: { path: "/" } });
      const r = JSON.parse((rootResult.content as Array<{ text: string }>)[0].text);
      expect(r.name).toBe("Test Graph");

      const primitivesChild = r.children.find((c: { name: string }) => c.name === "Primitives");
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
      const result = await client.callTool({ name: "search", arguments: { query: "REST" } });
      const results = JSON.parse((result.content as Array<{ text: string }>)[0].text);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].path).toBe("/architecture/rest");
    });

    it("validate returns clean via MCP", async () => {
      const result = await client.callTool({ name: "validate", arguments: {} });
      const warnings = JSON.parse((result.content as Array<{ text: string }>)[0].text);
      expect(warnings).toHaveLength(0);
    });

    it("can discover skills via graph navigation", async () => {
      const result = await client.callTool({ name: "get_node", arguments: { path: "/skills" } });
      const skills = JSON.parse((result.content as Array<{ text: string }>)[0].text);
      expect(skills.name).toBe("Skills");
      const childNames = skills.children.map((c: { name: string }) => c.name);
      expect(childNames).toContain("Information Architect");
      expect(childNames).toContain("Context Engineer");
      expect(childNames).toContain("Analyst");
    });

    it("can discover patterns via graph navigation", async () => {
      const result = await client.callTool({ name: "get_node", arguments: { path: "/patterns" } });
      const patterns = JSON.parse((result.content as Array<{ text: string }>)[0].text);
      expect(patterns.name).toBe("Patterns");
      const childNames = patterns.children.map((c: { name: string }) => c.name);
      expect(childNames).toContain("Placement");
      expect(childNames).toContain("Collections");
      expect(childNames).toContain("Linking");
      expect(childNames).toContain("Progressive Disclosure");
    });

    it("skills have cross-references to relevant graph nodes", async () => {
      const result = await client.callTool({
        name: "context",
        arguments: { path: "/skills/information-architect" },
      });
      const ia = JSON.parse((result.content as Array<{ text: string }>)[0].text);
      expect(ia.outgoing.length).toBeGreaterThan(0);
      const outPaths = ia.outgoing.map((r: { path: string }) => r.path);
      expect(outPaths).toContain("/primitives/collections");
    });

    it("search finds skills by role name", async () => {
      const result = await client.callTool({
        name: "search",
        arguments: { query: "Context Engineer" },
      });
      const results = JSON.parse((result.content as Array<{ text: string }>)[0].text);
      const paths = results.map((r: { path: string }) => r.path);
      expect(paths).toContain("/skills/context-engineer");
    });

    it("write operations work end-to-end", async () => {
      // Create
      const createResult = await client.callTool({
        name: "create_thing",
        arguments: { path: "/guide/advanced", name: "Advanced Guide", description: "For power users" },
      });
      const created = JSON.parse((createResult.content as Array<{ text: string }>)[0].text);
      expect(created.success).toBe(true);

      // Verify it's queryable
      const nodeResult = await client.callTool({ name: "get_node", arguments: { path: "/guide/advanced" } });
      const node = JSON.parse((nodeResult.content as Array<{ text: string }>)[0].text);
      expect(node.name).toBe("Advanced Guide");

      // Update
      const updateResult = await client.callTool({
        name: "update_thing",
        arguments: { path: "/guide/advanced", description: "Updated description" },
      });
      const updated = JSON.parse((updateResult.content as Array<{ text: string }>)[0].text);
      expect(updated.success).toBe(true);

      // Delete
      const deleteResult = await client.callTool({
        name: "delete_thing",
        arguments: { path: "/guide/advanced" },
      });
      const deleted = JSON.parse((deleteResult.content as Array<{ text: string }>)[0].text);
      expect(deleted.success).toBe(true);

      // Verify gone
      const goneResult = await client.callTool({ name: "get_node", arguments: { path: "/guide/advanced" } });
      const gone = JSON.parse((goneResult.content as Array<{ text: string }>)[0].text);
      expect(gone).toBeNull();
    });
  });
});
