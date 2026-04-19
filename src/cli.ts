#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { compile, addGitMetadata, getHistory } from "./compiler/compiler.js";
import { createSchema } from "./schema/schema.js";
import type { SchemaContext } from "./schema/schema.js";
import { createMcpServer } from "./server/mcp.js";
import { watchTree } from "./compiler/watcher.js";
import { loadAccessConfig } from "./schema/access.js";
import { createYoga } from "graphql-yoga";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const command = process.argv[2];
const rootDir = process.argv[3] || process.cwd();

if (command === "dev") {
  dev(rootDir);
} else if (command === "mcp") {
  mcp(rootDir);
} else if (command === "compile") {
  compileOnly(rootDir);
} else if (command === "init") {
  init(rootDir);
} else if (command === "init-mcp") {
  initMcp(rootDir);
} else {
  console.log(`Usage: spandrel <command> [root-dir]

Commands:
  init      Create a new knowledge repo
  init-mcp  Output MCP config JSON for your editor
  compile   Compile and validate the graph
  dev       Start in development mode (GraphQL + file watcher)
  mcp       Start the MCP server (stdio)
`);
  process.exit(1);
}

async function dev(rootDir: string) {
  console.log(`[spandrel] Compiling ${rootDir}...`);
  const store = await compile(rootDir);
  await addGitMetadata(store, rootDir);
  const warnings = await store.getWarnings();
  console.log(
    `[spandrel] Compiled: ${store.nodeCount} nodes, ${store.edgeCount} edges, ${warnings.length} warnings`
  );

  if (warnings.length > 0) {
    console.log("[spandrel] Warnings:");
    for (const w of warnings) {
      console.log(`  ${w.type}: ${w.message}`);
    }
  }

  const accessConfig = loadAccessConfig(rootDir);
  if (accessConfig) {
    console.log(`[spandrel] Access config loaded (${Object.keys(accessConfig.roles).length} roles, ${Object.keys(accessConfig.policies).length} policies)`);
  }

  const schemaCtx: SchemaContext = { rootDir, getHistory, accessConfig };
  const schema = createSchema(store, schemaCtx);

  const yoga = createYoga({
    schema,
    context: ({ request }) => {
      const identity = request.headers.get("x-spandrel-identity");
      schemaCtx.actor = identity ? { identity } : undefined;
      return {};
    },
  });
  const server = createServer(yoga);
  const port = parseInt(process.env.PORT || "4000", 10);
  server.listen(port, () => {
    console.log(`[spandrel] GraphQL server at http://localhost:${port}/graphql`);
  });

  const watcher = watchTree(rootDir, store, () => {
    console.log(
      `[spandrel] Recompiled: ${store.nodeCount} nodes, ${store.edgeCount} edges`
    );
  });

  process.on("SIGINT", () => {
    console.log("\n[spandrel] Shutting down...");
    watcher.close();
    server.close();
    process.exit(0);
  });
}

async function mcp(rootDir: string) {
  console.error(`[spandrel] Compiling ${rootDir}...`);
  const store = await compile(rootDir);
  console.error(
    `[spandrel] Compiled: ${store.nodeCount} nodes, ${store.edgeCount} edges`
  );

  await addGitMetadata(store, rootDir);
  const accessConfig = loadAccessConfig(rootDir);
  if (accessConfig) {
    console.error(`[spandrel] Access config loaded (${Object.keys(accessConfig.roles).length} roles)`);
  }

  const identity = process.env.SPANDREL_IDENTITY;
  const actor = identity ? { identity } : undefined;

  const schema = createSchema(store, { rootDir, getHistory, accessConfig, actor });
  const mcpServer = await createMcpServer(schema, { graph: store });
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error("[spandrel] MCP server running on stdio");

  watchTree(rootDir, store, () => {
    console.error(
      `[spandrel] Recompiled: ${store.nodeCount} nodes, ${store.edgeCount} edges`
    );
  });
}

function init(targetDir: string) {
  const absDir = path.resolve(targetDir);

  if (fs.existsSync(path.join(absDir, "index.md"))) {
    console.error(`[spandrel] ${absDir} already contains an index.md — aborting.`);
    process.exit(1);
  }

  // Create the directory if it doesn't exist
  fs.mkdirSync(absDir, { recursive: true });

  // Root index.md
  fs.writeFileSync(
    path.join(absDir, "index.md"),
    `---
name: My Knowledge Graph
description: A Spandrel knowledge graph — edit this description to explain what this graph is for.
---

Welcome to your knowledge graph. Start by creating collections (directories with \`index.md\` files) for the major entity types in your domain.

See the [Spandrel patterns](https://github.com/spandrel/spandrel/tree/main/patterns) for guidance on structuring your graph.
`
  );

  // Example collection
  const exampleDir = path.join(absDir, "topics");
  fs.mkdirSync(exampleDir, { recursive: true });

  fs.writeFileSync(
    path.join(exampleDir, "index.md"),
    `---
name: Topics
description: An example collection — rename or replace this with your own top-level categories.
---

This is an example collection. Each subdirectory with an \`index.md\` becomes a Thing in the graph.
`
  );

  fs.writeFileSync(
    path.join(exampleDir, "design.md"),
    `# Topics — Design

## What a well-formed member looks like

- Has a clear, specific \`name\`
- Has a \`description\` that tells the reader whether to go deeper
- Links to related Things in other collections via frontmatter \`links\`

## Expected frontmatter

\`\`\`yaml
name: Topic Name
description: One-line summary
links:
  - to: /path/to/related-thing
    type: relationship_type
\`\`\`
`
  );

  // .gitignore
  fs.writeFileSync(path.join(absDir, ".gitignore"), `_access/\n`);

  console.log(`[spandrel] Created knowledge repo at ${absDir}`);
  console.log(`
Next steps:
  1. Edit index.md to describe your graph
  2. Create collections: mkdir -p people && echo '---\\nname: People\\ndescription: ...\\n---' > people/index.md
  3. Compile:  spandrel compile ${absDir}
  4. Serve:    spandrel dev ${absDir}
  5. MCP:      spandrel init-mcp ${absDir}
`);
}

function initMcp(rootDir: string) {
  const absDir = path.resolve(rootDir);
  const spandrelBin = process.argv[1];

  // Figure out if we're running from tsx (dev) or compiled (dist)
  const isTs = spandrelBin.endsWith(".ts");
  let command: string;
  let args: string[];

  if (isTs) {
    // Dev mode: running via tsx
    command = "npx";
    args = ["tsx", spandrelBin, "mcp", absDir];
  } else {
    // Installed: running compiled JS directly via node or the bin shim
    command = "spandrel";
    args = ["mcp", absDir];
  }

  const config = {
    mcpServers: {
      spandrel: {
        command,
        args,
      },
    },
  };

  console.log(`Add this to your MCP config (claude_desktop_config.json, settings.json, etc.):\n`);
  console.log(JSON.stringify(config, null, 2));
  console.log(`\nOr for Claude Code, run:\n`);
  console.log(`  claude mcp add spandrel -- ${command} ${args.join(" ")}`);
}

async function compileOnly(rootDir: string) {
  console.log(`Compiling ${rootDir}...`);
  const store = await compile(rootDir);
  const warnings = await store.getWarnings();
  console.log(
    `Compiled: ${store.nodeCount} nodes, ${store.edgeCount} edges, ${warnings.length} warnings`
  );

  if (warnings.length > 0) {
    console.log("\nWarnings:");
    for (const w of warnings) {
      console.log(`  [${w.type}] ${w.path}: ${w.message}`);
    }
  }

  console.log("\nNodes:");
  for (const node of await store.getAllNodes()) {
    const indent = "  ".repeat(node.depth);
    console.log(`${indent}${node.path} (${node.nodeType}) — ${node.name}`);
  }
}
