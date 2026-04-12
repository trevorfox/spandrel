import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { graphql } from "graphql";
import { z } from "zod";
import type { GraphQLSchema } from "graphql";

export function createMcpServer(schema: GraphQLSchema): McpServer {
  const server = new McpServer({
    name: "spandrel",
    version: "0.1.0",
  });

  server.tool(
    "get_node",
    "Get a node by path. Returns name, description, nodeType, children, links, parent. Use depth for wider structural view.",
    {
      path: z.string().describe("Path to the node (e.g. '/' or '/clients/acme')"),
      depth: z.number().optional().describe("How many levels of children to include"),
    },
    async ({ path: nodePath, depth }) => {
      const depthArg = depth !== undefined ? `, depth: ${depth}` : "";
      const result = await graphql({
        schema,
        source: `{
          node(path: "${nodePath}"${depthArg}) {
            path name description nodeType depth parent
            children { path name description nodeType depth children }
            links { to type description }
            created updated author
          }
        }`,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result.data?.node ?? null, null, 2) }],
      };
    }
  );

  server.tool(
    "get_content",
    "Get the full markdown content of a node.",
    {
      path: z.string().describe("Path to the node"),
    },
    async ({ path: nodePath }) => {
      const result = await graphql({
        schema,
        source: `{ content(path: "${nodePath}") }`,
      });
      const text = typeof result.data?.content === "string" ? result.data.content : "Node not found";
      return {
        content: [{ type: "text" as const, text }],
      };
    }
  );

  server.tool(
    "get_children",
    "Get children of a node (names and descriptions only). Use depth to go deeper.",
    {
      path: z.string().describe("Path to the parent node"),
      depth: z.number().optional().describe("How many levels deep"),
    },
    async ({ path: nodePath, depth }) => {
      const depthArg = depth !== undefined ? `, depth: ${depth}` : "";
      const result = await graphql({
        schema,
        source: `{
          children(path: "${nodePath}"${depthArg}) {
            path name description nodeType depth children
          }
        }`,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result.data?.children ?? [], null, 2) }],
      };
    }
  );

  server.tool(
    "get_references",
    "Get all link edges from a node — relationships to other nodes.",
    {
      path: z.string().describe("Path to the node"),
    },
    async ({ path: nodePath }) => {
      const result = await graphql({
        schema,
        source: `{
          references(path: "${nodePath}") {
            to type description
          }
        }`,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result.data?.references ?? [], null, 2) }],
      };
    }
  );

  server.tool(
    "search",
    "Full-text search across all nodes. Returns paths, names, descriptions, and content snippets.",
    {
      query: z.string().describe("Search query string"),
    },
    async ({ query: q }) => {
      const result = await graphql({
        schema,
        source: `{
          search(query: "${q.replace(/"/g, '\\"')}") {
            path name description snippet
          }
        }`,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result.data?.search ?? [], null, 2) }],
      };
    }
  );

  server.tool(
    "get_graph",
    "Get the graph structure (nodes + typed edges) for visualization or broad orientation.",
    {
      path: z.string().optional().describe("Root path (defaults to '/')"),
      depth: z.number().optional().describe("How many levels deep"),
    },
    async ({ path: nodePath, depth }) => {
      const pathArg = nodePath ? `path: "${nodePath}"` : "";
      const depthArg = depth !== undefined ? `depth: ${depth}` : "";
      const args = [pathArg, depthArg].filter(Boolean).join(", ");
      const argsStr = args ? `(${args})` : "";
      const result = await graphql({
        schema,
        source: `{
          graph${argsStr} {
            nodes { path name description nodeType depth }
            edges { from to type linkType description }
          }
        }`,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result.data?.graph ?? null, null, 2) }],
      };
    }
  );

  server.tool(
    "validate",
    "Check graph health. Returns warnings about broken links, missing descriptions, unlisted children.",
    {
      path: z.string().optional().describe("Scope validation to a subtree"),
    },
    async ({ path: nodePath }) => {
      const pathArg = nodePath ? `(path: "${nodePath}")` : "";
      const result = await graphql({
        schema,
        source: `{
          validate${pathArg} {
            path type message
          }
        }`,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result.data?.validate ?? [], null, 2) }],
      };
    }
  );

  server.tool(
    "get_history",
    "Get version history for a node from git.",
    {
      path: z.string().describe("Path to the node"),
    },
    async ({ path: nodePath }) => {
      const result = await graphql({
        schema,
        source: `{
          history(path: "${nodePath}") {
            hash date author message
          }
        }`,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result.data?.history ?? [], null, 2) }],
      };
    }
  );

  return server;
}

export async function startMcpServer(schema: GraphQLSchema): Promise<void> {
  const server = createMcpServer(schema);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
