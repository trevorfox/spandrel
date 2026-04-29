# Web — Design

The web layer is a single-page application that renders a Spandrel graph for humans. It serves two use cases from one artifact:

1. **Local familiarization and authoring** — shipped with `spandrel dev`, so anyone running the dev server sees their graph immediately at `localhost:4000`.
2. **Public publishing** — shipped by `spandrel publish` as a static bundle suitable for GitHub Pages, Netlify, or any static host.

The viewer is not a framework dependency. It is a consumer of the same graph the REST and MCP layers consume — nothing in the compiler or storage layer knows the viewer exists. If someone wants a different viewer, they read the same `graph.json` shape.

## Who this is for

The viewer is not a docs-site generator, though it happens to generate doc sites. It is a general-purpose window into any Spandrel graph. The real audiences:

- **Knowledge-base owners onboarding teammates.** Someone inherits or joins a mature graph. Opening the viewer shows the full shape in one screen — collections, link types, how things connect — without asking twenty questions or reading the whole tree.
- **Personal knowledge gardeners.** People who keep research notes, reading logs, client dossiers, or a second brain. The graph view turns a pile of markdown into a navigable structure; publishing turns it into a shareable garden.
- **Authors linting their own work.** The warnings drawer surfaces broken links, missing descriptions, and undeclared link types in real time while writing. This is a use case for `spandrel dev`, not publishing.
- **Teams without MCP in their loop.** Not every reader uses an agent. The viewer gives humans a first-class way in.
- **Anyone publishing structured knowledge to the web.** Portfolios, course materials, documentation, research archives.

## Design principles

- **One artifact, two deploys.** The same SPA bundle is served live in dev and as static files in publish. No forked code paths.
- **Data-source minimalism.** The viewer reads exactly one input: `graph.json`. It does not call REST or MCP from the browser. Live-ness is achieved by having the dev server overwrite `graph.json` on rebuild and notify the SPA to refetch.
- **Aesthetic restraint.** The visual style is limestone: serif body, wide margins, thin rules, small-caps metadata labels, muted palette. Dark mode is candlelit stone — warm charcoal and cream. Graphs are thin-lined and typographic, not network-diagram busy.
- **URLs are real.** Every node has a canonical URL and three formats accessible by extension. Bookmarkable, shareable, scrape-friendly.
- **Additive, not speculative.** v1 ships the minimum elegant surface. Prerendering, SEO, and content negotiation are opt-in via flags in later versions.

## Architecture

Three moving parts:

1. The **compiler** emits `graph.json` (and, when content negotiation is on, per-node `.md` and `.json` siblings).
2. The **SPA** in `src/web/` — built by Vite to `dist/web/` — reads `graph.json` and renders the viewer.
3. The **CLI** has two verbs that use the above: `dev` (serves it live) and `publish` (emits it static).

```
compiler ─→ graph.json ─→ SPA
                            ↑
              ┌─────────────┴─────────────┐
          spandrel dev                spandrel publish
        (live, SSE hot reload)        (static, _site/ bundle)
```

Nothing in the compiler or schema layer depends on the viewer. The viewer is downstream of the graph.

## CLI surface

Three commands, three moments in a repo's life:

- **`spandrel init`** — one-time bootstrap in an empty directory. Scaffolds `_access/config.yaml`, `/linkTypes/` vocabulary, `.github/workflows/publish.yml`, and a `CNAME` placeholder. Run once; never again.
- **`spandrel dev <path>`** — the authoring loop. Compiles the graph in memory, watches the filesystem, serves REST, MCP, SSE, and the viewer at `localhost:4000`. This is where writing happens.
- **`spandrel publish <path> --out _site [--base /repo/] [--strip-private] [--static] [--site-url https://example.com]`** — the deploy step. Compiles once, writes `graph.json`, copies the SPA bundle into `--out`. That folder is the deployable.

Mental model: **init = birth, dev = daily work, publish = ship.**

## Viewer layout

```
┌──────────────────────────────────────────────────────────┐
│ [breadcrumb]              [search]              [theme ☽] │
├──────────────────────────────────┬───────────────────────┤
│                                  │                       │
│  rendered markdown body          │                       │
│  (limestone content frame:       │   d3-force graph      │
│   serif body, wide margins,      │   (clickable nav,     │
│   thin rules, small-caps         │    collection-colored │
│   metadata labels)               │    nodes, thin edges) │
│                                  │                       │
│                                  │                       │
├──────────────────────────────────┴───────────────────────┤
│ ▲ related nodes (grouped by link type) | warnings        │
│   (collapsible drawer)                                   │
└──────────────────────────────────────────────────────────┘
```

Four regions:

- **Top bar.** Breadcrumbs (from the path segments), client-side fuzzy search over names and descriptions, theme toggle.
- **Main content (left/center).** The current node. Rendered markdown body in a limestone frame. Frontmatter metadata shown as small-caps header. Reading surface — should feel calm.
- **Right.** The full graph visualization, d3-force, always visible. Click a node to navigate. Collections color-coded. Current node highlighted. This is the primary navigator.
- **Bottom drawer (collapsible).** Related nodes grouped by link type, each showing the type's description. Warnings strip (broken links, undeclared linkTypes, missing descriptions) piped straight from compiler output.

## Theme

Light and dark are orthogonal to format — independent toggles.

- **Light (limestone):** warm off-white background, deep graphite text, soft ochre accents. Serif body (Source Serif or similar), sans-serif metadata labels in small caps. Thin hairline rules. Generous whitespace.
- **Dark (candlelit stone):** warm charcoal background, cream text, amber accents. Same typography, same rules.

Theme persists in `localStorage`; system preference is the initial default.

## Hot reload

In dev mode the server opens a Server-Sent Events channel at `/events`. SSE is plain HTTP: the server holds the connection open and pushes text messages to the browser. When the compiler finishes a rebuild, the server pushes `reload`. The SPA refetches `graph.json` and re-renders. Simpler than websockets; no separate protocol, no library needed.

## Access control on publish

Publish defaults to `--strip-private`: the compiler reads `_access/config.yaml` and removes nodes and edges gated to non-public roles before writing `graph.json`. This matches the governed-graph framing — publishing is an explicit release, not an accidental export.

To publish a genuinely private-hosted graph, the operator opts in with `--no-strip-private` and hosts the output behind their own auth. Not recommended for GitHub Pages.

## GitHub Pages deployment

The `init`-scaffolded workflow:

```yaml
on: { push: { branches: [main] } }
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions: { pages: write, id-token: write }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install -g spandrel
      - run: spandrel publish . --out _site --base /$GITHUB_REPOSITORY_NAME/
      - uses: actions/upload-pages-artifact@v3
        with: { path: _site }
      - uses: actions/deploy-pages@v4
```

Repo Settings → Pages → Source: **GitHub Actions**. Site lands at `<user>.github.io/<repo>/`.

Notes:
- `--base` is required on project pages because assets are served from `/<repo>/`, not `/`. Hash routing (`#/path/to/node`) handles deep links without needing SPA fallback files.
- User pages (`<user>.github.io/`) serve at `/` and don't need `--base`.
- Private repos work on paid plans; the Action builds private source and publishes public static output. On Free plans, a two-repo pattern works: private `my-kg` writes `_site/` into a public `my-kg-site` repo.
- Custom domains: `CNAME` file at the root of `_site/`. `init` scaffolds an empty placeholder.

Local preview of a published bundle: `npx serve _site`. Opening `index.html` via `file://` does not work — browsers block `fetch('graph.json')` from file URLs.

## v1.1: format toggles and URL extensions

A follow-up layer that makes each node addressable in three machine-readable formats.

Three views of every node, each at its own URL:

- `/clients/acme-corp` — rendered HTML (default)
- `/clients/acme-corp.md` — raw markdown body + frontmatter as YAML, monospace
- `/clients/acme-corp.json` — full node object: name, description, frontmatter, links, body

A toggle in the top bar updates the URL. Bookmarkable. The same content negotiation works via `curl` or `fetch`, so agents can pull machine-readable node data without HTML scraping — effectively a read-only HTTP API over static files.

In dev mode the server handles extension-based routing directly. In publish mode the compiler emits the three siblings per node.

## v1.2: `--static` and SEO

Opt-in via `spandrel publish --static`. Adds a prerender pass over the graph: for each node, emit `_site/<path>/index.html` with the markdown already rendered into the body. The SPA shell still hydrates on top for the interactive graph pane. The result is a real static site — every URL returns real HTML, "view source" shows real content, crawlers can index without running JS.

SEO metadata, included only in `--static` output:

- `<title>` from node name
- `<meta name="description">` from frontmatter description
- `<link rel="canonical">` from canonical URL
- OpenGraph and Twitter card tags
- JSON-LD schema.org block

The JSON-LD uses a disciplined six-predicate whitelist, not the full internal link-type vocabulary:

- `isPartOf` — node → parent collection
- `hasPart` — collection → children
- `about` — node → subject/topic
- `mentions` — generic reference (catch-all)
- `sameAs` — external canonical equivalents
- `relatedLink` — generic "see also"

Every declared link type in `/linkTypes/<type>/index.md` may optionally include a `schemaOrg:` frontmatter field mapping it to one of the six. Unmapped types default to `mentions`. Values outside the whitelist are rejected at build time with a warning and fall back to `mentions`. Framing: **JSON-LD is a projection, not a mirror.** The viewer, REST, and MCP continue to see the full typed vocabulary (`depends-on`, `supersedes`, `owned-by`). Only the public structured-data block is restricted. Search engines get something they understand; agents and humans get the real graph.

The `@type` for each node is inferred from its shape: `DefinedTerm` for nodes under `/linkTypes/`, `Collection` for composites, `CreativeWork` for leaves. An individual node can override via a `schemaType:` frontmatter field when a more specific type fits (e.g. `Organization`, `Person`).

Canonical URL policy: `--site-url` (optional, default empty) controls whether the `<link rel="canonical">`, `og:url`, and JSON-LD `url`/`@id` fields emit absolute or relative URLs. When unset, relative URLs degrade gracefully on sub-path hosting. When set, absolute URLs land in every page — Google prefers those.

## Scope boundaries

### In v1

- SPA at `localhost:4000` via `spandrel dev`
- `spandrel publish` producing a deployable `_site/` bundle
- `graph.json` as the sole data source
- Markdown body rendering with limestone styling
- d3-force graph viz on the right
- Related-nodes drawer with link types surfaced
- Warnings panel fed from compiler output
- Client-side fuzzy search
- Light/dark theme toggle
- SSE hot reload in dev
- `--strip-private` default on publish
- `spandrel init` scaffolds the publish workflow + `CNAME` placeholder

### In v1.1

- Format toggle + URL extension routing (`.md`, `.json`)

### In v1.2

- `--static` flag: per-node prerendered HTML
- `--site-url` flag: absolute canonical URLs when an origin is known
- SEO meta tags (title, description, canonical, OpenGraph, Twitter)
- JSON-LD with six-predicate whitelist
- Optional `schemaOrg:` mapping in `/linkTypes/` frontmatter
- Optional per-node `schemaType:` frontmatter override for `@type` inference

### Out of scope

- Image / asset copying through the publish pipeline (knowledge graphs don't need it in the initial target use case)
- Federation across repos
- Multi-user auth for the dev viewer (localhost only)
- Server-side rendering for dynamic hosted deploys
- A separate `@spandrel/site` package (premature split; graduate later if theming/plugins demand independence)

## What the viewer is not

- **Not a CMS.** Authoring happens in the filesystem, in any text editor. The viewer reads.
- **Not a replacement for MCP.** The published static bundle is a read-only projection. Live, governed, authenticated access runs through MCP and REST, served by `spandrel dev` locally or by any operator running the server in production.
- **Not opinionated about content.** It renders whatever shape of graph the compiler produces. No schema assumptions beyond the Spandrel content model.
