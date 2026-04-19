#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { createServer } from "node:http";
import { compile, addGitMetadata, getHistory } from "./compiler/compiler.js";
import { createSchema } from "./schema/schema.js";
import type { SchemaContext } from "./schema/schema.js";
import { createMcpServer } from "./server/mcp.js";
import { watchTree } from "./compiler/watcher.js";
import { loadAccessConfig } from "./schema/access.js";
import { scaffoldInit, type InitOptions } from "./cli-init.js";
import { createYoga } from "graphql-yoga";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const args = process.argv.slice(2);
const command = args[0];

if (command === "dev") {
  dev(parsePositional(args));
} else if (command === "mcp") {
  mcp(parsePositional(args));
} else if (command === "compile") {
  compileOnly(parsePositional(args));
} else if (command === "init") {
  init(args.slice(1));
} else if (command === "init-mcp") {
  initMcp(parsePositional(args));
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

function parsePositional(argv: string[]): string {
  // First positional after the command, skipping --flag value pairs.
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      if (!a.includes("=")) i++; // skip value
      continue;
    }
    return a;
  }
  return process.cwd();
}

function parseInitArgs(argv: string[]): { targetDir: string; opts: Partial<InitOptions> } {
  let targetDir: string | undefined;
  const opts: Partial<InitOptions> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--name" || a === "--description") {
      const key = a === "--name" ? "name" : "description";
      opts[key] = argv[++i] ?? "";
    } else if (a.startsWith("--name=")) {
      opts.name = a.slice("--name=".length);
    } else if (a.startsWith("--description=")) {
      opts.description = a.slice("--description=".length);
    } else if (!targetDir && !a.startsWith("--")) {
      targetDir = a;
    }
  }
  return { targetDir: targetDir ?? process.cwd(), opts };
}

async function init(argv: string[]) {
  const { targetDir, opts } = parseInitArgs(argv);
  const absDir = path.resolve(targetDir);

  if (fs.existsSync(path.join(absDir, "index.md"))) {
    console.log(`Already a Spandrel graph at ${absDir}. Nothing to do.`);
    process.exit(0);
  }

  let name = opts.name;
  let description = opts.description;

  if (!name || !description) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      if (!name) name = (await rl.question("Graph name: ")).trim();
      if (!description) description = (await rl.question("Description: ")).trim();
    } finally {
      rl.close();
    }
  }

  if (!name) name = path.basename(absDir) || "My Knowledge Graph";
  if (!description) description = "A Spandrel knowledge graph.";

  const result = scaffoldInit(absDir, { name, description });

  console.log(`[spandrel] Created knowledge repo at ${absDir}`);
  console.log(`  ${result.filesWritten.length} files written`);
  console.log(`
Next steps:
  1. Edit index.md to describe your graph
  2. Add collections (directories with index.md) for your domain's entity types
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
