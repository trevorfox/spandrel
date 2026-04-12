import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { graphql } from "graphql";
import { compile } from "./compiler.js";
import { createSchema } from "./schema.js";

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
    writeIndex(path.join(root, "projects", "alpha"), { name: "Project Alpha", description: "The alpha project" }, "Alpha is in progress.");
  });

  afterEach(() => {
    rmrf(root);
  });

  function query(source: string) {
    const graph = compile(root);
    const schema = createSchema(graph);
    return graphql({ schema, source });
  }

  it("node query returns correct node with name, description, nodeType", async () => {
    const result = await query(`{
      node(path: "/") {
        path
        name
        description
        nodeType
        depth
        parent
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
        children {
          path
          name
          description
        }
      }
    }`);
    expect(result.errors).toBeUndefined();
    const children = result.data!.node.children;
    expect(children.length).toBe(2);
    expect(children.map((c: { name: string }) => c.name).sort()).toEqual(["Clients", "Projects"]);
  });

  it("node query with depth=2 returns children and grandchildren paths", async () => {
    const result = await query(`{
      node(path: "/", depth: 2) {
        children {
          path
          name
          children
        }
      }
    }`);
    expect(result.errors).toBeUndefined();
    const children = result.data!.node.children;
    const clients = children.find((c: { name: string }) => c.name === "Clients");
    expect(clients).toBeDefined();
    // With depth=2, children of children should include grandchild paths
    expect(clients.children).toContain("/clients/acme");
  });

  it("node query returns links", async () => {
    const result = await query(`{
      node(path: "/clients/acme") {
        links {
          to
          type
          description
        }
      }
    }`);
    expect(result.errors).toBeUndefined();
    const links = result.data!.node.links;
    expect(links).toHaveLength(1);
    expect(links[0].to).toBe("/projects/alpha");
    expect(links[0].type).toBe("active_project");
  });

  it("content query returns full markdown body", async () => {
    const result = await query(`{
      content(path: "/clients/acme")
    }`);
    expect(result.errors).toBeUndefined();
    expect(result.data!.content).toContain("Acme Corporation is a key account");
  });

  it("content query returns null for nonexistent path", async () => {
    const result = await query(`{
      content(path: "/nonexistent")
    }`);
    expect(result.errors).toBeUndefined();
    expect(result.data!.content).toBeNull();
  });

  it("children query returns subtree names and descriptions", async () => {
    const result = await query(`{
      children(path: "/") {
        path
        name
        description
      }
    }`);
    expect(result.errors).toBeUndefined();
    expect(result.data!.children.length).toBe(2);
  });

  it("references query returns link edges from a node", async () => {
    const result = await query(`{
      references(path: "/clients/acme") {
        to
        type
        description
      }
    }`);
    expect(result.errors).toBeUndefined();
    expect(result.data!.references).toHaveLength(1);
    expect(result.data!.references[0].to).toBe("/projects/alpha");
  });

  it("search query finds nodes by name", async () => {
    const result = await query(`{
      search(query: "Acme") {
        path
        name
        description
      }
    }`);
    expect(result.errors).toBeUndefined();
    expect(result.data!.search.length).toBeGreaterThan(0);
    const acme = result.data!.search.find((r: { path: string }) => r.path === "/clients/acme");
    expect(acme).toBeDefined();
  });

  it("search query finds nodes by content and returns snippets", async () => {
    const result = await query(`{
      search(query: "key account") {
        path
        name
        snippet
      }
    }`);
    expect(result.errors).toBeUndefined();
    expect(result.data!.search.length).toBeGreaterThan(0);
    expect(result.data!.search[0].snippet).toContain("key account");
  });

  it("graph query returns nodes and edges", async () => {
    const result = await query(`{
      graph {
        nodes {
          path
          name
        }
        edges {
          from
          to
          type
        }
      }
    }`);
    expect(result.errors).toBeUndefined();
    expect(result.data!.graph.nodes.length).toBe(5);
    expect(result.data!.graph.edges.length).toBeGreaterThan(0);
  });

  it("graph query with path scopes to subtree", async () => {
    const result = await query(`{
      graph(path: "/clients", depth: 1) {
        nodes {
          path
        }
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
      validate {
        path
        type
        message
      }
    }`);
    expect(result.errors).toBeUndefined();
    // Should have at least some warnings (e.g., broken link to /people/jane)
    expect(result.data!.validate.length).toBeGreaterThan(0);
  });

  it("validate query with path scopes to that subtree", async () => {
    const result = await query(`{
      validate(path: "/clients") {
        path
        type
        message
      }
    }`);
    expect(result.errors).toBeUndefined();
    for (const w of result.data!.validate) {
      expect(w.path.startsWith("/clients")).toBe(true);
    }
  });

  it("history query returns empty array (git not wired yet)", async () => {
    const result = await query(`{
      history(path: "/") {
        hash
        date
        author
        message
      }
    }`);
    expect(result.errors).toBeUndefined();
    expect(result.data!.history).toEqual([]);
  });

  it("node query returns null for nonexistent path", async () => {
    const result = await query(`{
      node(path: "/does/not/exist") {
        path
        name
      }
    }`);
    expect(result.errors).toBeUndefined();
    expect(result.data!.node).toBeNull();
  });
});
