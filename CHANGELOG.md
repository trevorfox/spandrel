# Changelog

All notable changes to Spandrel are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The stable surface for consumers is documented in [PUBLIC-API.md](./PUBLIC-API.md).

## [0.8.0] — 2026-05-09

Graph mutations — move, delete, and cascade-rewrite across the full author-facing surface (CLI, MCP, REST). Plus two compiler resilience fixes folded in: malformed YAML frontmatter no longer crashes the compile, and concurrent watcher events no longer leave stale hierarchy edges.

### Added

- **`move_thing` MCP tool** — rename or move a Thing to a new path. Rewrites every referrer's declared frontmatter links automatically; surfaces inline markdown `[text](/path)` mentions that point at the moved node as `danglingMentions` so authors can fix prose by hand.
- **`POST /node/{path}/move` REST endpoint** — same semantics as `move_thing`. Body: `{ "to": "/new/path" }`. Returns `{ success, from, to, moveResult, warnings }`.
- **`spandrel mv <from> <to>` CLI subcommand** — previews the edit plan to stderr, then applies on `--yes`. `--dry-run` previews and exits 0. `--cascade` flag is not applicable (use `spandrel rm` with `--cascade` for deletes).
- **`spandrel rm <path> [--cascade] [--dry-run] [--yes]` CLI subcommand** — previews the delete edit plan to stderr. Without `--cascade`, refuses when inbound declared-link referrers exist. With `--cascade`, strips dead link entries from every referrer's frontmatter before deleting.
- **`danglingMentions` field on `MoveResult` and `DeleteResult`** — an array of `{ in: string, to: string }` entries naming every node whose markdown body contains an inline `[text](/path)` mention pointing at the moved/deleted node. These are surfaced for author attention; they are not auto-rewritten. Surfaced in MCP tool results, REST response bodies, and CLI stderr output.

### Changed (potentially breaking)

- **`delete_thing` MCP tool now refuses by default when inbound declared-link referrers exist.** Previously deleted unconditionally, leaving dangling `links` entries in every referrer. Now throws and returns `{ success: false }` unless the caller passes `cascade: "remove-link"`, which strips the dead link entries from every referrer's frontmatter as part of the deletion. Callers that previously relied on unconditional delete must add `cascade: "remove-link"` to preserve the old behavior (minus the silent data loss).
- **`DELETE /node/{path}` REST endpoint now refuses by default when referrers exist.** Same change as the MCP tool. Pass `?cascade=remove-link` to opt into removing dead link entries. Returns HTTP 400 when refused.

### Fixed

- **Compiler skips files with malformed YAML frontmatter instead of crashing.** A single bad frontmatter (e.g. an unquoted colon in a value) previously threw a `YAMLException` out of gray-matter and killed the entire compile — taking down `dev` mode and `spandrel publish` with a stack trace that didn't even name the offending file. Each `matter()` call is now wrapped; YAML failures emit a `yaml_parse_error` warning naming the file and the parser's reason, the node is skipped, and the walk continues — same pattern as `file_too_large` and `compile_timeout`.
- **Watcher serializes change events to prevent stale edges.** `recompileNode` did a read-filter-write on the store's edge list, so two concurrent unlinks (e.g. deleting two siblings together) raced — each filtered from the same snapshot and the later write clobbered the earlier deletion, leaving a hierarchy edge to a node that no longer existed. Watcher events are now chained behind a single-slot promise so they observe in order but execute one at a time.

---

## [0.7.1] — 2026-05-04

Compiler honesty pass. Three small fixes that turn the validation output from "mostly false-positive noise" into actual signal. Audited against the framework's own `docs/` KG: 15 warnings → 0 warnings (three compiler fixes resolved 13; two real content gaps fixed in `docs/content-model/index.md`).

### Fixed

- **`broken_link` no longer flags inline links inside fenced code blocks or inline code spans.** Pattern docs use `[Acme](/clients/acme)` inside ` ``` ` examples to *illustrate* the linking syntax; those aren't real edges. Link extraction now strips fenced code blocks (` ```…``` `, `~~~…~~~`) and inline code spans (`` `…` ``) before scanning prose. Resolves the case where author-illustrative examples produced spurious broken-link warnings.
- **`broken_link` strips anchor fragments before path lookup.** `[Section](/content-model/nodes#some-section)` resolves cleanly when `/content-model/nodes` exists; the fragment is no longer treated as part of the target path. (No `unknown_anchor` warning yet — fragment validation against headings is a future capability.)
- **`unlisted_child` no longer warns for `navigable: false` children.** Companion documents (`DESIGN.md`, `SKILL.md`, `AGENT.md`, etc.) compile as `kind: document, navigable: false` — by design they're *not* part of the parent's navigable surface, so requiring them to be mentioned in the parent body inverts their purpose. The check now correctly skips `navigable: false` nodes.

### Internal

- 4 new compiler test fixtures covering each change.
- `docs/content-model/index.md` updated to link `/content-model/design-md`, `/content-model/reserved-prefixes`, `/content-model/nodes`, `/content-model/links`, `/content-model/paths` explicitly (closes the two real `unlisted_child` gaps surfaced by the audit).

---

## [0.7.0] — 2026-05-04

**BREAKING: the `spandrel/web` embeddable-viewer surface is removed.** `mountViewer`, `createStaticDataSource`, `createRestDataSource`, the `ViewerOptions` / `ViewerHandle` / `ViewerDataSource` types, and the `spandrel/web/styles.css` re-export are no longer part of the package's exports map. The viewer source stays in-tree and powers `spandrel publish` internally, but it's no longer a documented embed point.

### Why

The mount API shipped in 0.5.0 anticipating multiple host integrations. In practice the cross-coupling friction (host auth model vs. embedded data calls, layout containment, theme bridging) consistently outweighed the value of a public viewer-mount surface for the consumers we observed. Hosts that need a graph viewer in their product can serve `spandrel publish`'s static bundle directly or build their own UI against the documented REST contract.

### Removed

- `mountViewer`, `createStaticDataSource`, `createRestDataSource` from `spandrel/web` (no longer in the exports map).
- `ViewerOptions`, `ViewerHandle`, `ViewerDataSource` types.
- `spandrel/web/styles.css` re-export (was added in 0.6.0).
- `scripts/build-web-styles.ts` and the `build:web-styles` npm script.
- `test/web/styles-export.test.ts`.

### Kept

- `renderNodeAsMarkdown` (top-level export — still public, used for markdown round-trip).
- The viewer source under `src/web/` (powers `spandrel publish` only).
- Cascade-layer setup (`@layer spandrel-base`, `@layer spandrel-components`) and per-mount state — internal, no ongoing API cost.
- The compiler, storage, access-policy, REST, and MCP public surfaces — unchanged.

### Migration

- **Hosts that imported from `spandrel/web`:** there is no like-for-like replacement in 0.7.0. Either pin to `spandrel@^0.6.0`, serve `spandrel publish`'s static bundle, or build a viewer against the REST contract documented in `PUBLIC-API.md`.
- **Everyone else:** no action — the framework's documented top-level surface is unchanged.

---

## [0.6.0] — 2026-05-03

**BREAKING: companion-file lowercase forms are now a hard error.** The `companion_file_lowercase` deprecation warning introduced in 0.5.0 is promoted to a compile error. Rename any lowercase companion files (`design.md`, `skill.md`, `agent.md`, `readme.md`, `claude.md`, `agents.md`) to their uppercase canonical stems (`DESIGN.md`, `SKILL.md`, `AGENT.md`, `README.md`, `CLAUDE.md`, `AGENTS.md`) before upgrading.

This release also lands the three Phase A viewer deferrals from 0.5.0 (CSS specificity, per-mount state, stable `spandrel/web/styles.css` re-export) — see "Phase B viewer polish" below.

### Changed

- **`companion_file_lowercase` warning → compile error.** `src/compiler/compiler.ts` now throws when it encounters a lowercase companion-file form. The error message names the offending file and tells the user the canonical uppercase stem to rename to. Compilation aborts on the first violation; fix and re-run.

### Phase B viewer polish

- **Cascade layers for viewer styles.** `src/web/app/styles/components.css` and `base.css` are wrapped in `@layer spandrel-components` and `@layer spandrel-base` respectively, with explicit layer ordering. Hosts embedding the viewer override visual rules with unlayered CSS (or rules in a later layer) — their selectors win regardless of specificity, no `!important` needed. Internal cascade behaves normally, so state-toggling rules using attribute selectors (e.g. `.tree-rail[data-open="false"]`) keep their natural specificity. A regression test (`test/web/css-specificity.test.ts`) asserts the layer wrap holds across edits.
- **Stable CSS import path: `spandrel/web/styles.css`.** The viewer's source CSS (`tokens.css` + `components.css` + `base.css`) is concatenated at build time into `dist/web/styles.css` and exposed via `package.json` `exports`. Embedders using `mountViewer()` can now `import "spandrel/web/styles.css"` from a bundler that resolves package CSS, instead of reaching into the hashed Vite output.
- **Per-mount viewer state.** `mountViewer()` now instantiates an isolated `ViewerState` per call and threads it through every component constructor. Two viewers under different roots on the same page navigate, scope, and toggle their rails independently — previously they shared module-level signal singletons and silently coupled. Public surface (`mountViewer`, `ViewerOptions`, `ViewerHandle`) is unchanged; the refactor is internal to `src/web/app/`.

### Migration notes

- **Authors:** rename any lowercase companion files in your knowledge repo to the uppercase canonical form. Path identity is preserved — `/architecture/compiler/DESIGN` is the same node either way; only the on-disk filename changes.
- **Consumers (hosts and integrations):** no API surface change. The error surfaces through the same `compile()` call that previously emitted a warning.
- **No other breaking changes in 0.6.0.** Top-level imports, sub-path imports, REST/MCP wire surfaces, and storage contracts are unchanged from 0.5.0.

---


## [0.5.0] — 2026-05-03

Document nodes + embeddable viewer (Phase A). See `_notes/PROPOSAL-0.5.0-document-nodes-and-embeddable-viewer.md` for the full design.

### Added

- **Companion files compile as document nodes.** `DESIGN.md`, `SKILL.md`, `AGENT.md`, `README.md`, `CLAUDE.md`, `AGENTS.md` at any level (root or alongside a composite) compile to `kind: document, navigable: false` children of their containing composite. Path is stem-based and uppercase-canonical regardless of source casing — `docs/architecture/compiler/design.md` becomes `/architecture/compiler/DESIGN`. Lowercase forms are accepted with a `companion_file_lowercase` warning; lowercase support drops in 0.6.0.
- **`kind` and `navigable` are first-class on `SpandrelNode`.** `kind: "node" | "document"` (default `"node"`) and `navigable: boolean` (default `true`) ship on every node.
- **`includeNonNavigable` opt-in across read APIs.** `resolveContext`, `resolveNavigate`, `resolveChildren`, `resolveNode`, `resolveGraph`, and `shapeNodeAsJson` accept the parameter. REST handlers `/graph` and `/node/...` accept `?includeNonNavigable=true`. MCP `context` and `navigate` tools accept the boolean argument. Default behavior excludes companion documents from default child listings; explicit opt-in surfaces them. Documents remain searchable, linkable, and addressable directly via `getNode`.
- **`isNavigable(node)` exported from `spandrel/graph-ops`.** Convenience predicate for consumers writing their own filter logic.
- **Embeddable viewer (`spandrel/web` Phase A).** `mountViewer(root, options)` API with pluggable `ViewerDataSource` (`createStaticDataSource()` for bundles, `createRestDataSource({ baseUrl, headers })` for any spec-conformant REST endpoint). Theme root configurable via `themeRoot` option (defaults to mount root) — `data-theme` attribute now writes there instead of `document.documentElement`. Token CSS scoped to `[data-theme]` (no `:root` prefix) so tokens apply wherever the attribute lives. External routing supported via `routing: "external"` + `onNavigate` for hosts with their own router. Returns `ViewerHandle` with `navigate(path)` and `destroy()`.

### Changed

- **Companion files are now graph content, not skipped.** Through 0.4.x, `EXCLUDED_LEAF_MD_FILES` filtered companion files out of the graph entirely. Starting in 0.5.0, they compile as document nodes. Existing graphs gain new nodes for any companion files they have — visible via `getNode(path)`, `search`, and `includeNonNavigable: true` listings; invisible to default child traversals (so existing default browsing UX is unchanged).
- **`renderNodeAsMarkdown` and `mountViewer`-related symbols added to `spandrel/web` exports.** New top-level `spandrel/web` module — see `PUBLIC-API.md`.
- **Validation skips `kind: "document"` nodes for `missing_name` / `missing_description`.** Documents have sensible defaults derived from their companion-file stem; missing-name warnings are author concerns for curated content, not for documents.

### Migration notes

- **Consumers indexing graph nodes** (custom storage adapters, analyzers, dashboards) will see new document nodes after upgrading. Verify `getChildren` / collection-listing UIs filter `navigable: false` correctly (the framework's `resolveChildren` does this by default; bespoke consumers should mirror the behavior).
- **REST routes** that pass through query params should forward `?includeNonNavigable=true` to the framework helpers.
- **Companion-file authors:** uppercase canonical filenames are recommended (`DESIGN.md`, not `design.md`). Lowercase is accepted in 0.5.0 with a deprecation warning; rename when convenient.
- **No top-level export removed; no breaking changes to existing top-level imports.** `kind` and `navigable` are optional fields on `SpandrelNode` — existing code that doesn't read them is unaffected.

### Phase A scope and Phase B deferrals

The embeddable viewer ships Phase A: data-source pluggability, theme-root locality, token CSS scoping. Three items are explicitly deferred to a later release when a real second consumer asks:

- Component CSS specificity reduction (`:where()` wrap of all 1,343 lines of component rules).
- Per-mount state (multiple viewers on one page sharing or not sharing state).
- Stable `spandrel/web/styles.css` re-export path (Vite currently emits a hashed filename).

Single-mount embedding works correctly today; the deferrals affect rare use cases and are tracked in `PUBLIC-API.md` and the proposal doc.

---

## [0.4.10] — 2026-05-03

Hygiene release. Additive only — no breaking changes to the documented public surface. Existing 0.4.x consumers upgrade by bumping the dep.

### Added

- **Public API documentation.** New `PUBLIC-API.md` at the package root listing stable top-level imports, stable sub-path imports (`spandrel/graph-ops.js`, `spandrel/rest/shape.js`, `spandrel/storage/conformance.js`, `spandrel/access/conformance.js`), what's explicitly internal, and semver discipline.
- **JSON Schema for node frontmatter.** `nodeFrontmatterSchema` (TS const, top-level export) and `schema.json` (static file at the package root). Single source of truth derived from the compiler's validation — usable by typed editors, CMS configs, and validators.
- **Build manifest from `spandrel compile`.** New `--manifest [path]` flag emits structured JSON (`spandrelVersion`, `generatedAt`, `nodeCount`, `edgeCount`, `warningCount`, `warningsByType`, `collections`). Default path: `spandrel-manifest.json`. Programmatic API: `buildManifest(store, opts)` from `"spandrel"`.
- **Reserved-prefix contract.** New top-level section in `/content-model/reserved-prefixes` formalizing that `_*` directories and files are excluded from compilation and reserved for system or sidecar use. Consumers (CMS integrations, file watchers, custom renderers) should apply the same exclusion rule.
- **`createNodeAdapter(router)`.** Wraps the Web-standard router for `node:http` consumers. Returns the classic `(req, res) => Promise<boolean>` shape where `false` means "no route matched, fall through."
- **Top-level exports** for handler authors: `jsonResponse`, `textResponse`, `errorResponse`, `readJsonBody`, `RestContext`, `RestHandler`, `ParsedUrl`, `WebRouter`, `NodeRouter`.
- **`renderNodeAsMarkdown` promoted to top-level export.** Round-trips a `SpandrelNode` back to its on-disk source form. Was previously available via the `spandrel/web/render-node.js` sub-path; the top-level form is the stable contract going forward.

### Changed

- **REST router uses Web-standard primitives.** `createRestRouter` now returns `(req: Request) => Promise<Response | null>` instead of `(req: IncomingMessage, res: ServerResponse) => Promise<boolean>`. `null` means "no route matched, fall through to other handlers." Hosts on Next.js, Hono, Bun, Cloudflare Workers, Deno Deploy, and Vercel Functions consume the handler natively. Reference Node CLI / dev server use `createNodeAdapter` to bridge to `node:http`.
- **`actorFromRequest` takes a Web `Request`.** Was previously typed against `node:http` `IncomingMessage`. Behavior unchanged — same headers, same actor shape.

### Removed

- **`runConformanceTests` and `runAccessPolicyConformance` no longer re-exported from the top-level barrel.** Both modules import `vitest`, which was being dragged into consumer runtimes (Next.js production builds, Vercel functions, plain `node`) and tripping vitest's loader-time internal-state check. Test files now import them from explicit sub-paths:

  ```ts
  import { runConformanceTests } from "spandrel/storage/conformance.js";
  import { runAccessPolicyConformance } from "spandrel/access/conformance.js";
  ```

  Consumer runtimes that imported `runConformanceTests` from `"spandrel"` will fail to resolve — switch to the sub-path. The conformance kits themselves are unchanged.

### Migration notes

- **Test files only:** update imports of `runConformanceTests` and `runAccessPolicyConformance` to the explicit sub-path forms shown above.
- **REST router consumers:**
  - On Web-standard hosts (Next.js, Hono, Bun, Workers, Deno Deploy, Vercel Functions): consume `createRestRouter` directly. Returned handler accepts `Request`, returns `Response | null`.
  - On `node:http` hosts: wrap with `createNodeAdapter(createRestRouter(opts))` to preserve the previous `(req, res) => Promise<boolean>` shape.
- **No other consumer changes required.** All previously-stable top-level imports continue to work.

---

## [0.4.1] — 2026-04-29

REST as a peer of MCP; access policy refactor. See `_notes/PROPOSAL-remove-graphql-from-spec.md` for the spec migration write-up.

## [0.4.0] — 2026-04-29

GraphQL removed from the spec. Three-tier identity (`anonymous` / `identified` / `authenticated`). `AccessPolicy` class introduced as the single enforcement contract. REST wire surface added. Free-function access helpers (`canAccess`, `canWrite`, `filterNodeFields`) replaced by `AccessPolicy` methods.

## [0.3.x] — earlier

GraphQL-based serving. Top-level exports included `createSchema`, `SchemaContext`, and free-function access helpers.
