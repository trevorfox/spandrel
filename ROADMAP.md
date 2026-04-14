# Spandrel Roadmap

## Framing

Spandrel is a spec with a reference implementation. The `design.md` companion files in `src/` are the spec — implementation-agnostic contracts that any conforming implementation must satisfy. The TypeScript code is one way to satisfy them. The `docs/` directory is a compilable Spandrel KG describing the framework itself.

Two deployment modes, one GraphQL schema:

- **Local dev** — `spandrel dev` compiles to in-memory store, serves GraphQL + MCP. No setup required.
- **Production** — compiler writes to Supabase (Postgres). GraphQL + MCP hosted on Vercel. GitHub Action recompiles on push.

```
git push → GitHub Action → compile → write to Supabase
                                          ↓
                                   GraphQL (Vercel) → Supabase
                                     ↑          ↑
                                    MCP        Web UI
```

All clients go through GraphQL. Access control is enforced there. The storage interface is backend-agnostic — the design doc in `src/storage/design.md` defines the contract, and anyone can build their own backend against it.

---

## Phase 1: Production Serving

Goal: multiple users accessing the knowledge graph via MCP on Claude Desktop/Code.

### GraphStore interface
- Extract the in-memory graph into a formal `GraphStore` interface
- Reference implementation: in-memory (what exists now)
- Postgres implementation for Supabase
- Compiler writes to either target (`spandrel dev` vs `spandrel compile --target supabase`)
- Conformance tests validate any backend against the contract

### Vercel deployment
- GraphQL API as serverless function
- MCP server over streamable HTTP as serverless function

### CI pipeline
- GitHub Action: on push, compile and write to Supabase

### Auth
- Map `_access/config.yaml` to real user identity
- Access checks in the GraphQL layer
- Start simple (API keys), evolve to Supabase Auth or SSO later

## Phase 2: Authoring Tools

Goal: make the knowledge graph easy to maintain as it grows.

### Migrations
- Rename/move tools that update references across the graph
- Graph-aware: follows links, updates backlinks

### Typed edge validation
- Formal relationship types: "depends on," "relates to," "supersedes," "is owned by"
- Compiler enforces valid edge types

### Content lifecycle
- Draft/published/archived states in frontmatter
- Staleness detection (TTL, last-updated tracking)

## Phase 3: Ingestion Pipeline

Goal: bring unstructured data into the knowledge graph with AI assistance.

Uses local SQLite for embeddings, clusters, and checkpoint state. Output is markdown files.

### Intake mode (structure exists)
- Classify new content against existing collections
- Generate frontmatter, suggest placement
- Smallest scope, most common use case

### Bootstrap mode (no structure)
- Embed and cluster source material
- Propose collections from clusters
- Generate index.md files
- Requires embeddings infrastructure

### Reshape mode (reorganize)
- Reorganize existing structure
- Depends on migration tools from Phase 2

### Embeddings infrastructure
- Local embeddings (e.g., Xenova/all-MiniLM-L6-v2)
- SQLite + sqlite-vec for vector search during authoring
- Powers clustering in bootstrap/reshape modes

## Phase 4: Intelligence

Goal: graph-aware analysis and exploration.

### Graph algorithms
- Community detection, centrality analysis, bridge node identification
- Via graphology
- Powers the analyst role

### Semantic search
- Full-text search via Postgres (production) or FTS5 (local)
- Vector search via pgvector (production) or sqlite-vec (local)
- `spandrel analyze` command for sense-making

### Roles as shipped skills
- Information Architect — design, bootstrap, reshape
- Context Engineer — maintenance, validation, graph health
- Analyst — exploration, search, graph analysis
- Framework ships archetypes, bootstrap generates instance-specific SKILL.md files

## Phase 5: Federation & UI

Goal: multi-repo knowledge graphs and human interfaces.

### Federation
- Cross-repo references via git submodules
- External references using URLs in `links`
- Each instance maintains its own access controls
- Shared collection pattern: a client's knowledge hub is its own Spandrel instance, mounted by multiple orgs

### Web UI / GitHub Pages
- Interactive graph visualization
- Consumes the same GraphQL API as MCP
- `docs/` KG deployed as the framework's documentation site
- Progression: browsable markdown on GitHub (now) → explorable via MCP (Phase 1) → live site (this phase)

---

## Ongoing: docs/ KG

The `docs/` knowledge graph describes the framework and is maintained alongside the code. It compiles in CI. Content deepens over time — nodes exist with descriptions, bodies get richer as the framework evolves. Not a phase, just continuous.
