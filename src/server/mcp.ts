import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { GraphStore } from "../storage/graph-store.js";
import type { AccessPolicy } from "../access/policy.js";
import { accessLevelAtLeast } from "../access/policy.js";
import type { Actor, AccessLevel, ShapedNode } from "../access/types.js";
import {
  resolveNode,
  resolveContext,
  resolveReferences,
  resolveSearch,
  resolveNavigate,
  resolveGraph,
  lookupLinkTypeDescription,
  MAX_GRAPH_DEPTH,
  type SearchResult,
} from "../graph-ops.js";
import {
  createThing,
  updateThing,
  deleteThing,
  resolveSourcePath,
} from "./writer.js";
import { recompileNode } from "../compiler/compiler.js";
import type { HistoryEntry } from "../compiler/types.js";

export interface McpServerOptions {
  store: GraphStore;
  policy: AccessPolicy;
  /** Inbound actor; defaults to anonymous when not supplied. */
  actor?: Actor;
  /** Filesystem root — required for the three write tools. */
  rootDir?: string;
  /** Optional git history accessor for the `get_history` tool. */
  getHistory?: (rootDir: string, nodePath: string) => Promise<HistoryEntry[]>;
}

const ANONYMOUS_ACTOR: Actor = { tier: "anonymous" };

/**
 * How many link types to enumerate in the instructions block before
 * truncating with a "…and N more" marker. Keeps the instructions within
 * the agent's context budget regardless of how large the declared
 * vocabulary grows.
 */
const MAX_LINK_TYPES_IN_INSTRUCTIONS = 20;

/**
 * Cap on the summarised length of a single linkType description line.
 * Longer descriptions are truncated with an ellipsis so one verbose
 * entry can't blow out the whole block.
 */
const MAX_LINK_TYPE_DESCRIPTION_CHARS = 400;

function formatLinkTypeLine(stem: string, description: string): string {
  const trimmed = description.trim();
  if (!trimmed) return `- ${stem}`;
  const summary = trimmed.length > MAX_LINK_TYPE_DESCRIPTION_CHARS
    ? trimmed.slice(0, MAX_LINK_TYPE_DESCRIPTION_CHARS - 1).trimEnd() + "…"
    : trimmed;
  return `- ${stem} — ${summary}`;
}

export async function buildInstructions(graph?: GraphStore): Promise<string> {
  const root = graph ? await graph.getNode("/") : undefined;
  const name = root?.name ?? "Knowledge Graph";
  const description = root?.description ?? "";
  const nodeCount = graph?.nodeCount ?? 0;
  const edgeCount = graph ? (await graph.getEdges({ type: "link" })).length : 0;

  const collections: string[] = [];
  if (root && graph) {
    const childMap = await graph.getNodes(root.children);
    for (const childPath of root.children) {
      const child = childMap.get(childPath);
      if (child) {
        collections.push(`${child.name} (${childPath})`);
      }
    }
  }

  const collectionsLine = collections.length > 0
    ? `\nCollections: ${collections.join(", ")}.`
    : "";

  let linkTypesBlock = "";
  if (graph) {
    const linkTypes = await graph.getLinkTypes();
    if (linkTypes.size > 0) {
      const entries = Array.from(linkTypes.entries()).sort(([a], [b]) => a.localeCompare(b));
      const shown = entries.slice(0, MAX_LINK_TYPES_IN_INSTRUCTIONS);
      const remaining = entries.length - shown.length;
      const lines = shown.map(([stem, info]) => formatLinkTypeLine(stem, info.description));
      if (remaining > 0) {
        lines.push(`- …and ${remaining} more (query linkTypes for the full list)`);
      }
      linkTypesBlock = `\n\nLink types declared in this graph:\n${lines.join("\n")}`;
    }
  }

  return `Spandrel is a structured knowledge graph: "${name}" — ${description}
${nodeCount} nodes, ${edgeCount} typed edges.${collectionsLine}

How to use:
- Start with context("/") to orient. Follow edges to discover content.
- Use context() for traversal and relationship questions — answers live in edges, not keyword matches.
- Use search() as a fallback when you don't know where to start. Search matches node text only, not edges.
- For "who owns X" or "what connects to Y", use get_references() or context() — not search.

When to use: Consult this graph proactively for questions about ${collections.length > 0 ? collections.map(c => c.replace(/ \(.*/, "").toLowerCase()).join(", ") : "the domain it covers"}.${linkTypesBlock}`;
}

/**
 * Run the default keyword-search behaviour against an AccessPolicy-shaped
 * graph. Hosts that register their own `search` tool (e.g. to layer vector
 * search on top for paid tiers) can call this to fall through to keyword
 * behaviour when the caller is on a lower tier.
 */
export async function runKeywordSearch(
  store: GraphStore,
  policy: AccessPolicy,
  actor: Actor,
  args: { query: string; path?: string }
): Promise<SearchResult[]> {
  const results = await resolveSearch(store, args.query, args.path);
  return filterReadable(store, policy, actor, results, "description");
}

export interface RegisterReadOnlyToolsOptions {
  /**
   * When true, skip registering the default keyword `search` tool. Hosts that
   * want to provide their own search implementation (e.g. vector search on a
   * paid tier) can pass `{ skipSearch: true }` and then register their own
   * `search` tool directly on the server after this call. This is the
   * supported extension point; do not reach into `server._registeredTools`.
   */
  skipSearch?: boolean;
}

export async function createMcpServer(options: McpServerOptions): Promise<McpServer> {
  const server = new McpServer(
    { name: "spandrel", version: "0.1.0" },
    { instructions: await buildInstructions(options.store) },
  );

  registerReadOnlyTools(server, options);
  if (options.rootDir) {
    registerWriteTools(server, options);
  }
  return server;
}

export async function startMcpServer(options: McpServerOptions): Promise<void> {
  const server = await createMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// --- Helpers shared by tools ---------------------------------------------

interface BoundContext {
  store: GraphStore;
  policy: AccessPolicy;
  actor: Actor;
}

function bind(opts: McpServerOptions): BoundContext {
  return {
    store: opts.store,
    policy: opts.policy,
    actor: opts.actor ?? ANONYMOUS_ACTOR,
  };
}

async function filterReadable<T extends { path: string }>(
  store: GraphStore,
  policy: AccessPolicy,
  actor: Actor,
  items: T[],
  minLevel: AccessLevel = "exists"
): Promise<T[]> {
  const nodeMap = await store.getNodes(items.map((i) => i.path));
  return items.filter((item) => {
    const n = nodeMap.get(item.path);
    const level = policy.resolveLevel(actor, item.path, n?.frontmatter ?? {});
    return accessLevelAtLeast(level, minLevel);
  });
}

function asTextResult(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

// --- Read-only tools -----------------------------------------------------

export function registerReadOnlyTools(
  server: McpServer,
  options: McpServerOptions,
  registerOpts: RegisterReadOnlyToolsOptions = {}
): void {
  const ctx = bind(options);

  server.tool(
    "get_node",
    "Returns a node's metadata, children, and links. Use depth to preview children. Names and descriptions at each level tell you whether to go deeper.",
    {
      path: z.string().describe("Path to the node (e.g. '/' or '/clients/acme')"),
      depth: z.number().optional().describe("How many levels of children to include"),
      includeContent: z.boolean().optional().describe("Include the full markdown content inline"),
    },
    async ({ path: nodePath, depth, includeContent }) => {
      const node = await ctx.store.getNode(nodePath);
      if (!node) return asTextResult(null);

      const level = ctx.policy.resolveLevel(ctx.actor, nodePath, node.frontmatter);
      if (level === "none") return asTextResult(null);

      const wantContent = !!includeContent && accessLevelAtLeast(level, "content");
      const result = await resolveNode(ctx.store, nodePath, depth, wantContent);
      if (!result) return asTextResult(null);

      // Filter children + links + backlinks by visibility.
      result.children = await filterReadable(ctx.store, ctx.policy, ctx.actor, result.children);
      result.links = result.links.filter((l) =>
        accessLevelAtLeast(ctx.policy.resolveLevel(ctx.actor, l.to), "exists")
      );
      result.referencedBy = result.referencedBy.filter((l) =>
        accessLevelAtLeast(ctx.policy.resolveLevel(ctx.actor, l.to), "exists")
      );

      // Strip fields the actor's level doesn't permit.
      if (!accessLevelAtLeast(level, "description")) {
        result.description = "";
        result.children = [];
        result.links = [];
        result.referencedBy = [];
      }
      if (!accessLevelAtLeast(level, "content")) {
        result.content = null;
      }
      return asTextResult(result);
    }
  );

  server.tool(
    "get_content",
    "Returns the markdown body of a node without structural metadata.",
    {
      path: z.string().describe("Path to the node"),
    },
    async ({ path: nodePath }) => {
      const node = await ctx.store.getNode(nodePath);
      if (!node) {
        return { content: [{ type: "text" as const, text: "Node not found" }] };
      }
      const level = ctx.policy.resolveLevel(ctx.actor, nodePath, node.frontmatter);
      if (!accessLevelAtLeast(level, "content")) {
        return { content: [{ type: "text" as const, text: "Node not found" }] };
      }
      return { content: [{ type: "text" as const, text: node.content }] };
    }
  );

  server.tool(
    "context",
    "Full node context in one call: content, children, outgoing links with target names, incoming backlinks with source names. Start at '/' and follow edges to discover answers. Companion documents (DESIGN, SKILL, AGENT, README, CLAUDE, AGENTS) are excluded by default; pass includeNonNavigable=true to surface them.",
    {
      path: z.string().describe("Path to the node"),
      includeNonNavigable: z
        .boolean()
        .optional()
        .describe(
          "Include non-navigable nodes (companion documents) in child listings. Default false."
        ),
    },
    async ({ path: nodePath, includeNonNavigable }) => {
      const node = await ctx.store.getNode(nodePath);
      if (!node) return asTextResult(null);

      const level = ctx.policy.resolveLevel(ctx.actor, nodePath, node.frontmatter);
      if (level === "none") return asTextResult(null);

      const result = await resolveContext(ctx.store, nodePath, {
        includeNonNavigable: includeNonNavigable ?? false,
      });
      if (!result) return asTextResult(null);

      result.children = await filterReadable(ctx.store, ctx.policy, ctx.actor, result.children);
      result.outgoing = await filterReadable(ctx.store, ctx.policy, ctx.actor, result.outgoing);
      result.incoming = await filterReadable(ctx.store, ctx.policy, ctx.actor, result.incoming);

      if (!accessLevelAtLeast(level, "content")) {
        (result as unknown as { content: string | null }).content = null;
      }
      if (!accessLevelAtLeast(level, "description")) {
        result.description = "";
        result.children = [];
        result.outgoing = [];
        result.incoming = [];
      }
      return asTextResult(result);
    }
  );

  server.tool(
    "get_references",
    "Returns typed link edges for a node — who owns what, what connects where. Direction: outgoing (default), incoming, or both.",
    {
      path: z.string().describe("Path to the node"),
      direction: z.enum(["outgoing", "incoming", "both"]).optional().describe("Which direction of links to return"),
    },
    async ({ path: nodePath, direction }) => {
      const level = ctx.policy.resolveLevel(ctx.actor, nodePath);
      if (!accessLevelAtLeast(level, "description")) return asTextResult([]);

      const refs = await resolveReferences(ctx.store, nodePath, direction ?? "outgoing");
      const accessible = await filterReadable(ctx.store, ctx.policy, ctx.actor, refs);
      return asTextResult(accessible);
    }
  );

  if (!registerOpts.skipSearch) {
    server.tool(
      "search",
      "Keyword search across node text and edge metadata. Use ONLY for discovery — when you don't know where to look. For relationship or structural questions ('what links to X', 'who owns Y', 'what's under /clients'), prefer context() or get_references() — answers live in edges, not keyword matches. Follow any search hit with context() on the result path to get the full picture.",
      {
        query: z.string().describe("Search query string"),
        path: z.string().optional().describe("Scope search to this subtree path"),
      },
      async ({ query: q, path: scopePath }) => {
        const results = await runKeywordSearch(ctx.store, ctx.policy, ctx.actor, { query: q, path: scopePath });
        return asTextResult(results);
      }
    );
  }

  server.tool(
    "navigate",
    "Filtered one-hop traversal: returns children and linked nodes, optionally narrowed by keyword or edge type (e.g. 'owns_client'). Call repeatedly to walk the graph. Companion documents are excluded by default; pass includeNonNavigable=true to surface them.",
    {
      path: z.string().describe("Starting node path (e.g. '/' or '/clients')"),
      keyword: z.string().optional().describe("Filter neighbors by keyword (matches name, description, or edge description)"),
      edgeType: z.string().optional().describe("Filter to edges of this type only (e.g. 'owns_client', 'leads_execution')"),
      includeNonNavigable: z
        .boolean()
        .optional()
        .describe("Include non-navigable nodes (companion documents) as neighbors. Default false."),
    },
    async ({ path: nodePath, keyword, edgeType, includeNonNavigable }) => {
      const level = ctx.policy.resolveLevel(ctx.actor, nodePath);
      if (!accessLevelAtLeast(level, "description")) return asTextResult(null);

      const result = await resolveNavigate(ctx.store, nodePath, keyword, edgeType, {
        includeNonNavigable: includeNonNavigable ?? false,
      });
      if (!result) return asTextResult(null);

      result.neighbors = await filterReadable(ctx.store, ctx.policy, ctx.actor, result.neighbors);
      return asTextResult(result);
    }
  );

  server.tool(
    "get_graph",
    "Dumps all nodes and edges in a subtree. Can be large — use context() or navigate() to explore incrementally instead.",
    {
      path: z.string().optional().describe("Root path (defaults to '/')"),
      depth: z.number().optional().describe("How many levels deep"),
    },
    async ({ path: nodePath, depth }) => {
      const requestedDepth = depth ?? MAX_GRAPH_DEPTH;
      if (requestedDepth > MAX_GRAPH_DEPTH) {
        throw new Error(
          `Depth ${requestedDepth} exceeds maximum allowed depth of ${MAX_GRAPH_DEPTH}`
        );
      }

      const result = await resolveGraph(ctx.store, nodePath ?? "/", requestedDepth);
      const visibleNodes = await filterReadable(ctx.store, ctx.policy, ctx.actor, result.nodes);
      const visiblePaths = new Set(visibleNodes.map((n) => n.path));
      const visibleEdges = result.edges.filter(
        (e) => visiblePaths.has(e.from) && visiblePaths.has(e.to)
      );
      return asTextResult({ nodes: visibleNodes, edges: visibleEdges });
    }
  );

  server.tool(
    "validate",
    "Returns warnings: broken links, missing descriptions, unlisted children.",
    {
      path: z.string().optional().describe("Scope validation to a subtree"),
    },
    async ({ path: nodePath }) => {
      const warnings = await ctx.store.getWarnings();

      if (nodePath) {
        const level = ctx.policy.resolveLevel(ctx.actor, nodePath);
        if (!accessLevelAtLeast(level, "content")) return asTextResult([]);
        return asTextResult(
          warnings.filter((w) => w.path === nodePath || w.path.startsWith(nodePath + "/"))
        );
      }

      const accessible = warnings.filter((w) =>
        accessLevelAtLeast(ctx.policy.resolveLevel(ctx.actor, w.path), "content")
      );
      return asTextResult(accessible);
    }
  );

  server.tool(
    "get_history",
    "Returns git history for a node.",
    {
      path: z.string().describe("Path to the node"),
    },
    async ({ path: nodePath }) => {
      const level = ctx.policy.resolveLevel(ctx.actor, nodePath);
      if (!accessLevelAtLeast(level, "content")) return asTextResult([]);

      if (options.getHistory && options.rootDir) {
        const entries = await options.getHistory(options.rootDir, nodePath);
        return asTextResult(entries);
      }
      return asTextResult([]);
    }
  );
}

// --- Write tools ---------------------------------------------------------

export function registerWriteTools(
  server: McpServer,
  options: McpServerOptions
): void {
  if (!options.rootDir) {
    throw new Error("registerWriteTools requires options.rootDir");
  }
  const rootDir: string = options.rootDir;
  const ctx = bind(options);

  async function executeMutation(thingPath: string, action: () => void) {
    if (!ctx.policy.canWrite(ctx.actor, thingPath)) {
      return { success: false, path: thingPath, message: "Write access denied", warnings: [] };
    }
    try {
      action();
      const { sourcePath } = resolveSourcePath(rootDir, thingPath);
      await recompileNode(ctx.store, rootDir, sourcePath);
      const warnings = (await ctx.store.getWarnings()).filter(
        (w) => w.path === thingPath || w.path.startsWith(thingPath + "/")
      );
      return { success: true, path: thingPath, message: null, warnings };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, path: thingPath, message, warnings: [] };
    }
  }

  server.tool(
    "create_thing",
    "Creates a new node with frontmatter and optional links. Parent path must already exist.",
    {
      path: z.string().describe("Path for the new Thing (e.g. '/clients/acme')"),
      name: z.string().describe("Name of the Thing"),
      description: z.string().describe("Description of the Thing"),
      content: z.string().optional().describe("Markdown body content"),
      links: z.array(z.object({
        to: z.string(),
        type: z.string().optional(),
        description: z.string().optional(),
      })).optional().describe("Links to other Things"),
      author: z.string().optional().describe("Author path or identifier"),
      tags: z.array(z.string()).optional().describe("Tags for categorization"),
    },
    async ({ path: thingPath, name, description, content, links, author, tags }) => {
      const result = await executeMutation(thingPath, () => {
        createThing(rootDir, thingPath, { name, description, content, links, author, tags });
      });
      return asTextResult(result);
    }
  );

  server.tool(
    "update_thing",
    "Updates a node. Only specified fields are changed; others are preserved.",
    {
      path: z.string().describe("Path to the Thing to update"),
      name: z.string().optional().describe("New name"),
      description: z.string().optional().describe("New description"),
      content: z.string().optional().describe("New markdown body content"),
      links: z.array(z.object({
        to: z.string(),
        type: z.string().optional(),
        description: z.string().optional(),
      })).optional().describe("Replace links (full replacement, not merge)"),
      author: z.string().optional().describe("New author"),
      tags: z.array(z.string()).optional().describe("Replace tags"),
    },
    async ({ path: thingPath, name, description, content, links, author, tags }) => {
      const result = await executeMutation(thingPath, () => {
        updateThing(rootDir, thingPath, { name, description, content, links, author, tags });
      });
      return asTextResult(result);
    }
  );

  server.tool(
    "delete_thing",
    "Deletes a node and its entire subtree. Cannot delete root.",
    {
      path: z.string().describe("Path to the Thing to delete"),
    },
    async ({ path: thingPath }) => {
      const result = await executeMutation(thingPath, () => {
        deleteThing(rootDir, thingPath);
      });
      return asTextResult(result);
    }
  );
}

// Re-export ShapedNode for downstream consumers that build on this surface.
export type { ShapedNode };
