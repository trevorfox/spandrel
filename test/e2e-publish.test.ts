import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

describe("spandrel publish — --static prerender", () => {
  let root: string;
  let out: string;

  beforeEach(() => {
    root = mkRoot();
    out = path.join(root, "_site");
    createThing(root, "/", {
      name: "Prerender Fixture",
      description: "E2E fixture for --static",
      content: "# Welcome\n\nContains: [Clients](/clients).",
    });
    createThing(root, "/clients", {
      name: "Clients",
      description: "Client collection",
      content: "Collection of clients. See [Acme](/clients/acme-corp).",
    });
    createThing(root, "/clients/acme-corp", {
      name: "Acme Corp",
      description: "Flagship client account",
      content: "## About\n\nAcme is a customer.",
    });
  });

  afterEach(() => {
    rmrf(root);
  });

  it("emits _site/clients/acme-corp/index.html with baked body, meta, and JSON-LD", async () => {
    await publish(root, { out, static: true });
    const page = path.join(out, "clients/acme-corp/index.html");
    expect(fs.existsSync(page)).toBe(true);

    const html = fs.readFileSync(page, "utf-8");

    expect(html).toContain("<title>Acme Corp — Prerender Fixture</title>");
    expect(html).toMatch(
      /<meta[^>]*name="description"[^>]*content="Flagship client account"/
    );
    expect(html).toMatch(
      /<link[^>]*rel="canonical"[^>]*href="\/clients\/acme-corp\/"/
    );
    expect(html).toContain('<meta property="og:title" content="Acme Corp"');
    expect(html).toContain('<meta property="og:type" content="article"');
    expect(html).toContain('<meta name="twitter:card" content="summary"');

    // Prerendered body block with heading and rendered content
    expect(html).toContain('id="prerender-content"');
    expect(html).toContain("<h1>Acme Corp</h1>");
    expect(html).toMatch(/<h2[^>]*>About<\/h2>/);

    // SPA hydration target
    expect(html).toContain('id="app"');

    // JSON-LD is present, valid JSON, and has the required fields
    const match = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
    );
    expect(match).toBeTruthy();
    const ld = JSON.parse(match![1]);
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("CreativeWork");
    expect(ld.name).toBe("Acme Corp");
    expect(ld.isPartOf).toEqual({ "@id": "/clients/" });
  });

  it("emits hasPart on composite nodes", async () => {
    await publish(root, { out, static: true });
    const page = path.join(out, "clients/index.html");
    const html = fs.readFileSync(page, "utf-8");
    const match = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
    );
    const ld = JSON.parse(match![1]);
    expect(ld["@type"]).toBe("Collection");
    expect(ld.hasPart).toEqual([{ "@id": "/clients/acme-corp/" }]);
  });

  it("replaces the SPA shell at _site/index.html with the root node's prerender", async () => {
    await publish(root, { out, static: true });
    const html = fs.readFileSync(path.join(out, "index.html"), "utf-8");
    expect(html).toContain("<title>Prerender Fixture</title>");
    expect(html).toContain('id="prerender-content"');
    // The root page intentionally omits its H1 — the site-banner already
    // renders the root name, and repeating it as an H1 produces a visible
    // "Name / Name" stutter. Crawlers still get a strong <title> and
    // JSON-LD name. For non-root pages the H1 is kept (tested elsewhere).
    expect(html).toContain('<header id="site-banner"');
    expect(html).toContain('class="site-banner-name">Prerender Fixture</span>');
  });

  it("respects --base when rewriting canonical URLs and internal links", async () => {
    await publish(root, { out, static: true, base: "/my-repo/" });
    const html = fs.readFileSync(
      path.join(out, "clients/acme-corp/index.html"),
      "utf-8"
    );
    expect(html).toContain('<base href="/my-repo/"');
    expect(html).toMatch(
      /<link[^>]*rel="canonical"[^>]*href="\/my-repo\/clients\/acme-corp\/"/
    );
    // Internal markdown links in the body render as real URLs, not hash fragments.
    const rootHtml = fs.readFileSync(path.join(out, "index.html"), "utf-8");
    expect(rootHtml).toContain('href="/my-repo/clients/"');
    expect(rootHtml).not.toContain('href="#/clients"');
  });

  it("emits absolute URLs when --site-url is provided", async () => {
    await publish(root, {
      out,
      static: true,
      siteUrl: "https://example.com",
    });
    const html = fs.readFileSync(
      path.join(out, "clients/acme-corp/index.html"),
      "utf-8"
    );
    expect(html).toMatch(
      /<link[^>]*rel="canonical"[^>]*href="https:\/\/example\.com\/clients\/acme-corp\/"/
    );
    const ld = JSON.parse(
      html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]
    );
    expect(ld.url).toBe("https://example.com/clients/acme-corp/");
    expect(ld.isPartOf).toEqual({ "@id": "https://example.com/clients/" });
  });

  it("does not emit per-node files when --static is not set", async () => {
    await publish(root, { out });
    expect(fs.existsSync(path.join(out, "clients/acme-corp/index.html"))).toBe(
      false
    );
    // Root index.html is the SPA shell, not a prerender.
    const rootHtml = fs.readFileSync(path.join(out, "index.html"), "utf-8");
    expect(rootHtml).not.toContain('id="prerender-content"');
  });

  it("projects typed link edges through the schemaOrg predicate whitelist", async () => {
    // Seed a linkType node with a legal schemaOrg mapping.
    fs.mkdirSync(path.join(root, "linkTypes"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "linkTypes/equivalent-to.md"),
      [
        "---",
        "name: equivalent-to",
        "description: External canonical equivalents",
        "schemaOrg: sameAs",
        "---",
        "",
      ].join("\n")
    );
    // Target node under a new collection.
    createThing(root, "/people", {
      name: "People",
      description: "People collection",
      content: "",
    });
    createThing(root, "/people/alice", {
      name: "Alice",
      description: "Person",
      content: "",
    });
    // Rewrite acme-corp as a leaf .md with a typed frontmatter link using our linkType.
    fs.rmSync(path.join(root, "clients/acme-corp"), { recursive: true, force: true });
    fs.writeFileSync(
      path.join(root, "clients/acme-corp.md"),
      [
        "---",
        "name: Acme Corp",
        "description: Flagship client account",
        "links:",
        "  - to: /people/alice",
        "    type: equivalent-to",
        "---",
        "## About",
        "",
        "Acme is a customer.",
        "",
      ].join("\n")
    );

    await publish(root, { out, static: true });
    const html = fs.readFileSync(
      path.join(out, "clients/acme-corp/index.html"),
      "utf-8"
    );
    const ld = JSON.parse(
      html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]
    );
    expect(ld.sameAs).toEqual([{ "@id": "/people/alice/" }]);
  });

  it("falls back to mentions and warns when a linkType's schemaOrg is not in the whitelist", async () => {
    fs.mkdirSync(path.join(root, "linkTypes"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "linkTypes/bogus.md"),
      [
        "---",
        "name: bogus",
        "description: Has a bad mapping",
        "schemaOrg: notARealThing",
        "---",
        "",
      ].join("\n")
    );
    createThing(root, "/targets", {
      name: "Targets",
      description: "Targets collection",
      content: "",
    });
    createThing(root, "/targets/t1", {
      name: "Target One",
      description: "Target",
      content: "",
    });
    fs.rmSync(path.join(root, "clients/acme-corp"), { recursive: true, force: true });
    fs.writeFileSync(
      path.join(root, "clients/acme-corp.md"),
      [
        "---",
        "name: Acme Corp",
        "description: Flagship client account",
        "links:",
        "  - to: /targets/t1",
        "    type: bogus",
        "---",
        "body",
        "",
      ].join("\n")
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await publish(root, { out, static: true });
      const html = fs.readFileSync(
        path.join(out, "clients/acme-corp/index.html"),
        "utf-8"
      );
      const ld = JSON.parse(
        html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]
      );
      // Bad predicate falls back to "mentions".
      expect(ld.mentions).toEqual([{ "@id": "/targets/t1/" }]);
      expect(ld.sameAs).toBeUndefined();
      // The warning surfaced.
      const warnCalls = warnSpy.mock.calls.map((c) => String(c[0]));
      expect(
        warnCalls.some((m) => /notARealThing/.test(m) && /mentions/.test(m))
      ).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("injects <meta robots=noindex> into the SPA shell and every prerender when --noindex", async () => {
    await publish(root, { out, static: true, noindex: true });
    const shell = fs.readFileSync(path.join(out, "index.html"), "utf-8");
    const page = fs.readFileSync(
      path.join(out, "clients/acme-corp/index.html"),
      "utf-8"
    );
    expect(shell).toMatch(
      /<meta[^>]*name=["']robots["'][^>]*content=["']noindex,\s*nofollow["']/
    );
    expect(page).toMatch(
      /<meta[^>]*name=["']robots["'][^>]*content=["']noindex,\s*nofollow["']/
    );
  });

  it("does not emit <meta robots> when --noindex is off", async () => {
    await publish(root, { out, static: true });
    const page = fs.readFileSync(
      path.join(out, "clients/acme-corp/index.html"),
      "utf-8"
    );
    expect(page).not.toMatch(/<meta[^>]*name=["']robots["']/i);
  });
});
