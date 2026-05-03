import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { compile } from "../src/compiler/compiler.js";
import { AccessPolicy } from "../src/access/policy.js";
import { createRestRouter } from "../src/rest/router.js";
import { createNodeAdapter } from "../src/rest/node-adapter.js";
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

const partnerPolicy = new AccessPolicy({
  roles: {
    "partner-a": { members: ["alice@partner.com"] },
    public: { default: true },
  },
  policies: {
    "partner-a": {
      paths: ["/clients/acme/**"],
      access_level: "content",
      operations: ["read"],
    },
    public: {
      paths: ["/guide/**"],
      access_level: "description",
      operations: ["read"],
    },
  },
});

interface Harness {
  server: Server;
  baseUrl: string;
  close: () => Promise<void>;
}

async function startHarness(rootDir: string, policy: AccessPolicy): Promise<Harness> {
  const store = await compile(rootDir);
  const router = createNodeAdapter(createRestRouter({ store, policy, rootDir }));
  const server = createServer(async (req, res) => {
    if (await router(req, res)) return;
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe("REST — wire surface", () => {
  let root: string;
  let harness: Harness;

  beforeAll(async () => {
    root = createTempDir();
    writeIndex(root, { name: "Root", description: "The root" }, "Welcome.");
    writeIndex(path.join(root, "clients"), { name: "Clients", description: "Clients" });
    writeIndex(path.join(root, "clients", "acme"), {
      name: "Acme Corp",
      description: "Key client",
      links: [{ to: "/projects/alpha", type: "active_project" }],
    }, "Acme details.");
    writeIndex(path.join(root, "projects"), { name: "Projects", description: "Projects" });
    writeIndex(path.join(root, "projects", "alpha"), {
      name: "Alpha",
      description: "The alpha project",
    }, "Alpha is ongoing.");
    writeIndex(path.join(root, "linkTypes"), { name: "Link Types", description: "Vocab" });
    fs.writeFileSync(
      path.join(root, "linkTypes", "active_project.md"),
      "---\nname: active_project\ndescription: A live engagement.\n---\n"
    );

    harness = await startHarness(root, adminPolicy);
  });

  afterAll(async () => {
    await harness.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe("GET /node/{...path}", () => {
    it("returns the root node with HAL _links", async () => {
      const r = await fetch(`${harness.baseUrl}/node`);
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body.path).toBe("/");
      expect(body.name).toBe("Root");
      expect(body._links.self.href).toBe("/node");
      expect(body._links.children.href).toBe("/graph?root=%2F&depth=1");
    });

    it("returns a nested node with parent and content links", async () => {
      const r = await fetch(`${harness.baseUrl}/node/clients/acme`);
      const body = await r.json();
      expect(body.path).toBe("/clients/acme");
      expect(body._links.parent.href).toBe("/node/clients");
      expect(body._links.content.href).toBe("/content/clients/acme");
    });

    it("embeds children at requested depth", async () => {
      const r = await fetch(`${harness.baseUrl}/node?depth=1`);
      const body = await r.json();
      const childNames = body.children.map((c: { name: string }) => c.name);
      expect(childNames).toContain("Clients");
      expect(childNames).toContain("Projects");
    });

    it("embeds content with includeContent=true", async () => {
      const r = await fetch(`${harness.baseUrl}/node/clients/acme?includeContent=true`);
      const body = await r.json();
      expect(body.content).toContain("Acme details");
    });

    it("returns 404 for nonexistent node", async () => {
      const r = await fetch(`${harness.baseUrl}/node/does/not/exist`);
      expect(r.status).toBe(404);
    });

    it("rejects depth above the maximum", async () => {
      const r = await fetch(`${harness.baseUrl}/node?depth=99`);
      expect(r.status).toBe(400);
    });
  });

  describe("GET /content/{...path}", () => {
    it("returns the markdown body", async () => {
      const r = await fetch(`${harness.baseUrl}/content/clients/acme`);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toContain("text/markdown");
      const body = await r.text();
      expect(body).toContain("Acme details");
    });

    it("returns 404 for nonexistent path", async () => {
      const r = await fetch(`${harness.baseUrl}/content/does/not/exist`);
      expect(r.status).toBe(404);
    });
  });

  describe("GET /graph", () => {
    it("returns nodes and edges as a subgraph", async () => {
      const r = await fetch(`${harness.baseUrl}/graph`);
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body.nodes.length).toBeGreaterThan(3);
      expect(body.edges.length).toBeGreaterThan(0);
      expect(body._links.self.href).toContain("/graph?root=");
      // Each node carries a self href.
      for (const node of body.nodes) {
        expect(node._links.self.href).toMatch(/^\/node/);
      }
    });

    it("scopes by root", async () => {
      const r = await fetch(`${harness.baseUrl}/graph?root=/clients&depth=1`);
      const body = await r.json();
      const paths = body.nodes.map((n: { path: string }) => n.path);
      expect(paths).toContain("/clients");
      expect(paths).toContain("/clients/acme");
      expect(paths).not.toContain("/projects");
    });
  });

  describe("includeNonNavigable", () => {
    let companionRoot: string;
    let companionHarness: Harness;

    beforeAll(async () => {
      companionRoot = createTempDir();
      writeIndex(companionRoot, { name: "Root", description: "Root" });
      writeIndex(path.join(companionRoot, "clients"), {
        name: "Clients",
        description: "Clients",
      });
      writeIndex(path.join(companionRoot, "clients", "acme"), {
        name: "Acme",
        description: "Test client",
      });
      fs.writeFileSync(
        path.join(companionRoot, "clients", "acme", "SKILL.md"),
        "---\ndescription: Acme skill\n---\nFollow /clients/acme for context.\n"
      );
      companionHarness = await startHarness(companionRoot, adminPolicy);
    });

    afterAll(async () => {
      await companionHarness.close();
      fs.rmSync(companionRoot, { recursive: true, force: true });
    });

    it("excludes companion documents from default /graph traversal", async () => {
      const r = await fetch(`${companionHarness.baseUrl}/graph?root=/&depth=10`);
      const body = await r.json();
      const paths = body.nodes.map((n: { path: string }) => n.path);
      expect(paths).toContain("/clients/acme");
      expect(paths).not.toContain("/clients/acme/SKILL");
    });

    it("surfaces companion documents when includeNonNavigable=true", async () => {
      const r = await fetch(
        `${companionHarness.baseUrl}/graph?root=/&depth=10&includeNonNavigable=true`
      );
      const body = await r.json();
      const paths = body.nodes.map((n: { path: string }) => n.path);
      expect(paths).toContain("/clients/acme/SKILL");
    });

    it("excludes companion documents from default /node children", async () => {
      const r = await fetch(`${companionHarness.baseUrl}/node/clients/acme?depth=1`);
      const body = await r.json();
      const childPaths = (body.children ?? []).map((c: { path: string }) => c.path);
      expect(childPaths).not.toContain("/clients/acme/SKILL");
    });

    it("includes companion documents in /node when includeNonNavigable=true", async () => {
      const r = await fetch(
        `${companionHarness.baseUrl}/node/clients/acme?depth=1&includeNonNavigable=true`
      );
      const body = await r.json();
      const childPaths = (body.children ?? []).map((c: { path: string }) => c.path);
      expect(childPaths).toContain("/clients/acme/SKILL");
    });

    it("companion documents are addressable directly even by default", async () => {
      const r = await fetch(`${companionHarness.baseUrl}/node/clients/acme/SKILL`);
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body.path).toBe("/clients/acme/SKILL");
    });
  });

  describe("GET /search", () => {
    it("returns ranked results", async () => {
      const r = await fetch(`${harness.baseUrl}/search?q=Alpha`);
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body.results.length).toBeGreaterThan(0);
      expect(body.results[0].path).toBe("/projects/alpha");
    });

    it("requires q parameter", async () => {
      const r = await fetch(`${harness.baseUrl}/search`);
      expect(r.status).toBe(400);
    });

    it("scopes to a subtree", async () => {
      const r = await fetch(`${harness.baseUrl}/search?q=Alpha&path=/projects`);
      const body = await r.json();
      for (const result of body.results) {
        expect(result.path.startsWith("/projects")).toBe(true);
      }
    });
  });

  describe("GET /linkTypes", () => {
    it("returns the declared vocabulary", async () => {
      const r = await fetch(`${harness.baseUrl}/linkTypes`);
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body.linkTypes.length).toBeGreaterThan(0);
      const names = body.linkTypes.map((lt: { name: string }) => lt.name);
      expect(names).toContain("active_project");
    });
  });

  describe("PUT /node/{...path}", () => {
    it("creates a new node", async () => {
      const r = await fetch(`${harness.baseUrl}/node/people`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "People", description: "All people" }),
      });
      expect(r.status).toBe(201);
      const body = await r.json();
      expect(body.success).toBe(true);
      expect(body.path).toBe("/people");

      // Node is now reachable.
      const get = await fetch(`${harness.baseUrl}/node/people`);
      const node = await get.json();
      expect(node.name).toBe("People");
    });

    it("updates an existing node", async () => {
      const r = await fetch(`${harness.baseUrl}/node/clients/acme`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Updated key client" }),
      });
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body.success).toBe(true);
    });
  });

  describe("DELETE /node/{...path}", () => {
    it("deletes a node", async () => {
      // Create then delete.
      await fetch(`${harness.baseUrl}/node/transient`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Transient", description: "Doomed" }),
      });
      const r = await fetch(`${harness.baseUrl}/node/transient`, { method: "DELETE" });
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body.success).toBe(true);

      const get = await fetch(`${harness.baseUrl}/node/transient`);
      expect(get.status).toBe(404);
    });
  });
});

// --- Three-tier actor extraction ----------------------------------------

describe("REST — actor extraction and gating", () => {
  let root: string;
  let harness: Harness;

  beforeAll(async () => {
    root = createTempDir();
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "clients"), { name: "Clients", description: "Clients" });
    writeIndex(path.join(root, "clients", "acme"), {
      name: "Acme",
      description: "Key client",
    }, "Acme details.");
    writeIndex(path.join(root, "guide"), {
      name: "Guide",
      description: "Public guide",
    }, "Guide content.");

    harness = await startHarness(root, partnerPolicy);
  });

  afterAll(async () => {
    await harness.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("anonymous actor sees public-only nodes", async () => {
    const r = await fetch(`${harness.baseUrl}/node/clients/acme`);
    expect(r.status).toBe(404);
  });

  it("anonymous actor sees /guide at description level", async () => {
    const r = await fetch(`${harness.baseUrl}/node/guide`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.name).toBe("Guide");
    expect(body._links.content).toBeUndefined();
  });

  it("identified actor (X-Identity-Email) gains scoped access", async () => {
    const r = await fetch(`${harness.baseUrl}/node/clients/acme`, {
      headers: { "X-Identity-Email": "alice@partner.com" },
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.name).toBe("Acme");
    expect(body._links.content).toBeDefined();
  });

  it("identified actor cannot write (read-only role)", async () => {
    const r = await fetch(`${harness.baseUrl}/node/clients/acme/note`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Identity-Email": "alice@partner.com",
      },
      body: JSON.stringify({ name: "Note", description: "should be denied" }),
    });
    expect(r.status).toBe(403);
  });

  it("anonymous write attempt is denied", async () => {
    const r = await fetch(`${harness.baseUrl}/node/anywhere`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nope", description: "should be denied" }),
    });
    expect(r.status).toBe(403);
  });

  it("authenticated bearer token routes through that tier", async () => {
    // The fixture does not grant a role to bearer tokens, so writes still
    // deny — but the request must be parsed as authenticated.
    const r = await fetch(`${harness.baseUrl}/node/something`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer some-token",
      },
      body: JSON.stringify({ name: "x", description: "x" }),
    });
    expect(r.status).toBe(403);
  });
});
