import path from "node:path";
import { createServer } from "node:http";
import { compile } from "./compiler.js";
import { createSchema } from "./schema.js";
import { createMcpServer } from "./mcp.js";
import { watchTree } from "./watcher.js";
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
} else {
  console.log(`Usage: spandrel <command> [root-dir]

Commands:
  dev       Start in development mode (GraphQL + file watcher)
  mcp       Start the MCP server (stdio)
  compile   Compile and validate the graph
`);
  process.exit(1);
}

function dev(rootDir: string) {
  console.log(`[spandrel] Compiling ${rootDir}...`);
  const graph = compile(rootDir);
  console.log(
    `[spandrel] Compiled: ${graph.nodes.size} nodes, ${graph.edges.length} edges, ${graph.warnings.length} warnings`
  );

  if (graph.warnings.length > 0) {
    console.log("[spandrel] Warnings:");
    for (const w of graph.warnings) {
      console.log(`  ${w.type}: ${w.message}`);
    }
  }

  const schema = createSchema(graph);

  // GraphQL server
  const yoga = createYoga({ schema });
  const server = createServer(yoga);
  const port = parseInt(process.env.PORT || "4000", 10);
  server.listen(port, () => {
    console.log(`[spandrel] GraphQL server at http://localhost:${port}/graphql`);
  });

  // File watcher
  const watcher = watchTree(rootDir, graph, () => {
    console.log(
      `[spandrel] Recompiled: ${graph.nodes.size} nodes, ${graph.edges.length} edges`
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
  const graph = compile(rootDir);
  console.error(
    `[spandrel] Compiled: ${graph.nodes.size} nodes, ${graph.edges.length} edges`
  );

  const schema = createSchema(graph);
  const mcpServer = createMcpServer(schema);
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error("[spandrel] MCP server running on stdio");

  // Watch for changes
  watchTree(rootDir, graph, () => {
    console.error(
      `[spandrel] Recompiled: ${graph.nodes.size} nodes, ${graph.edges.length} edges`
    );
  });
}

function compileOnly(rootDir: string) {
  console.log(`Compiling ${rootDir}...`);
  const graph = compile(rootDir);
  console.log(
    `Compiled: ${graph.nodes.size} nodes, ${graph.edges.length} edges, ${graph.warnings.length} warnings`
  );

  if (graph.warnings.length > 0) {
    console.log("\nWarnings:");
    for (const w of graph.warnings) {
      console.log(`  [${w.type}] ${w.path}: ${w.message}`);
    }
  }

  console.log("\nNodes:");
  for (const node of graph.nodes.values()) {
    const indent = "  ".repeat(node.depth);
    console.log(`${indent}${node.path} (${node.nodeType}) — ${node.name}`);
  }
}
