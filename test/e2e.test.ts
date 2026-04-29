import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { compile } from "../src/compiler/compiler.js";
import { AccessPolicy } from "../src/access/policy.js";
import { createMcpServer } from "../src/server/mcp.js";
import { createThing } from "../src/server/writer.js";

// Default-admin policy: every actor is treated as admin so the read/write
// surface can be exercised end-to-end. Per-policy gating is covered in
// test/access.test.ts.
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

/**
 * Property-based e2e tests.
 *
 * Takes an abstract knowledge definition, bootstraps a full Spandrel system
 * (writer → compiler → REST + MCP), then verifies invariants that must
 * hold for ANY valid knowledge graph:
 *
 *   STRUCTURAL: Does the system work?
 *   SEMANTIC:   Does the output reflect the input?
 *
 * The harness knows nothing about specific paths or names — all assertions
 * are derived from the input definition. The definitions themselves are
 * chosen to exercise structural edge cases, not to model real domains.
 */

// --- Knowledge definition types ---

interface KnowledgeItem {
  slug: string;
  name: string;
  description: string;
  content: string;
  links?: Array<{ to: string; type: string }>;
  keywords?: string[];
}

interface KnowledgeCollection {
  slug: string;
  name: string;
  description: string;
  items: KnowledgeItem[];
}

interface KnowledgeDefinition {
  name: string;
  description: string;
  collections: KnowledgeCollection[];
}

// --- Harness ---

function buildSystem(def: KnowledgeDefinition): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spandrel-e2e-"));

  const collectionMentions = def.collections.map((c) => c.name).join(", ");
  createThing(root, "/", {
    name: def.name,
    description: def.description,
    content: `This graph covers: ${collectionMentions}.`,
  });

  for (const col of def.collections) {
    const itemMentions = col.items.map((i) => i.name).join(", ");
    createThing(root, `/${col.slug}`, {
      name: col.name,
      description: col.description,
      content: itemMentions ? `Contains: ${itemMentions}.` : col.description,
    });

    for (const item of col.items) {
      createThing(root, `/${col.slug}/${item.slug}`, {
        name: item.name,
        description: item.description,
        content: item.content,
        links: item.links,
      });
    }
  }

  return root;
}

function allItems(def: KnowledgeDefinition): { path: string; name: string; keywords?: string[] }[] {
  const items: { path: string; name: string; keywords?: string[] }[] = [];
  for (const col of def.collections) {
    items.push({ path: `/${col.slug}`, name: col.name });
    for (const item of col.items) {
      items.push({ path: `/${col.slug}/${item.slug}`, name: item.name, keywords: item.keywords });
    }
  }
  return items;
}

function allDeclaredLinks(def: KnowledgeDefinition): Array<{ from: string; to: string }> {
  const links: Array<{ from: string; to: string }> = [];
  for (const col of def.collections) {
    for (const item of col.items) {
      if (item.links) {
        for (const link of item.links) {
          links.push({ from: `/${col.slug}/${item.slug}`, to: link.to });
        }
      }
    }
  }
  return links;
}

// --- Test runner ---

function runE2E(def: KnowledgeDefinition) {
  let root: string;
  let client: Client;
  let compiledGraph: Awaited<ReturnType<typeof compile>>;
  const items = allItems(def);
  const declaredLinks = allDeclaredLinks(def);

  describe(`E2E: ${def.name}`, () => {
    beforeAll(async () => {
      root = buildSystem(def);
      compiledGraph = await compile(root);
      const mcpServer = await createMcpServer({
        store: compiledGraph,
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

    afterAll(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });

    // ---- STRUCTURAL ----

    describe("compilation", () => {
      it("zero warnings", async () => {
        expect(await compiledGraph.getWarnings()).toHaveLength(0);
      });

      it("node count matches definition", () => {
        expect(compiledGraph.nodeCount).toBe(1 + items.length);
      });
    });

    describe("navigation", () => {
      it("root lists all collections as children", async () => {
        const result = await client.callTool({ name: "get_node", arguments: { path: "/" } });
        const r = JSON.parse((result.content as Array<{ text: string }>)[0].text);
        expect(r.name).toBe(def.name);
        const childNames = r.children.map((c: { name: string }) => c.name);
        for (const col of def.collections) {
          expect(childNames).toContain(col.name);
        }
      });

      it("every collection lists its items as children", async () => {
        for (const col of def.collections) {
          const result = await client.callTool({ name: "get_node", arguments: { path: `/${col.slug}` } });
          const node = JSON.parse((result.content as Array<{ text: string }>)[0].text);
          expect(node.name).toBe(col.name);
          const childNames = node.children.map((c: { name: string }) => c.name);
          for (const item of col.items) {
            expect(childNames).toContain(item.name);
          }
        }
      });

      it("every leaf has content", async () => {
        for (const col of def.collections) {
          for (const item of col.items) {
            const result = await client.callTool({
              name: "get_content",
              arguments: { path: `/${col.slug}/${item.slug}` },
            });
            const text = (result.content as Array<{ text: string }>)[0].text;
            expect(text.length).toBeGreaterThan(0);
          }
        }
      });
    });

    describe("links", () => {
      it("every declared link resolves to an existing node", async () => {
        for (const link of declaredLinks) {
          const result = await client.callTool({
            name: "context",
            arguments: { path: link.from },
          });
          const ctx = JSON.parse((result.content as Array<{ text: string }>)[0].text);
          const outPaths = ctx.outgoing.map((r: { path: string }) => r.path);
          expect(outPaths).toContain(link.to);
        }
      });

      it("every link produces a backlink on the target", async () => {
        for (const link of declaredLinks) {
          const result = await client.callTool({
            name: "get_references",
            arguments: { path: link.to, direction: "incoming" },
          });
          const refs = JSON.parse((result.content as Array<{ text: string }>)[0].text);
          const incomingPaths = refs.map((r: { path: string }) => r.path);
          expect(incomingPaths).toContain(link.from);
        }
      });

      it("backlinks carry the source node's name", async () => {
        for (const link of declaredLinks) {
          const fromResult = await client.callTool({ name: "context", arguments: { path: link.from } });
          const toResult = await client.callTool({ name: "context", arguments: { path: link.to } });
          const fromCtx = JSON.parse((fromResult.content as Array<{ text: string }>)[0].text);
          const toCtx = JSON.parse((toResult.content as Array<{ text: string }>)[0].text);
          const backlink = toCtx.incoming.find((r: { path: string }) => r.path === link.from);
          expect(backlink).toBeDefined();
          expect(backlink.name).toBe(fromCtx.name);
        }
      });
    });

    describe("search", () => {
      it("every node is findable by exact name", async () => {
        for (const item of items) {
          const result = await client.callTool({
            name: "search",
            arguments: { query: item.name },
          });
          const results = JSON.parse((result.content as Array<{ text: string }>)[0].text);
          const paths = results.map((r: { path: string }) => r.path);
          expect(paths).toContain(item.path);
        }
      });

      it("keyword search finds the node that defines it", async () => {
        const withKeywords = items.filter((i) => i.keywords && i.keywords.length > 0);
        for (const item of withKeywords) {
          for (const keyword of item.keywords!) {
            const result = await client.callTool({
              name: "search",
              arguments: { query: keyword },
            });
            const results = JSON.parse((result.content as Array<{ text: string }>)[0].text);
            const paths = results.map((r: { path: string }) => r.path);
            expect(paths).toContain(item.path);
          }
        }
      });

      it("scoped search only returns nodes within scope", async () => {
        for (const col of def.collections) {
          if (col.items.length === 0) continue;
          const result = await client.callTool({
            name: "search",
            arguments: { query: col.items[0].name, path: `/${col.slug}` },
          });
          const results = JSON.parse((result.content as Array<{ text: string }>)[0].text);
          for (const r of results) {
            expect(r.path.startsWith(`/${col.slug}`)).toBe(true);
          }
        }
      });
    });

    describe("graph completeness", () => {
      it("graph query returns correct counts", async () => {
        const result = await client.callTool({ name: "get_graph", arguments: {} });
        const graph = JSON.parse((result.content as Array<{ text: string }>)[0].text);
        expect(graph.nodes.length).toBe(1 + items.length);
        expect(graph.edges.length).toBeGreaterThanOrEqual(items.length);
      });

      it("validate returns zero warnings", async () => {
        const result = await client.callTool({ name: "validate", arguments: {} });
        const warnings = JSON.parse((result.content as Array<{ text: string }>)[0].text);
        expect(warnings).toHaveLength(0);
      });
    });

    describe("writes", () => {
      it("create → query → update → query → delete → confirm gone", async () => {
        const testPath = `/${def.collections[0].slug}/e2e-write-test`;

        // Create
        const cr = await client.callTool({
          name: "create_thing",
          arguments: { path: testPath, name: "Write Test", description: "Temporary node" },
        });
        expect(JSON.parse((cr.content as Array<{ text: string }>)[0].text).success).toBe(true);

        // Query
        const q1 = await client.callTool({ name: "get_node", arguments: { path: testPath } });
        expect(JSON.parse((q1.content as Array<{ text: string }>)[0].text).name).toBe("Write Test");

        // Update
        const ur = await client.callTool({
          name: "update_thing",
          arguments: { path: testPath, description: "Updated" },
        });
        expect(JSON.parse((ur.content as Array<{ text: string }>)[0].text).success).toBe(true);

        // Query again
        const q2 = await client.callTool({ name: "get_node", arguments: { path: testPath } });
        expect(JSON.parse((q2.content as Array<{ text: string }>)[0].text).description).toBe("Updated");

        // Delete
        const dr = await client.callTool({ name: "delete_thing", arguments: { path: testPath } });
        expect(JSON.parse((dr.content as Array<{ text: string }>)[0].text).success).toBe(true);

        // Gone
        const q3 = await client.callTool({ name: "get_node", arguments: { path: testPath } });
        expect(JSON.parse((q3.content as Array<{ text: string }>)[0].text)).toBeNull();
      });
    });

    // ---- SEMANTIC ----

    describe("progressive disclosure", () => {
      it("description differs from name for every leaf", async () => {
        for (const col of def.collections) {
          for (const item of col.items) {
            const result = await client.callTool({
              name: "get_node",
              arguments: { path: `/${col.slug}/${item.slug}` },
            });
            const node = JSON.parse((result.content as Array<{ text: string }>)[0].text);
            expect(node.description.length).toBeGreaterThan(0);
            expect(node.description).not.toBe(node.name);
          }
        }
      });

      it("content is longer than description for every leaf", async () => {
        for (const col of def.collections) {
          for (const item of col.items) {
            const result = await client.callTool({
              name: "context",
              arguments: { path: `/${col.slug}/${item.slug}` },
            });
            const ctx = JSON.parse((result.content as Array<{ text: string }>)[0].text);
            expect(ctx.content.length).toBeGreaterThan(ctx.description.length);
          }
        }
      });
    });
  });
}

// --- Definitions that exercise structural edge cases ---

// Minimal: one collection, one item, no links.
// Tests the simplest possible valid graph.
const minimal: KnowledgeDefinition = {
  name: "Minimal",
  description: "Smallest valid graph",
  collections: [
    {
      slug: "things",
      name: "Things",
      description: "The only collection",
      items: [
        {
          slug: "one",
          name: "One",
          description: "The only item in the only collection",
          content: "This node exists to prove a single-item graph compiles and navigates correctly.",
        },
      ],
    },
  ],
};

// Dense cross-linking: every item links to items in other collections.
// Tests backlink fan-in, bidirectional resolution, and link saturation.
const denseCrossLinks: KnowledgeDefinition = {
  name: "Dense Links",
  description: "Every node links to every other collection",
  collections: [
    {
      slug: "alpha",
      name: "Alpha",
      description: "First group",
      items: [
        {
          slug: "a1",
          name: "A1",
          description: "Links to B1, B2, and C1",
          content: "A1 is connected to everything it can reach across collections.",
          links: [
            { to: "/beta/b1", type: "related" },
            { to: "/beta/b2", type: "related" },
            { to: "/gamma/c1", type: "related" },
          ],
          keywords: ["connected", "reach"],
        },
        {
          slug: "a2",
          name: "A2",
          description: "Links back to B1 and C1",
          content: "A2 creates duplicate backlinks on B1 and C1 to test fan-in.",
          links: [
            { to: "/beta/b1", type: "related" },
            { to: "/gamma/c1", type: "related" },
          ],
          keywords: ["duplicate", "fan-in"],
        },
      ],
    },
    {
      slug: "beta",
      name: "Beta",
      description: "Second group",
      items: [
        {
          slug: "b1",
          name: "B1",
          description: "Target of multiple incoming links from Alpha",
          content: "B1 should have backlinks from both A1 and A2. Tests fan-in on a single node.",
          links: [{ to: "/alpha/a1", type: "related" }],
          keywords: ["backlinks"],
        },
        {
          slug: "b2",
          name: "B2",
          description: "Linked from A1, links to C1",
          content: "B2 sits in the middle of a chain: A1 → B2 → C1.",
          links: [{ to: "/gamma/c1", type: "chain" }],
          keywords: ["chain", "middle"],
        },
      ],
    },
    {
      slug: "gamma",
      name: "Gamma",
      description: "Third group — high fan-in target",
      items: [
        {
          slug: "c1",
          name: "C1",
          description: "Referenced by A1, A2, and B2",
          content: "C1 is the most-referenced node. It should have three incoming backlinks.",
          links: [{ to: "/alpha/a1", type: "related" }],
          keywords: ["most-referenced", "incoming"],
        },
      ],
    },
  ],
};

// Wide and shallow: many collections, one item each.
// Tests that the system scales horizontally without deep nesting.
const wideShallow: KnowledgeDefinition = {
  name: "Wide Shallow",
  description: "Many collections with one item each",
  collections: Array.from({ length: 8 }, (_, i) => ({
    slug: `col-${i}`,
    name: `Collection ${i}`,
    description: `Collection number ${i} of eight`,
    items: [
      {
        slug: "item",
        name: `Item ${i}`,
        description: `The sole item in collection ${i}`,
        content: `Content for the sole entry in collection number ${i}. Unique marker: xyzzy${i}.`,
        keywords: [`xyzzy${i}`],
        ...(i > 0
          ? { links: [{ to: `/col-${i - 1}/item`, type: "previous" }] }
          : {}),
      },
    ],
  })),
};

// --- Run all ---

runE2E(minimal);
runE2E(denseCrossLinks);
runE2E(wideShallow);
