---
name: Claude Code plugin
description: Package a Spandrel graph as a Claude Code plugin — bundles the graph, an MCP server, and skills into one installable artifact distributed via the marketplace mechanism.
links:
  - to: /architecture/mcp
    type: depends-on
    description: The plugin wires `spandrel mcp` as the MCP server; recipients consume the graph via standard MCP tool calls
  - to: /deployment/local
    type: relates-to
    description: Plugin authoring uses the same `spandrel dev`/`compile`/`audit` workflow as local development; packaging is what comes after
  - to: /patterns/placement
    type: relates-to
    description: The procedural-vs-knowledge separation determines what belongs inside the plugin vs outside; placement matters more in plugin mode than in local mode
---

# Claude Code plugin

`.claude-plugin/plugin.json` + `.mcp.json` + `skills/` + `hooks/` packages a Spandrel graph as a [Claude Code plugin](https://code.claude.com/docs/en/plugins). Recipients run three commands and get the graph, the MCP server that serves it, and any bundled skills — all wired and ready, no manual setup.

This is the right deployment when the graph is meant to be **consumed by an agent inside Claude Code** — for content production, decision support, or workflow orchestration — and you want collaborators to install it the way they install any other plugin.

## Why this mode exists

Three things you get from plugin packaging that the other deployment modes don't give you:

1. **One-shot install of graph + capabilities + wiring.** `spandrel dev` requires a clone. Static MCP gives you graph access from any client. Plugin packaging delivers the graph *plus* the skills that consume it *plus* the MCP server that serves it as a single versioned unit recipients can `/plugin install` and update.
2. **Native fit with how Claude Code already works.** Plugin format is what the model already knows how to load. Skills appear as `/plugin-name:skill-name`. The MCP attaches automatically. Hooks fire on session lifecycle. No bespoke install path to document or maintain.
3. **A natural distribution boundary for client-specific knowledge.** If you're running an agency, a research engagement, or any context where one body of knowledge serves a specific audience, the plugin gives you a clean delivery vehicle for that audience — versioned, gated by repo access if needed, and updatable independently of other plugins they have installed.

The trade-off — and it's a real one — is that plugins as a *format* are Claude Code-specific. The graph and the MCP server work anywhere; the install path and the skill loader do not. See the [cross-surface behavior](#cross-surface-behavior) section below for what works where.

## Repository layout

The single most important decision in plugin mode is the **procedural-vs-knowledge separation**. The graph (what you know) and the procedural layer (skills, hooks, plugin manifest) belong in physically distinct subtrees:

```
.claude-plugin/             # Plugin + marketplace manifests (procedural)
  plugin.json
  marketplace.json
.mcp.json                   # Spandrel MCP server config (procedural)
hooks/                      # SessionStart bootstrap, etc. (procedural)
  hooks.json
  bootstrap-skills.sh
skills/                     # Plugin skills loaded by Claude Code (procedural)
  <skill-name>/
    SKILL.md
    index.md                # Spandrel composite-node anchor (graph-side)
    assets/                 # Optional — code, templates, fonts for code-bearing skills
README.md                   # Install + usage
AGENTS.md                   # Agent operational guide

knowledge/                  # ← Spandrel graph root
  index.md                  # Root node — points at all collections
  <collection-1>/           # Whatever your graph encodes
  <collection-2>/
  ...
  _audit/                   # Gitignored — embeddings.db, audit state
  _notes/                   # Gitignored — private working notes
```

**Why this physical separation matters in plugin mode** (more than it does in local-dev mode):

- **`.mcp.json` points Spandrel at `${CLAUDE_PLUGIN_ROOT}/knowledge`**, not the repo root. Spandrel only crawls `knowledge/`; everything else is invisible to the graph compiler.
- **Internal graph links resolve graph-root-relative.** Inside any node, `to: /positioning/...` resolves against `knowledge/`, not the repo. Don't write `/knowledge/positioning/...` inside frontmatter — it won't resolve.
- **Plugin skills are procedural.** They shouldn't appear as graph nodes. If a skill needs a graph anchor (so `/skills/<name>` resolves from somewhere), put the anchor inside `knowledge/skills/<name>.md` — but most plugins don't need this.

The split also reflects something philosophically true about [Spandrel's premise](/philosophy): knowledge and procedure are different kinds of artifact and benefit from being legible separately. Plugin mode makes that physical.

## Setting one up

Five steps to take an existing Spandrel and package it as a Claude Code plugin.

### 1. Restructure into the procedural/knowledge split

If your graph currently lives at the repo root, move it under `knowledge/`:

```bash
mkdir knowledge/
git mv index.md <collection-1>/ <collection-2>/ ... knowledge/
mv _audit/ _notes/ knowledge/   # gitignored dirs use plain mv
```

Use `git mv`, not [`spandrel mv`](/architecture/cli). `spandrel mv` is for renaming a node within the graph and cascading the link rewrites — it assumes the node's graph-relative path is changing. In a root-shift restructure, no graph-relative path changes: `/positioning/foo` still resolves to `/positioning/foo` after you re-point Spandrel at `${ROOT}/knowledge`. The move is purely filesystem-level, invisible to the compiler. Internal `to: /positioning/...` links don't need rewriting.

If you're starting fresh, scaffold with the split already in place.

### 2. Add the plugin manifest

Create `.claude-plugin/plugin.json`:

```json
{
  "name": "your-plugin-name",
  "version": "0.1.0",
  "description": "What this knowledge base is and what skills it ships.",
  "author": { "name": "Your Name", "email": "you@example.com" },
  "repository": "https://github.com/your-org/your-repo",
  "license": "UNLICENSED"
}
```

The `name` becomes the skill namespace prefix (`/your-plugin-name:<skill-name>`) and the marketplace plugin ID.

### 3. Wire the MCP server

Create `.mcp.json` at the repo root:

```json
{
  "mcpServers": {
    "your-plugin-name": {
      "command": "npx",
      "args": ["-y", "spandrel", "mcp", "${CLAUDE_PLUGIN_ROOT}/knowledge"]
    }
  }
}
```

`${CLAUDE_PLUGIN_ROOT}` resolves to the plugin's cache directory at runtime. `npx -y spandrel mcp` downloads and caches the Spandrel CLI on first run (~30 sec), so recipients don't need a global install.

### 4. Make it a one-plugin marketplace

Add `.claude-plugin/marketplace.json` so recipients can `/plugin marketplace add <your-repo>`:

```json
{
  "name": "your-plugin-name",
  "owner": { "name": "Your Org" },
  "plugins": [
    {
      "name": "your-plugin-name",
      "source": "./",
      "description": "Same description as plugin.json"
    }
  ]
}
```

This makes the repo simultaneously a marketplace and the single plugin it hosts.

### 5. (Optional) Add a bootstrap hook for code-bearing skills

If any skill ships code that needs `npm install` (Puppeteer, Satori, etc.), add a SessionStart hook so dependencies install automatically:

`hooks/hooks.json`:
```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}\"/hooks/bootstrap-skills.sh" }] }
    ]
  }
}
```

`hooks/bootstrap-skills.sh` (idempotent — checks for `node_modules/` before installing):
```bash
#!/usr/bin/env bash
set -e
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SKILLS_DIR="${PLUGIN_ROOT}/skills"
[ -d "$SKILLS_DIR" ] || exit 0
shopt -s nullglob
for pkg in "${SKILLS_DIR}"/*/assets/package.json; do
  asset_dir="$(dirname "$pkg")"
  [ -d "${asset_dir}/node_modules" ] && continue
  (cd "$asset_dir" && npm install --silent --no-audit --no-fund) || true
done
exit 0
```

The contract for skill authors: drop a `package.json` in `skills/<name>/assets/` — the hook handles the rest. Scales to N code-bearing skills with one hook.

### Verify

```bash
npx spandrel compile ./knowledge      # graph integrity
claude --plugin-dir .                  # load the plugin in a session without installing
```

Then commit, push, and recipients install with:

```
/plugin marketplace add your-org/your-repo
/plugin install your-plugin-name@your-plugin-name
/reload-plugins
```

## Cross-surface behavior

The most important thing to understand about plugin mode is what survives across Claude surfaces and what doesn't.

| Surface | Plugin format (`.claude-plugin/`) | SKILL.md format | MCP server | Code-bearing skills |
|---|---|---|---|---|
| **Claude Code (CLI + IDE)** | Native — `/plugin marketplace add` | Native | Native via `.mcp.json` | Run locally with full filesystem access |
| **Claude Cowork (claude.ai web)** | Plugins don't load here | Skills work as Cowork skills | Configurable per-session | Run in Anthropic's sandbox — no local FS |
| **Claude Desktop** | No plugin loader | Manual install per skill | Configurable in `claude_desktop_config.json` | Depends on what tools the desktop exposes |
| **Claude API** | N/A | Via Skills API | Server-side | Anthropic sandbox |
| **Third-party CLIs (Codex, Gemini CLI, Cursor, Aider, etc.)** | Not loaded | SKILL.md is portable | Configurable | Whatever the host CLI provides |

The asymmetry to internalize: **the plugin as a packaging format is Claude Code-only, but the pieces inside it can move independently.**

- **The graph and MCP server** are universal. Any MCP-aware client can attach — the graph is reachable from Claude Desktop, Cowork, third-party CLIs, even non-Anthropic agents that speak MCP.
- **Knowledge-only skills (SKILL.md with no executable code)** are portable across all surfaces. They're just markdown procedure.
- **Code-bearing skills** only fully work in Claude Code. The same SKILL.md can run in Cowork's sandbox, but output goes to chat artifacts, not your local disk.

This asymmetry has architectural consequences for what you put in the plugin (see next section).

## What to include vs not — the architectural call

The temptation is to bundle every skill that touches the graph into the plugin. Resist it. The clearer division:

**Include in the client/knowledge plugin:**

- The graph itself
- The MCP server config (`.mcp.json`)
- **Knowledge-only / procedural skills tied to this specific graph's conventions** — e.g., a `create-node` skill that knows your collection vocabulary, link types, and red lines. These are knowledge about knowledge; they belong with the graph.
- Smoke-test skills (e.g., `hello-world`) for verifying the install path
- A SessionStart hook if any skills need code (even if you only have one such skill today)
- `README.md`, `AGENTS.md` at the repo root for repo-level operational guidance

**Distribute separately:**

- **Code-bearing asset-production skills** that work against *any* attached Spandrel MCP — LinkedIn carousel renderers, blog drafters, video-script generators, image producers, ad-copy writers. These belong in a separate plugin (e.g., `your-content-toolkit`) that:
  - Reads from whatever Spandrel MCP is currently attached (doesn't hard-code the client's MCP name)
  - Is installable independently — your team installs it once, then installs whichever client plugins they're working on
  - Stays in your control rather than getting handed to every client who installs the knowledge plugin

This split has both technical and business consequences. Technically, it means your asset-production toolkit isn't duplicated across N client plugins. Business-wise, it means your production playbook stays separable from any individual client's knowledge — the asset-production skills are typically the value-add you're selling, not the client's content.

A skill in the content-toolkit plugin uses the MCP it finds attached — it doesn't need to know which client's graph it's pointing at. The skill prose refers to "the attached Spandrel MCP" semantically; the model resolves the actual tool name (`mcp__plugin_<client>_<server>__context` or whatever's attached) at runtime.

## What this deployment can't do

- **Run code-bearing skills outside Claude Code.** The plugin format and its local execution model are Claude Code-specific. If your skill needs Puppeteer + local file writes, it only fully works in Claude Code. In Cowork, the same SKILL.md runs but produces sandbox artifacts, not local files.
- **Serve as a public read-only knowledge base on its own.** The plugin is for agent consumption inside Claude Code sessions. If you also want human-browsable URLs and search engine visibility, layer in [static + flat-file MCP](/deployment/static-mcp) — they compose; the static bundle gives web visibility while the plugin delivers in-session capability.
- **Support writes from agents in the field.** The plugin ships markdown. Recipients can author against the graph via MCP if they have write access (in Claude Code, they do), but the canonical write path is still source-edit + commit + push. There's no central live backend in plugin mode — every recipient has their own clone. For multi-user collaborative writes, see [hosted live backend](/deployment/hosted).
- **Update without recipient action.** Marketplaces have auto-update but it's opt-in. Manual update is `/plugin marketplace update <name>` + `/reload-plugins`. Plan for a small lag between push and recipient pickup.
- **Distribute private graphs without GitHub auth.** Recipients need read access to the source repo for `/plugin marketplace add` to clone it. For controlled distribution, host the source repo privately; recipients with read access install normally, others can't.

## Trade-off summary

| Want this | Use Claude Code plugin |
|---|---|
| One-shot install of graph + skills + MCP wiring for collaborators | ✓ |
| Version + update story via marketplace mechanism | ✓ |
| Client-specific knowledge delivered as a sealed unit | ✓ |
| Code-bearing skills (Puppeteer, Satori, etc.) running locally | ✓ |
| Public read-only knowledge base | Use static + flat-file MCP |
| Multi-user collaborative writes | Use hosted live backend |
| Cross-surface compatibility (Cowork, Desktop, API) | Use static + flat-file MCP for the MCP layer; skills don't carry over |
| Distribution without recipients having Claude Code | Use static + flat-file MCP |

