---
name: Code path
description: Documenting a code repo — source files stay out, manifests and prose drive the graph
links:
  - to: /onboarding/paths
    type: part-of
  - to: /onboarding/templates/code-repo
    type: pairs-with
---

# Code path

The user points at a code repo. The Spandrel graph describes the code — it doesn't ingest it. Source files never become graph nodes; only prose and structural metadata do.

## Signals you're on this path

- A dominant source language dominates the file tree (TypeScript, Python, Go, Rust, Java)
- A root manifest exists: `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`, `Gemfile`
- Source files vastly outnumber prose files
- Any prose is *about* the code — READMEs, ADRs, architecture docs, design notes

**Not this path** if the repo is majority-prose with some scripts (that's [survey](/onboarding/paths/survey)). Not this path if there's no manifest or no clear source language (that's something else — ask).

## Inventory rules

Filter out source files. Only read:

- `README*` (root and in every subdirectory)
- `CHANGELOG*`, `HISTORY*`, `NOTES*`
- `LICENSE*`, `CONTRIBUTING*`, `CODE_OF_CONDUCT*`
- Anything under `docs/`, `adrs/`, `architecture/`, `proposals/`, `rfcs/`, `design/`, `RFC*/`
- Manifests: `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`, `build.gradle`, `Gemfile`, `composer.json`, `mix.exs`
- Workspace config: `pnpm-workspace.yaml`, `lerna.json`, `turbo.json`, `nx.json`, `go.work`, `Cargo.toml` `[workspace]`

Detect the shape:

- **Single package** — one manifest at the root
- **Monorepo** — manifests under `packages/`, `apps/`, `services/`, `crates/`, `libs/`, or a workspaces declaration in the root manifest

Present findings in concrete terms:

> "Monorepo with 5 packages under `packages/` — `core`, `cli`, `server`, `ui`, `utils`. Each has a README. Three ADRs under `docs/adrs/`: 0001-storage-choice, 0002-auth-model, 0003-plugin-api. `architecture/overview.md` exists. Root README is ~120 lines."

Let the user confirm, correct, or add context.

## Sense-making

Collection vocabulary comes from the repo's own naming. Don't force all four:

- **`/modules/`** or **`/services/`** or **`/packages/`** or **`/crates/`** — one node per package/service/module. Pick the name the repo itself uses.
- **`/architecture/`** — system diagrams (as markdown), component boundaries, high-level design.
- **`/adrs/`** or **`/decisions/`** — one node per ADR, preserving IDs.
- **`/domains/`** — business or problem-domain concepts that cut across modules (`billing`, `identity`, `inventory`). Add only if the user talks about the system this way.

Optionally later: `/runbooks/`, `/integrations/`, `/glossary/`. Don't propose these yet unless the inventory surfaced them.

Ask the user: "Is the knowledge graph a separate repo, or does it live inside this code repo as `docs/knowledge/`?" Either works; adjust paths accordingly.

## Seeding

For each module/package/service:

- Create `/<modules>/<slug>/index.md`
- `name` from the manifest (strip scope prefixes like `@org/` if the user prefers unscoped)
- `description` from the manifest `description` field if present; otherwise the first non-heading paragraph of the package's README
- Copy or reference the README body as the node's content

For each ADR:

- Create `/adrs/<id>-<slug>.md` as a leaf node
- Preserve the original ID (`0001`, `ADR-0001`, whatever scheme the repo uses)
- `name` = the ADR's title (first `# ...` heading, minus any "ADR-NNNN:" prefix)
- `description` = one-line summary or the first paragraph
- Content = the ADR body, preserved

For architecture docs:

- One node per top-level document under `architecture/` or `docs/architecture/`
- Use directory form (`/architecture/overview/index.md`) if the doc has sub-sections worth promoting; leaf form otherwise

**Seed `depends-on` edges automatically.** For each module, read its manifest's dependency list. For every dependency that resolves to another module *in this graph* (another workspace package), add:

```yaml
links:
  - to: /packages/core
    type: depends-on
```

Skip external dependencies (npm registry, crates.io, PyPI). If the user later wants external deps tracked, they can add a `/dependencies` collection — don't do it automatically.

### Example seeded tree

For a TypeScript monorepo with three packages and a few ADRs:

```
docs/knowledge/
├── index.md
├── README.md
├── packages/
│   ├── index.md
│   ├── design.md
│   ├── core/index.md        # depends-on /packages/utils
│   ├── cli/index.md         # depends-on /packages/core
│   └── utils/index.md
├── architecture/
│   ├── index.md
│   └── overview.md
└── adrs/
    ├── index.md
    ├── 0001-storage-choice.md
    └── 0002-auth-model.md
```

After the seed, prompt for *semantic* edges the manifest can't express:

- **Module → domain** (`owns`, `implements`): "the billing service owns the invoicing domain"
- **ADR → module/architecture** (`affects`, `supersedes`): "ADR-0007 affects `/packages/auth`; it supersedes ADR-0003"
- **Architecture → module** (`realized-by`): "this architecture doc is realized by `/services/ingest` and `/services/api`"

Ask the user to name a few; don't infer.

## Gotchas

- **Reading source files.** Spandrel does not compile source. Never open `.ts`, `.py`, `.go`, `.rs`, `.java` as content. It poisons the graph with content that isn't the user's authoring.
- **External dep noise.** Auto-seeding every npm/PyPI dep as a node buries real structure. Workspace-internal deps only.
- **ADR ID drift.** If the repo renames ADRs (`ADR-0001` → `ADR-00001`) across history, preserve whatever the most recent version uses and add `formerly-known-as` aliases rather than renaming nodes.
- **README duplication.** If the root README reproduces content that's also in `architecture/overview.md`, pick one canonical source and link from the other rather than maintaining two copies.
