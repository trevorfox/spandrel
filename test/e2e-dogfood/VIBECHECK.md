# Spandrel Vibe Check

A manual test of the full Spandrel pipeline. You're checking whether the experience of building, querying, and navigating a knowledge graph *feels right* — not whether tests pass.

Budget ~30 minutes. You need a terminal and a Claude Code session.

## Setup

```bash
cd /path/to/spandrel
npm install && npm run build
mkdir -p /tmp/spandrel-vibecheck
```

## Phase 1: Build (cold start)

Open a Claude Code session with the KG directory added:

```bash
claude --add-dir /tmp/spandrel-vibecheck
```

Then tell it:

> Read BOOTSTRAP.md and follow it to build a knowledge graph about [your topic]. Put it in /tmp/spandrel-vibecheck.

Pick a topic you actually know — your team, a project, a hobby. The bootstrap should ask you questions, propose structure, and build incrementally. Pay attention to:

- **Does it ask before building?** It should learn your domain before proposing collections.
- **Does the structure match your mental model?** The collections it creates should feel like the natural categories in your head, not a taxonomy imposed from outside.
- **Are the links obvious?** When it connects two Things, you should think "yes, of course" — not "I guess?"

When it's done, compile:

```bash
spandrel compile /tmp/spandrel-vibecheck
```

Note the node/edge/warning counts. Warnings aren't failures — but they tell you where the graph is underspecified.

## Phase 2: Query (can you use it?)

Start the dev server:

```bash
spandrel dev /tmp/spandrel-vibecheck
```

Now query your graph. Open another terminal:

```bash
# What's in it?
curl -s localhost:4000/graphql -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{ node(path: \"/\") { name description children { name description path } } }"}' | jq

# Search for something you know is there
curl -s localhost:4000/graphql -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{ search(query: \"your term here\") { path name score } }"}' | jq

# Get full context on a node
curl -s localhost:4000/graphql -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{ context(path: \"/your/node\") { name description content outgoing { name path } incoming { name path } } }"}' | jq
```

Pay attention to:

- **Does the root tell you what this graph is about?** If you'd never seen it, would you know where to start?
- **Does search return what you expect?** Search for something you know exists. Is it the top result?
- **Do the links make navigation possible?** Pick a node, follow its outgoing links, follow those links. Did you end up somewhere that makes sense?
- **Is anything missing?** Think of a question your graph should answer. Can it?

## Phase 3: MCP (can an agent use it?)

Start a new Claude Code session with the MCP server:

```bash
claude --mcp-config <(echo '{"mcpServers":{"spandrel":{"command":"npx","args":["tsx","src/cli.ts","mcp","/tmp/spandrel-vibecheck"]}}}')
```

Then ask it something about your graph topic — don't tell it the structure, just ask a natural question. Pay attention to:

- **Does the agent find its way?** It should navigate from root to the answer without you guiding it.
- **Does progressive disclosure work?** The agent should read descriptions, decide what's relevant, and go deeper — not dump the whole graph.
- **Would you trust this for a colleague?** If you handed this graph to someone on your team via MCP, would they get value without a walkthrough?

## Phase 4: Maintain (does it hold up?)

Back in the build session, add something new:

> Add a new Thing about [something you left out]. Put it in the right collection and link it to related nodes.

Then recompile and check:

- **Was the placement obvious?** There should be one clearly correct collection. If the agent hesitated, the structure might be wrong.
- **Did the links come naturally?** If you had to force connections, the graph might be too siloed.
- **Did node count go up by the right amount?** One new Thing = one new node + its edges.

## What you're looking for

This isn't pass/fail. You're calibrating:

| Signal | Good | Bad |
|--------|------|-----|
| Bootstrap asks questions first | Learns domain, then proposes | Dumps a template structure |
| Structure matches your head | "Yes, that's how I think about this" | "I wouldn't organize it that way" |
| Search finds things | Top results are what you meant | Relevant things buried or missing |
| Agent navigates without help | Follows links, finds answers | Gets lost, reads everything |
| Adding new content is obvious | One right place, clear links | Ambiguous placement, forced links |

Write down what felt off. That's the feedback that matters.
