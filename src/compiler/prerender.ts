/**
 * Build-time prerender pass for `spandrel publish --static`.
 *
 * Emits per-node HTML files under `_site/<path>/index.html` for crawlers and
 * "view source", while still shipping the SPA script tags so the interactive
 * viewer hydrates on top. The SPA replaces `#prerender-content` on mount —
 * this prerender is not required to match runtime rendering visually, only
 * to produce real, indexable HTML.
 *
 * Three pure-ish concerns, kept separate for testability:
 *
 *   1. Head extraction — pull the SPA's asset/font/theme tags out of the
 *      Vite-built `index.html` so hashed filenames aren't hardcoded here.
 *   2. JSON-LD projection — project typed link edges onto a small schema.org
 *      predicate whitelist. Six predicates, no more (see `SCHEMA_ORG_WHITELIST`).
 *   3. Per-node HTML assembly — bolt SEO meta + JSON-LD + prerendered body
 *      into the shared head, emit one file per node.
 */

import { Marked, Renderer, type Tokens } from "marked";
import type { SpandrelNode, SpandrelEdge } from "./types.js";
import type { Graph } from "../web/types.js";

/**
 * The only schema.org predicates we ever emit. Framing: JSON-LD is a public
 * projection, not a mirror of the full typed vocabulary. Search engines get
 * something they understand; agents and humans still see the real graph via
 * GraphQL and MCP.
 */
export const SCHEMA_ORG_WHITELIST = [
  "isPartOf",
  "hasPart",
  "about",
  "mentions",
  "sameAs",
  "relatedLink",
] as const;

export type SchemaOrgPredicate = (typeof SCHEMA_ORG_WHITELIST)[number];

const WHITELIST_SET: Set<string> = new Set(SCHEMA_ORG_WHITELIST);

/**
 * Build a stem → schema.org predicate map from the graph's linkType nodes.
 *
 * Each `/linkTypes/<stem>.md` node may declare a `schemaOrg:` frontmatter
 * field naming one of the whitelisted predicates. When absent, the stem maps
 * to `"mentions"` (the catch-all). When present but not in the whitelist,
 * the value is ignored with a warning and the stem falls back to `"mentions"`.
 *
 * The map only contains stems whose linkType node exists. Edge linkTypes
 * referring to undeclared stems are handled at projection time.
 */
export function buildLinkTypePredicateMap(
  graph: Graph,
  warn: (msg: string) => void = (m) => console.warn(`[spandrel] ${m}`)
): Map<string, SchemaOrgPredicate> {
  const map = new Map<string, SchemaOrgPredicate>();
  const nodesByPath = new Map(graph.nodes.map((n) => [n.path, n]));

  for (const info of graph.linkTypes) {
    const stem = info.path.slice("/linkTypes/".length);
    if (stem.length === 0 || stem.includes("/")) continue;

    const node = nodesByPath.get(info.path);
    const declared = node?.frontmatter?.["schemaOrg"];

    if (declared === undefined || declared === null || declared === "") {
      map.set(stem, "mentions");
      continue;
    }

    if (typeof declared !== "string") {
      warn(
        `linkType /linkTypes/${stem} declares a non-string schemaOrg value; falling back to "mentions".`
      );
      map.set(stem, "mentions");
      continue;
    }

    if (!WHITELIST_SET.has(declared)) {
      warn(
        `linkType /linkTypes/${stem} declares schemaOrg "${declared}" which is not in the whitelist (${SCHEMA_ORG_WHITELIST.join(", ")}); falling back to "mentions".`
      );
      map.set(stem, "mentions");
      continue;
    }

    map.set(stem, declared as SchemaOrgPredicate);
  }

  return map;
}

/**
 * Map an edge's linkType to a schema.org predicate.
 * Unmapped or missing linkTypes fall through to `"mentions"`.
 */
export function predicateForEdge(
  edge: SpandrelEdge,
  predicateMap: Map<string, SchemaOrgPredicate>
): SchemaOrgPredicate {
  if (!edge.linkType) return "mentions";
  return predicateMap.get(edge.linkType) ?? "mentions";
}

/**
 * Infer a schema.org `@type` for a node.
 *
 * - Nodes under `/linkTypes/*` are `DefinedTerm` — they define vocabulary.
 * - Composite nodes (with children) are `Collection` — they hold parts.
 * - Leaf nodes default to `CreativeWork` — a generic content node.
 *
 * An individual node may override via `schemaType:` in frontmatter. The
 * override is taken verbatim — callers are trusted not to invent nonsense.
 */
export function inferSchemaType(node: SpandrelNode): string {
  const override = node.frontmatter?.["schemaType"];
  if (typeof override === "string" && override.length > 0) return override;

  if (node.path.startsWith("/linkTypes/")) {
    const rest = node.path.slice("/linkTypes/".length);
    if (rest.length > 0 && !rest.includes("/")) return "DefinedTerm";
  }
  if (node.nodeType === "composite") return "Collection";
  return "CreativeWork";
}

/**
 * Join a base and a node path into a URL string suitable for the HTML we
 * emit. Trailing slash policy: directory-like URLs end with `/`. The root
 * node `/` renders at the base itself.
 *
 * Examples (base = `/`):
 *   /               → /
 *   /clients        → /clients/
 *   /clients/acme   → /clients/acme/
 *
 * Examples (base = `/my-repo/`):
 *   /               → /my-repo/
 *   /clients        → /my-repo/clients/
 */
export function nodeRelativeHref(nodePath: string, base: string): string {
  const trimmedBase = base.endsWith("/") ? base : `${base}/`;
  if (nodePath === "/" || nodePath === "") return trimmedBase;
  const rel = nodePath.startsWith("/") ? nodePath.slice(1) : nodePath;
  return `${trimmedBase}${rel}/`;
}

/**
 * Compose the canonical URL used in meta tags and JSON-LD. When `siteUrl`
 * is set, emits an absolute URL. Otherwise emits the relative `nodeRelativeHref`
 * — still valid for JSON-LD and degrades gracefully on sub-path hosting.
 */
export function nodeCanonicalUrl(
  nodePath: string,
  base: string,
  siteUrl: string
): string {
  const rel = nodeRelativeHref(nodePath, base);
  if (!siteUrl) return rel;
  const trimmed = siteUrl.replace(/\/+$/, "");
  return `${trimmed}${rel}`;
}

export interface JsonLd {
  "@context": "https://schema.org";
  "@type": string;
  name: string;
  description?: string;
  url: string;
  isPartOf?: { "@id": string };
  hasPart?: Array<{ "@id": string }>;
  mentions?: Array<{ "@id": string }>;
  about?: Array<{ "@id": string }>;
  sameAs?: Array<{ "@id": string }>;
  relatedLink?: Array<{ "@id": string }>;
}

/**
 * Build the JSON-LD object for one node. Only whitelist predicates ever
 * appear. Edges that would collide with the structural `isPartOf`/`hasPart`
 * predicates (hierarchy edges, which already show up as parent/children)
 * are not duplicated from link edges — we use parent/children for hierarchy
 * and link edges only for lateral relationships.
 */
export function buildJsonLd(
  node: SpandrelNode,
  graph: Graph,
  predicateMap: Map<string, SchemaOrgPredicate>,
  base: string,
  siteUrl: string
): JsonLd {
  const nodesByPath = new Map(graph.nodes.map((n) => [n.path, n]));
  const url = nodeCanonicalUrl(node.path, base, siteUrl);

  const ld: JsonLd = {
    "@context": "https://schema.org",
    "@type": inferSchemaType(node),
    name: node.name || node.path,
    url,
  };

  if (node.description) ld.description = node.description;

  if (node.parent && nodesByPath.has(node.parent)) {
    ld.isPartOf = {
      "@id": nodeCanonicalUrl(node.parent, base, siteUrl),
    };
  }

  const visibleChildren = node.children.filter((p) => nodesByPath.has(p));
  if (visibleChildren.length > 0) {
    ld.hasPart = visibleChildren.map((p) => ({
      "@id": nodeCanonicalUrl(p, base, siteUrl),
    }));
  }

  // Group outgoing link edges by projected predicate. Hierarchy/authored_by
  // edges are handled separately (or not at all — `authored_by` isn't part
  // of the public projection).
  const buckets: Record<SchemaOrgPredicate, Set<string>> = {
    isPartOf: new Set(),
    hasPart: new Set(),
    about: new Set(),
    mentions: new Set(),
    sameAs: new Set(),
    relatedLink: new Set(),
  };

  for (const edge of graph.edges) {
    if (edge.from !== node.path) continue;
    if (edge.type !== "link") continue;
    if (!nodesByPath.has(edge.to)) continue; // skip broken/external
    const predicate = predicateForEdge(edge, predicateMap);
    buckets[predicate].add(nodeCanonicalUrl(edge.to, base, siteUrl));
  }

  // hasPart and isPartOf get structural data already; skip populating them
  // from link edges so hierarchy wins and we never duplicate IDs.
  for (const predicate of ["about", "mentions", "sameAs", "relatedLink"] as const) {
    const ids = Array.from(buckets[predicate]);
    if (ids.length > 0) {
      ld[predicate] = ids.map((id) => ({ "@id": id }));
    }
  }

  return ld;
}

/**
 * Build-time markdown renderer.
 *
 * Internal links render as real URLs pointing at the prerendered HTML files
 * (not hash fragments) so crawlers see a real link graph. Base-aware: the
 * `--base` flag is respected. External links pass through unchanged.
 *
 * The SPA rewrites its own internal links to hash URLs on mount — the
 * crawler-facing HTML and the SPA-navigated HTML disagree here by design.
 */
export function createStaticMarkdownRenderer(base: string) {
  const renderer = new Renderer();
  const baseLink = renderer.link.bind(renderer);
  const trimmedBase = base.endsWith("/") ? base : `${base}/`;

  renderer.link = function (token: Tokens.Link): string {
    const href = token.href;
    let rewritten = href;
    if (
      href &&
      href.startsWith("/") &&
      !href.startsWith("//") &&
      !/^[a-z]+:\/\//i.test(href)
    ) {
      const rel = href.slice(1);
      rewritten = `${trimmedBase}${rel}${rel.endsWith("/") || rel.length === 0 ? "" : "/"}`;
    }
    return baseLink({ ...token, href: rewritten });
  };

  const instance = new Marked().use({ gfm: true, breaks: false, renderer });
  return (md: string): string => {
    if (!md || !md.trim()) return "";
    return instance.parse(md, { async: false }) as string;
  };
}

/** Minimal HTML-escape for attribute/text contexts. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Pull the SPA shell's `<head>` content (minus `<title>` and `<base>`) so the
 * prerenderer can reuse Vite's hashed asset tags without hardcoding them.
 *
 * We strip `<title>` and `<base>` because the prerenderer emits its own.
 * Everything else — theme bootstrap, font preconnects, asset <link>/<script>
 * tags — is preserved as-is.
 */
export function extractShellHead(shellHtml: string): string {
  const headMatch = shellHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (!headMatch) return "";
  let head = headMatch[1];
  head = head.replace(/<title[\s\S]*?<\/title>\s*/gi, "");
  head = head.replace(/<base\b[^>]*\/?>\s*/gi, "");
  // Charset and viewport are re-emitted in the per-node template; strip the
  // SPA's so we don't double-emit.
  head = head.replace(/<meta\s+charset=[^>]*>\s*/gi, "");
  head = head.replace(/<meta\s+name=["']viewport["'][^>]*>\s*/gi, "");
  return head.trim();
}

export interface RenderPageInput {
  node: SpandrelNode;
  graph: Graph;
  predicateMap: Map<string, SchemaOrgPredicate>;
  base: string;
  siteUrl: string;
  shellHead: string;
  renderBody: (md: string) => string;
  /** Display name of the graph's root node, used in `<title>` suffix. */
  siteName: string;
}

/**
 * Assemble the full prerendered HTML document for a single node.
 */
export function renderPage(input: RenderPageInput): string {
  const {
    node,
    graph,
    predicateMap,
    base,
    siteUrl,
    shellHead,
    renderBody,
    siteName,
  } = input;

  const canonical = nodeCanonicalUrl(node.path, base, siteUrl);
  const title =
    node.path === "/" || !siteName || siteName === node.name
      ? node.name || "Spandrel"
      : `${node.name} — ${siteName}`;
  const description = node.description || "";
  const jsonLd = buildJsonLd(node, graph, predicateMap, base, siteUrl);

  const bodyHtml = renderBody(node.content);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <base href="${escapeHtml(base)}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <meta property="og:title" content="${escapeHtml(node.name || title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta property="og:type" content="article" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeHtml(node.name || title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
    ${shellHead}
  </head>
  <body>
    <div id="prerender-content">
      <h1>${escapeHtml(node.name || node.path)}</h1>
      ${description ? `<p>${escapeHtml(description)}</p>` : ""}
      <article>${bodyHtml}</article>
    </div>
    <div id="app">
      <header id="top-bar" class="top-bar" aria-label="Navigation"></header>
      <main id="layout" class="layout">
        <section id="content" class="content" aria-label="Node content"></section>
        <aside id="graph-pane" class="graph-pane" aria-label="Graph"></aside>
      </main>
      <section id="drawer" class="drawer" aria-label="Related nodes and warnings"></section>
    </div>
  </body>
</html>
`;
}

/**
 * Compute the filesystem path (relative to the out dir) where a node's
 * prerendered HTML should land. Root node → `index.html`. Every other node
 * → `<path>/index.html`.
 */
export function nodeOutputRelPath(nodePath: string): string {
  if (nodePath === "/" || nodePath === "") return "index.html";
  const trimmed = nodePath.startsWith("/") ? nodePath.slice(1) : nodePath;
  return `${trimmed}/index.html`;
}
