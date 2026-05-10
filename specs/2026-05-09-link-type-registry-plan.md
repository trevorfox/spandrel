# Link Type Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/linkTypes/{stem}.md` per-type Things with a single `_links/config.yaml` registry. Drop per-edge `linkTypeDescription` decoration and the link-types vocabulary block from MCP server instructions. Drop the Schema.org JSON-LD type projection. Add opt-in `min_uses` reuse governance. Targets Spandrel `0.9.0`.

**Architecture:** New `src/links/` subsystem (config loader + types) parallels `src/access/`. Compiler reads `_links/config.yaml` at compile entry, passes the registry through `SpandrelGraph` and the storage layer. `/linkTypes/` ceases to be compiler-special. Wire layer (`ShapedEdge`, MCP instructions, REST `/linkTypes`, prerender JSON-LD) is simplified accordingly. The registry is treated as authoring-side configuration, not agent-facing content — the same role `_access/config.yaml` plays for access policy.

**Tech Stack:** TypeScript (Node ≥18), `js-yaml` (loaded via `createRequire`), `vitest`, `gray-matter`.

**Spec:** [2026-05-09-link-type-registry-design.md](./2026-05-09-link-type-registry-design.md)

**Branch:** `link-type-registry-spec` (already exists with two spec commits — implementation continues on this branch).

---

## Conventions

- **TDD per task:** failing test → run to confirm fail → minimum impl → run to confirm pass → commit.
- **Commit prefixes** (matches CLAUDE.local.md): `Impl:` (code), `Test:` (test-only), `Docs:` (doc-only), `CI:`, `Chore:`. Body explains *why*, not *what*.
- **Stage explicitly.** Never `git add -A`. List the files changed in this task.
- **Don't commit `dist/`** — gitignored.
- **Run tests:** `npm test` for full suite; `npx vitest run <file> -t "<name>"` for one.
- **Build sanity:** `npm run build` after intrusive changes; expect zero TS errors.

---

## File map

**New:**
- `src/links/config.ts` — `loadLinksConfig(rootDir)`; mirror of `src/access/config.ts`
- `src/links/types.ts` — `LinkRegistry`, `LinkTypeEntry`
- `src/links/design.md` — system spec companion (matches `src/access/design.md` pattern)
- `test/links-config.test.ts` — config loader tests

**Modified:**
- `src/compiler/types.ts` — revise `LinkTypeInfo`, add new warning codes
- `src/compiler/compiler.ts` — drop `/linkTypes/` indexing, replace `enforce` machinery, add `min_uses` and legacy advisory
- `src/compiler/prerender.ts` — drop Schema.org type-aware projection
- `src/compiler/emit-graph.ts` — passthrough (no logic change; type updates only)
- `src/storage/in-memory-graph-store.ts` — `getLinkTypes()` reads from registry
- `src/storage/remote-graph-store.ts` — `LinkTypeInfo` shape change
- `src/storage/store-to-graph.ts` — passthrough (type updates)
- `src/storage/graph-store.ts` — comment update on `getLinkTypes()`
- `src/access/types.ts` — drop `linkTypeDescription` from `ShapedEdge`
- `src/access/policy.ts` — drop decoration in `shapeEdge`
- `src/graph-ops.ts` — drop `lookupLinkTypeDescription`, update `OutgoingLink`/`RichReference`
- `src/server/mcp.ts` — drop link-types block (lines 88-99 region)
- `src/cli-init.ts` — replace `BASELINE_LINK_TYPES` markdown writes with single YAML
- `src/cli.ts` — drop `linkTypes` mention in startup message (line 194)
- `src/cli-publish.ts` — drop `buildLinkTypePredicateMap` import + call
- `src/web/types.ts` — `LinkTypeInfo` shape update
- `src/web/app/state.ts` — adapt to new `LinkTypeInfo` shape
- `src/web/app/data-source.ts` — passthrough
- `src/web/app/components/drawer.ts` — adapt drawer rendering
- `src/web/design.md` — remove Schema.org section
- `docs/patterns/linking.md` — rewrite
- `docs/content-model/links.md` — rewrite
- `package.json` — bump to `0.9.0`
- `CHANGELOG.md` — add `0.9.0` entry
- `PUBLIC-API.md` — add `0.9.0` entry

**Test rewrites:**
- `test/cli-init.test.ts`
- `test/compiler.test.ts` (`describe("Compiler — /linkTypes/ collection")` block + `enforce` tests)
- `test/access.test.ts` (lines 232, 240)
- `test/mcp.test.ts` (`describe("MCP — buildInstructions and /linkTypes/")` block)
- `test/rest.test.ts` (`describe("GET /linkTypes")` block)
- `test/prerender.test.ts` (`describe("buildLinkTypePredicateMap")` block + Schema.org tests)

---

## Phase 1 — Foundation: types and registry loader

### Task 1: Define new types in `src/links/types.ts`

**Files:**
- Create: `src/links/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/links/types.ts

/**
 * One entry in the link-type registry. Keyed in `LinkRegistry.types` by the
 * canonical stem (e.g. `"realized-by"`). The stem itself is the type's name —
 * there is no separate display-name field. Description is optional; types are
 * expected to have self-explanatory names.
 */
export interface LinkTypeEntry {
  description?: string;
}

/**
 * The link-type registry — a graph-local vocabulary loaded from
 * `_links/config.yaml`. The registry is an authoring artifact: it governs
 * how content is shaped (via `enforce` and `min_uses` warnings), and it is
 * exposed for tooling/web-viewer introspection via REST `GET /linkTypes`.
 * It is NOT pushed into agent context — agents see edge-level `type` and
 * `description` only.
 */
export interface LinkRegistry {
  enforce: boolean;
  minUses: number;
  types: Map<string, LinkTypeEntry>;
}

export const EMPTY_LINK_REGISTRY: LinkRegistry = {
  enforce: false,
  minUses: 0,
  types: new Map(),
};
```

- [ ] **Step 2: Verify TS compiles**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/links/types.ts
git commit -m "Impl: add LinkRegistry types

Foundation for the _links/config.yaml registry. Mirror of src/access/
types.ts in shape — config types live next to their loader."
```

---

### Task 2: TDD the config loader

**Files:**
- Create: `src/links/config.ts`
- Create: `test/links-config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/links-config.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadLinksConfig } from "../src/links/config.js";

function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "spandrel-links-"));
}

describe("loadLinksConfig", () => {
  it("returns an empty registry when no _links/config.yaml exists", () => {
    const root = tempRoot();
    const reg = loadLinksConfig(root);
    expect(reg.enforce).toBe(false);
    expect(reg.minUses).toBe(0);
    expect(reg.types.size).toBe(0);
  });

  it("loads a minimal registry with one type", () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, "_links"));
    fs.writeFileSync(
      path.join(root, "_links/config.yaml"),
      `types:\n  realized-by:\n    description: Target implements the source.\n`
    );
    const reg = loadLinksConfig(root);
    expect(reg.types.size).toBe(1);
    expect(reg.types.get("realized-by")?.description).toBe(
      "Target implements the source."
    );
  });

  it("reads enforce and min_uses governance knobs", () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, "_links"));
    fs.writeFileSync(
      path.join(root, "_links/config.yaml"),
      `enforce: true\nmin_uses: 2\ntypes:\n  affects:\n    description: x\n`
    );
    const reg = loadLinksConfig(root);
    expect(reg.enforce).toBe(true);
    expect(reg.minUses).toBe(2);
  });

  it("supports types without descriptions (description is optional)", () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, "_links"));
    fs.writeFileSync(
      path.join(root, "_links/config.yaml"),
      `types:\n  owns: {}\n  depends-on: {}\n`
    );
    const reg = loadLinksConfig(root);
    expect(reg.types.size).toBe(2);
    expect(reg.types.get("owns")?.description).toBeUndefined();
  });

  it("returns an empty registry on malformed YAML, not a crash", () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, "_links"));
    fs.writeFileSync(
      path.join(root, "_links/config.yaml"),
      `types:\n  realized-by:\n    description: : : :\n  - this is invalid\n`
    );
    // Capture console output so the test doesn't print noise
    const errs: unknown[] = [];
    const origErr = console.error;
    console.error = (...a: unknown[]) => errs.push(a);
    try {
      const reg = loadLinksConfig(root);
      expect(reg.types.size).toBe(0);
      expect(reg.enforce).toBe(false);
    } finally {
      console.error = origErr;
    }
  });

  it("ignores top-level keys other than enforce, min_uses, types", () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, "_links"));
    fs.writeFileSync(
      path.join(root, "_links/config.yaml"),
      `enforce: false\nfoo: bar\ntypes:\n  owns: {}\n`
    );
    const reg = loadLinksConfig(root);
    expect(reg.types.size).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test — confirm failure**

Run: `npx vitest run test/links-config.test.ts`
Expected: FAIL — `Cannot find module '../src/links/config.js'`.

- [ ] **Step 3: Implement the loader**

Create `src/links/config.ts`:

```typescript
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { LinkRegistry, LinkTypeEntry } from "./types.js";
import { EMPTY_LINK_REGISTRY } from "./types.js";

const require = createRequire(import.meta.url);
const yaml = require("js-yaml");

/**
 * Load `_links/config.yaml` from a knowledge-repo root. Returns an empty
 * registry when the file is absent or unparseable — the compiler treats
 * an empty registry as "no governance, no declared types" (smart default,
 * matches the `_access/config.yaml` posture).
 */
export function loadLinksConfig(rootDir: string): LinkRegistry {
  const configPath = path.join(rootDir, "_links", "config.yaml");
  if (!fs.existsSync(configPath)) return cloneEmpty();

  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf-8");
  } catch (err) {
    console.error(`[spandrel] failed to read ${configPath}:`, err);
    return cloneEmpty();
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    console.error(`[spandrel] malformed YAML in ${configPath}:`, err);
    return cloneEmpty();
  }

  if (!parsed || typeof parsed !== "object") return cloneEmpty();
  const obj = parsed as Record<string, unknown>;

  const enforce = obj.enforce === true;
  const minUses =
    typeof obj.min_uses === "number" && Number.isFinite(obj.min_uses) && obj.min_uses >= 0
      ? Math.floor(obj.min_uses)
      : 0;

  const types = new Map<string, LinkTypeEntry>();
  const typesField = obj.types;
  if (typesField && typeof typesField === "object" && !Array.isArray(typesField)) {
    for (const [stem, entry] of Object.entries(typesField as Record<string, unknown>)) {
      if (typeof stem !== "string" || stem.length === 0) continue;
      const description =
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? (entry as Record<string, unknown>).description
          : undefined;
      types.set(stem, {
        description: typeof description === "string" ? description : undefined,
      });
    }
  }

  return { enforce, minUses, types };
}

function cloneEmpty(): LinkRegistry {
  return {
    enforce: EMPTY_LINK_REGISTRY.enforce,
    minUses: EMPTY_LINK_REGISTRY.minUses,
    types: new Map(),
  };
}
```

- [ ] **Step 4: Run the test — confirm pass**

Run: `npx vitest run test/links-config.test.ts`
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/links/config.ts test/links-config.test.ts
git commit -m "Impl: loadLinksConfig reads _links/config.yaml

Mirror of src/access/config.ts pattern. Returns an empty registry
on missing file or malformed YAML — same posture as the access
config loader and the malformed-frontmatter handler from #7."
```

---

### Task 3: Add design.md companion for `src/links/`

**Files:**
- Create: `src/links/design.md`

- [ ] **Step 1: Write the design.md**

Create `src/links/design.md`:

```markdown
# Links Subsystem — Design

System config that governs the link-type vocabulary used across a Spandrel graph. Mirror of `_access/` in role: a system-level config file under an underscore-prefixed system directory, loaded once at compile time, surfaced through specific REST endpoints but **not** pushed into agent context by default.

## Authoring surface

`_links/config.yaml` at the graph root. Three top-level keys:

- `enforce: bool` — when `true`, the compiler emits `unknown_link_type` warnings for any `linkType` used on an edge but absent from `types:`. Default `false`.
- `min_uses: number` — when `> 0`, emits `underused_link_type` warnings for any type that appears in the graph fewer than N times. Default `0`.
- `types: { [stem]: { description?: string } }` — the declared vocabulary. The YAML key is the canonical stem. Descriptions are optional — type names should be self-explanatory.

## Doctrinal stance

The registry is an **authoring artifact**, not an agent artifact. Its purposes:

1. Compile-time governance via `enforce` and `min_uses`.
2. Author-side discoverability — one place to scan the graph's vocabulary.
3. Definitions for graph-local jargon, available to authoring tools and the web viewer.

It is **not** surfaced to agents at traversal time. The MCP server's instructions block does not render the registry. The two fields an agent sees on every edge — `linkType` (a self-explanatory label) and `description` (per-edge prose) — are the entire semantic surface.

## Surfaces

- **Compiler** — `loadLinksConfig(rootDir)` is called at compile entry; the returned registry is passed through `SpandrelGraph.linkTypes` and the storage layer.
- **REST** — `GET /linkTypes` returns the registry contents for tooling and viewer introspection.
- **Web viewer** — consumes `Graph.linkTypes` (an array projection of the registry) for type-grouped edge rendering in the drawer.
- **MCP** — does NOT render the registry. Agents read edge-level `linkType` + `description` directly.
```

- [ ] **Step 2: Commit**

```bash
git add src/links/design.md
git commit -m "Docs: design.md companion for src/links/

Mirrors the src/access/design.md pattern. States the doctrinal
stance: registry is authoring config, not agent-facing content."
```

---

## Phase 2 — Compiler integration

### Task 4: Revise `LinkTypeInfo` and `ValidationWarning` types

**Files:**
- Modify: `src/compiler/types.ts`

- [ ] **Step 1: Edit `src/compiler/types.ts` — `LinkTypeInfo`**

Replace the existing `LinkTypeInfo` block (lines ~54-64):

```typescript
/**
 * The wire-shape of a link-type entry, exposed via REST `GET /linkTypes`,
 * `Graph.linkTypes` in the prerendered manifest, and consumed by the web
 * viewer's drawer for type-grouped edge rendering.
 *
 * Sourced from `_links/config.yaml` (NOT from `/linkTypes/{stem}.md` Things
 * — that pattern was removed in 0.9.0). The canonical key is `stem`; there
 * is no separate display name. Description is optional.
 */
export interface LinkTypeInfo {
  stem: string;
  description?: string;
}
```

- [ ] **Step 2: Edit `src/compiler/types.ts` — `ValidationWarning.type` union**

Replace the type-codes union to drop `undeclared_link_type` and add the new codes:

```typescript
export interface ValidationWarning {
  path: string;
  type:
    | "missing_index"
    | "missing_name"
    | "missing_description"
    | "broken_link"
    | "unlisted_child"
    | "file_too_large"
    | "compile_timeout"
    | "invalid_frontmatter"
    | "unknown_link_type"      // replaces undeclared_link_type
    | "underused_link_type"    // new: min_uses governance
    | "yaml_parse_error"
    | "companion_file_lowercase";
  message: string;
}
```

(Note: `yaml_parse_error` already exists per CHANGELOG 0.8.0 — verify it's in the union; if not, leave it out.)

- [ ] **Step 3: Verify TS compile**

Run: `npm run build`
Expected: many errors in dependent files (we'll fix them in subsequent tasks). Note the count and proceed.

- [ ] **Step 4: Commit**

```bash
git add src/compiler/types.ts
git commit -m "Impl: revise LinkTypeInfo and ValidationWarning for new registry

LinkTypeInfo loses 'name' and 'path' (types are no longer Things, so
no addressable path; stem is the canonical key). ValidationWarning
adds unknown_link_type and underused_link_type codes; drops
undeclared_link_type. Dependent files are broken by this change and
will be fixed in subsequent tasks."
```

---

### Task 5: Wire `loadLinksConfig` into the compiler entry point

**Files:**
- Modify: `src/compiler/compiler.ts`

The compiler's main entry point (function that returns `SpandrelGraph`) needs to load the registry and store it on the graph. This task only wires the load — `getLinkTypeEnforcement` and `collectDeclaredLinkTypes` still exist; we replace them in the next task.

- [ ] **Step 1: Find the compiler entry**

Run: `grep -n "export.*function compile\|SpandrelGraph" src/compiler/compiler.ts | head`
Identify the main `compile` (or equivalent) function that returns `SpandrelGraph`.

- [ ] **Step 2: Add the import at the top of `compiler.ts`**

```typescript
import { loadLinksConfig } from "../links/config.js";
import type { LinkRegistry } from "../links/types.js";
```

- [ ] **Step 3: In the compiler entry, load the registry alongside the walk**

Inside the function that produces `SpandrelGraph`, after determining `rootDir` and before constructing the graph, add:

```typescript
const linkRegistry = loadLinksConfig(rootDir);
```

Pass `linkRegistry` to `validate()` (we'll consume it in Task 6) and store it on the graph (Task 9 wires `getLinkTypes()` to use it).

For now, just add the load and a pass-through. Define a temporary holder if needed — the integration tightens in later tasks.

- [ ] **Step 4: Run existing compiler tests**

Run: `npx vitest run test/compiler.test.ts`
Expected: existing tests still pass — this task adds a load but doesn't change behavior yet.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/compiler.ts
git commit -m "Impl: load _links/config.yaml at compile entry

The registry value isn't yet consumed; subsequent tasks replace
the /linkTypes/ Things-indexing with this registry."
```

---

### Task 6: Replace `enforce` machinery — drop list-mode, support boolean from registry

**Files:**
- Modify: `src/compiler/compiler.ts`
- Modify: `test/compiler.test.ts` (rewrite enforce tests)

- [ ] **Step 1: Rewrite the enforcement function in `compiler.ts`**

Replace the existing `getLinkTypeEnforcement` (lines ~672-690) and the validation block that uses it (lines ~735-757).

```typescript
/**
 * Emit `unknown_link_type` warnings for any linkType used on an edge but
 * absent from the registry's `types:` map, ONLY when `enforce: true`.
 *
 * Replaces the previous `/linkTypes/index.md` `enforce: strict | [list]`
 * mechanism. The list-mode is dropped — in a single-registry world a type
 * is either declared or it isn't.
 */
function emitUnknownLinkTypeWarnings(
  edges: SpandrelEdge[],
  registry: LinkRegistry,
  warnings: ValidationWarning[]
): void {
  if (!registry.enforce) return;
  const seen = new Set<string>();
  for (const edge of edges) {
    if (edge.type !== "link" || !edge.linkType) continue;
    if (registry.types.has(edge.linkType)) continue;
    const key = `${edge.from} ${edge.linkType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    warnings.push({
      path: edge.from,
      type: "unknown_link_type",
      message: `Link edge uses linkType "${edge.linkType}" which is not declared in _links/config.yaml. Add it to the registry, or use an existing type.`,
    });
  }
}
```

Update the `validate()` function so it accepts the registry parameter and calls `emitUnknownLinkTypeWarnings(edges, registry, warnings)` instead of the old `getLinkTypeEnforcement` + `collectDeclaredLinkTypes` flow. **Delete** `getLinkTypeEnforcement` and the old in-line validation block.

`collectDeclaredLinkTypes` stays for now — Task 8 (legacy advisory) still needs it briefly, then it's deleted in Task 9.

- [ ] **Step 2: Rewrite `test/compiler.test.ts` enforce tests**

The existing tests live in the region around lines 367-600 and use `writeIndex(path.join(root, "linkTypes"), ...)` to set up `enforce: strict` / list-mode scenarios.

Replace them with two new tests that use `_links/config.yaml`:

```typescript
// Helper — already exists above? if not, add:
function writeLinksConfig(root: string, body: string): void {
  fs.mkdirSync(path.join(root, "_links"), { recursive: true });
  fs.writeFileSync(path.join(root, "_links/config.yaml"), body);
}

it("emits unknown_link_type warnings under enforce: true for undeclared types", async () => {
  const root = tempRoot();
  writeIndex(root, { name: "Test Graph", description: "x" });
  writeLinksConfig(
    root,
    `enforce: true\ntypes:\n  owns:\n    description: Operational control.\n`
  );
  fs.writeFileSync(
    path.join(root, "alpha.md"),
    `---\nname: Alpha\ndescription: x\nlinks:\n  - to: /beta\n    type: foo\n---\n`
  );
  fs.writeFileSync(
    path.join(root, "beta.md"),
    `---\nname: Beta\ndescription: y\n---\n`
  );

  const graph = await compile(root);
  const warnings = graph.warnings.filter(
    (w) => w.type === "unknown_link_type"
  );
  expect(warnings).toHaveLength(1);
  expect(warnings[0].message).toContain('"foo"');
});

it("emits zero unknown_link_type warnings when enforce: false (default)", async () => {
  const root = tempRoot();
  writeIndex(root, { name: "Test Graph", description: "x" });
  writeLinksConfig(root, `types:\n  owns: {}\n`);
  fs.writeFileSync(
    path.join(root, "alpha.md"),
    `---\nname: Alpha\ndescription: x\nlinks:\n  - to: /beta\n    type: foo\n---\n`
  );
  fs.writeFileSync(
    path.join(root, "beta.md"),
    `---\nname: Beta\ndescription: y\n---\n`
  );

  const graph = await compile(root);
  const warnings = graph.warnings.filter(
    (w) => w.type === "unknown_link_type"
  );
  expect(warnings).toHaveLength(0);
});

it("does not emit warnings when graph has no _links/config.yaml at all", async () => {
  const root = tempRoot();
  writeIndex(root, { name: "Test Graph", description: "x" });
  fs.writeFileSync(
    path.join(root, "alpha.md"),
    `---\nname: Alpha\ndescription: x\nlinks:\n  - to: /beta\n    type: anything\n---\n`
  );
  fs.writeFileSync(
    path.join(root, "beta.md"),
    `---\nname: Beta\ndescription: y\n---\n`
  );

  const graph = await compile(root);
  const warnings = graph.warnings.filter(
    (w) => w.type === "unknown_link_type"
  );
  expect(warnings).toHaveLength(0);
});
```

**Delete** the old enforce describe block(s) entirely — `enforce: strict` and `enforce: [list]` tests are gone.

- [ ] **Step 3: Run the affected tests**

Run: `npx vitest run test/compiler.test.ts`
Expected: the new enforce tests pass. Old `/linkTypes/`-collection tests still failing (they're addressed in later tasks).

- [ ] **Step 4: Commit**

```bash
git add src/compiler/compiler.ts test/compiler.test.ts
git commit -m "Impl: replace enforce machinery with boolean from registry

Drops the list-mode enforce: [type1, type2] semantic — it has no
clean meaning in a single-registry world (a type is either in
types: or it isn't). New warning code: unknown_link_type."
```

---

### Task 7: Add `min_uses` reuse warnings

**Files:**
- Modify: `src/compiler/compiler.ts`
- Modify: `test/compiler.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/compiler.test.ts`:

```typescript
it("emits underused_link_type warnings when types appear < min_uses", async () => {
  const root = tempRoot();
  writeIndex(root, { name: "Test Graph", description: "x" });
  writeLinksConfig(root, `min_uses: 2\ntypes: {}\n`);

  // 'rare' is used once; 'common' is used twice
  fs.writeFileSync(
    path.join(root, "alpha.md"),
    `---\nname: Alpha\ndescription: x\nlinks:\n  - to: /beta\n    type: rare\n  - to: /gamma\n    type: common\n---\n`
  );
  fs.writeFileSync(
    path.join(root, "beta.md"),
    `---\nname: Beta\ndescription: y\nlinks:\n  - to: /gamma\n    type: common\n---\n`
  );
  fs.writeFileSync(
    path.join(root, "gamma.md"),
    `---\nname: Gamma\ndescription: z\n---\n`
  );

  const graph = await compile(root);
  const warnings = graph.warnings.filter((w) => w.type === "underused_link_type");
  expect(warnings).toHaveLength(1);
  expect(warnings[0].message).toContain('"rare"');
  expect(warnings[0].message).toContain("1 time");
});

it("emits no underused warnings when min_uses: 0 (default)", async () => {
  const root = tempRoot();
  writeIndex(root, { name: "Test Graph", description: "x" });
  writeLinksConfig(root, `types: {}\n`);
  fs.writeFileSync(
    path.join(root, "alpha.md"),
    `---\nname: Alpha\ndescription: x\nlinks:\n  - to: /beta\n    type: rare\n---\n`
  );
  fs.writeFileSync(
    path.join(root, "beta.md"),
    `---\nname: Beta\ndescription: y\n---\n`
  );

  const graph = await compile(root);
  expect(
    graph.warnings.filter((w) => w.type === "underused_link_type")
  ).toHaveLength(0);
});
```

- [ ] **Step 2: Run — confirm fail**

Run: `npx vitest run test/compiler.test.ts -t "underused_link_type"`
Expected: FAIL — warning code not emitted.

- [ ] **Step 3: Implement in `compiler.ts`**

Add to `compiler.ts` next to `emitUnknownLinkTypeWarnings`:

```typescript
/**
 * Emit `underused_link_type` warnings for any linkType that appears in
 * the graph fewer than `registry.minUses` times. Reuse-discipline as a
 * quality lever — denoising is the actual GraphRAG-anti-pattern guardrail.
 *
 * Counts only types that ARE used. Declared-but-unused types are out of
 * scope (scaffolding ahead is allowed).
 */
function emitUnderusedLinkTypeWarnings(
  edges: SpandrelEdge[],
  registry: LinkRegistry,
  warnings: ValidationWarning[]
): void {
  if (registry.minUses <= 1) return;
  const counts = new Map<string, { count: number; samplePath: string }>();
  for (const edge of edges) {
    if (edge.type !== "link" || !edge.linkType) continue;
    const cur = counts.get(edge.linkType);
    if (cur) {
      cur.count++;
    } else {
      counts.set(edge.linkType, { count: 1, samplePath: edge.from });
    }
  }
  for (const [stem, { count, samplePath }] of counts) {
    if (count >= registry.minUses) continue;
    warnings.push({
      path: samplePath,
      type: "underused_link_type",
      message: `Link type "${stem}" used ${count} time${count === 1 ? "" : "s"} across the graph (min_uses: ${registry.minUses}). Consider reusing an existing type or extending the registry.`,
    });
  }
}
```

Wire the call into `validate()` next to `emitUnknownLinkTypeWarnings`.

- [ ] **Step 4: Run — confirm pass**

Run: `npx vitest run test/compiler.test.ts -t "underused_link_type"`
Expected: both new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/compiler.ts test/compiler.test.ts
git commit -m "Impl: min_uses reuse-discipline governance

Emits underused_link_type warnings for types used fewer than
min_uses times. The actual quality lever per the research —
denoising matters more than declaration."
```

---

### Task 8: Drop `/linkTypes/` Things-indexing; emit legacy advisory

**Files:**
- Modify: `src/compiler/compiler.ts`
- Modify: `test/compiler.test.ts`

- [ ] **Step 1: Delete `collectDeclaredLinkTypes` and the `LINK_TYPE_PATH_PREFIX`/`LINK_TYPES_INDEX_PATH` constants**

In `compiler.ts`, remove the constants and the `collectDeclaredLinkTypes` function. They have no callers after Task 6.

- [ ] **Step 2: Add a one-shot legacy advisory**

In the compiler entry function, after `loadLinksConfig`, add:

```typescript
const legacyDir = path.join(rootDir, "linkTypes");
const newConfig = path.join(rootDir, "_links", "config.yaml");
if (fs.existsSync(legacyDir) && !fs.existsSync(newConfig)) {
  console.log(
    `[spandrel] Note: /linkTypes/ Things found, but link-type declarations now live in _links/config.yaml (see CHANGELOG for 0.9.0).`
  );
}
```

Imports: `import fs from "node:fs"; import path from "node:path";` — these are likely already imported.

- [ ] **Step 3: Delete the entire `describe("Compiler — /linkTypes/ collection")` block in `test/compiler.test.ts`** (line ~841 onwards)

That collection no longer exists as a special case. Inspect the rest of the file for any other tests that rely on `writeLinkType()` or `linkTypes/index.md` and remove or rewrite them.

- [ ] **Step 4: Add a legacy-advisory test**

Append to `test/compiler.test.ts`:

```typescript
it("logs a one-line advisory when /linkTypes/ exists but _links/config.yaml is missing", async () => {
  const root = tempRoot();
  writeIndex(root, { name: "Test Graph", description: "x" });
  fs.mkdirSync(path.join(root, "linkTypes"));
  fs.writeFileSync(
    path.join(root, "linkTypes/index.md"),
    `---\nname: Link Types\ndescription: legacy\n---\n`
  );

  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...a: unknown[]) => logs.push(a.map(String).join(" "));
  try {
    await compile(root);
  } finally {
    console.log = origLog;
  }

  const advisory = logs.find((l) => l.includes("/linkTypes/ Things found"));
  expect(advisory).toBeDefined();
  expect(advisory).toContain("0.9.0");
});
```

- [ ] **Step 5: Run the full compiler test suite**

Run: `npx vitest run test/compiler.test.ts`
Expected: pass except for any remaining old-shape tests (which were rewritten or deleted in Steps 3-4).

- [ ] **Step 6: Commit**

```bash
git add src/compiler/compiler.ts test/compiler.test.ts
git commit -m "Impl: drop /linkTypes/ Things-indexing; add legacy advisory

The compiler no longer treats /linkTypes/ as a special collection.
Files there now compile as ordinary Things. When the legacy
directory exists without _links/config.yaml, emit a one-line
non-blocking advisory pointing to the changelog."
```

---

## Phase 3 — Storage layer

### Task 9: Pipe registry through compiler → store → graph

**Files:**
- Modify: `src/compiler/compiler.ts`
- Modify: `src/compiler/types.ts`
- Modify: `src/storage/in-memory-graph-store.ts`
- Modify: `src/storage/store-to-graph.ts`
- Modify: `src/storage/graph-store.ts`

`SpandrelGraph` currently has `linkTypes: Map<string, LinkTypeInfo>`. We keep that shape but populate it from `registry.types`, mapped to the new `LinkTypeInfo`.

- [ ] **Step 1: Update `SpandrelGraph` in `src/compiler/types.ts`**

The shape stays — `linkTypes: Map<string, LinkTypeInfo>` — but `LinkTypeInfo` is the new shape from Task 4. Verify the import and type are correct; no edit if already aligned.

- [ ] **Step 2: Build the linkTypes map at compile time**

In `compiler.ts`, where `SpandrelGraph` is constructed, replace any old map-construction with:

```typescript
const linkTypes = new Map<string, LinkTypeInfo>();
for (const [stem, entry] of linkRegistry.types) {
  linkTypes.set(stem, { stem, description: entry.description });
}
```

- [ ] **Step 3: Update in-memory store**

In `src/storage/in-memory-graph-store.ts`:
- Remove the `LINK_TYPE_PATH_PREFIX` constant and the loop that walks nodes for `/linkTypes/` Things.
- `getLinkTypes()` should return the map stored on construction (the constructor already takes the graph; the map is now the registry-derived one).
- Update the JSDoc on the method.

```typescript
async getLinkTypes(): Promise<Map<string, LinkTypeInfo>> {
  return this.linkTypes;
}
```

(`this.linkTypes` is whatever field the store currently uses; verify with a `grep -n "linkTypes" src/storage/in-memory-graph-store.ts`.)

- [ ] **Step 4: Update `store-to-graph.ts` and `graph-store.ts` JSDoc**

In `graph-store.ts`, update the JSDoc for `getLinkTypes()`:

```typescript
/**
 * Returns the link-type registry loaded from `_links/config.yaml`, keyed by
 * the canonical stem (e.g. `"owns"`). Returns an empty Map when the graph
 * has no `_links/config.yaml`. The registry is an authoring artifact —
 * agents do not see it at traversal time.
 */
getLinkTypes(): Promise<Map<string, LinkTypeInfo>>;
```

- [ ] **Step 5: Run the storage and compiler tests**

Run: `npm test`
Expected: many failures still (wire surface and tests not yet updated). Storage tests should pass; compiler tests for the new flow should pass; access/mcp/rest/prerender tests still failing.

- [ ] **Step 6: Commit**

```bash
git add src/compiler/compiler.ts src/compiler/types.ts \
        src/storage/in-memory-graph-store.ts \
        src/storage/store-to-graph.ts \
        src/storage/graph-store.ts
git commit -m "Impl: pipe LinkRegistry through compile → store → graph

getLinkTypes() now returns the registry-derived map; the
/linkTypes/ Things-walking code in the in-memory store is
removed. Map shape uses the new LinkTypeInfo (stem + optional
description; no path or name)."
```

---

### Task 10: Update `remote-graph-store` for new `LinkTypeInfo` shape

**Files:**
- Modify: `src/storage/remote-graph-store.ts`

- [ ] **Step 1: Update `getLinkTypes()` in `remote-graph-store.ts`**

The remote store reads from a fetched `Graph` object. `linkTypes: LinkTypeInfo[]` is the wire shape. Update the deserialization at lines 174-178:

```typescript
async getLinkTypes(): Promise<Map<string, LinkTypeInfo>> {
  const graph = await this.fetchGraph();
  const out = new Map<string, LinkTypeInfo>();
  for (const lt of graph.linkTypes) {
    out.set(lt.stem, lt);
  }
  return out;
}
```

- [ ] **Step 2: Run the remote-graph-store test**

Run: `npx vitest run test/remote-graph-store.test.ts`
Expected: pass — the test fixture (`test/fixtures/graph.json`) likely has the old `LinkTypeInfo` shape with `path`/`name`. If a test fails, update the fixture to use `{stem, description?}` shape.

- [ ] **Step 3: Update test fixture if needed**

If `test/fixtures/graph.json` has `linkTypes: [{name: ..., description: ..., path: ...}, ...]`, rewrite to `linkTypes: [{stem: ..., description: ...}, ...]`.

- [ ] **Step 4: Commit**

```bash
git add src/storage/remote-graph-store.ts test/fixtures/graph.json
git commit -m "Impl: remote-graph-store uses new LinkTypeInfo shape"
```

---

## Phase 4 — Wire surface

### Task 11: Drop `linkTypeDescription` from `ShapedEdge`

**Files:**
- Modify: `src/access/types.ts`
- Modify: `src/access/policy.ts`
- Modify: `src/graph-ops.ts`
- Modify: `test/access.test.ts`

- [ ] **Step 1: Edit `src/access/types.ts`**

Remove `linkTypeDescription` from `ShapedEdge`:

```typescript
export interface ShapedEdge {
  from: string;
  to: string;
  type: SpandrelEdge["type"];
  linkType?: string;
  description?: string;
  // linkTypeDescription removed in 0.9.0 — registry is no longer per-edge decoration
}
```

- [ ] **Step 2: Update `shapeEdge` in `src/access/policy.ts`**

Find the function (around line 172-182). Remove the `linkTypeDescription` parameter and field assignment:

```typescript
shapeEdge(edge: SpandrelEdge): ShapedEdge {
  return {
    from: edge.from,
    to: edge.to,
    type: edge.type,
    linkType: edge.linkType,
    description: edge.description,
  };
}
```

(Adjust to match the actual surrounding code — the existing impl uses an extra `linkTypeDescription` parameter; remove it.)

- [ ] **Step 3: Audit `src/graph-ops.ts`**

The `OutgoingLink` and `RichReference` interfaces (lines ~72-113) currently include `linkTypeDescription` and `lookupLinkTypeDescription`. Remove them:

```typescript
export interface OutgoingLink {
  to: string;
  type: string | null;
  description: string | null;
}

export interface RichReference {
  path: string;
  name: string;
  description: string;
  linkType: string | null;
  linkDescription: string | null;
  direction: "outgoing" | "incoming";
}
```

Delete `lookupLinkTypeDescription` and any `getLinkTypes()` calls inside `getOutgoingLinks`, `getIncomingLinks`, `resolveReferences` that were used solely for the now-removed field.

- [ ] **Step 4: Update access tests**

In `test/access.test.ts`, replace lines 232-244 region:

```typescript
it("returns the edge with linkType and description, no linkTypeDescription", () => {
  // ...setup as before...
  const result = policy.shapeEdge(edge /*, no second arg */);
  expect(result!.linkType).toBe("owns");
  expect(result!.description).toBe("source controls target");
  expect((result as Record<string, unknown>).linkTypeDescription).toBeUndefined();
});
```

Adapt the surrounding test to match — `shapeEdge` no longer takes the description as a second argument.

- [ ] **Step 5: Run the test**

Run: `npx vitest run test/access.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/access/types.ts src/access/policy.ts src/graph-ops.ts test/access.test.ts
git commit -m "Impl: remove linkTypeDescription from ShapedEdge

Per-edge wire is now {type, description} only. The registry's
type-level prose is no longer decorated onto every edge — agents
get the type label and the per-edge description, which is the
load-bearing semantic carrier."
```

---

### Task 12: Drop link-types block from MCP server instructions

**Files:**
- Modify: `src/server/mcp.ts`
- Modify: `test/mcp.test.ts`

- [ ] **Step 1: Edit `src/server/mcp.ts`**

Remove the link-types-block assembly (around lines 88-99). The existing variable `linkTypesBlock` is concatenated into the instructions string at line 112. Delete the block-building code AND the `${linkTypesBlock}` interpolation in the template literal.

```typescript
// REMOVE:
//   let linkTypesBlock = "";
//   if (...) {
//     const linkTypes = await graph.getLinkTypes();
//     ...
//     linkTypesBlock = `\n\nLink types declared in this graph:\n...`;
//   }
//
// AND in the return template, remove `${linkTypesBlock}` entirely.
```

Also remove the `lookupLinkTypeDescription` import at line 15 if it's no longer used.

- [ ] **Step 2: Rewrite the affected `mcp.test.ts` tests**

Find the `describe("MCP — buildInstructions and /linkTypes/")` block at line 552. Replace the tests:

- **Delete:** "includes a 'Link types declared in this graph' block when /linkTypes/ exists" (line 563)
- **Delete:** "context tool surfaces linkTypeDescription for declared linkTypes" (line 620)
- **Delete:** "truncates with '…and N more' when over the cap" (around line 654)
- **Keep, rename:** the existing "omits the link-types block entirely when graph has no /linkTypes/ collection" — update so it now asserts the block is absent regardless of registry presence.

```typescript
describe("MCP — buildInstructions", () => {
  it("does not include a link-types vocabulary block (removed in 0.9)", async () => {
    const root = tempRoot();
    writeIndex(root, { name: "Test Graph", description: "x" });
    fs.mkdirSync(path.join(root, "_links"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "_links/config.yaml"),
      `types:\n  owns:\n    description: control.\n`
    );
    fs.writeFileSync(
      path.join(root, "alpha.md"),
      `---\nname: Alpha\ndescription: x\n---\n`
    );

    const instructions = await buildInstructionsForGraph(root);
    expect(instructions).not.toContain("Link types declared in this graph");
  });
});
```

(Adapt `buildInstructionsForGraph` to whatever helper the existing tests use to invoke `buildInstructions`.)

- [ ] **Step 3: Run the test**

Run: `npx vitest run test/mcp.test.ts -t "buildInstructions"`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/mcp.ts test/mcp.test.ts
git commit -m "Impl: remove link-types vocabulary block from MCP instructions

The registry is no longer surfaced to agents at session start.
Type names and per-edge descriptions are the entire agent-facing
semantic surface."
```

---

### Task 13: Update REST `GET /linkTypes` for the new shape

**Files:**
- Modify: `src/rest/handlers/linkTypes.ts`
- Modify: `test/rest.test.ts`

- [ ] **Step 1: Edit `src/rest/handlers/linkTypes.ts`**

The current handler does `await ctx.store.getNode(lt.path)` to access-check each link type as a Thing. Since types are no longer Things, drop the per-Thing access check — the registry is a system-config artifact (like `_access/config.yaml`, which is read at query time without per-row access shaping).

```typescript
import type { RestHandler } from "../types.js";
import { jsonResponse } from "../router.js";

/**
 * GET /linkTypes — return the declared link-type vocabulary loaded from
 * `_links/config.yaml`. The registry is treated as system config (like
 * `_access/config.yaml`); not subject to per-row access shaping.
 */
export const handleLinkTypes: RestHandler = async (_req, _url, ctx) => {
  const linkTypes = await ctx.store.getLinkTypes();
  const items = Array.from(linkTypes.values()).map((lt) => ({
    stem: lt.stem,
    description: lt.description,
  }));
  return jsonResponse(200, {
    linkTypes: items,
    _links: { self: { href: "/linkTypes" } },
  });
};
```

- [ ] **Step 2: Update `test/rest.test.ts`**

Find the `describe("GET /linkTypes")` block (line ~271). The fixture setup at line 83-85 uses `writeIndex(path.join(root, "linkTypes"), ...)` and per-file `linkTypes/X.md` writes. Replace with `_links/config.yaml`:

```typescript
// In the test setup for the linkTypes describe block:
fs.mkdirSync(path.join(root, "_links"), { recursive: true });
fs.writeFileSync(
  path.join(root, "_links/config.yaml"),
  `types:\n  active_project:\n    description: Active client engagement.\n`
);
```

Update the assertion:

```typescript
const r = await fetch(`${harness.baseUrl}/linkTypes`);
expect(r.status).toBe(200);
const body = await r.json();
expect(body.linkTypes.length).toBeGreaterThan(0);
const stems = body.linkTypes.map((lt: { stem: string }) => lt.stem);
expect(stems).toContain("active_project");
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run test/rest.test.ts -t "linkTypes"`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/rest/handlers/linkTypes.ts test/rest.test.ts
git commit -m "Impl: REST GET /linkTypes serves from registry

Registry is system config — no per-row access shaping. Returns
the new LinkTypeInfo shape ({stem, description}). Existing endpoint;
source switched from /linkTypes/ Things to _links/config.yaml."
```

---

## Phase 5 — CLI

### Task 14: Update `spandrel init` to scaffold `_links/config.yaml`

**Files:**
- Modify: `src/cli-init.ts`
- Modify: `test/cli-init.test.ts`

- [ ] **Step 1: Rewrite the link-types section in `src/cli-init.ts`**

Find the existing section (around lines 112-126) that writes `linkTypes/index.md` and 10 leaf files. Replace with a single YAML write:

```typescript
// Scaffold _links/config.yaml — the link-type registry.
// Type names are self-explanatory; descriptions are offered for authors.
const linksConfigBody =
  `# Link-type registry. The YAML key is the canonical type name (the\n` +
  `# stem that frontmatter \`links[].type:\` values reference). Descriptions\n` +
  `# are optional — type names should be self-explanatory.\n` +
  `#\n` +
  `# Governance (both default off):\n` +
  `#   enforce: true       — warn on any type used in the graph but absent below\n` +
  `#   min_uses: N         — warn when a type appears in fewer than N edges\n` +
  `\n` +
  `enforce: false\n` +
  `min_uses: 0\n` +
  `\n` +
  `types:\n` +
  BASELINE_LINK_TYPES.map(
    (lt) => `  ${lt.stem}:\n    description: ${q(lt.description)}\n`
  ).join("");

write("_links/config.yaml", linksConfigBody);
```

(`q()` is the existing YAML-quoting helper near `frontmatter()`. Reuse it.)

**Delete** the old `linkTypeNames`, `linkTypesBody`, and the loop that writes `linkTypes/${stem}.md`.

`BASELINE_LINK_TYPES` stays — it's the seed data; only the file format changes.

- [ ] **Step 2: Update `test/cli-init.test.ts`**

The existing tests expect 12 nodes (root + linkTypes landing + 10 leaves) and assert files at `linkTypes/index.md` and `linkTypes/${stem}.md`. Rewrite:

```typescript
it("writes _links/config.yaml with the baseline link-type vocabulary", () => {
  const root = scaffolded();
  const yamlPath = path.join(root, "_links/config.yaml");
  expect(fs.existsSync(yamlPath)).toBe(true);
  const body = fs.readFileSync(yamlPath, "utf-8");
  expect(body).toContain("enforce: false");
  expect(body).toContain("min_uses: 0");
  for (const lt of BASELINE_LINK_TYPES) {
    expect(body).toContain(`  ${lt.stem}:`);
  }
});

it("does not scaffold a /linkTypes/ Things collection (removed in 0.9)", () => {
  const root = scaffolded();
  expect(fs.existsSync(path.join(root, "linkTypes"))).toBe(false);
});

it("produces a graph that compiles cleanly: 1 node, no warnings, 10 linkTypes", async () => {
  const root = scaffolded();
  const graph = await compile(root);
  expect(graph.warnings).toHaveLength(0);
  expect(graph.nodes.size).toBe(1);   // root index only
  expect(graph.linkTypes.size).toBe(10);
});
```

(Adapt to the existing `scaffolded()`/init-helper pattern in the file.)

**Delete** the old "writes linkTypes/index.md as a composite landing page" test and the per-stem assertions. Keep the "no linkTypes collection scaffolded under specific paths" test (line 145) — it now asserts a more general absence.

- [ ] **Step 3: Run the test**

Run: `npx vitest run test/cli-init.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/cli-init.ts test/cli-init.test.ts
git commit -m "Impl: spandrel init scaffolds _links/config.yaml

Replaces the 11-file /linkTypes/ scaffolding with a single YAML
holding the same 10 baseline types. Governance defaults off."
```

---

### Task 15: Update CLI startup message

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Edit line 194 in `src/cli.ts`**

Current: `console.log(`[spandrel] REST    http://localhost:${port}/{node,content,search,graph,linkTypes}`);`

This still mentions `linkTypes` — keep it (the endpoint still exists). No edit unless the URL list needs reformatting. Verify the line is accurate.

- [ ] **Step 2: Commit (skip if no edit)**

If no change, skip this task.

---

## Phase 6 — Schema.org removal

### Task 16: Drop type-aware Schema.org projection from prerender

**Files:**
- Modify: `src/compiler/prerender.ts`
- Modify: `src/cli-publish.ts`
- Modify: `test/prerender.test.ts`

- [ ] **Step 1: Strip Schema.org type-projection code from `src/compiler/prerender.ts`**

Delete or simplify these:
- `SCHEMA_ORG_WHITELIST` constant
- `buildLinkTypePredicateMap` function
- `mapEdgeToSchemaOrgPredicate` function (or replace its body with `return "mentions";`)
- The `/linkTypes/`-aware branch in `inferSchemaType` (line 121 region) — drop the `DefinedTerm` mapping since `/linkTypes/` is no longer a special collection

The JSON-LD object building (line 167+, 198+) **stays**, but every edge always maps to `"mentions"` — no per-type projection. Simplify the call site to drop `predicateMap`.

- [ ] **Step 2: Update `src/cli-publish.ts`**

Remove the import at line 14:

```typescript
// REMOVE:
import { buildLinkTypePredicateMap } from "./compiler/prerender.js";
```

Remove the call at line 423:

```typescript
// REMOVE:
const predicateMap = buildLinkTypePredicateMap(graph);
```

If `predicateMap` is passed to other functions, drop those parameters too.

- [ ] **Step 3: Rewrite `test/prerender.test.ts`**

Delete the entire `describe("buildLinkTypePredicateMap")` block (line 136+). Delete any tests that assert `DefinedTerm` for `/linkTypes/*` nodes (lines 99, 105 region). Keep tests for `inferSchemaType` for ordinary nodes — `Collection`, `CreativeWork`, etc.

If any prerender output test (full JSON-LD assertion) references type-aware predicates, update to expect `"mentions"` for every edge.

- [ ] **Step 4: Run the prerender + publish tests**

Run: `npx vitest run test/prerender.test.ts test/e2e-publish.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/prerender.ts src/cli-publish.ts test/prerender.test.ts
git commit -m "Impl: drop Schema.org type-aware projection

JSON-LD output still emits, but every edge maps to schema:mentions
unconditionally. The schemaOrg: frontmatter field on /linkTypes/
nodes is no longer read; the SCHEMA_ORG_WHITELIST is removed."
```

---

## Phase 7 — Web viewer adapter

### Task 17: Adapt viewer to new `LinkTypeInfo` shape

**Files:**
- Modify: `src/web/types.ts`
- Modify: `src/web/app/state.ts`
- Modify: `src/web/app/data-source.ts`
- Modify: `src/web/app/components/drawer.ts`

- [ ] **Step 1: Update `src/web/types.ts`**

`LinkTypeInfo` is re-exported from compiler types. Make sure the re-export aligns with the new `{stem, description?}` shape. If the file defines a separate `LinkTypeInfo`, drop the duplicate.

- [ ] **Step 2: Update `src/web/app/state.ts`**

At lines 210-213, the existing code derives `stem` from `lt.path`. With no `path`, use `lt.stem` directly:

```typescript
const linkTypeByStem = new Map<string, LinkTypeInfo>();
for (const lt of g.linkTypes) {
  linkTypeByStem.set(lt.stem, lt);
}
```

- [ ] **Step 3: Verify `src/web/app/data-source.ts`**

Line 170 (`linkTypes: g.linkTypes ?? []`) is a passthrough — no change needed. Verify by inspection.

- [ ] **Step 4: Update `src/web/app/components/drawer.ts`**

Lines 85-97 reference `linkTypeByStem`. The lookup keys remain the same (stems). If the drawer renders `typeInfo.name` anywhere, swap to `typeInfo.stem`. If it renders `typeInfo.description`, that still works (description is now optional — handle the undefined case if not already).

- [ ] **Step 5: Build + smoke test**

Run: `npm run build`
Expected: zero TS errors.

Smoke test the dev viewer: `node dist/cli.js dev /tmp/some-graph` — open in browser, click a node with typed edges, verify the drawer renders the type group with the description visible.

- [ ] **Step 6: Commit**

```bash
git add src/web/types.ts src/web/app/state.ts \
        src/web/app/data-source.ts src/web/app/components/drawer.ts
git commit -m "Impl: adapt web viewer to new LinkTypeInfo shape

LinkTypeInfo is now {stem, description?}. The drawer's
type-grouped edge rendering keeps working — descriptions are
now optional rather than required."
```

---

## Phase 8 — Doctrine, changelog, release

### Task 18: Rewrite `docs/patterns/linking.md`

**Files:**
- Modify: `docs/patterns/linking.md`

- [ ] **Step 1: Rewrite the body**

Open `docs/patterns/linking.md` in the editor. The frontmatter (`name`, `description`, `links`) stays. Rewrite the body so:

- **Replace** the `### Declaring a typed vocabulary with /linkTypes/` section with `### Declaring a typed vocabulary with _links/config.yaml`. Show the YAML example. Frame as authoring config, not Things-collection.
- **Replace** the `### Opting into governance with enforce` section. Drop the list-mode example. Show:
  - `enforce: true` → warn on undeclared types used
  - `min_uses: N` → warn on under-reused types
- **Strengthen** the per-edge `description:` paragraph. Add the new principle: type names should be self-explanatory; the registry's type-level prose is offered to authors and authoring tools, not pushed into agent context.
- **Remove** any reference to `linkTypeDescription` on the wire — that field no longer exists.

- [ ] **Step 2: Verify the file compiles as a Spandrel node**

Run: `node dist/cli.js compile docs`
Expected: zero new warnings on `docs/patterns/linking.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/patterns/linking.md
git commit -m "Docs: rewrite linking pattern for _links/config.yaml

- Replace /linkTypes/ Things-collection with _links/config.yaml.
- Drop list-mode enforce; document enforce: true and min_uses.
- Strengthen the doctrinal stance: type-level prose is authoring-side."
```

---

### Task 19: Rewrite `docs/content-model/links.md`

**Files:**
- Modify: `docs/content-model/links.md`

- [ ] **Step 1: Rewrite the body**

Same shape as Task 18 — replace `/linkTypes/` references with `_links/config.yaml`. Drop the per-edge `linkTypeDescription` mention. Frame the registry as authoring config.

- [ ] **Step 2: Verify**

Run: `node dist/cli.js compile docs`
Expected: zero new warnings.

- [ ] **Step 3: Commit**

```bash
git add docs/content-model/links.md
git commit -m "Docs: rewrite links content-model for _links/config.yaml"
```

---

### Task 20: Remove Schema.org section from `src/web/design.md`

**Files:**
- Modify: `src/web/design.md`

- [ ] **Step 1: Delete the Schema.org section**

Open `src/web/design.md`. The Schema.org / JSON-LD content is around lines 168-201. Remove it entirely or replace with a brief note:

> JSON-LD output emits a `CreativeWork` per node with all link edges projected as `schema:mentions`. The previous per-link-type `schemaOrg:` projection was removed in 0.9.0; if a more typed projection becomes useful, restore as a separate spec.

- [ ] **Step 2: Commit**

```bash
git add src/web/design.md
git commit -m "Docs: remove Schema.org type-projection section from web design

Type-aware Schema.org projection was removed in 0.9.0. JSON-LD
output remains, with all edges mapped to schema:mentions."
```

---

### Task 21: CHANGELOG entry for 0.9.0

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add a new top entry**

Insert above `## [0.8.1] — 2026-05-09`:

```markdown
## [0.9.0] — 2026-05-09

Replaces the `/linkTypes/{stem}.md` per-type Things scaffolding with a single `_links/config.yaml` registry, recasts link types as system config (sibling of `_access/`), drops per-edge `linkTypeDescription` decoration from the wire, removes the link-types vocabulary block from MCP server instructions, drops the Schema.org type-aware JSON-LD projection, and adds opt-in `min_uses` reuse-discipline governance.

The doctrinal stance: the link-type registry is an **authoring artifact, not an agent artifact**. Type-level prose lives in the YAML for human authors and authoring tools to consult; it is not pushed into agent context. The two fields an agent sees on every edge — `linkType` (a self-explanatory label) and `description` (per-edge prose) — are the entire semantic surface.

### Changed (breaking)

- **`/linkTypes/{stem}.md` is no longer compiler-special.** Existing files in that directory still compile as ordinary Things, but their content no longer decorates edges. Move type declarations to `_links/config.yaml`. When the legacy directory is detected without a config file, the compiler logs a one-line advisory pointing to this changelog.
- **`ShapedEdge.linkTypeDescription` removed** from REST and MCP wire surfaces. Per-edge wire is now `{from, to, type, linkType?, description?}`.
- **MCP server instructions no longer render the link-type vocabulary block.** Existing behavior in `mcp.ts` was removed.
- **`enforce: [list]` semantic dropped.** Single-registry world has no clean meaning for it. The new boolean form is `enforce: true | false` in `_links/config.yaml`.
- **`LinkTypeInfo` shape changed** from `{name, description, path}` to `{stem, description?}`. Wire consumers (web viewer, REST `GET /linkTypes`, MCP) are updated.
- **Schema.org type-projection removed.** Per-link-type `schemaOrg:` frontmatter is no longer read. JSON-LD output emits with all edges mapped to `schema:mentions`. Restore in a separate spec if a real consumer surfaces.

### Added

- **`_links/config.yaml`** — single-file link-type registry. Loaded from the graph root by `loadLinksConfig(rootDir)`. Symmetric with `_access/config.yaml`.
- **`min_uses: N`** — opt-in reuse-discipline governance. Compiler emits `underused_link_type` warnings for any type used fewer than N times across the graph. Default `0` (off). The actual quality lever per the research — denoising matters more than declaration alone.
- **`unknown_link_type` warning code** — replaces `undeclared_link_type`. Emitted under `enforce: true` for any type used on an edge but absent from `types:` in the registry.
- **Legacy advisory** — one-line non-blocking note when a graph has `/linkTypes/{stem}.md` but no `_links/config.yaml`.

### Migration

- New graphs created with `spandrel init` get `_links/config.yaml` automatically (with the 10 baseline types).
- Existing graphs: hand-create `_links/config.yaml` from your `/linkTypes/` files, or use a one-off script. There is no migrate CLI command — this is a one-shot for a small number of graphs.

---
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "Docs: CHANGELOG entry for 0.9.0"
```

---

### Task 22: PUBLIC-API.md entry for 0.9.0

**Files:**
- Modify: `PUBLIC-API.md`

- [ ] **Step 1: Skim the existing PUBLIC-API.md**

Read the file's structure — it has a "Versioning history" section per the 0.8.1 release notes. Find where 0.8.0 lives.

- [ ] **Step 2: Add the 0.9.0 entry**

Document:

- `ShapedEdge.linkTypeDescription` removed (REST and MCP).
- REST `GET /linkTypes` response shape: `linkTypes: Array<{stem, description?}>`.
- `_links/config.yaml` as a recognized config file at the graph root.
- `enforce: [list]` mode dropped from `_links/config.yaml`; only `enforce: true | false`.
- Schema.org type-aware JSON-LD projection removed.

- [ ] **Step 3: Commit**

```bash
git add PUBLIC-API.md
git commit -m "Docs: PUBLIC-API.md entry for 0.9.0"
```

---

### Task 23: Bump version + final smoke

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Bump version**

In `package.json`, change `"version": "0.8.1"` to `"version": "0.9.0"`.

- [ ] **Step 2: Full test run**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 3: Full build**

Run: `npm run build`
Expected: zero TS errors. `dist/` regenerates (gitignored).

- [ ] **Step 4: Lint, if configured**

Run: `npm run lint` (if present in package.json scripts).
Expected: PASS.

- [ ] **Step 5: Compile own docs as a sanity check**

Run: `node dist/cli.js compile docs`
Expected: existing warning baseline (or fewer warnings); no new ones from the doctrine doc rewrites.

- [ ] **Step 6: Commit + final summary**

```bash
git add package.json
git commit -m "Release 0.9.0: link-type registry as authoring config

Replaces /linkTypes/ Things-collection with _links/config.yaml.
Drops linkTypeDescription decoration on edges and the link-types
vocabulary block from MCP instructions. Removes Schema.org type
projection. Adds min_uses reuse-discipline governance.

The doctrine: registry is authoring-side config, not agent-facing
content. Per-edge description and self-explanatory type names are
the entire semantic surface for agents.

Breaking: ShapedEdge.linkTypeDescription removed; LinkTypeInfo shape
changed to {stem, description?}; enforce: [list] mode dropped.

See CHANGELOG.md and PUBLIC-API.md for full migration notes."
```

- [ ] **Step 7: Open the PR**

Confirm with the user before pushing. When approved:

```bash
git push -u origin link-type-registry-spec
gh pr create --title "Release 0.9.0: link-type registry as authoring config" --body "$(cat <<'EOF'
## Summary

- Replace `/linkTypes/{stem}.md` per-type Things scaffolding with a single `_links/config.yaml` registry
- Drop per-edge `linkTypeDescription` decoration from the wire
- Drop the link-types vocabulary block from MCP server instructions
- Drop Schema.org type-aware JSON-LD projection
- Add opt-in `min_uses` reuse-discipline governance
- The doctrine: registry is authoring config, not agent content

Spec: `specs/2026-05-09-link-type-registry-design.md`
Plan: `specs/2026-05-09-link-type-registry-plan.md`

## Test plan

- [ ] `npm test` passes
- [ ] `npm run build` produces zero TS errors
- [ ] `node dist/cli.js init <empty-dir>` writes `_links/config.yaml` with 10 baselines
- [ ] `node dist/cli.js compile docs` is clean
- [ ] Smoke-test web viewer drawer: typed edges still render with descriptions

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist

Run these against the plan as a final pass:

- **Spec coverage:** Each spec section has a corresponding task. Authoring surface (Tasks 1-3, 14), wire surface (11-13), governance (6-8), Schema.org removal (16, 20), doctrine update (18-19), test fallout (folded into each impl task), version (23). ✅
- **Placeholder scan:** Every step shows the actual code or command. No "implement later," "fill in details," or unreferenced helpers. ✅
- **Type consistency:** `LinkTypeInfo = {stem, description?}` is the same shape across compiler, storage, web, REST. `LinkRegistry` is consumed only in compiler + `loadLinksConfig`. Warning codes match the union in Task 4. ✅
- **TDD discipline:** Tasks 2, 6, 7, 8, 11 lead with failing tests. Tasks 4, 5, 9, 10, 12, 13, 14, 16, 17 are mechanical refactors driven by existing tests, with rewrites bundled. ✅
