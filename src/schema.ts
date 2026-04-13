import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
  GraphQLInt,
  GraphQLBoolean,
  GraphQLNonNull,
  GraphQLEnumType,
} from "graphql";
import {
  GraphQLInputObjectType,
} from "graphql";
import nodePath from "node:path";
import type { SpandrelGraph, HistoryEntry, AccessConfig, Actor, AccessLevel } from "./types.js";
import { canAccess, canWrite, accessLevelAtLeast } from "./access.js";
import { createThing, updateThing, deleteThing, resolvePaths } from "./writer.js";
import { recompileNode } from "./compiler.js";

export type SchemaContext = {
  rootDir?: string;
  getHistory?: (rootDir: string, nodePath: string) => Promise<HistoryEntry[]>;
  actor?: Actor;
  accessConfig?: AccessConfig | null;
};

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

const DirectionEnum = new GraphQLEnumType({
  name: "Direction",
  values: {
    outgoing: { value: "outgoing" },
    incoming: { value: "incoming" },
    both: { value: "both" },
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

// Rich reference — includes the linked node's name and description
const RichReferenceType = new GraphQLObjectType({
  name: "RichReference",
  fields: {
    path: { type: new GraphQLNonNull(GraphQLString) },
    name: { type: new GraphQLNonNull(GraphQLString) },
    description: { type: new GraphQLNonNull(GraphQLString) },
    linkType: { type: GraphQLString },
    linkDescription: { type: GraphQLString },
    direction: { type: new GraphQLNonNull(GraphQLString) },
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
    referencedBy: { type: new GraphQLList(new GraphQLNonNull(LinkType)) },
    content: { type: GraphQLString },
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
    score: { type: new GraphQLNonNull(GraphQLInt) },
  },
});

const GraphResultType = new GraphQLObjectType({
  name: "GraphResult",
  fields: {
    nodes: { type: new GraphQLList(new GraphQLNonNull(NodeSummaryType)) },
    edges: { type: new GraphQLList(new GraphQLNonNull(EdgeObjectType)) },
  },
});

const MutationResultType = new GraphQLObjectType({
  name: "MutationResult",
  fields: {
    success: { type: new GraphQLNonNull(GraphQLBoolean) },
    path: { type: new GraphQLNonNull(GraphQLString) },
    message: { type: GraphQLString },
    warnings: { type: new GraphQLList(new GraphQLNonNull(ValidationWarningType)) },
  },
});

const LinkInputType = new GraphQLInputObjectType({
  name: "LinkInput",
  fields: {
    to: { type: new GraphQLNonNull(GraphQLString) },
    type: { type: GraphQLString },
    description: { type: GraphQLString },
  },
});

// Context result — the "tell me everything" type
const ContextResultType = new GraphQLObjectType({
  name: "ContextResult",
  fields: {
    path: { type: new GraphQLNonNull(GraphQLString) },
    name: { type: new GraphQLNonNull(GraphQLString) },
    description: { type: new GraphQLNonNull(GraphQLString) },
    nodeType: { type: new GraphQLNonNull(NodeTypeEnum) },
    depth: { type: new GraphQLNonNull(GraphQLInt) },
    parent: { type: GraphQLString },
    content: { type: GraphQLString },
    children: { type: new GraphQLList(new GraphQLNonNull(NodeSummaryType)) },
    outgoing: { type: new GraphQLList(new GraphQLNonNull(RichReferenceType)) },
    incoming: { type: new GraphQLList(new GraphQLNonNull(RichReferenceType)) },
    created: { type: GraphQLString },
    updated: { type: GraphQLString },
    author: { type: GraphQLString },
  },
});

export function createSchema(graph: SpandrelGraph, ctx?: SchemaContext): GraphQLSchema {
  function checkAccess(nodePath: string, metadata: Record<string, unknown> = {}): AccessLevel {
    if (!ctx?.accessConfig || !ctx?.actor) return "traverse";
    return canAccess(ctx.accessConfig, ctx.actor, nodePath, metadata);
  }

  function filterAccessible<T extends { path: string }>(
    items: (T | null | undefined)[],
    minLevel: AccessLevel = "exists"
  ): T[] {
    return (items.filter(Boolean) as T[]).filter((item) => {
      const node = graph.nodes.get(item.path);
      const level = checkAccess(item.path, node?.frontmatter ?? {});
      return accessLevelAtLeast(level, minLevel);
    });
  }

  return new GraphQLSchema({
    query: new GraphQLObjectType({
      name: "Query",
      fields: {
        node: {
          type: NodeDetailType,
          args: {
            path: { type: new GraphQLNonNull(GraphQLString) },
            depth: { type: GraphQLInt },
            includeContent: { type: GraphQLBoolean },
          },
          resolve: (_root, args: { path: string; depth?: number; includeContent?: boolean }) => {
            const node = graph.nodes.get(args.path);
            if (!node) return null;
            const level = checkAccess(args.path, node.frontmatter);
            if (level === "none") return null;
            const includeContent = args.includeContent && accessLevelAtLeast(level, "content");
            const result = resolveNode(graph, args.path, args.depth, includeContent);
            if (!result) return null;
            // Filter children and links by access
            if (result.children) {
              result.children = filterAccessible(result.children);
            }
            if (result.links) {
              result.links = result.links.filter((l: { to: string }) =>
                accessLevelAtLeast(checkAccess(l.to), "exists")
              );
            }
            if (result.referencedBy) {
              result.referencedBy = result.referencedBy.filter((l: { to: string }) =>
                accessLevelAtLeast(checkAccess(l.to), "exists")
              );
            }
            if (!accessLevelAtLeast(level, "description")) {
              result.description = "";
              result.children = [];
              result.links = [];
              result.referencedBy = [];
            }
            if (!accessLevelAtLeast(level, "content")) {
              result.content = null;
            }
            return result;
          },
        },

        content: {
          type: GraphQLString,
          args: {
            path: { type: new GraphQLNonNull(GraphQLString) },
          },
          resolve: (_root, args: { path: string }) => {
            const node = graph.nodes.get(args.path);
            if (!node) return null;
            const level = checkAccess(args.path, node.frontmatter);
            if (!accessLevelAtLeast(level, "content")) return null;
            return node.content;
          },
        },

        context: {
          type: ContextResultType,
          args: {
            path: { type: new GraphQLNonNull(GraphQLString) },
          },
          resolve: (_root, args: { path: string }) => {
            const node = graph.nodes.get(args.path);
            if (!node) return null;
            const level = checkAccess(args.path, node.frontmatter);
            if (level === "none") return null;
            const result = resolveContext(graph, args.path);
            if (!result) return null;
            // Filter by access
            if (result.children) {
              result.children = filterAccessible(result.children);
            }
            if (result.outgoing) {
              result.outgoing = filterAccessible(result.outgoing);
            }
            if (result.incoming) {
              result.incoming = filterAccessible(result.incoming);
            }
            if (!accessLevelAtLeast(level, "content")) {
              (result as Record<string, unknown>).content = null;
            }
            if (!accessLevelAtLeast(level, "description")) {
              result.description = "";
              result.children = [];
              result.outgoing = [];
              result.incoming = [];
            }
            return result;
          },
        },

        children: {
          type: new GraphQLList(new GraphQLNonNull(NodeSummaryType)),
          args: {
            path: { type: new GraphQLNonNull(GraphQLString) },
            depth: { type: GraphQLInt },
          },
          resolve: (_root, args: { path: string; depth?: number }) => {
            const level = checkAccess(args.path);
            if (!accessLevelAtLeast(level, "description")) return [];
            const children = resolveChildren(graph, args.path, args.depth ?? 1);
            return filterAccessible(children);
          },
        },

        references: {
          type: new GraphQLList(new GraphQLNonNull(RichReferenceType)),
          args: {
            path: { type: new GraphQLNonNull(GraphQLString) },
            direction: { type: DirectionEnum },
          },
          resolve: (_root, args: { path: string; direction?: string }) => {
            const level = checkAccess(args.path);
            if (!accessLevelAtLeast(level, "description")) return [];
            const refs = resolveReferences(graph, args.path, args.direction ?? "outgoing");
            return filterAccessible(refs);
          },
        },

        search: {
          type: new GraphQLList(new GraphQLNonNull(SearchResultType)),
          args: {
            query: { type: new GraphQLNonNull(GraphQLString) },
            path: { type: GraphQLString },
          },
          resolve: (_root, args: { query: string; path?: string }) => {
            const results = resolveSearch(graph, args.query, args.path);
            return filterAccessible(results, "description");
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
            const result = resolveGraph(
              graph,
              args.path ?? "/",
              args.depth ?? 999
            );
            result.nodes = filterAccessible(result.nodes);
            const visiblePaths = new Set(result.nodes.map((n) => n.path));
            result.edges = result.edges.filter(
              (e) => visiblePaths.has(e.from) && visiblePaths.has(e.to)
            );
            return result;
          },
        },

        validate: {
          type: new GraphQLList(new GraphQLNonNull(ValidationWarningType)),
          args: {
            path: { type: GraphQLString },
          },
          resolve: (_root, args: { path?: string }) => {
            // Validate requires at least content-level access
            if (args.path) {
              const level = checkAccess(args.path);
              if (!accessLevelAtLeast(level, "content")) return [];
              return graph.warnings.filter(
                (w) =>
                  w.path === args.path || w.path.startsWith(args.path + "/")
              );
            }
            // Full validate — filter to accessible warnings only
            return graph.warnings.filter((w) =>
              accessLevelAtLeast(checkAccess(w.path), "content")
            );
          },
        },

        history: {
          type: new GraphQLList(new GraphQLNonNull(HistoryEntryType)),
          args: {
            path: { type: new GraphQLNonNull(GraphQLString) },
          },
          resolve: async (_root, args: { path: string }) => {
            const level = checkAccess(args.path);
            if (!accessLevelAtLeast(level, "content")) return [];
            if (ctx?.getHistory && ctx?.rootDir) {
              return ctx.getHistory(ctx.rootDir, args.path);
            }
            return [];
          },
        },
      },
    }),
    mutation: ctx?.rootDir ? (() => {
      const rootDir = ctx!.rootDir!;

      function executeMutation(thingPath: string, action: () => void) {
        if (ctx?.accessConfig && ctx?.actor) {
          if (!canWrite(ctx.accessConfig, ctx.actor, thingPath)) {
            return { success: false, path: thingPath, message: "Write access denied", warnings: [] };
          }
        }
        try {
          action();
          // Synchronous recompile so the node is immediately queryable
          const { indexPath } = resolvePaths(rootDir, thingPath);
          recompileNode(graph, rootDir, indexPath);
          const warnings = graph.warnings.filter(
            (w) => w.path === thingPath || w.path.startsWith(thingPath + "/")
          );
          return { success: true, path: thingPath, message: null, warnings };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, path: thingPath, message, warnings: [] };
        }
      }

      return new GraphQLObjectType({
        name: "Mutation",
        fields: {
          createThing: {
            type: MutationResultType,
            args: {
              path: { type: new GraphQLNonNull(GraphQLString) },
              name: { type: new GraphQLNonNull(GraphQLString) },
              description: { type: new GraphQLNonNull(GraphQLString) },
              content: { type: GraphQLString },
              links: { type: new GraphQLList(new GraphQLNonNull(LinkInputType)) },
              author: { type: GraphQLString },
              tags: { type: new GraphQLList(new GraphQLNonNull(GraphQLString)) },
            },
            resolve: (_root, args) => executeMutation(args.path, () => {
              createThing(rootDir, args.path, {
                name: args.name, description: args.description,
                content: args.content, links: args.links,
                author: args.author, tags: args.tags,
              });
            }),
          },

          updateThing: {
            type: MutationResultType,
            args: {
              path: { type: new GraphQLNonNull(GraphQLString) },
              name: { type: GraphQLString },
              description: { type: GraphQLString },
              content: { type: GraphQLString },
              links: { type: new GraphQLList(new GraphQLNonNull(LinkInputType)) },
              author: { type: GraphQLString },
              tags: { type: new GraphQLList(new GraphQLNonNull(GraphQLString)) },
            },
            resolve: (_root, args) => executeMutation(args.path, () => {
              updateThing(rootDir, args.path, {
                name: args.name, description: args.description,
                content: args.content, links: args.links,
                author: args.author, tags: args.tags,
              });
            }),
          },

          deleteThing: {
            type: MutationResultType,
            args: {
              path: { type: new GraphQLNonNull(GraphQLString) },
            },
            resolve: (_root, args) => executeMutation(args.path, () => {
              deleteThing(rootDir, args.path);
            }),
          },
        },
      });
    })() : undefined,
  });
}

function getOutgoingLinks(graph: SpandrelGraph, nodePath: string) {
  return graph.edges
    .filter((e) => e.from === nodePath && e.type === "link")
    .map((e) => ({
      to: e.to,
      type: e.linkType ?? null,
      description: e.description ?? null,
    }));
}

function getIncomingLinks(graph: SpandrelGraph, nodePath: string) {
  return graph.edges
    .filter((e) => e.to === nodePath && e.type === "link")
    .map((e) => ({
      to: e.from,
      type: e.linkType ?? null,
      description: e.description ?? null,
    }));
}

function resolveReferences(
  graph: SpandrelGraph,
  nodePath: string,
  direction: string
): Array<{
  path: string;
  name: string;
  description: string;
  linkType: string | null;
  linkDescription: string | null;
  direction: string;
}> {
  const results: Array<{
    path: string;
    name: string;
    description: string;
    linkType: string | null;
    linkDescription: string | null;
    direction: string;
  }> = [];

  if (direction === "outgoing" || direction === "both") {
    for (const edge of graph.edges) {
      if (edge.from === nodePath && edge.type === "link") {
        const target = graph.nodes.get(edge.to);
        results.push({
          path: edge.to,
          name: target?.name ?? edge.to,
          description: target?.description ?? "",
          linkType: edge.linkType ?? null,
          linkDescription: edge.description ?? null,
          direction: "outgoing",
        });
      }
    }
  }

  if (direction === "incoming" || direction === "both") {
    for (const edge of graph.edges) {
      if (edge.to === nodePath && edge.type === "link") {
        const source = graph.nodes.get(edge.from);
        results.push({
          path: edge.from,
          name: source?.name ?? edge.from,
          description: source?.description ?? "",
          linkType: edge.linkType ?? null,
          linkDescription: edge.description ?? null,
          direction: "incoming",
        });
      }
    }
  }

  return results;
}

function resolveNode(
  graph: SpandrelGraph,
  nodePath: string,
  depth?: number,
  includeContent?: boolean
) {
  const node = graph.nodes.get(nodePath);
  if (!node) return null;

  const links = getOutgoingLinks(graph, nodePath);
  const referencedBy = getIncomingLinks(graph, nodePath);

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
        }).filter(Boolean);

  return {
    path: node.path,
    name: node.name,
    description: node.description,
    nodeType: node.nodeType,
    depth: node.depth,
    parent: node.parent,
    children,
    links,
    referencedBy,
    content: includeContent ? node.content : null,
    created: node.created,
    updated: node.updated,
    author: node.author,
  };
}

function resolveContext(graph: SpandrelGraph, nodePath: string) {
  const node = graph.nodes.get(nodePath);
  if (!node) return null;

  const outgoing = resolveReferences(graph, nodePath, "outgoing");
  const incoming = resolveReferences(graph, nodePath, "incoming");

  const children = node.children
    .map((cp) => {
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
    })
    .filter(Boolean);

  return {
    path: node.path,
    name: node.name,
    description: node.description,
    nodeType: node.nodeType,
    depth: node.depth,
    parent: node.parent,
    content: node.content,
    children,
    outgoing,
    incoming,
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

function resolveSearch(graph: SpandrelGraph, query: string, scopePath?: string) {
  const q = query.toLowerCase();
  const results: Array<{
    path: string;
    name: string;
    description: string;
    snippet: string | null;
    score: number;
  }> = [];

  for (const node of graph.nodes.values()) {
    // Scope to subtree if path provided
    if (scopePath && !node.path.startsWith(scopePath) && node.path !== scopePath) {
      continue;
    }

    const nameExact = node.name.toLowerCase() === q;
    const nameMatch = node.name.toLowerCase().includes(q);
    const descMatch = node.description.toLowerCase().includes(q);
    const contentMatch = node.content.toLowerCase().includes(q);

    if (nameMatch || descMatch || contentMatch) {
      // Relevance ranking: exact name > name contains > description > content
      let score = 0;
      if (nameExact) score = 100;
      else if (nameMatch) score = 75;
      else if (descMatch) score = 50;
      else if (contentMatch) score = 25;

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
        score,
      });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

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
