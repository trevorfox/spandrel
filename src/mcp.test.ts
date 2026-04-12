import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { compile } from "./compiler.js";
import { createSchema } from "./schema.js";
import { createMcpServer } from "./mcp.js";

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "spandrel-mcp-test-"));
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
    writeIndex(path.join(root, "projects", "alpha"), { name: "Alpha", description: "The alpha project" }, "Alpha is ongoing.");

    const graph = compile(root);
    const schema = createSchema(graph);
    const mcpServer = createMcpServer(schema);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: "test-client", version: "1.0.0" });
    await Promise.all([
      client.connect(clientTransport),
      mcpServer.connect(serverTransport),
    ]);
  });

  afterEach(() => {
    rmrf(root);
  });

  it("exposes exactly 8 tools", async () => {
    const result = await client.listTools();
    expect(result.tools.length).toBe(8);
    const names = result.tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "get_children",
      "get_content",
      "get_graph",
      "get_history",
      "get_node",
      "get_references",
      "search",
      "validate",
    ]);
  });

  it("get_node returns correct node data", async () => {
    const result = await client.callTool({ name: "get_node", arguments: { path: "/" } });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const node = JSON.parse(text);
    expect(node.path).toBe("/");
    expect(node.name).toBe("Root");
    expect(node.nodeType).toBe("composite");
  });

  it("get_content returns markdown body", async () => {
    const result = await client.callTool({ name: "get_content", arguments: { path: "/clients/acme" } });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("Acme details");
  });

  it("get_children returns child nodes", async () => {
    const result = await client.callTool({ name: "get_children", arguments: { path: "/" } });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const children = JSON.parse(text);
    expect(children.length).toBe(2);
  });

  it("get_references returns link edges", async () => {
    const result = await client.callTool({ name: "get_references", arguments: { path: "/clients/acme" } });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const refs = JSON.parse(text);
    expect(refs.length).toBe(1);
    expect(refs[0].to).toBe("/projects/alpha");
  });

  it("search finds nodes by query", async () => {
    const result = await client.callTool({ name: "search", arguments: { query: "alpha" } });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const results = JSON.parse(text);
    expect(results.length).toBeGreaterThan(0);
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
});
