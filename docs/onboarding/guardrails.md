---
name: Onboarding guardrails
description: Execution traps that real agent-driven sessions hit — read before any parallel fan-out
links:
  - to: /onboarding
    type: part-of
---

# Onboarding guardrails

Real sessions keep tripping on the same five mechanical failures. None of them are Spandrel concepts — they're execution hygiene. Read this before you fan out parallel agents, and again any time something feels weirdly broken.

## 1. Collect all sources upfront

At Level 1, gather **every** source path the user intends to ingest — in one question, not as discoveries bubble up. Iterative collection costs rework because structural decisions made against an incomplete source set get invalidated when the next source arrives.

> "Before we classify: list every directory, repo, export, or drop you want to pull from. I'll work through them together."

## 2. Agents create their own node directories

Do **not** run `mkdir -p /path/to/every/collection/upfront`. Empty directories silently shadow leaf files during compile and produce misleading node counts. Instead, let each agent create the directory for the node it's writing at the moment it writes it:

```bash
# ✗ Don't
mkdir -p clients/acme clients/globex clients/initech
# then dispatch agents to fill them

# ✓ Do
# Dispatch agents, each creates its own target directory as it writes
```

Corollary: when a fan-out completes, run `find <kb-root> -type d -empty -delete` before compile to catch any planning-phase leftovers.

## 3. Version-check the CLI

`npm link` points the global `spandrel` CLI at whatever the local build was the last time `npm run build` ran. It drifts. Before trusting any compile output, confirm:

```bash
spandrel --version
# match against the current repo's package.json
```

If they don't match, `npm run build && npm link` in the spandrel repo. A stale CLI will report node counts from the old build and silently miss new fields.

## 4. Exemplar-first fan-out

When multiple collections need to be seeded in parallel, **write one exemplar node per collection yourself before dispatching agents**. Pass the exemplar path to every parallel agent with "match this shape, voice, and depth."

Without an exemplar, parallel agents produce N different interpretations of "a good node." With one, quality consistency comes free.

## 5. Watch for context compaction during fan-out

A lead agent running a large fan-out can hit context compaction mid-run. Sub-agents dispatched before the compaction finish against a truncated brief. Symptoms:

- Later batches of nodes drift from the exemplar
- Edge vocabulary shifts partway through
- Some agents produce generic content while others are specific

Mitigation:

- Keep the exemplar path + the quality bar in a short "briefing file" that every sub-agent reads directly — don't rely on the lead to restate it per call
- Batch fan-outs in groups of 3–5, not 10+
- After each batch, spot-check one node against the exemplar before dispatching the next batch

## 6. Scope git adds

When agents commit their work, they must use explicit `git add <paths>`, never `git add -A` or `git add .`. Parallel agents can otherwise step on each other's staging or commit unrelated changes from the worktree.

---

## Check before declaring onboarding complete

- [ ] `spandrel --version` matches repo
- [ ] No empty directories: `find <kb-root> -type d -empty`
- [ ] `spandrel compile <kb-root>` reports zero warnings
- [ ] Every top-level collection has an `index.md` and a `design.md`
- [ ] At least one exemplar member per collection; other members match its shape
