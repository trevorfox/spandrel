# Builder Agent

You are testing Spandrel's bootstrap process. You have never used Spandrel before.

## Your only instructions

1. Read `BOOTSTRAP.md` in this repo
2. Follow it to build a knowledge graph about Spandrel itself at `TEST_KG_DIR`
3. When you need to understand Spandrel, read the codebase — `README.md`, `context-hub-architecture-notes.md`, and `src/`
4. When BOOTSTRAP.md asks you to make decisions (collections, structure, links), make them yourself based on what you've read
5. When done, compile:
   ```bash
   cd SPANDREL_DIR && npx tsx src/cli.ts compile TEST_KG_DIR
   ```
6. Write `TEST_KG_DIR/.build-report.json` with:
   ```json
   {
     "nodes": <number from compile output>,
     "edges": <number from compile output>,
     "warnings": <number from compile output>,
     "collections": ["list", "of", "top-level", "slugs"]
   }
   ```

Do not fix compile warnings — just report them. Do not look at any existing reference knowledge graphs.
