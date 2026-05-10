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
 *   2. JSON-LD projection — every outgoing link edge maps to `schema:mentions`.
 *      Structural hierarchy is captured by `isPartOf` / `hasPart`. No
 *      per-type whitelist; the full vocabulary lives in the graph via REST/MCP.
 *   3. Per-node HTML assembly — bolt SEO meta + JSON-LD + prerendered body
 *      into the shared head, emit one file per node.
 */

import { Marked, type Tokens } from "marked";
import type { SpandrelNode, SpandrelEdge } from "./types.js";
import type { Graph } from "../web/types.js";

/**
 * Every outgoing link edge maps to `schema:mentions`. Structural hierarchy
 * uses the dedicated `isPartOf` / `hasPart` predicates. The full typed
 * vocabulary is served to consumers via REST and MCP.
 */
export function predicateForEdge(_edge: SpandrelEdge): "mentions" {
  return "mentions";
}

/**
 * Infer a schema.org `@type` for a node.
 *
 * - Composite nodes (with children) are `Collection` — they hold parts.
 * - Leaf nodes default to `CreativeWork` — a generic content node.
 *
 * An individual node may override via `schemaType:` in frontmatter. The
 * override is taken verbatim — callers are trusted not to invent nonsense.
 */
export function inferSchemaType(node: SpandrelNode): string {
  const override = node.frontmatter?.["schemaType"];
  if (typeof override === "string" && override.length > 0) return override;

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
}

/**
 * Build the JSON-LD object for one node.
 *
 * Structural hierarchy is captured by `isPartOf` (parent) and `hasPart`
 * (visible children). Every outgoing typed link edge maps unconditionally to
 * `schema:mentions` — the full vocabulary is available to consumers via REST
 * and MCP; the JSON-LD projection stays minimal and crawler-friendly.
 *
 * Broken targets (paths not in the graph) and external URLs are silently
 * dropped — JSON-LD `@id` values must resolve to something meaningful.
 */
export function buildJsonLd(
  node: SpandrelNode,
  graph: Graph,
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

  // Every outgoing link edge → schema:mentions. Broken/external targets
  // are dropped (they wouldn't produce a resolvable @id).
  const mentionIds: string[] = [];
  for (const edge of graph.edges) {
    if (edge.from !== node.path) continue;
    if (edge.type !== "link") continue;
    if (!nodesByPath.has(edge.to)) continue;
    mentionIds.push(nodeCanonicalUrl(edge.to, base, siteUrl));
  }
  if (mentionIds.length > 0) {
    ld.mentions = mentionIds.map((id) => ({ "@id": id }));
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
  const trimmedBase = base.endsWith("/") ? base : `${base}/`;
  const instance = new Marked();
  instance.use({
    gfm: true,
    breaks: false,
    renderer: {
      link(token: Tokens.Link): string {
        const href = token.href ?? "";
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
        // Delegate to the default renderer by calling the parent on `this`.
        // `this.parser.parseInline` renders the token text recursively.
        const self = this as unknown as {
          parser: { parseInline: (tokens: Tokens.Generic[]) => string };
        };
        const text = self.parser.parseInline(token.tokens ?? []);
        const titleAttr = token.title ? ` title="${escapeHtml(token.title)}"` : "";
        return `<a href="${escapeHtml(rewritten)}"${titleAttr}>${text}</a>`;
      },
    },
  });
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
  base: string;
  siteUrl: string;
  shellHead: string;
  renderBody: (md: string) => string;
  /** Display name of the graph's root node, used in `<title>` suffix. */
  siteName: string;
  /** When true, emit `<meta name="robots" content="noindex, nofollow">`. */
  noindex?: boolean;
}

/**
 * Compose the href for a sibling-format file (`.md` or `.json`).
 *
 * Root node uses the directory-style `index.{ext}` form because `.md` /
 * `.json` as bare dot-files are served with `application/octet-stream` on
 * GitHub Pages and force a download. Every other node uses the compact
 * sibling form (`<path>.{ext}`) which scrapers, agents, and curl users
 * find more familiar — matches raw-GitHub conventions. Both forms are
 * emitted by `writeNodeSiblings` so the hrefs always resolve.
 */
function alternateHref(nodePath: string, ext: "md" | "json"): string {
  if (nodePath === "/" || nodePath === "") return `index.${ext}`;
  return `${nodePath.replace(/^\/+/, "")}.${ext}`;
}

/**
 * Assemble the full prerendered HTML document for a single node.
 */
export function renderPage(input: RenderPageInput): string {
  const {
    node,
    graph,
    base,
    siteUrl,
    shellHead,
    renderBody,
    siteName,
    noindex = false,
  } = input;

  const canonical = nodeCanonicalUrl(node.path, base, siteUrl);
  const title =
    node.path === "/" || !siteName || siteName === node.name
      ? node.name || "Spandrel"
      : `${node.name} — ${siteName}`;
  const description = node.description || "";
  const jsonLd = buildJsonLd(node, graph, base, siteUrl);

  const bodyHtml = renderBody(node.content);

  // Root node (if present) provides the sitewide masthead text — name +
  // tagline. Same-size text, no H1 hierarchy. For crawlers and no-JS users
  // this renders above the page content; the SPA rebuilds the same banner
  // dynamically on mount so the layout stays consistent.
  const rootNode = graph.nodes.find((n) => n.path === "/");
  const bannerName = rootNode?.name ?? siteName ?? "";
  const bannerTagline = rootNode?.description ?? "";
  const bannerInner = [
    bannerName ? `<span class="site-banner-name">${escapeHtml(bannerName)}</span>` : "",
    bannerName && bannerTagline ? `<span class="site-banner-sep" aria-hidden="true">·</span>` : "",
    bannerTagline ? `<span class="site-banner-tagline">${escapeHtml(bannerTagline)}</span>` : "",
  ].join("");
  const bannerHtml = bannerInner
    ? `<a class="site-banner-inner" href="./">${bannerInner}</a>`
    : "";

  // For the root page, the site-banner already renders the name. Skipping
  // the duplicate H1 avoids the "Spandrel / Spandrel" stutter that showed
  // up in visible prerender output. Crawlers still get a strong <title>
  // and JSON-LD `name`, so SEO is preserved.
  const showPageHeader = node.path !== "/";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <base href="${escapeHtml(base)}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta id="meta-description" name="description" content="${escapeHtml(description)}" />${
      noindex ? `\n    <meta name="robots" content="noindex, nofollow" />` : ""
    }
    <link id="canonical" rel="canonical" href="${escapeHtml(canonical)}" />
    <link rel="alternate" type="text/markdown" href="${escapeHtml(alternateHref(node.path, "md"))}" title="Markdown" />
    <link rel="alternate" type="application/json" href="${escapeHtml(alternateHref(node.path, "json"))}" title="JSON" />
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
    <div id="app">
      <header id="site-banner" class="site-banner" aria-label="Site">${bannerHtml}</header>
      <header id="top-bar" class="top-bar" aria-label="Navigation"></header>
      <main id="layout" class="layout">
        <aside id="tree-rail" class="tree-rail" aria-label="File tree"></aside>
        <section id="content" class="content" aria-label="Node content">
          <div id="prerender-content" class="content-body">
            ${
              showPageHeader
                ? `<header class="meta"><h1>${escapeHtml(node.name || node.path)}</h1>${
                    description ? `<p class="description">${escapeHtml(description)}</p>` : ""
                  }</header>`
                : ""
            }
            <article>${bodyHtml}</article>
          </div>
        </section>
        <aside id="graph-pane" class="graph-pane" aria-label="Graph"></aside>
      </main>
      <section id="drawer" class="drawer" aria-label="Related nodes and warnings"></section>
      <nav id="view-pill" class="view-pill" aria-label="View"></nav>
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
