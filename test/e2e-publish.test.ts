import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import matter from "gray-matter";
import { publish } from "../src/cli-publish.js";
import { createThing } from "../src/server/writer.js";
import type { Graph } from "../src/web/types.js";
import type { SpandrelNode } from "../src/compiler/types.js";

/**
 * E2E coverage for `spandrel publish`: compile a tmp graph to a real
 * `_site/` bundle and assert the bundle is self-contained and correctly
 * shaped. These tests stop short of booting a browser — they verify the
 * bytes on disk are what a static host needs.
 */

function mkRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "spandrel-publish-"));
}

function rmrf(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function seedGraph(root: string): void {
  createThing(root, "/", {
    name: "Publish Fixture",
    description: "E2E fixture for spandrel publish",
    content: "Contains: Things.",
  });
  createThing(root, "/things", {
    name: "Things",
    description: "A collection.",
    content: "Contains: One.",
  });
  createThing(root, "/things/one", {
    name: "One",
    description: "The only item.",
    content: "The single leaf. See /things for its parent.",
  });
}

describe("spandrel publish — graph.json + bundle", () => {
  let root: string;
  let out: string;

  beforeEach(() => {
    root = mkRoot();
    out = path.join(root, "_site");
    seedGraph(root);
  });

  afterEach(() => {
    rmrf(root);
  });

  it("writes graph.json at the bundle root with the expected shape", async () => {
    await publish(root, { out });

    const graphJsonPath = path.join(out, "graph.json");
    expect(fs.existsSync(graphJsonPath)).toBe(true);

    const raw = fs.readFileSync(graphJsonPath, "utf-8");
    const graph: Graph = JSON.parse(raw);

    expect(Array.isArray(graph.nodes)).toBe(true);
    expect(Array.isArray(graph.edges)).toBe(true);
    expect(Array.isArray(graph.linkTypes)).toBe(true);
    expect(Array.isArray(graph.warnings)).toBe(true);

    const paths = graph.nodes.map((n) => n.path).sort();
    expect(paths).toContain("/");
    expect(paths).toContain("/things");
    expect(paths).toContain("/things/one");
  });

  it("writes index.html (either bundle or placeholder)", async () => {
    const result = await publish(root, { out });
    const indexPath = path.join(out, "index.html");
    expect(fs.existsSync(indexPath)).toBe(true);

    const html = fs.readFileSync(indexPath, "utf-8");
    if (!result.wroteBundle) {
      // Agent B hasn't landed yet — placeholder must explain what to do and
      // must still point at graph.json so the data is recoverable.
      expect(html.toLowerCase()).toContain("spa bundle not built");
      expect(html).toContain("graph.json");
    } else {
      // Bundle present: index.html is whatever Vite shipped, but it must
      // contain a <base href> the publisher can later rewrite.
      expect(/<base\s+href=/i.test(html)).toBe(true);
    }
  });

  it("rewrites <base href> when --base is provided", async () => {
    const result = await publish(root, { out, base: "/my-repo/" });
    const html = fs.readFileSync(path.join(out, "index.html"), "utf-8");

    if (result.wroteBundle) {
      expect(html).toContain('<base href="/my-repo/"');
    } else {
      // Placeholder's own <base href> is rewritten to the requested base so
      // even the fallback page supports sub-path hosting.
      expect(html).toContain('<base href="/my-repo/"');
    }
  });

  it("leaves <base href=\"/\"> untouched when --base is the default", async () => {
    const result = await publish(root, { out, base: "/" });
    const html = fs.readFileSync(path.join(out, "index.html"), "utf-8");

    if (result.wroteBundle) {
      expect(html).toMatch(/<base\s+href="\/"/i);
    } else {
      expect(html).toContain('<base href="/"');
    }
  });

  it("copies CNAME from graph root when present", async () => {
    fs.writeFileSync(path.join(root, "CNAME"), "kg.example.com\n");
    await publish(root, { out });
    const cnamePath = path.join(out, "CNAME");
    expect(fs.existsSync(cnamePath)).toBe(true);
    expect(fs.readFileSync(cnamePath, "utf-8")).toContain("kg.example.com");
  });

  it("does not create CNAME when the source is absent", async () => {
    await publish(root, { out });
    expect(fs.existsSync(path.join(out, "CNAME"))).toBe(false);
  });

  it("emits per-node `.md` and `.json` sibling files for every node", async () => {
    await publish(root, { out });

    // Leaf node at /things/one → siblings at _site/things/one.{md,json}
    const leafMd = path.join(out, "things", "one.md");
    const leafJson = path.join(out, "things", "one.json");
    expect(fs.existsSync(leafMd)).toBe(true);
    expect(fs.existsSync(leafJson)).toBe(true);

    // Composite collection at /things → siblings at _site/things.{md,json}
    const collectionMd = path.join(out, "things.md");
    const collectionJson = path.join(out, "things.json");
    expect(fs.existsSync(collectionMd)).toBe(true);
    expect(fs.existsSync(collectionJson)).toBe(true);

    // Root node at / → siblings at _site/.md and _site/.json
    expect(fs.existsSync(path.join(out, ".md"))).toBe(true);
    expect(fs.existsSync(path.join(out, ".json"))).toBe(true);
  });

  it("sibling .md parses back to the node's name/description via gray-matter", async () => {
    await publish(root, { out });

    const leafMd = fs.readFileSync(path.join(out, "things", "one.md"), "utf-8");
    const parsed = matter(leafMd);
    expect(parsed.data.name).toBe("One");
    expect(parsed.data.description).toBe("The only item.");
    expect(parsed.content).toContain("The single leaf");
  });

  it("sibling .json is the full node object", async () => {
    await publish(root, { out });

    const leafJson: SpandrelNode = JSON.parse(
      fs.readFileSync(path.join(out, "things", "one.json"), "utf-8")
    );
    expect(leafJson.path).toBe("/things/one");
    expect(leafJson.name).toBe("One");
    expect(leafJson.description).toBe("The only item.");
    expect(typeof leafJson.content).toBe("string");
    // Full node shape is present.
    expect(leafJson).toHaveProperty("frontmatter");
    expect(leafJson).toHaveProperty("nodeType");
    expect(leafJson).toHaveProperty("depth");
  });
});

describe("spandrel publish — --strip-private", () => {
  let root: string;
  let out: string;

  beforeEach(() => {
    root = mkRoot();
    out = path.join(root, "_site");
  });

  afterEach(() => {
    rmrf(root);
  });

  it("strips nodes the anonymous public actor cannot reach", async () => {
    createThing(root, "/", {
      name: "Gated Graph",
      description: "Tests strip-private behavior",
      content: "Contains: Public, Private.",
    });
    createThing(root, "/public", {
      name: "Public",
      description: "Visible to everyone",
      content: "Anyone can see this.",
    });
    createThing(root, "/private", {
      name: "Private",
      description: "Gated to admin role only",
      content: "Sensitive.",
    });

    // Access config: only /public/** is public; /private/** requires admin.
    fs.mkdirSync(path.join(root, "_access"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "_access", "config.yaml"),
      [
        "roles:",
        "  admin:",
        "    members: [\"jane@company.com\"]",
        "  public:",
        "    default: true",
        "policies:",
        "  admin:",
        "    paths: [\"/**\"]",
        "    access_level: traverse",
        "    operations: [read, write, admin]",
        "  public:",
        "    paths: [\"/\", \"/public/**\"]",
        "    access_level: description",
        "    operations: [read]",
        "",
      ].join("\n")
    );

    await publish(root, { out });

    const graph: Graph = JSON.parse(
      fs.readFileSync(path.join(out, "graph.json"), "utf-8")
    );
    const paths = graph.nodes.map((n) => n.path);
    expect(paths).toContain("/public");
    expect(paths).not.toContain("/private");

    // Edges into or out of /private must have been dropped along with the node.
    for (const edge of graph.edges) {
      expect(edge.from).not.toBe("/private");
      expect(edge.to).not.toBe("/private");
    }
  });

  it("leaves every node intact when --no-strip-private is requested", async () => {
    createThing(root, "/", {
      name: "Ungated",
      description: "No access config",
      content: "Everything visible.",
    });
    createThing(root, "/leaf", {
      name: "Leaf",
      description: "A leaf",
      content: "Leaf content.",
    });

    await publish(root, { out, stripPrivate: false });

    const graph: Graph = JSON.parse(
      fs.readFileSync(path.join(out, "graph.json"), "utf-8")
    );
    const paths = graph.nodes.map((n) => n.path).sort();
    expect(paths).toContain("/");
    expect(paths).toContain("/leaf");
  });
});
