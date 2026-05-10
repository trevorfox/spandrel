import { describe, it, expect } from "vitest";
import {
  predicateForEdge,
  inferSchemaType,
  nodeRelativeHref,
  nodeCanonicalUrl,
  nodeOutputRelPath,
  buildJsonLd,
  extractShellHead,
  escapeHtml,
  createStaticMarkdownRenderer,
  renderPage,
} from "../src/compiler/prerender.js";
import { parsePublishArgs } from "../src/cli-publish.js";
import type { SpandrelNode, SpandrelEdge } from "../src/compiler/types.js";
import type { Graph } from "../src/web/types.js";

/**
 * Every test here pins one piece of the prerender projection. The unit
 * boundary is "given a Graph, produce this specific output" — no I/O,
 * no publish pipeline. That way when the whitelist rules or `@type`
 * inference shift, the failures point at the rule, not at the CLI.
 */

function makeNode(partial: Partial<SpandrelNode>): SpandrelNode {
  return {
    path: "/",
    name: "Root",
    description: "",
    nodeType: "leaf",
    depth: 0,
    parent: null,
    children: [],
    content: "",
    frontmatter: {},
    created: null,
    updated: null,
    author: null,
    ...partial,
  };
}

function makeGraph(partial: Partial<Graph>): Graph {
  return {
    nodes: [],
    edges: [],
    linkTypes: [],
    warnings: [],
    ...partial,
  };
}

describe("nodeOutputRelPath", () => {
  it("emits index.html for the root node", () => {
    expect(nodeOutputRelPath("/")).toBe("index.html");
    expect(nodeOutputRelPath("")).toBe("index.html");
  });

  it("emits <path>/index.html for nested nodes", () => {
    expect(nodeOutputRelPath("/clients/acme-corp")).toBe(
      "clients/acme-corp/index.html"
    );
    expect(nodeOutputRelPath("/linkTypes/owns")).toBe(
      "linkTypes/owns/index.html"
    );
  });
});

describe("nodeRelativeHref / nodeCanonicalUrl", () => {
  it("hrefs root as the base itself", () => {
    expect(nodeRelativeHref("/", "/")).toBe("/");
    expect(nodeRelativeHref("/", "/my-repo/")).toBe("/my-repo/");
  });

  it("appends a trailing slash for non-root nodes", () => {
    expect(nodeRelativeHref("/clients/acme", "/")).toBe("/clients/acme/");
    expect(nodeRelativeHref("/clients/acme", "/my-repo/")).toBe(
      "/my-repo/clients/acme/"
    );
  });

  it("returns relative URLs when siteUrl is empty", () => {
    expect(nodeCanonicalUrl("/clients/acme", "/", "")).toBe("/clients/acme/");
  });

  it("returns absolute URLs when siteUrl is set, stripping trailing slashes", () => {
    expect(
      nodeCanonicalUrl("/clients/acme", "/", "https://example.com")
    ).toBe("https://example.com/clients/acme/");
    expect(
      nodeCanonicalUrl("/clients/acme", "/my-repo/", "https://example.com/")
    ).toBe("https://example.com/my-repo/clients/acme/");
  });
});

describe("inferSchemaType", () => {
  it("classifies composite nodes as Collection", () => {
    expect(
      inferSchemaType(makeNode({ path: "/clients", nodeType: "composite" }))
    ).toBe("Collection");
  });

  it("classifies leaf nodes as CreativeWork", () => {
    expect(
      inferSchemaType(makeNode({ path: "/clients/acme", nodeType: "leaf" }))
    ).toBe("CreativeWork");
  });

  it("classifies /linkTypes leaf nodes as CreativeWork (no special casing)", () => {
    expect(
      inferSchemaType(makeNode({ path: "/linkTypes/owns", nodeType: "leaf" }))
    ).toBe("CreativeWork");
  });

  it("honors a frontmatter schemaType override", () => {
    expect(
      inferSchemaType(
        makeNode({
          path: "/clients/acme",
          nodeType: "leaf",
          frontmatter: { schemaType: "Organization" },
        })
      )
    ).toBe("Organization");
  });
});

describe("predicateForEdge", () => {
  it("always returns mentions regardless of linkType", () => {
    const edge: SpandrelEdge = { from: "/a", to: "/b", type: "link", linkType: "sameAs" };
    expect(predicateForEdge(edge)).toBe("mentions");
  });

  it("returns mentions for edges without a linkType", () => {
    const edge: SpandrelEdge = { from: "/a", to: "/b", type: "link" };
    expect(predicateForEdge(edge)).toBe("mentions");
  });
});

describe("buildJsonLd", () => {
  const nodes = [
    makeNode({
      path: "/",
      name: "My Graph",
      description: "Root",
      nodeType: "composite",
      children: ["/clients"],
    }),
    makeNode({
      path: "/clients",
      name: "Clients",
      description: "Collection",
      nodeType: "composite",
      parent: "/",
      children: ["/clients/acme"],
    }),
    makeNode({
      path: "/clients/acme",
      name: "Acme",
      description: "A client",
      nodeType: "leaf",
      parent: "/clients",
    }),
    makeNode({
      path: "/people/alice",
      name: "Alice",
      description: "Contact",
      nodeType: "leaf",
      parent: "/people",
    }),
  ];
  const edges: SpandrelEdge[] = [
    { from: "/clients/acme", to: "/people/alice", type: "link", linkType: "owned-by" },
    { from: "/clients/acme", to: "https://acme.com", type: "link", linkType: "sameAs" },
    { from: "/clients/acme", to: "/missing", type: "link", linkType: "mentions" },
  ];
  const graph = makeGraph({ nodes, edges });

  it("includes @context, @type, name, and url", () => {
    const ld = buildJsonLd(nodes[2], graph, "/", "");
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("CreativeWork");
    expect(ld.name).toBe("Acme");
    expect(ld.url).toBe("/clients/acme/");
  });

  it("emits isPartOf for nodes with a visible parent", () => {
    const ld = buildJsonLd(nodes[2], graph, "/", "");
    expect(ld.isPartOf).toEqual({ "@id": "/clients/" });
  });

  it("omits isPartOf when the parent is missing from the graph", () => {
    const ld = buildJsonLd(nodes[3], graph, "/", "");
    expect(ld.isPartOf).toBeUndefined();
  });

  it("emits hasPart for composites with visible children", () => {
    const ld = buildJsonLd(nodes[1], graph, "/", "");
    expect(ld.hasPart).toEqual([{ "@id": "/clients/acme/" }]);
  });

  it("maps every outgoing link edge to mentions, dropping broken/external targets", () => {
    const ld = buildJsonLd(nodes[2], graph, "/", "");
    // owned-by and sameAs-typed edges with internal targets → mentions;
    // external target (https://acme.com) and /missing → dropped
    expect(ld.mentions).toEqual([{ "@id": "/people/alice/" }]);
  });

  it("uses absolute URLs when a site-url is provided", () => {
    const ld = buildJsonLd(nodes[2], graph, "/", "https://example.com");
    expect(ld.url).toBe("https://example.com/clients/acme/");
    expect(ld.isPartOf).toEqual({ "@id": "https://example.com/clients/" });
  });
});

describe("extractShellHead", () => {
  it("strips title and base, preserves asset tags", () => {
    const shell = [
      "<!doctype html>",
      "<html>",
      "<head>",
      '<meta charset="utf-8" />',
      '<base href="/" />',
      "<title>Spandrel</title>",
      '<link rel="stylesheet" href="./assets/index-abc.css" />',
      '<script type="module" src="./assets/index-abc.js"></script>',
      "</head>",
      "<body></body>",
      "</html>",
    ].join("\n");
    const head = extractShellHead(shell);
    expect(head).not.toMatch(/<title/i);
    expect(head).not.toMatch(/<base\b/i);
    expect(head).not.toMatch(/<meta\s+charset/i);
    expect(head).toContain("index-abc.css");
    expect(head).toContain("index-abc.js");
  });

  it("returns empty when there is no head", () => {
    expect(extractShellHead("<html><body/></html>")).toBe("");
  });
});

describe("escapeHtml", () => {
  it("escapes the usual suspects", () => {
    expect(escapeHtml("<a href=\"x\">&'</a>")).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;"
    );
  });
});

describe("createStaticMarkdownRenderer", () => {
  it("rewrites internal links to real URLs, not hash fragments", () => {
    const render = createStaticMarkdownRenderer("/");
    const html = render("See [acme](/clients/acme) for details.");
    expect(html).toContain('href="/clients/acme/"');
    expect(html).not.toContain("#/clients/acme");
  });

  it("respects --base when rewriting internal links", () => {
    const render = createStaticMarkdownRenderer("/my-repo/");
    const html = render("See [acme](/clients/acme).");
    expect(html).toContain('href="/my-repo/clients/acme/"');
  });

  it("leaves external links untouched", () => {
    const render = createStaticMarkdownRenderer("/");
    const html = render("See [acme](https://acme.com).");
    expect(html).toContain('href="https://acme.com"');
  });
});

describe("parsePublishArgs — static and site-url flags", () => {
  it("leaves static off by default", () => {
    const { opts } = parsePublishArgs(["/some/dir"]);
    expect(opts.static).toBeUndefined();
    expect(opts.siteUrl).toBeUndefined();
  });

  it("enables static with --static", () => {
    const { opts } = parsePublishArgs(["/some/dir", "--static"]);
    expect(opts.static).toBe(true);
  });

  it("explicitly disables static with --no-static", () => {
    const { opts } = parsePublishArgs(["/some/dir", "--no-static"]);
    expect(opts.static).toBe(false);
  });

  it("accepts --site-url with a separate value", () => {
    const { opts } = parsePublishArgs([
      "/some/dir",
      "--site-url",
      "https://example.com",
    ]);
    expect(opts.siteUrl).toBe("https://example.com");
  });

  it("accepts --site-url= inline", () => {
    const { opts } = parsePublishArgs([
      "/some/dir",
      "--site-url=https://example.com",
    ]);
    expect(opts.siteUrl).toBe("https://example.com");
  });
});

describe("renderPage", () => {
  const node = makeNode({
    path: "/clients/acme",
    name: "Acme Corp",
    description: "A sample client",
    nodeType: "leaf",
    parent: "/clients",
    content: "# Acme\n\nBody text.",
  });
  const graph = makeGraph({
    nodes: [
      makeNode({ path: "/", name: "My Graph", nodeType: "composite", children: ["/clients"] }),
      makeNode({
        path: "/clients",
        name: "Clients",
        nodeType: "composite",
        parent: "/",
        children: ["/clients/acme"],
      }),
      node,
    ],
  });

  it("emits a complete HTML document with title, meta, and JSON-LD", () => {
    const html = renderPage({
      node,
      graph,
      base: "/",
      siteUrl: "",
      shellHead: '<script type="module" src="./assets/x.js"></script>',
      renderBody: (md) => `<article>${md}</article>`,
      siteName: "My Graph",
    });
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<title>Acme Corp — My Graph</title>");
    expect(html).toMatch(
      /<meta[^>]*name="description"[^>]*content="A sample client"/
    );
    expect(html).toMatch(
      /<link[^>]*rel="canonical"[^>]*href="\/clients\/acme\/"/
    );
    expect(html).toContain('<meta property="og:title" content="Acme Corp"');
    expect(html).toContain('<script type="application/ld+json">');
    expect(html).toContain('assets/x.js');
    expect(html).toContain('id="prerender-content"');
    expect(html).toContain('id="app"');
  });

  it("uses only the node name in the title for the root node", () => {
    const rootNode = graph.nodes[0];
    const html = renderPage({
      node: rootNode,
      graph,
      base: "/",
      siteUrl: "",
      shellHead: "",
      renderBody: () => "",
      siteName: "My Graph",
    });
    expect(html).toContain("<title>My Graph</title>");
    expect(html).not.toContain("My Graph — My Graph");
  });

  it("embeds JSON-LD that parses as valid JSON with @context and @type", () => {
    const html = renderPage({
      node,
      graph,
      base: "/",
      siteUrl: "",
      shellHead: "",
      renderBody: () => "",
      siteName: "My Graph",
    });
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
});
