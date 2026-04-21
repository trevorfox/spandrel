import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "./compiler/compiler.js";
import { emitGraph } from "./compiler/emit-graph.js";
import { loadAccessConfig, canAccess, filterNodeFields, accessLevelAtLeast } from "./schema/access.js";
import type { Actor } from "./schema/types.js";
import type { SpandrelNode, SpandrelEdge, ValidationWarning } from "./compiler/types.js";
import { InMemoryGraphStore } from "./storage/in-memory-graph-store.js";
import type { GraphStore } from "./storage/graph-store.js";
import { renderNodeAsMarkdown } from "./web/render-node.js";
import {
  buildLinkTypePredicateMap,
  createStaticMarkdownRenderer,
  extractShellHead,
  nodeOutputRelPath,
  renderPage,
} from "./compiler/prerender.js";

export interface PublishOptions {
  /** Output directory, relative to cwd. Default `_site`. */
  out: string;
  /** Base href rewritten into index.html. Default `/`. */
  base: string;
  /** When true (default), filter nodes/edges the anonymous public actor cannot see. */
  stripPrivate: boolean;
  /**
   * When true, prerender one HTML file per node under `_site/<path>/index.html`
   * with SEO meta + JSON-LD baked in. The SPA still hydrates on top. Off by
   * default to preserve the SPA-shell-only behavior.
   */
  static: boolean;
  /**
   * Absolute site origin (e.g. `"https://example.com"`). When set, canonical
   * URLs emitted into SEO/meta/JSON-LD are absolute. When empty, we emit
   * relative URLs — still valid, degrades gracefully on sub-path hosting.
   */
  siteUrl: string;
  /**
   * When true, inject `<meta name="robots" content="noindex, nofollow">`
   * into every emitted HTML page (both the SPA shell and, when `static` is
   * on, every prerendered per-node page). Useful for staging deploys or
   * sites that should not appear in search results.
   */
  noindex: boolean;
}

export const DEFAULT_PUBLISH_OPTIONS: PublishOptions = {
  out: "_site",
  base: "/",
  stripPrivate: true,
  static: false,
  siteUrl: "",
  noindex: false,
};

/**
 * Rewrite `<base href="/">` (or `<base href='/'>`) to `<base href="{base}">`.
 *
 * Kept as a small pure helper so the regex logic is testable without
 * spinning up a full publish run. Idempotent when the base already matches.
 * Matches both the literal default (`/`) and any previously-written base, so
 * re-publishing with a different `--base` does the right thing.
 */
export function rewriteHtmlBase(html: string, base: string): string {
  return html.replace(
    /<base\s+href=(["'])[^"']*\1\s*\/?>/gi,
    `<base href="${base}" />`
  );
}

/**
 * Inject `<meta name="robots" content="noindex, nofollow" />` into `<head>`
 * if it isn't already present. Idempotent — re-running over an already-
 * marked document leaves it unchanged.
 */
export function injectNoindex(html: string): string {
  if (/<meta\s+name=["']robots["'][^>]*noindex/i.test(html)) return html;
  const tag = `<meta name="robots" content="noindex, nofollow" />`;
  return html.replace(
    /<head(\s[^>]*)?>/i,
    (m) => `${m}\n    ${tag}`
  );
}

/**
 * Filter a compiled store down to what an anonymous public actor can see.
 *
 * - When no `_access/config.yaml` exists, nothing is stripped (open access).
 * - When a config exists, every node is checked at `exists` level; nodes the
 *   public actor cannot see are removed from the wire output, along with any
 *   edges touching them. Visible nodes are field-filtered to the actor's
 *   allowed disclosure level (description, content, ...).
 *
 * Returns a new InMemoryGraphStore so the caller can feed it into `emitGraph`
 * without caring whether filtering happened.
 */
export async function stripPrivateNodes(
  source: GraphStore,
  rootDir: string
): Promise<GraphStore> {
  const config = loadAccessConfig(rootDir);
  if (!config) return source;

  const actor: Actor = { identity: null };

  const filtered = new InMemoryGraphStore();
  const visiblePaths = new Set<string>();

  for (const node of await source.getAllNodes()) {
    const level = canAccess(config, actor, node.path, node.frontmatter);
    if (level === "none") continue;
    if (!accessLevelAtLeast(level, "exists")) continue;

    const projected = filterNodeFields(node, level);
    if (!projected) continue;

    // filterNodeFields returns a Partial<SpandrelNode>. Shape the result back
    // into a full SpandrelNode so the wire format stays consistent — fields
    // the actor cannot see come through as empty/default values rather than
    // undefined. The SPA treats missing descriptions or content as "nothing
    // to show" and renders accordingly.
    const wireNode: SpandrelNode = {
      path: node.path,
      name: projected.name ?? node.name,
      description: projected.description ?? "",
      nodeType: projected.nodeType ?? node.nodeType,
      depth: projected.depth ?? node.depth,
      parent: projected.parent ?? node.parent,
      children: projected.children ?? [],
      content: projected.content ?? "",
      frontmatter: projected.frontmatter ?? {},
      created: projected.created ?? null,
      updated: projected.updated ?? null,
      author: projected.author ?? null,
    };

    await filtered.setNode(wireNode);
    visiblePaths.add(node.path);
  }

  // Drop any children references that point at invisible nodes — preserves
  // the tree view for the SPA without leaking the existence of gated nodes.
  for (const node of await filtered.getAllNodes()) {
    if (node.children.length > 0) {
      node.children = node.children.filter((p) => visiblePaths.has(p));
    }
  }

  const edges: SpandrelEdge[] = (await source.getEdges()).filter(
    (e) => visiblePaths.has(e.from) && visiblePaths.has(e.to)
  );
  await filtered.replaceEdges(edges);

  // Warnings ride along for the publisher's own benefit, but any warning
  // attached to a stripped node goes with it — a public reader has no way
  // to act on those.
  const warnings: ValidationWarning[] = (await source.getWarnings()).filter((w) =>
    visiblePaths.has(w.path)
  );
  await filtered.replaceWarnings(warnings);

  return filtered;
}

/**
 * Resolve the SPA bundle directory that ships alongside the compiled CLI.
 *
 * Uses `import.meta.url` so it works both when `spandrel` is installed
 * globally (`npm i -g`) and when linked locally from a source checkout.
 *
 * - Published / compiled path: this module lives at `dist/cli-publish.js`,
 *   so `./web/` resolves to `dist/web/`. This is the common case.
 * - Source checkout via tsx (`npm run dev`): this module lives at
 *   `src/cli-publish.ts`, and `./web/` resolves to `src/web/` — which holds
 *   the Vite source, not the built bundle. Fall back to `../dist/web/`
 *   relative to the source tree so a previous `npm run build:web` is picked
 *   up automatically.
 *
 * If neither exists, return the primary path so the caller's existence
 * check fails and the placeholder path is taken.
 */
export function resolveBundleDir(): string {
  const primary = fileURLToPath(new URL("./web/", import.meta.url));
  if (fs.existsSync(path.join(primary, "index.html"))) return primary;

  const sourceFallback = fileURLToPath(new URL("../dist/web/", import.meta.url));
  if (fs.existsSync(path.join(sourceFallback, "index.html"))) return sourceFallback;

  return primary;
}

/**
 * Translate a graph node path to the on-disk sibling file location.
 *
 * - `/`                 → `<out>/.md`  (leading-dot file; collision-free).
 * - `/clients`          → `<out>/clients.md`
 * - `/clients/acme`     → `<out>/clients/acme.md`
 *
 * The leaf directory always exists after this call (mkdir -p).
 */
function nodeSiblingPath(outDir: string, nodePath: string, ext: ".md" | ".json"): string {
  if (nodePath === "/" || nodePath === "") {
    return path.join(outDir, ext);
  }
  // Normalize: drop leading slash, the rest becomes a relative path.
  const rel = nodePath.replace(/^\/+/, "");
  return path.join(outDir, rel + ext);
}

/**
 * Emit `<path>.md` and `<path>.json` for every node, plus `index.md` /
 * `index.json` inside every node's directory so the canonical directory-
 * style URL (`<path>/index.md`, `<path>/index.json`) resolves for leaves,
 * composites, and root alike. Returns the number of nodes processed.
 *
 * Address scheme after this runs:
 *   /                  → `<out>/.md`  and `<out>/index.md`
 *   /clients           → `<out>/clients.md`  and `<out>/clients/index.md`
 *   /clients/acme      → `<out>/clients/acme.md`  and `<out>/clients/acme/index.md`
 *
 * The directory-style form is the one the UI links to — it matches the
 * `<path>/index.html` shape of prerendered HTML, and avoids the dot-file
 * MIME trap on GitHub Pages (bare `.json` files come back as
 * application/octet-stream and force a download).
 */
function writeNodeSiblings(outDir: string, nodes: SpandrelNode[]): number {
  for (const node of nodes) {
    const md = renderNodeAsMarkdown(node);
    const json = JSON.stringify(node, null, 2);

    const mdPath = nodeSiblingPath(outDir, node.path, ".md");
    const jsonPath = nodeSiblingPath(outDir, node.path, ".json");
    fs.mkdirSync(path.dirname(mdPath), { recursive: true });
    fs.writeFileSync(mdPath, md);
    fs.writeFileSync(jsonPath, json);

    // Directory-style aliases for every node — leaves, composites, and
    // root. The index.{md,json} form is the canonical UI link target, so
    // every node needs a directory that resolves it.
    const dir =
      node.path === "/"
        ? outDir
        : path.join(outDir, node.path.replace(/^\/+/, ""));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.md"), md);
    fs.writeFileSync(path.join(dir, "index.json"), json);
  }
  return nodes.length;
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(s, d);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}

/**
 * `robots.txt` that keeps search engines off the raw-file URLs.
 *
 * The HTML pages are the canonical representations of each node. The `.md`
 * and `.json` siblings are for scrapers, agents, and human curl — indexing
 * them separately would create duplicate-content confusion for crawlers.
 */
const ROBOTS_TXT = `User-agent: *
Disallow: /*.md$
Disallow: /*.json$
`;

/**
 * Compile `rootDir` and emit a self-contained static bundle to `{out}`.
 *
 * The bundle is everything a static host needs: `graph.json` (data), the SPA
 * (HTML/JS/CSS), and an optional `CNAME`. No server, no JS runtime on the host.
 */
export async function publish(
  rootDir: string,
  opts: Partial<PublishOptions> = {}
): Promise<{ outDir: string; wroteBundle: boolean }> {
  const options: PublishOptions = { ...DEFAULT_PUBLISH_OPTIONS, ...opts };
  const absRoot = path.resolve(rootDir);
  const absOut = path.resolve(options.out);

  console.log(`[spandrel] Compiling ${absRoot}...`);
  const rawStore = await compile(absRoot);
  const warnings = await rawStore.getWarnings();
  console.log(
    `[spandrel] Compiled: ${rawStore.nodeCount} nodes, ${rawStore.edgeCount} edges, ${warnings.length} warnings`
  );

  const store = options.stripPrivate
    ? await stripPrivateNodes(rawStore, absRoot)
    : rawStore;

  if (options.stripPrivate && store !== rawStore) {
    const dropped = rawStore.nodeCount - store.nodeCount;
    if (dropped > 0) {
      console.log(`[spandrel] Stripped ${dropped} non-public nodes for the public bundle.`);
    }
  }

  fs.mkdirSync(absOut, { recursive: true });

  const graph = await emitGraph(store);
  const graphJsonPath = path.join(absOut, "graph.json");
  fs.writeFileSync(graphJsonPath, JSON.stringify(graph));
  console.log(`[spandrel] Wrote ${path.relative(process.cwd(), graphJsonPath) || graphJsonPath}`);

  // Per-node sibling files: `<out>/<path>.md` and `<out>/<path>.json` for
  // every node. These are the static projection of the dev server's
  // extension routes, so `curl site.example.com/clients/acme-corp.md` works
  // the same against a live server or a published bundle.
  //
  // Root node lands at `<out>/.md` / `<out>/.json` — the leading-dot file
  // is unusual but collision-free with any authored node path, and hosts
  // serve it verbatim when asked for `/.md`. The SPA shell still lives at
  // `<out>/index.html`.
  // Siblings need the full node (body content, frontmatter) — graph.json's
  // skeleton can't provide that. Pull from the store directly.
  const siblingCount = writeNodeSiblings(absOut, await store.getAllNodes());
  console.log(`[spandrel] Wrote ${siblingCount * 2} per-node sibling files (.md + .json)`);

  const bundleDir = resolveBundleDir();
  // A "valid" bundle means Vite's output: an index.html plus whatever assets
  // it produced. The mere presence of the dir isn't enough — `src/web/`
  // itself contains non-bundle source files. Check for index.html as the
  // reliable signal. If the bundle is missing, fail loudly — publish with
  // no viewer is almost never what the user wanted.
  const bundleIndex = path.join(bundleDir, "index.html");
  if (!fs.existsSync(bundleIndex)) {
    throw new Error(
      `SPA bundle not found at ${bundleDir}. Run \`npm run build\` in the Spandrel source tree, or install a published version that ships the bundle.`,
    );
  }
  copyDirRecursive(bundleDir, absOut);
  console.log(`[spandrel] Copied SPA bundle from ${bundleDir}`);

  // Rewrite <base href> only when the user asked for a non-default base.
  // Leaving "/" alone keeps the bundle identical to what Vite produced,
  // which helps when diffing a published bundle against the source build.
  if (options.base && options.base !== "/") {
    const indexPath = path.join(absOut, "index.html");
    if (fs.existsSync(indexPath)) {
      const html = fs.readFileSync(indexPath, "utf-8");
      fs.writeFileSync(indexPath, rewriteHtmlBase(html, options.base));
      console.log(`[spandrel] Rewrote <base href> to ${options.base}`);
    }
  }

  // Inject robots noindex into the SPA shell. Only needed when we're not
  // about to regenerate every HTML file via --static prerender — in that
  // case renderPage emits the tag itself, and double-injecting would cause
  // the shell's tag to leak into each prerender via extractShellHead.
  if (options.noindex && !options.static) {
    const indexPath = path.join(absOut, "index.html");
    if (fs.existsSync(indexPath)) {
      const html = fs.readFileSync(indexPath, "utf-8");
      fs.writeFileSync(indexPath, injectNoindex(html));
    }
    console.log("[spandrel] Marked the SPA shell as noindex, nofollow.");
  } else if (options.noindex) {
    console.log("[spandrel] Marking every prerendered page as noindex, nofollow.");
  }

  const cnameSrc = path.join(absRoot, "CNAME");
  if (fs.existsSync(cnameSrc) && fs.statSync(cnameSrc).isFile()) {
    fs.copyFileSync(cnameSrc, path.join(absOut, "CNAME"));
    console.log("[spandrel] Copied CNAME from graph root");
  }

  if (options.static) {
    await prerenderStaticPages(store, absOut, options);
  }

  // robots.txt keeps crawlers on the canonical HTML pages and off the
  // `.md` / `.json` sibling URLs. Written last so --static's prerender
  // doesn't clobber it.
  fs.writeFileSync(path.join(absOut, "robots.txt"), ROBOTS_TXT);

  console.log(`[spandrel] Published to ${path.relative(process.cwd(), absOut) || absOut}`);
  return { outDir: absOut, wroteBundle: true };
}

/**
 * Walk every node in the store and emit `<path>/index.html` alongside the
 * existing SPA bundle. Each page carries real markdown content, SEO meta,
 * JSON-LD, and the SPA script tags (extracted from Vite's index.html so
 * hashed filenames aren't hardcoded). The SPA clears `#prerender-content`
 * on mount.
 *
 * Assumes the SPA shell has already been copied into `absOut`. Silently
 * skips prerender (with a warning) if the shell isn't there — there's
 * nothing to reuse.
 */
async function prerenderStaticPages(
  store: GraphStore,
  absOut: string,
  options: PublishOptions
): Promise<void> {
  const shellPath = path.join(absOut, "index.html");
  if (!fs.existsSync(shellPath)) {
    console.warn(
      "[spandrel] --static requested but no SPA shell found at index.html; skipping prerender."
    );
    return;
  }

  const shellHtml = fs.readFileSync(shellPath, "utf-8");
  const shellHead = extractShellHead(shellHtml);

  // Skeleton graph for relationship emission (JSON-LD, banner context).
  // Prerender needs full nodes for the body, which still live on the store.
  const graph = await emitGraph(store);
  const predicateMap = buildLinkTypePredicateMap(graph);
  const renderBody = createStaticMarkdownRenderer(options.base);
  const rootNode = graph.nodes.find((n) => n.path === "/");
  const siteName = rootNode?.name ?? "";

  let wrote = 0;
  for (const node of await store.getAllNodes()) {
    const relOut = nodeOutputRelPath(node.path);
    const outFile = path.join(absOut, relOut);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    const html = renderPage({
      node,
      graph,
      predicateMap,
      base: options.base,
      siteUrl: options.siteUrl,
      shellHead,
      renderBody,
      siteName,
      noindex: options.noindex,
    });
    fs.writeFileSync(outFile, html);
    wrote++;
  }

  console.log(`[spandrel] Prerendered ${wrote} static pages (SEO + JSON-LD).`);
}

export function parsePublishArgs(argv: string[]): { rootDir: string; opts: Partial<PublishOptions> } {
  let rootDir: string | undefined;
  const opts: Partial<PublishOptions> = {};

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") {
      opts.out = argv[++i] ?? "";
    } else if (a.startsWith("--out=")) {
      opts.out = a.slice("--out=".length);
    } else if (a === "--base") {
      opts.base = argv[++i] ?? "";
    } else if (a.startsWith("--base=")) {
      opts.base = a.slice("--base=".length);
    } else if (a === "--strip-private") {
      opts.stripPrivate = true;
    } else if (a === "--no-strip-private") {
      opts.stripPrivate = false;
    } else if (a === "--static") {
      opts.static = true;
    } else if (a === "--no-static") {
      opts.static = false;
    } else if (a === "--site-url") {
      opts.siteUrl = argv[++i] ?? "";
    } else if (a.startsWith("--site-url=")) {
      opts.siteUrl = a.slice("--site-url=".length);
    } else if (a === "--noindex") {
      opts.noindex = true;
    } else if (a === "--no-noindex") {
      opts.noindex = false;
    } else if (!rootDir && !a.startsWith("--")) {
      rootDir = a;
    }
  }

  return { rootDir: rootDir ?? process.cwd(), opts };
}
