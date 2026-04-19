import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { graphql } from "graphql";
import { z } from "zod";
import type { GraphQLSchema } from "graphql";
import type { GraphStore } from "../storage/graph-store.js";

export type McpServerOptions = {
  /** The compiled graph store — used to generate server instructions */
  graph?: GraphStore;
};

async function buildInstructions(graph?: GraphStore): Promise<string> {
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

  return `Spandrel is a structured knowledge graph: "${name}" — ${description}
${nodeCount} nodes, ${edgeCount} typed edges.${collectionsLine}

How to use:
- Start with context("/") to orient. Follow edges to discover content.
- Use context() for traversal and relationship questions — answers live in edges, not keyword matches.
- Use search() as a fallback when you don't know where to start. Search matches node text only, not edges.
- For "who owns X" or "what connects to Y", use get_references() or context() — not search.

When to use: Consult this graph proactively for questions about ${collections.length > 0 ? collections.map(c => c.replace(/ \(.*/, "").toLowerCase()).join(", ") : "the domain it covers"}.`;
}

export async function createMcpServer(schema: GraphQLSchema, options?: McpServerOptions): Promise<McpServer> {
  const server = new McpServer(
    { name: "spandrel", version: "0.1.0" },
    { instructions: await buildInstructions(options?.graph) },
  );

  // Helper: run a parameterized GraphQL query safely
  async function gql(source: string, variables: Record<string, unknown> = {}) {
    return graphql({ schema, source, variableValues: variables });
  }

  // --- Core navigation tools (agent-facing) ---

  server.tool(
    "get_node",
    "Returns a node's metadata, children, and links. Use depth to preview children. Names and descriptions at each level tell you whether to go deeper.",
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
    "Returns the markdown body of a node without structural metadata.",
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
    "Full node context in one call: content, children, outgoing links with target names, incoming backlinks with source names. Start at '/' and follow edges to discover answers.",
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
    "Returns typed link edges for a node — who owns what, what connects where. Direction: outgoing (default), incoming, or both.",
    {
      path: z.string().describe("Path to the node"),
      direction: z.enum(["outgoing", "incoming", "both"]).optional().describe("Which direction of links to return"),
    },
    async ({ path: nodePath, direction }) => {
      const result = await gql(`
        query GetReferences($path: String!, $direction: Direction) {
          references(path: $path, direction: $direction) {
            nodes { path name description linkType linkDescription direction }
            pageInfo { hasNextPage endCursor }
          }
        }
      `, { path: nodePath, direction: direction ?? "outgoing" });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result.data?.references?.nodes ?? [], null, 2) }],
      };
    }
  );

  server.tool(
    "search",
    "Keyword search across node text and edge metadata. Use when you don't know where to look; follow up with context() on results to get the full picture.",
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
    "navigate",
    "Filtered one-hop traversal: returns children and linked nodes, optionally narrowed by keyword or edge type (e.g. 'owns_client'). Call repeatedly to walk the graph.",
    {
      path: z.string().describe("Starting node path (e.g. '/' or '/clients')"),
      keyword: z.string().optional().describe("Filter neighbors by keyword (matches name, description, or edge description)"),
      edgeType: z.string().optional().describe("Filter to edges of this type only (e.g. 'owns_client', 'leads_execution')"),
    },
    async ({ path: nodePath, keyword, edgeType }) => {
      const result = await gql(`
        query Navigate($path: String!, $keyword: String, $edgeType: String) {
          navigate(path: $path, keyword: $keyword, edgeType: $edgeType) {
            path name description
            neighbors { path name description nodeType relation linkType linkDescription }
          }
        }
      `, { path: nodePath, keyword, edgeType });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result.data?.navigate ?? null, null, 2) }],
      };
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
    "Returns warnings: broken links, missing descriptions, unlisted children.",
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
    "Returns git history for a node.",
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
    "Deletes a node and its entire subtree. Cannot delete root.",
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
  const server = await createMcpServer(schema, options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
