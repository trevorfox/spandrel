#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { compile, addGitMetadata, getHistory } from "./compiler/compiler.js";
import { createSchema } from "./schema/schema.js";
import type { SchemaContext } from "./schema/schema.js";
import { createMcpServer } from "./server/mcp.js";
import { watchTree } from "./compiler/watcher.js";
import { loadAccessConfig } from "./schema/access.js";
import { scaffoldInit, type InitOptions } from "./cli-init.js";
import { publish, parsePublishArgs, resolveBundleDir } from "./cli-publish.js";
import { emitGraph } from "./compiler/emit-graph.js";
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
} else if (command === "publish") {
  publishCmd(args.slice(1));
} else {
  console.log(`Usage: spandrel <command> [root-dir]

Commands:
  init      Create a new knowledge repo
  init-mcp  Output MCP config JSON for your editor
  compile   Compile and validate the graph
  dev       Start in development mode (GraphQL + file watcher + viewer)
  mcp       Start the MCP server (stdio)
  publish   Emit a static bundle (graph.json + SPA) to --out
`);
  process.exit(1);
}

async function publishCmd(argv: string[]) {
  const { rootDir, opts } = parsePublishArgs(argv);
  await publish(path.resolve(rootDir), opts);
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

  // SSE channel — one Set for all open long-lived viewer connections. We
  // track these so the graceful-shutdown path can destroy them before
  // server.close(); otherwise Node waits on the open sockets forever and
  // Ctrl-C appears to hang.
  const sseClients = new Set<ServerResponse>();
  const heartbeats = new WeakMap<ServerResponse, NodeJS.Timeout>();

  const broadcastReload = () => {
    for (const res of sseClients) {
      res.write("data: reload\n\n");
    }
  };

  const bundleDir = resolveBundleDir();
  const yogaPrefix = (yoga as unknown as { graphqlEndpoint?: string }).graphqlEndpoint ?? "/graphql";

  const server = createServer(async (req, res) => {
    const rawUrl = req.url || "/";
    const urlPath = rawUrl.split("?")[0] ?? "/";

    // Route order: explicit data endpoints → SSE → GraphQL → static SPA.
    // Keeping GraphQL above the static fallback preserves yoga's behavior
    // for its own routes (/graphql, /graphql/stream, etc.).
    if (urlPath === "/graph.json") {
      try {
        const graph = await emitGraph(store);
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify(graph));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(`emit error: ${(err as Error).message}`);
      }
      return;
    }

    if (urlPath === "/events") {
      handleSse(req, res, sseClients, heartbeats);
      return;
    }

    if (urlPath === yogaPrefix || urlPath.startsWith(yogaPrefix + "/") || urlPath.startsWith(yogaPrefix + "?")) {
      return yoga(req, res);
    }

    // Static file from the SPA bundle. Missing files fall back to index.html
    // so hash-routing deep links work — though in practice hash routing
    // means the browser never actually requests those paths.
    await serveStatic(urlPath, bundleDir, res);
  });

  const port = parseInt(process.env.PORT || "4000", 10);
  server.listen(port, () => {
    console.log(`[spandrel] GraphQL server at http://localhost:${port}${yogaPrefix}`);
    console.log(`[spandrel] Viewer at        http://localhost:${port}/`);
  });

  // Watcher → SSE. chokidar emits rapidly on editor saves (atomic write +
  // rename = 2+ events for one user action), so debounce to one broadcast
  // per burst. 100ms is long enough to coalesce, short enough to feel live.
  let reloadTimer: NodeJS.Timeout | null = null;
  const scheduleReload = () => {
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      reloadTimer = null;
      broadcastReload();
    }, 100);
  };

  const watcher = watchTree(rootDir, store, () => {
    console.log(
      `[spandrel] Recompiled: ${store.nodeCount} nodes, ${store.edgeCount} edges`
    );
    scheduleReload();
  });

  process.on("SIGINT", () => {
    console.log("\n[spandrel] Shutting down...");
    if (reloadTimer) clearTimeout(reloadTimer);
    for (const res of sseClients) {
      const hb = heartbeats.get(res);
      if (hb) clearInterval(hb);
      res.destroy();
    }
    sseClients.clear();
    watcher.close();
    server.close();
    process.exit(0);
  });
}

function handleSse(
  req: IncomingMessage,
  res: ServerResponse,
  clients: Set<ServerResponse>,
  heartbeats: WeakMap<ServerResponse, NodeJS.Timeout>
): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    // Disable proxy buffering in case the dev server ever sits behind one.
    "X-Accel-Buffering": "no",
  });
  // Flush so EventSource reports `readyState === 1` immediately — otherwise
  // the client can hang in CONNECTING until the first real event arrives.
  res.write(": connected\n\n");

  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15_000);
  heartbeats.set(res, heartbeat);

  clients.add(res);

  const cleanup = () => {
    clearInterval(heartbeat);
    clients.delete(res);
    heartbeats.delete(res);
  };

  req.on("close", cleanup);
  req.on("end", cleanup);
  res.on("close", cleanup);
}

const STATIC_MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
};

const PLACEHOLDER_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Spandrel — viewer bundle not built</title>
</head>
<body>
  <main style="font-family: system-ui, sans-serif; max-width: 42rem; margin: 4rem auto; padding: 0 1.5rem;">
    <h1>SPA bundle not built</h1>
    <p>The Spandrel web viewer has not been built for this install. Run <code>npm run build</code> in the spandrel source tree to produce <code>dist/web/</code>.</p>
    <p>Meanwhile, the live graph is available at <a href="/graph.json"><code>/graph.json</code></a> and GraphQL at <a href="/graphql"><code>/graphql</code></a>.</p>
  </main>
</body>
</html>
`;

async function serveStatic(urlPath: string, bundleDir: string, res: ServerResponse): Promise<void> {
  const bundleIndex = path.join(bundleDir, "index.html");
  const hasBundle = fs.existsSync(bundleIndex);

  if (!hasBundle) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(PLACEHOLDER_HTML);
    return;
  }

  // Resolve against the bundle dir, guarding against `..` escapes.
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const resolved = path.resolve(bundleDir, rel);
  if (!resolved.startsWith(path.resolve(bundleDir))) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("forbidden");
    return;
  }

  let filePath = resolved;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    // SPA fallback — hash routing rarely hits this, but deep-link refreshes
    // on a path-routed build would expect index.html here.
    filePath = bundleIndex;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = STATIC_MIME[ext] ?? "application/octet-stream";
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, {
      "Content-Type": mime,
      "Cache-Control": "no-store",
    });
    res.end(data);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(`static error: ${(err as Error).message}`);
  }
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
