---
name: Bulk path
description: An unstructured pile the user wants processed in conversation — dialogue-driven shape emergence
links:
  - to: /onboarding/paths
    type: part-of
---

# Bulk path

The user has a pile of content — notes, transcripts, pasted text, exported documents — that hasn't been organized yet. Rather than scanning a directory, the agent processes the pile through dialogue.

## Signals you're on this path

- User pastes content directly into the conversation, or references specific file drops rather than a structured directory
- Content is mixed-format and mixed-topic — no apparent native organization
- Volume is conversation-sized: tens to low-hundreds of documents, not thousands
- User is actively present to react and disambiguate

**Not this path** if the volume is too large for one conversation. Large piles with no structure are a [survey](/onboarding/paths/survey) problem plus embeddings — see the Onboarding mode entry in ROADMAP.md.

**Not this path** if content already has structure on disk — that's [survey](/onboarding/paths/survey).

## Inventory rules

Dialogue-driven, not filesystem-driven. Ask the user to paste or describe three to five representative samples from the pile. Ask them what types of things they see (transcripts, notes, half-drafts, quotes, etc.).

Do not try to read every document before proposing structure — the conversation won't fit. Sample, cluster mentally, and propose.

Keep a running list of topics, entities, and recurring types as the user shares samples. Read back what you're hearing every few samples so the user can correct.

## Sense-making

Because the content lacks native structure, the "what's your existing structure?" question at Level 2 is blunted. The sequence:

1. **Ask about real-world structure, not content structure.** Even if the notes are unorganized, the *domain* they're about has structure. "These are all notes about your consulting clients — do you already slice clients by industry, by stage, by account team?" Use whatever comes back.
2. **Framework fallback.** If the domain is net-new or the user can't articulate structure, offer [frameworks](/patterns/frameworks).
3. **Derived clusters.** Propose 3–5 collections from the samples you've seen, grounded in the types of things the user pasted.

## Seeding

1. Write the root `index.md` and collection skeletons as in other paths.
2. **Write one exemplar node per collection before fanning out.** See [guardrails](/onboarding/guardrails). With an unstructured pile, the exemplar-first rule is especially important — without it, parallel agents produce wildly different interpretations.
3. Work through the pile in batches with the user:
   - User pastes a document or batch
   - Agent classifies it into a collection, extracts `name` + `description` + any obvious links
   - Agent writes the node file
   - User confirms or corrects before the next batch
4. For documents that don't fit any collection cleanly, stash them in a `_inbox/` directory (underscore-prefixed, not compiled) and revisit at the end.
5. When the pile is exhausted, compile and walk the graph.

## Gotchas

- **Paraphrase drift.** An agent classifying documents at speed will paraphrase loosely and lose the user's voice. Read back descriptions verbatim every five to ten nodes so drift gets caught.
- **Missed entities.** Inline links to people, clients, projects that haven't been created yet as nodes produce dangling references. Either create those entities as you encounter them (preferred) or queue up a "create these" list and batch-write them after the main pass.
- **No natural stopping point.** An unstructured pile doesn't know when it's "done." Agree on a stopping criterion with the user upfront: time-boxed (30 minutes of processing), volume-boxed (first 50 documents), or coverage-boxed (until every major topic has at least one node).
