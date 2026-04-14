# UX Feedback

Real feedback from bootstrap sessions. Problems, friction, and ideas — not bug reports.

---

## Post-Bootstrap Disorientation

**Problem:** After the agent finishes bootstrapping a knowledge repo, the user is left with a directory full of `index.md` files and no reference back to how it was created, what built it, or how to use it. The repo feels like it appeared from nowhere.

**What's missing:**

1. **Build report.** Something generated at the end of bootstrap that lives in the knowledge repo — what was built, how many nodes/edges, what source content was used, when it was compiled, what version of Spandrel did the build. A receipt.

2. **"How this works" reference.** The knowledge repo has no pointer back to Spandrel itself. A new user (or the same user a week later) opening the repo has no way to know:
   - What tool compiled it
   - How to recompile, serve, or query it
   - What the `index.md` / frontmatter / links conventions are
   - What `design.md` and `AGENT.md` files do
   - What MCP tools are available

3. **README in the knowledge repo.** The Spandrel repo has a README. The knowledge repo it creates doesn't. This is the thing the user actually lives in day-to-day, and it has zero documentation.

**Possible solutions:**

- Generate a `README.md` in the knowledge repo during bootstrap Phase 5. Include: what this repo is, how it was built, quick-start commands (`spandrel compile`, `spandrel dev`, `spandrel mcp`), link back to Spandrel repo/docs, and the key conventions (directory = node, `index.md` = frontmatter, links, etc.).
- Generate a `BUILD-REPORT.md` or `.spandrel/build-report.md` with compile stats, source inventory, and timestamp.
- Consider whether `spandrel compile` itself should emit a brief summary file (like a lockfile or manifest) so the repo always has a machine-readable record of its last compile.

**User quote:** "I was kind of confused once the repo was created. There wasn't any reference from that repo as to how it was created."

---

## Directory-per-Node Surprise

**Problem:** Users expect files, not directories. Running `tree` on a freshly built knowledge repo and seeing only `index.md` files is confusing — it looks like the same file repeated dozens of times rather than a structured graph.

**Context:** The directory-per-node pattern is intentional and correct (each Thing can have children, sub-things, sibling files like `design.md` or `SKILL.md`). But nothing explains this to the user during or after bootstrap.

**Possible solutions:**

- Explain the pattern in the generated README.
- During bootstrap Phase 5 (Verify), explicitly call out the directory structure and why it works this way before the user discovers it on their own.
- Consider whether `tree` output in the verify step should annotate what each file is (e.g., `index.md  # 88 nodes` or similar).

**User quote:** "It's only index files. Is that by design?"

---

## Bootstrap Should Inventory Before Proposing Structure

**Problem:** During Phase 2 (Inventory) and Phase 3 (Structure), the agent jumped straight to proposing a collection structure — top-down, from the domain description — before looking at the actual source content. The user had to push back and redirect the agent to read the files first.

The whole point of Spandrel is that structure emerges from content. The bootstrap process should reflect that: scan the source files, understand what exists, *then* propose how to organize it. Instead, the agent treated the user's domain description as the input and invented collections from scratch, ignoring the existing file tree.

**What happened:**
- User pointed the agent at `~/elegantatomics/EA-OS/` as source content
- Agent proposed a collection structure based on the business description ("consulting agency") without reading any files
- User rejected it: "I want to point it at files first then let spandrel decide. Isn't that the point of spandrel?"
- Agent then inventoried ~80 source files and proposed a structure that actually matched the content

**What should change:**
- Phase 2 should *always* start by scanning source content (if provided) before asking structural questions
- The agent should present an inventory summary ("here's what I found") and let the user confirm before proposing collections
- BOOTSTRAP.md should make this explicit: "If source content exists, inventory it first. Structure follows content, not the other way around."

**User quote:** "I want to point it at files first then let spandrel decide. Isn't that the point of spandrel?"

---

## Agent Defaults to Flat Search Instead of Graph Traversal

**Problem:** When an agent uses the Spandrel MCP to answer questions, it reaches for `search` first — a flat keyword scan across all 88 nodes. This works for exact substring matches but fails for discovery questions ("who handles Google Ads?", "what tools does Segun use?") where the answer lives in edge metadata and node relationships, not in a keyword hit.

The graph has typed edges (`strategy_lead`, `leads_execution`, `primary_user`) that encode exactly these relationships, but the agent never traverses them because `search` is the path of least resistance: one call vs. multiple hops.

**What happened in testing:**

- `search("Google Ads")` — returned results, but only keyword matches. Didn't surface that Robert *manages* Google Ads for SMN (that's encoded in his `leads_execution` edge description, not in a searchable field).
- `search("Instantly account")` — returned empty on first try (likely a startup race condition, worked on retry).
- `context("/clients/definite")` — excellent. Returned full content, typed edges in both directions, children. This is the tool that actually answers relationship questions.
- The agent never tried: start at `/` → traverse to `/clients` → read edge types → follow `leads_execution` edges to find who does what.

**What's missing:**

1. **No nudge toward traversal.** The tool descriptions don't suggest that graph traversal is the preferred discovery strategy. `search` exists, so the agent uses it. Progressive disclosure — start broad, narrow by structure — isn't encouraged anywhere.

2. **No structure-aware search.** `search` only matches against name/description/content of nodes. It doesn't search edge labels, link types, or link descriptions. So "who handles Google Ads" can't find the `leads_execution` edge on Robert's node that says "Manages Google/Bing ad campaigns."

3. **No combined tool for guided traversal.** The agent has `get_graph` (full dump) and `context` (single node), but nothing in between — no "from this node, show me children/edges matching X" that would let the agent narrow without either dumping everything or hopping node by node.

**Possible solutions:**

- **Tool description hints.** Add guidance to the MCP tool descriptions: "For discovery questions, prefer traversal starting from `/` or a known subtree over flat search. Use `context` to follow edges." This alone would shift agent behavior significantly.
- **Edge-aware search.** Extend `search` to also match against edge `type`, `linkType`, and `description` fields. A search for "ads" should surface the `leads_execution` edge that mentions "ad campaigns."
- **`navigate` tool.** A traversal-oriented tool: given a starting path and an optional filter (keyword, edge type, node type), return the next level of relevant nodes with their connecting edges. Lets the agent do progressive disclosure in one call per hop instead of assembling it from `get_graph` + `context`.
- **System prompt / tool preamble.** When the MCP server connects, include a brief "how to use this graph" preamble that establishes traversal as the primary pattern and search as a fallback.

**User quote:** "Why not traverse to discover where to look? Progressive disclosure."

---

## Search Doesn't Leverage the Graph — It's Just Ctrl+F on a Flat List

**Problem:** The previous entry identified that agents default to search over traversal. This follow-up stress test confirms the problem is worse than expected: search fundamentally doesn't use the graph. It's a flat substring scan that ignores edges, link types, and graph structure entirely. For a graph database, that's a critical gap — the graph is the product, and the primary query tool can't see it.

**Test methodology:** 10 realistic questions a new EA employee or onboarding agent would ask, using the MCP tools against the EA knowledge graph (88 nodes, ~300 edges).

**Results: 4/10 searches hit, 6/10 failed or required workarounds.**

| Question | Search result | Why it failed |
|---|---|---|
| "What clients do we work with?" | Empty | Natural language, no substring match. Answer is the `/clients` children list — a traversal. |
| "What's the outbound process?" | Empty | Answer is distributed across Segun + Apollo + n8n + Instantly + Definite edges. No single node contains the phrase. |
| "How do I get access to tools?" | Empty | Actual text says "Contact Robert for access issues" — different words, same concept. |
| "Who owns which clients?" | 1 irrelevant hit | Ownership is encoded in `owns_client` typed edges on Trevor's node. Search can't see edges. |
| "How much does Flux cost?" | Empty | Pricing table exists in Flux's content, but "Flux pricing" as a substring doesn't appear. `context(/clients/flux)` returns it immediately. |
| "What Slack channels should I join?" | 1 thin hit | Found the Slack node, but it has almost no content. No channel list exists in the KB (content gap). |

**Questions that worked** all had literal keyword overlap: "budget" (appears 19 times), "landing page" (appears in node names), "Rene" (proper noun in content).

**The core issue:**

Search is Ctrl+F across a flat list of documents. It doesn't know:
- **What connects to what** — edges are invisible to search
- **What type of relationship exists** — `owns_client`, `leads_execution`, `primary_user` are rich metadata that search ignores
- **How to compose an answer from structure** — "outbound process" requires assembling Segun → Apollo → n8n → Instantly, which is a graph walk
- **Synonyms or intent** — "get access" ≠ "Contact Robert for access issues"

For a tool whose entire value proposition is *structured knowledge with typed relationships*, having the primary query tool be a keyword scanner means the graph is dead weight during retrieval. The agent might as well be searching a folder of markdown files.

**What would make this a graph query tool:**

1. **Edge search.** `search("owns")` should return `Trevor —owns_client→ SMN`, `Trevor —owns_client→ Flux`, etc. Currently invisible.
2. **Relationship queries.** "Who is connected to SMN?" should return all nodes with edges to/from `/clients/smn` with their link types — without requiring the caller to know the path first.
3. **Subgraph extraction.** "Show me everything related to outbound" should follow edges from any node matching "outbound" and return the connected subgraph (Segun → Apollo, Segun → n8n, Segun → Definite outbound edge, Instantly → Definite).
4. **Traversal-first tool ordering.** Reorder or rename tools so agents reach for `context` and `get_node` before `search`. Or make `search` return graph context (edges, parents, link types) alongside keyword matches so the agent can follow the structure from any hit.

**User quote:** "It's not really leveraging the graph at all."

---

## Knowledge Repos Ship with No Skills — Agents Can't Do Anything Out of the Box

**Problem:** When Spandrel bootstraps a knowledge repo, the result is a directory of markdown files and an MCP server. There are no skills — no `.claude/skills/`, no `.agents/skills/`, nothing that tells an agent *how to work with this graph*. The agent has raw MCP tools (search, context, get_node) but no higher-level workflows.

This means a new agent session in a knowledge repo starts cold. It doesn't know how to run a standup against the graph, onboard a new client node, triage stale content, or answer common questions using traversal instead of flat search. Every session rediscovers these patterns from scratch.

Meanwhile, the Spandrel *framework* repo has a builder skill (`.agents/spandrel-builder/SKILL.md`) that encodes expertise for developing Spandrel itself. But the repos Spandrel *produces* — the ones users actually live in — get nothing.

**What's missing:**

1. **No skills ship with the knowledge repo.** Bootstrap creates nodes, edges, and an AGENT.md, but no executable skills. The repo has no `.claude/` or `.agents/` directory at all.

2. **No standard skill set for knowledge graph operations.** Spandrel knowledge repos share common workflows — navigating the graph, adding/updating nodes, reviewing content freshness, answering relationship questions — but none of these are packaged as reusable skills.

3. **No agent-framework-agnostic skill location.** Skills currently live in either `.claude/skills/` (Claude Code specific) or `.agents/skills/` (convention from EA-OS). There's no single location that all agent frameworks discover automatically. A skill written for one framework is invisible to another.

**What should change:**

1. **Bootstrap should generate starter skills.** At minimum, a knowledge repo should ship with:
   - **Graph navigator** — "given a question, traverse the graph using progressive disclosure instead of flat search. Start at root, follow edges, use context() to drill into relevant nodes."
   - **Content reviewer** — "scan nodes for stale content, missing descriptions, orphaned nodes with no incoming edges, broken links."
   - **Node creator** — "add a new node to the graph following Spandrel conventions: create directory, write index.md with proper frontmatter, add links to/from related nodes."
   - Any domain-specific skills that emerge from the bootstrap content (e.g., if the graph has clients and people, generate a "who owns what" skill that traverses ownership edges).

2. **Pick one skill location and make it the standard.** Spandrel needs to decide: `.agents/skills/` or `.claude/skills/` or something else. The choice should be:
   - Framework-agnostic (not locked to Claude Code)
   - Auto-discovered by agents at session start
   - Documented in the generated README
   - If the answer is `.agents/skills/`, then Claude Code needs to discover that path. If `.claude/skills/`, then other frameworks need guidance on how to read them. Either way, one canonical location.

3. **Skills should be part of the graph.** A skill *is* a node — it has a name, description, relationships to the nodes it operates on. The graph should know about its own skills. This means skills could be queryable ("what skills can I use?"), linked to relevant nodes ("this client node has an onboarding skill"), and governed by the same access control as everything else.

**The broader issue:** Spandrel's value proposition is structured knowledge for agents. But "structured knowledge" without "structured workflows" means the agent has a library with no librarian. The skills *are* the interface between the graph and useful work. Shipping a knowledge repo without them is like shipping a database without queries.

**User quote:** "The knowledge repo should be shipped with usable skills. There needs to be a way for any and all agents to pick up the skills automatically."

---

*Add new entries below as more sessions happen.*
