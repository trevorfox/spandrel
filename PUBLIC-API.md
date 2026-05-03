# Spandrel — Public API

> **Status:** Draft, 2026-05-03. Will be normative as of 0.4.10.

This document lists the npm package's stable public surface. Imports listed here follow semver: breaking changes only on a major version bump. Anything *not* listed here is internal — it may move, rename, or change shape on a minor version.

The goal is portability: a TypeScript or JavaScript host should be able to import Spandrel into its own project, build against the documented surface, and trust that minor upgrades won't silently break.

---

## Top-level imports — `import { … } from "spandrel"`

Stable. Use these by default.

### Compiler

```ts
import {
  compile,
  recompileNode,
  addGitMetadata,
  getHistory,
  buildManifest,
  nodeFrontmatterSchema,
} from "spandrel";

import type {
  SpandrelNode,
  SpandrelEdge,
  SpandrelGraph,
  ValidationWarning,
  HistoryEntry,
  LinkTypeInfo,
  BuildManifest,
  BuildManifestOptions,
  NodeFrontmatterSchema,
} from "spandrel";
```

The static JSON Schema file is also published at the package root:

```ts
import schema from "spandrel/schema.json" with { type: "json" };
```

### Storage

```ts
import { InMemoryGraphStore } from "spandrel";

import type { GraphStore, EdgeFilter } from "spandrel";
```

### Access policy

```ts
import {
  AccessPolicy,
  accessLevelAtLeast,
  loadAccessConfig,
} from "spandrel";

import type {
  Actor,
  AccessLevel,
  AccessConfig,
  Policy,
  RoleConfig,
  DenyRule,
  ShapedNode,
  ShapedEdge,
} from "spandrel";
```

### REST wire surface

```ts
import {
  createRestRouter,
  createNodeAdapter,
  actorFromRequest,
  shapeNodeAsJson,
  jsonResponse,
  textResponse,
  errorResponse,
  readJsonBody,
} from "spandrel";

import type {
  NodeJson,
  NodeReference,
  NodeJsonLinks,
  RestContext,
  RestHandler,
  ParsedUrl,
  WebRouter,
  NodeRouter,
} from "spandrel";
```

> **0.4.10 (shipped):** `createRestRouter` returns a Web-standard handler — `(req: Request) => Promise<Response | null>`. `null` means "no route matched, fall through." Hosts on Next.js, Hono, Bun, Cloudflare Workers, Deno Deploy, Vercel Functions consume this directly. The reference Node CLI uses `createNodeAdapter(router)` to wrap it for `node:http`'s `(req, res) => Promise<boolean>` shape.

### MCP wire surface

```ts
import {
  createMcpServer,
  startMcpServer,
  registerReadOnlyTools,
  registerWriteTools,
  buildInstructions,
  runKeywordSearch,
} from "spandrel";

import type {
  McpServerOptions,
  RegisterReadOnlyToolsOptions,
} from "spandrel";
```

### Markdown serialization

```ts
import { renderNodeAsMarkdown } from "spandrel";
```

Round-trips a `SpandrelNode` back to its on-disk source form (YAML frontmatter + body). Used by `spandrel dev`'s `.md` route and `spandrel publish`'s per-node siblings; available to any consumer that needs to emit a node as text.

---

## Sub-path imports — `import { … } from "spandrel/<path>"`

These exist because some helpers are too granular for the top-level surface but still belong in the public API. Sub-path imports listed here follow the same semver discipline as top-level.

```ts
// Pure helpers shared between MCP and REST. Stable.
import {
  resolveSearch,
  resolveGraph,
  MAX_GRAPH_DEPTH,
  resolveReferences,
  paginate,
  decorateLinkType,
} from "spandrel/graph-ops.js";

// Hyperlink construction for HAL-style _links blocks. Stable.
import { nodeHref } from "spandrel/rest/shape.js";
```

> **0.4.10 change:** `runConformanceTests` and `runAccessPolicyConformance` are removed from the top-level barrel (they were dragging vitest into consumer runtimes). Import them from `spandrel/storage/conformance.js` and `spandrel/access/conformance.js` respectively in your test files.

### Web viewer (0.5.0)

```ts
import {
  mountViewer,
  createStaticDataSource,
  createRestDataSource,
  renderNodeAsMarkdown,
} from "spandrel/web";

import type {
  ViewerOptions,
  ViewerHandle,
  ViewerDataSource,
  Graph,
  SpandrelNode,
  SpandrelEdge,
  ValidationWarning,
  LinkTypeInfo,
} from "spandrel/web";
```

Embed pattern:

```ts
const handle = mountViewer(document.getElementById("viewer-host"), {
  data: createRestDataSource({
    baseUrl: "/api/acme/docs",
    headers: () => ({ Authorization: `Bearer ${session.token}` }),
  }),
  themeRoot: document.getElementById("viewer-host"), // local theming
  routing: "external",
  onNavigate: (path) => router.push(`/viewer${path}`),
});

// later
handle.navigate("/clients/acme");
handle.destroy();
```

The mount root must contain the standard layout skeleton (elements with ids `site-banner`, `top-bar`, `content`, `graph-pane`, `drawer`, `view-pill`, `tree-rail`). The simplest way to obtain the skeleton is to copy it from `spandrel publish` output's `index.html`.

**0.5.0 Phase A scope:**
- Pluggable data source (`ViewerDataSource` interface; `createStaticDataSource()` for bundles, `createRestDataSource()` for any spec-conformant REST endpoint).
- Theme root locality — `data-theme` writes to the configured `themeRoot` (defaults to mount root) instead of `document.documentElement`.
- Token CSS scoped to `[data-theme]` (no `:root` prefix) so tokens apply wherever the attribute lives. Hosts override colors/typography/spacing by redefining tokens for `[data-theme="custom"]`.
- External routing (`routing: "external"` + `onNavigate`) for hosts with their own router.

**0.5.0 Phase A known limitations** (deferred to a later release when a real consumer asks):
- Component CSS specificity is non-zero. Hosts overriding rules beyond token redefinition need higher-specificity selectors or `!important`. A `:where()` wrap pass that drops specificity to zero is mechanical work for a future release.
- Module-level signals (per-mount state) — multiple viewers on one page share state. Single-mount works correctly; multi-mount lands when a consumer needs it.
- CSS bundle path — Vite emits a hashed filename in `dist/web/assets/`. Consumers either import it via the SPA's `index.html` shell or copy `src/web/app/styles/{tokens,components,base}.css` directly. A stable `spandrel/web/styles.css` re-export ships with the same Phase B refactor as the `:where()` wrap.

---

## What's internal

Anything not listed above is internal. In particular:

- Anything under `spandrel/compiler/` other than the top-level `compile` re-export — internal compiler structure may change.
- Anything under `spandrel/storage/` other than `InMemoryGraphStore` and the `GraphStore` / `EdgeFilter` types — alternative reference implementations may come and go.
- Anything under `spandrel/server/` other than the top-level MCP exports — protocol-layer wiring is implementation detail.
- Anything under `spandrel/rest/` other than `nodeHref` (sub-path) and the top-level `createRestRouter` / `actorFromRequest` / `shapeNodeAsJson` exports.
- Anything under `spandrel/access/` other than the top-level access exports.
- Conformance test runners — must be imported from explicit `spandrel/storage/conformance.js` and `spandrel/access/conformance.js` paths in test files only.

If you need a helper that isn't on this list, file an issue describing the use case rather than depending on an internal path. The right answer is usually to promote the helper to the public surface.

---

## Semver discipline

- **Patch (`0.4.x` → `0.4.x+1`)** — bug fixes, additive doc changes, runtime hygiene. No surface change. Safe to take automatically.
- **Minor (`0.4.x` → `0.5.0`)** — new public API entries; backwards-compatible behavior changes; deprecation warnings. Existing public imports still work; some internal-but-discovered paths may move.
- **Major (`0.x` → `0.y`, eventually `1.0`)** — public surface changes. Breaking removals or renames on the listed surface; deprecated forms removed.

While Spandrel is on `0.x`, the surface is committed but the version itself is pre-1.0. Treat each minor as a coordinated upgrade window: read the changelog, run conformance tests, ship.

---

## Versioning history

- **0.3.x** — GraphQL-based serving. Top-level exports included `createSchema`, `SchemaContext`, and free-function access helpers.
- **0.4.0** — GraphQL removed from the spec; `AccessPolicy` class introduced; REST elevated to a peer of MCP. Top-level access free functions (`canAccess`, `canWrite`, `filterNodeFields`) moved to `AccessPolicy` methods.
- **0.4.10** — Conformance re-exports removed from the top-level barrel. REST router switches to Web-standard primitives (`createNodeAdapter` provided for `node:http` consumers). JSON Schema export for node frontmatter (`nodeFrontmatterSchema` + `schema.json` at package root). Build manifest from `spandrel compile --manifest`. `_*` reserved-prefix contract formalized in `/content-model`.
- **0.5.0** *(planned)* — Compiler resolves companion files as `kind: document, navigable: false` nodes. Embeddable viewer at `spandrel/web` with `mountViewer()`, injected data sources, theme-root locality, and CSS isolation.
- **0.6.0** *(planned)* — Drop deprecated lowercase companion-file forms (`design.md` → `DESIGN.md`, etc.). Lint warning becomes hard error.

---

## Reporting

If you're consuming Spandrel from another project and find yourself reaching for an internal path because the public surface doesn't cover your use case, file an issue at [github.com/trevorfox/spandrel/issues](https://github.com/trevorfox/spandrel/issues). The fix is to expand the public surface, not for you to depend on internals.
