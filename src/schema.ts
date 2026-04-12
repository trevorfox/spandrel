import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
  GraphQLInt,
  GraphQLNonNull,
  GraphQLEnumType,
} from "graphql";
import type { SpandrelGraph } from "./types.js";

const NodeTypeEnum = new GraphQLEnumType({
  name: "NodeType",
  values: {
    leaf: { value: "leaf" },
    composite: { value: "composite" },
  },
});

const EdgeTypeEnum = new GraphQLEnumType({
  name: "EdgeType",
  values: {
    hierarchy: { value: "hierarchy" },
    link: { value: "link" },
    authored_by: { value: "authored_by" },
  },
});

const ValidationWarningType = new GraphQLObjectType({
  name: "ValidationWarning",
  fields: {
    path: { type: new GraphQLNonNull(GraphQLString) },
    type: { type: new GraphQLNonNull(GraphQLString) },
    message: { type: new GraphQLNonNull(GraphQLString) },
  },
});

const HistoryEntryType = new GraphQLObjectType({
  name: "HistoryEntry",
  fields: {
    hash: { type: new GraphQLNonNull(GraphQLString) },
    date: { type: new GraphQLNonNull(GraphQLString) },
    author: { type: new GraphQLNonNull(GraphQLString) },
    message: { type: new GraphQLNonNull(GraphQLString) },
  },
});

const EdgeObjectType = new GraphQLObjectType({
  name: "Edge",
  fields: {
    from: { type: new GraphQLNonNull(GraphQLString) },
    to: { type: new GraphQLNonNull(GraphQLString) },
    type: { type: new GraphQLNonNull(EdgeTypeEnum) },
    linkType: { type: GraphQLString },
    description: { type: GraphQLString },
  },
});

const LinkType = new GraphQLObjectType({
  name: "Link",
  fields: {
    to: { type: new GraphQLNonNull(GraphQLString) },
    type: { type: GraphQLString },
    description: { type: GraphQLString },
  },
});

const NodeSummaryType: GraphQLObjectType = new GraphQLObjectType({
  name: "NodeSummary",
  fields: {
    path: { type: new GraphQLNonNull(GraphQLString) },
    name: { type: new GraphQLNonNull(GraphQLString) },
    description: { type: new GraphQLNonNull(GraphQLString) },
    nodeType: { type: new GraphQLNonNull(NodeTypeEnum) },
    depth: { type: new GraphQLNonNull(GraphQLInt) },
    children: { type: new GraphQLList(new GraphQLNonNull(GraphQLString)) },
  },
});

const NodeDetailType = new GraphQLObjectType({
  name: "Node",
  fields: {
    path: { type: new GraphQLNonNull(GraphQLString) },
    name: { type: new GraphQLNonNull(GraphQLString) },
    description: { type: new GraphQLNonNull(GraphQLString) },
    nodeType: { type: new GraphQLNonNull(NodeTypeEnum) },
    depth: { type: new GraphQLNonNull(GraphQLInt) },
    parent: { type: GraphQLString },
    children: {
      type: new GraphQLList(new GraphQLNonNull(NodeSummaryType)),
    },
    links: { type: new GraphQLList(new GraphQLNonNull(LinkType)) },
    created: { type: GraphQLString },
    updated: { type: GraphQLString },
    author: { type: GraphQLString },
  },
});

const SearchResultType = new GraphQLObjectType({
  name: "SearchResult",
  fields: {
    path: { type: new GraphQLNonNull(GraphQLString) },
    name: { type: new GraphQLNonNull(GraphQLString) },
    description: { type: new GraphQLNonNull(GraphQLString) },
    snippet: { type: GraphQLString },
  },
});

const GraphResultType = new GraphQLObjectType({
  name: "GraphResult",
  fields: {
    nodes: { type: new GraphQLList(new GraphQLNonNull(NodeSummaryType)) },
    edges: { type: new GraphQLList(new GraphQLNonNull(EdgeObjectType)) },
  },
});

export function createSchema(graph: SpandrelGraph): GraphQLSchema {
  return new GraphQLSchema({
    query: new GraphQLObjectType({
      name: "Query",
      fields: {
        node: {
          type: NodeDetailType,
          args: {
            path: { type: new GraphQLNonNull(GraphQLString) },
            depth: { type: GraphQLInt },
          },
          resolve: (_root, args: { path: string; depth?: number }) => {
            return resolveNode(graph, args.path, args.depth);
          },
        },

        content: {
          type: GraphQLString,
          args: {
            path: { type: new GraphQLNonNull(GraphQLString) },
          },
          resolve: (_root, args: { path: string }) => {
            const node = graph.nodes.get(args.path);
            return node?.content ?? null;
          },
        },

        children: {
          type: new GraphQLList(new GraphQLNonNull(NodeSummaryType)),
          args: {
            path: { type: new GraphQLNonNull(GraphQLString) },
            depth: { type: GraphQLInt },
          },
          resolve: (_root, args: { path: string; depth?: number }) => {
            return resolveChildren(graph, args.path, args.depth ?? 1);
          },
        },

        references: {
          type: new GraphQLList(new GraphQLNonNull(LinkType)),
          args: {
            path: { type: new GraphQLNonNull(GraphQLString) },
          },
          resolve: (_root, args: { path: string }) => {
            return graph.edges
              .filter((e) => e.from === args.path && e.type === "link")
              .map((e) => ({
                to: e.to,
                type: e.linkType ?? null,
                description: e.description ?? null,
              }));
          },
        },

        search: {
          type: new GraphQLList(new GraphQLNonNull(SearchResultType)),
          args: {
            query: { type: new GraphQLNonNull(GraphQLString) },
          },
          resolve: (_root, args: { query: string }) => {
            return resolveSearch(graph, args.query);
          },
        },

        graph: {
          type: GraphResultType,
          args: {
            path: { type: GraphQLString },
            depth: { type: GraphQLInt },
          },
          resolve: (
            _root,
            args: { path?: string; depth?: number }
          ) => {
            return resolveGraph(
              graph,
              args.path ?? "/",
              args.depth ?? 999
            );
          },
        },

        validate: {
          type: new GraphQLList(new GraphQLNonNull(ValidationWarningType)),
          args: {
            path: { type: GraphQLString },
          },
          resolve: (_root, args: { path?: string }) => {
            if (args.path) {
              return graph.warnings.filter(
                (w) =>
                  w.path === args.path || w.path.startsWith(args.path + "/")
              );
            }
            return graph.warnings;
          },
        },

        history: {
          type: new GraphQLList(new GraphQLNonNull(HistoryEntryType)),
          args: {
            path: { type: new GraphQLNonNull(GraphQLString) },
          },
          resolve: () => {
            // Git history integration — returns empty for now
            return [];
          },
        },
      },
    }),
  });
}

function resolveNode(
  graph: SpandrelGraph,
  nodePath: string,
  depth?: number
) {
  const node = graph.nodes.get(nodePath);
  if (!node) return null;

  const links = graph.edges
    .filter((e) => e.from === nodePath && e.type === "link")
    .map((e) => ({
      to: e.to,
      type: e.linkType ?? null,
      description: e.description ?? null,
    }));

  const children =
    depth !== undefined && depth > 0
      ? resolveChildren(graph, nodePath, depth)
      : node.children.map((cp) => {
          const child = graph.nodes.get(cp);
          return child
            ? {
                path: child.path,
                name: child.name,
                description: child.description,
                nodeType: child.nodeType,
                depth: child.depth,
                children: child.children,
              }
            : null;
        }).filter(Boolean)
      ;

  return {
    path: node.path,
    name: node.name,
    description: node.description,
    nodeType: node.nodeType,
    depth: node.depth,
    parent: node.parent,
    children,
    links,
    created: node.created,
    updated: node.updated,
    author: node.author,
  };
}

function resolveChildren(
  graph: SpandrelGraph,
  nodePath: string,
  depth: number
): Array<{
  path: string;
  name: string;
  description: string;
  nodeType: string;
  depth: number;
  children: string[];
}> {
  const node = graph.nodes.get(nodePath);
  if (!node || depth <= 0) return [];

  return node.children
    .map((cp) => {
      const child = graph.nodes.get(cp);
      if (!child) return null;

      const grandchildren =
        depth > 1 ? resolveChildren(graph, cp, depth - 1) : [];

      return {
        path: child.path,
        name: child.name,
        description: child.description,
        nodeType: child.nodeType,
        depth: child.depth,
        children: grandchildren.length > 0
          ? grandchildren.map((gc) => gc.path)
          : child.children,
      };
    })
    .filter(Boolean) as Array<{
    path: string;
    name: string;
    description: string;
    nodeType: string;
    depth: number;
    children: string[];
  }>;
}

function resolveSearch(graph: SpandrelGraph, query: string) {
  const q = query.toLowerCase();
  const results: Array<{
    path: string;
    name: string;
    description: string;
    snippet: string | null;
  }> = [];

  for (const node of graph.nodes.values()) {
    const nameMatch = node.name.toLowerCase().includes(q);
    const descMatch = node.description.toLowerCase().includes(q);
    const contentMatch = node.content.toLowerCase().includes(q);

    if (nameMatch || descMatch || contentMatch) {
      let snippet: string | null = null;
      if (contentMatch) {
        const idx = node.content.toLowerCase().indexOf(q);
        const start = Math.max(0, idx - 50);
        const end = Math.min(node.content.length, idx + query.length + 50);
        snippet = (start > 0 ? "..." : "") +
          node.content.slice(start, end) +
          (end < node.content.length ? "..." : "");
      }
      results.push({
        path: node.path,
        name: node.name,
        description: node.description,
        snippet,
      });
    }
  }

  return results;
}

function resolveGraph(
  graph: SpandrelGraph,
  rootPath: string,
  depth: number
) {
  const collectedNodes = new Set<string>();
  const collectFromPath = (p: string, d: number) => {
    collectedNodes.add(p);
    if (d <= 0) return;
    const node = graph.nodes.get(p);
    if (!node) return;
    for (const child of node.children) {
      collectFromPath(child, d - 1);
    }
  };

  collectFromPath(rootPath, depth);

  const nodes = Array.from(collectedNodes)
    .map((p) => graph.nodes.get(p))
    .filter(Boolean)
    .map((n) => ({
      path: n!.path,
      name: n!.name,
      description: n!.description,
      nodeType: n!.nodeType,
      depth: n!.depth,
      children: n!.children,
    }));

  const edges = graph.edges.filter(
    (e) => collectedNodes.has(e.from) || collectedNodes.has(e.to)
  );

  return { nodes, edges };
}
