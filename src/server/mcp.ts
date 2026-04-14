import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { graphql } from "graphql";
import { z } from "zod";
import type { GraphQLSchema } from "graphql";
import type { SpandrelGraph } from "../compiler/types.js";

export type McpServerOptions = {
  /** The compiled graph — used to generate server instructions */
  graph?: SpandrelGraph;
};

function buildInstructions(graph?: SpandrelGraph): string {
  const root = graph?.nodes.get("/");
  const name = root?.name ?? "Knowledge Graph";
  const description = root?.description ?? "";
  const nodeCount = graph?.nodes.size ?? 0;
  const edgeCount = graph?.edges.filter(e => e.type === "link").length ?? 0;

  // Build a collections summary from root's children
  const collections: string[] = [];
  if (root && graph) {
    for (const childPath of root.children) {
      const child = graph.nodes.get(childPath);
      if (child) {
        collections.push(`${child.name} (${childPath})`);
      }
    }
  }

  const collectionsLine = collections.length > 0
    ? `\nCollections: ${collections.join(", ")}.`
    : "";

  return `Spandrel is a structured knowledge graph: "${name}" — ${description}
${nodeCount} nodes, ${edgeCount} typed edges.${collectionsLine}

How to use:
- Start with context("/") to orient. Follow edges to discover content.
- Use context() for traversal and relationship questions — answers live in edges, not keyword matches.
- Use search() as a fallback when you don't know where to start. Search matches node text only, not edges.
- For "who owns X" or "what connects to Y", use get_references() or context() — not search.

When to use: Consult this graph proactively for questions about ${collections.length > 0 ? collections.map(c => c.replace(/ \(.*/, "").toLowerCase()).join(", ") : "the domain it covers"}.`;
}

export function createMcpServer(schema: GraphQLSchema, options?: McpServerOptions): McpServer {
  const server = new McpServer(
    { name: "spandrel", version: "0.1.0" },
    { instructions: buildInstructions(options?.graph) },
  );

  // Helper: run a parameterized GraphQL query safely
  async function gql(source: string, variables: Record<string, unknown> = {}) {
    return graphql({ schema, source, variableValues: variables });
  }

  // --- Core navigation tools (agent-facing) ---

  server.tool(
    "get_node",
    "Get a node by path. Returns name, description, nodeType, children, outgoing links, incoming backlinks, parent. Start here for navigating from a known path. Use depth to preview children. Prefer this + context over search for discovery.",
    {
      path: z.string().describe("Path to the node (e.g. '/' or '/clients/acme')"),
      depth: z.number().optional().describe("How many levels of children to include"),
      includeContent: z.boolean().optional().describe("Include the full markdown content inline"),
    },
    async ({ path: nodePath, depth, includeContent }) => {
      const result = await gql(`
        query GetNode($path: String!, $depth: Int, $includeContent: Boolean) {
          node(path: $path, depth: $depth, includeContent: $includeContent) {
            path name description nodeType depth parent
            children { path name description nodeType depth children }
            links { to type description }
            referencedBy { to type description }
            content
            created updated author
          }
        }
      `, { path: nodePath, depth, includeContent: includeContent ?? false });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result.data?.node ?? null, null, 2) }],
      };
    }
  );

  server.tool(
    "get_content",
    "Get the full markdown content of a node. Use when you just need the content without structural metadata.",
    {
      path: z.string().describe("Path to the node"),
    },
    async ({ path: nodePath }) => {
      const result = await gql(`
        query GetContent($path: String!) {
          content(path: $path)
        }
      `, { path: nodePath });
      const text = typeof result.data?.content === "string" ? result.data.content : "Node not found";
      return {
        content: [{ type: "text" as const, text }],
      };
    }
  );

  server.tool(
    "context",
    "Get everything about a node in one call — content, children, all outgoing links (with target names), and all incoming backlinks (with source names). The primary tool for graph traversal. Start at '/' and follow edges to discover content. Prefer this over search for questions about relationships, ownership, or structure.",
    {
      path: z.string().describe("Path to the node"),
    },
    async ({ path: nodePath }) => {
      const result = await gql(`
        query GetContext($path: String!) {
          context(path: $path) {
            path name description nodeType depth parent
            content
            children { path name description nodeType depth }
            outgoing { path name description linkType linkDescription direction }
            incoming { path name description linkType linkDescription direction }
            created updated author
          }
        }
      `, { path: nodePath });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result.data?.context ?? null, null, 2) }],
      };
    }
  );

  server.tool(
    "get_references",
    "Get link edges for a node. Direction: outgoing (default), incoming (backlinks), or both. Includes the name and description of linked nodes. Use to answer 'what connects to X?' — relationship answers live in edges, not keyword matches.",
    {
      path: z.string().describe("Path to the node"),
      direction: z.enum(["outgoing", "incoming", "both"]).optional().describe("Which direction of links to return"),
    },
    async ({ path: nodePath, direction }) => {
      const result = await gql(`
        query GetReferences($path: String!, $direction: Direction) {
          references(path: $path, direction: $direction) {
            path name description linkType linkDescription direction
          }
        }
      `, { path: nodePath, direction: direction ?? "outgoing" });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result.data?.references ?? [], null, 2) }],
      };
    }
  );

  server.tool(
    "search",
    "Full-text search across node names, descriptions, and content. Results ranked by relevance. Use as a fallback when you don't know where to start traversing. For relationship questions ('who owns X', 'what connects to Y'), use context() or get_references() instead — search only matches text, not graph edges.",
    {
      query: z.string().describe("Search query string"),
      path: z.string().optional().describe("Scope search to this subtree path"),
    },
    async ({ query: q, path: scopePath }) => {
      const result = await gql(`
        query Search($query: String!, $path: String) {
          search(query: $query, path: $path) {
            path name description snippet score
          }
        }
      `, { query: q, path: scopePath });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result.data?.search ?? [], null, 2) }],
      };
    }
  );

  server.tool(
    "get_graph",
    "Get the graph structure (nodes + typed edges) for broad orientation or visualization. For focused exploration, prefer context() which gives one node's full neighborhood.",
    {
      path: z.string().optional().describe("Root path (defaults to '/')"),
      depth: z.number().optional().describe("How many levels deep"),
    },
    async ({ path: nodePath, depth }) => {
      const result = await gql(`
        query GetGraph($path: String, $depth: Int) {
          graph(path: $path, depth: $depth) {
            nodes { path name description nodeType depth }
            edges { from to type linkType description }
          }
        }
      `, { path: nodePath, depth });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result.data?.graph ?? null, null, 2) }],
      };
    }
  );

  // --- Builder tools (context engineer-facing) ---

  server.tool(
    "validate",
    "Check graph health. Returns warnings about broken links, missing descriptions, unlisted children. Primarily for context engineers.",
    {
      path: z.string().optional().describe("Scope validation to a subtree"),
    },
    async ({ path: nodePath }) => {
      const result = await gql(`
        query Validate($path: String) {
          validate(path: $path) {
            path type message
          }
        }
      `, { path: nodePath });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result.data?.validate ?? [], null, 2) }],
      };
    }
  );

  server.tool(
    "get_history",
    "Get version history for a node from git. Primarily for context engineers and analysts.",
    {
      path: z.string().describe("Path to the node"),
    },
    async ({ path: nodePath }) => {
      const result = await gql(`
        query GetHistory($path: String!) {
          history(path: $path) {
            hash date author message
          }
        }
      `, { path: nodePath });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result.data?.history ?? [], null, 2) }],
      };
    }
  );

  // --- Write tools (context engineer / builder-facing) ---

  server.tool(
    "create_thing",
    "Create a new Thing at the given path. Creates the directory and index.md with frontmatter. Every node is a directory — this is by design (directory-per-node pattern). The parent path must already exist.",
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
      const result = await gql(`
        mutation CreateThing($path: String!, $name: String!, $description: String!, $content: String, $links: [LinkInput!], $author: String, $tags: [String!]) {
          createThing(path: $path, name: $name, description: $description, content: $content, links: $links, author: $author, tags: $tags) {
            success path message warnings { path type message }
          }
        }
      `, { path: thingPath, name, description, content, links, author, tags });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result.data?.createThing ?? result.errors, null, 2) }],
      };
    }
  );

  server.tool(
    "update_thing",
    "Update an existing Thing's frontmatter and/or content. Only specified fields are changed; others are preserved.",
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
      const result = await gql(`
        mutation UpdateThing($path: String!, $name: String, $description: String, $content: String, $links: [LinkInput!], $author: String, $tags: [String!]) {
          updateThing(path: $path, name: $name, description: $description, content: $content, links: $links, author: $author, tags: $tags) {
            success path message warnings { path type message }
          }
        }
      `, { path: thingPath, name, description, content, links, author, tags });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result.data?.updateThing ?? result.errors, null, 2) }],
      };
    }
  );

  server.tool(
    "delete_thing",
    "Delete a Thing and its entire subtree. Cannot delete the root node. Use with caution.",
    {
      path: z.string().describe("Path to the Thing to delete"),
    },
    async ({ path: thingPath }) => {
      const result = await gql(`
        mutation DeleteThing($path: String!) {
          deleteThing(path: $path) {
            success path message warnings { path type message }
          }
        }
      `, { path: thingPath });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result.data?.deleteThing ?? result.errors, null, 2) }],
      };
    }
  );

  return server;
}

export async function startMcpServer(schema: GraphQLSchema, options?: McpServerOptions): Promise<void> {
  const server = createMcpServer(schema, options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
