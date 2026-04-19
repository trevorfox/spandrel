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

// Pagination constants
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const MAX_GRAPH_DEPTH = 10;
const QUERY_TIMEOUT_MS = 10_000;

function encodeCursor(index: number): string {
  return Buffer.from(`i:${index}`).toString("base64");
}

function decodeCursor(cursor: string): number {
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf-8");
    const m = decoded.match(/^i:(\d+)$/);
    return m ? parseInt(m[1], 10) : -1;
  } catch {
    return -1;
  }
}

function paginateList<T>(
  items: T[],
  first?: number | null,
  after?: string | null
): { items: T[]; hasNextPage: boolean; endCursor: string | null } {
  const pageSize = Math.min(first ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const startIndex = after != null ? decodeCursor(after) + 1 : 0;
  const sliced = items.slice(startIndex, startIndex + pageSize);
  const hasNextPage = startIndex + pageSize < items.length;
  const endCursor = sliced.length > 0 ? encodeCursor(startIndex + sliced.length - 1) : null;
  return { items: sliced, hasNextPage, endCursor };
}
import nodePath from "node:path";
import type { SpandrelNode, HistoryEntry } from "../compiler/types.js";
import type { GraphStore } from "../storage/graph-store.js";
import type { AccessConfig, Actor, AccessLevel } from "./types.js";
import { canAccess, canWrite, accessLevelAtLeast } from "./access.js";
import { createThing, updateThing, deleteThing, resolveSourcePath } from "../server/writer.js";
import { recompileNode } from "../compiler/compiler.js";

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

const NavigateNeighborType = new GraphQLObjectType({
  name: "NavigateNeighbor",
  fields: {
    path: { type: new GraphQLNonNull(GraphQLString) },
    name: { type: new GraphQLNonNull(GraphQLString) },
    description: { type: new GraphQLNonNull(GraphQLString) },
    nodeType: { type: new GraphQLNonNull(NodeTypeEnum) },
    relation: { type: new GraphQLNonNull(GraphQLString) },   // "child", "outgoing", "incoming"
    linkType: { type: GraphQLString },
    linkDescription: { type: GraphQLString },
  },
});

const NavigateResultType = new GraphQLObjectType({
  name: "NavigateResult",
  fields: {
    path: { type: new GraphQLNonNull(GraphQLString) },
    name: { type: new GraphQLNonNull(GraphQLString) },
    description: { type: new GraphQLNonNull(GraphQLString) },
    neighbors: { type: new GraphQLList(new GraphQLNonNull(NavigateNeighborType)) },
  },
});

const PageInfoType = new GraphQLObjectType({
  name: "PageInfo",
  fields: {
    hasNextPage: { type: new GraphQLNonNull(GraphQLBoolean) },
    endCursor: { type: GraphQLString },
  },
});

const NodeConnectionType = new GraphQLObjectType({
  name: "NodeConnection",
  fields: {
    nodes: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(NodeSummaryType))) },
    pageInfo: { type: new GraphQLNonNull(PageInfoType) },
  },
});

const ReferenceConnectionType = new GraphQLObjectType({
  name: "ReferenceConnection",
  fields: {
    nodes: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(RichReferenceType))) },
    pageInfo: { type: new GraphQLNonNull(PageInfoType) },
  },
});

const GraphResultType = new GraphQLObjectType({
  name: "GraphResult",
  fields: {
    nodes: { type: new GraphQLList(new GraphQLNonNull(NodeSummaryType)) },
    edges: { type: new GraphQLList(new GraphQLNonNull(EdgeObjectType)) },
    pageInfo: { type: new GraphQLNonNull(PageInfoType) },
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

export function createSchema(store: GraphStore, ctx?: SchemaContext): GraphQLSchema {
  function checkAccess(nodePath: string, metadata: Record<string, unknown> = {}): AccessLevel {
    if (!ctx?.accessConfig || !ctx?.actor) return "traverse";
    return canAccess(ctx.accessConfig, ctx.actor, nodePath, metadata);
  }

  function filterAccessible<T extends { path: string }>(
    items: (T | null | undefined)[],
    minLevel: AccessLevel = "exists"
  ): T[] {
    return (items.filter(Boolean) as T[]).filter((item) => {
      const node = store.getNode(item.path);
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
            const node = store.getNode(args.path);
            if (!node) return null;
            const level = checkAccess(args.path, node.frontmatter);
            if (level === "none") return null;
            const includeContent = args.includeContent && accessLevelAtLeast(level, "content");
            const result = resolveNode(store, args.path, args.depth, includeContent);
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
            const node = store.getNode(args.path);
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
            const node = store.getNode(args.path);
            if (!node) return null;
            const level = checkAccess(args.path, node.frontmatter);
            if (level === "none") return null;
            const result = resolveContext(store, args.path);
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
          type: NodeConnectionType,
          args: {
            path: { type: new GraphQLNonNull(GraphQLString) },
            depth: { type: GraphQLInt },
            first: { type: GraphQLInt },
            after: { type: GraphQLString },
          },
          resolve: (_root, args: { path: string; depth?: number; first?: number; after?: string }) => {
            const level = checkAccess(args.path);
            if (!accessLevelAtLeast(level, "description")) {
              return { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } };
            }
            const allChildren = resolveChildren(store, args.path, args.depth ?? 1);
            const accessible = filterAccessible(allChildren);
            const { items, hasNextPage, endCursor } = paginateList(accessible, args.first, args.after);
            return { nodes: items, pageInfo: { hasNextPage, endCursor } };
          },
        },

        references: {
          type: ReferenceConnectionType,
          args: {
            path: { type: new GraphQLNonNull(GraphQLString) },
            direction: { type: DirectionEnum },
            first: { type: GraphQLInt },
            after: { type: GraphQLString },
          },
          resolve: (_root, args: { path: string; direction?: string; first?: number; after?: string }) => {
            const level = checkAccess(args.path);
            if (!accessLevelAtLeast(level, "description")) {
              return { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } };
            }
            const allRefs = resolveReferences(store, args.path, args.direction ?? "outgoing");
            const accessible = filterAccessible(allRefs);
            const { items, hasNextPage, endCursor } = paginateList(accessible, args.first, args.after);
            return { nodes: items, pageInfo: { hasNextPage, endCursor } };
          },
        },

        search: {
          type: new GraphQLList(new GraphQLNonNull(SearchResultType)),
          args: {
            query: { type: new GraphQLNonNull(GraphQLString) },
            path: { type: GraphQLString },
          },
          resolve: (_root, args: { query: string; path?: string }) => {
            const results = resolveSearch(store, args.query, args.path);
            return filterAccessible(results, "description");
          },
        },

        navigate: {
          type: NavigateResultType,
          args: {
            path: { type: new GraphQLNonNull(GraphQLString) },
            keyword: { type: GraphQLString },
            edgeType: { type: GraphQLString },
          },
          resolve: (_root, args: { path: string; keyword?: string; edgeType?: string }) => {
            const level = checkAccess(args.path);
            if (!accessLevelAtLeast(level, "description")) return null;
            const result = resolveNavigate(store, args.path, args.keyword, args.edgeType);
            if (!result) return null;
            result.neighbors = filterAccessible(result.neighbors);
            return result;
          },
        },

        graph: {
          type: GraphResultType,
          args: {
            path: { type: GraphQLString },
            depth: { type: GraphQLInt },
            first: { type: GraphQLInt },
            after: { type: GraphQLString },
          },
          resolve: (
            _root,
            args: { path?: string; depth?: number; first?: number; after?: string }
          ) => {
            const requestedDepth = args.depth ?? MAX_GRAPH_DEPTH;
            if (requestedDepth > MAX_GRAPH_DEPTH) {
              throw new Error(
                `Depth ${requestedDepth} exceeds maximum allowed depth of ${MAX_GRAPH_DEPTH}`
              );
            }
            const result = resolveGraph(store, args.path ?? "/", requestedDepth);
            result.nodes = filterAccessible(result.nodes);
            const visiblePaths = new Set(result.nodes.map((n) => n.path));
            result.edges = result.edges.filter(
              (e) => visiblePaths.has(e.from) && visiblePaths.has(e.to)
            );
            const { items, hasNextPage, endCursor } = paginateList(
              result.nodes, args.first, args.after
            );
            return {
              nodes: items,
              edges: result.edges,
              pageInfo: { hasNextPage, endCursor },
            };
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
              return store.getWarnings().filter(
                (w) =>
                  w.path === args.path || w.path.startsWith(args.path + "/")
              );
            }
            // Full validate — filter to accessible warnings only
            return store.getWarnings().filter((w) =>
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
          const { sourcePath } = resolveSourcePath(rootDir, thingPath);
          recompileNode(store, rootDir, sourcePath);
          const warnings = store.getWarnings().filter(
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

function getOutgoingLinks(store: GraphStore, nodePath: string) {
  return store.getEdges({ from: nodePath, type: "link" })
    .map((e) => ({
      to: e.to,
      type: e.linkType ?? null,
      description: e.description ?? null,
    }));
}

function getIncomingLinks(store: GraphStore, nodePath: string) {
  return store.getEdges({ to: nodePath, type: "link" })
    .map((e) => ({
      to: e.from,
      type: e.linkType ?? null,
      description: e.description ?? null,
    }));
}

function resolveReferences(
  store: GraphStore,
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
    for (const edge of store.getEdges({ from: nodePath, type: "link" })) {
      const target = store.getNode(edge.to);
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

  if (direction === "incoming" || direction === "both") {
    for (const edge of store.getEdges({ to: nodePath, type: "link" })) {
      const source = store.getNode(edge.from);
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

  return results;
}

function resolveNode(
  store: GraphStore,
  nodePath: string,
  depth?: number,
  includeContent?: boolean
) {
  const node = store.getNode(nodePath);
  if (!node) return null;

  const links = getOutgoingLinks(store, nodePath);
  const referencedBy = getIncomingLinks(store, nodePath);

  const children =
    depth !== undefined && depth > 0
      ? resolveChildren(store, nodePath, depth)
      : node.children.map((cp) => {
          const child = store.getNode(cp);
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

function resolveContext(store: GraphStore, nodePath: string) {
  const node = store.getNode(nodePath);
  if (!node) return null;

  const outgoing = resolveReferences(store, nodePath, "outgoing");
  const incoming = resolveReferences(store, nodePath, "incoming");

  const children = node.children
    .map((cp) => {
      const child = store.getNode(cp);
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
  store: GraphStore,
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
  const node = store.getNode(nodePath);
  if (!node || depth <= 0) return [];

  return node.children
    .map((cp) => {
      const child = store.getNode(cp);
      if (!child) return null;

      const grandchildren =
        depth > 1 ? resolveChildren(store, cp, depth - 1) : [];

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

function resolveSearch(store: GraphStore, query: string, scopePath?: string) {
  const q = query.toLowerCase();
  const results: Array<{
    path: string;
    name: string;
    description: string;
    snippet: string | null;
    score: number;
  }> = [];

  // Track which paths we've already added so edge matches don't duplicate
  const seen = new Set<string>();

  function addResult(path: string, score: number, snippet: string | null) {
    if (seen.has(path)) {
      // Keep the higher score
      const existing = results.find(r => r.path === path);
      if (existing && score > existing.score) {
        existing.score = score;
        if (snippet) existing.snippet = snippet;
      }
      return;
    }
    const node = store.getNode(path);
    if (!node) return;
    seen.add(path);
    results.push({
      path: node.path,
      name: node.name,
      description: node.description,
      snippet,
      score,
    });
  }

  function inScope(path: string): boolean {
    return !scopePath || path === scopePath || path.startsWith(scopePath + "/");
  }

  // 1. Match against node text (existing behavior)
  for (const node of store.getAllNodes()) {
    if (!inScope(node.path)) continue;

    const nameExact = node.name.toLowerCase() === q;
    const nameMatch = node.name.toLowerCase().includes(q);
    const descMatch = node.description.toLowerCase().includes(q);
    const contentMatch = node.content.toLowerCase().includes(q);

    if (nameMatch || descMatch || contentMatch) {
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
      addResult(node.path, score, snippet);
    }
  }

  // 2. Match against edge linkType and description
  for (const edge of store.getEdges({ type: "link" })) {
    const linkTypeMatch = edge.linkType?.toLowerCase().includes(q);
    const linkDescMatch = edge.description?.toLowerCase().includes(q);

    if (linkTypeMatch || linkDescMatch) {
      const snippet = `${edge.from} —${edge.linkType ?? "link"}→ ${edge.to}: ${edge.description ?? ""}`;

      if (inScope(edge.from)) {
        addResult(edge.from, linkTypeMatch ? 60 : 40, snippet);
      }
      if (inScope(edge.to)) {
        addResult(edge.to, linkTypeMatch ? 60 : 40, snippet);
      }
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results;
}

function resolveNavigate(
  store: GraphStore,
  nodePath: string,
  keyword?: string,
  edgeType?: string
): {
  path: string;
  name: string;
  description: string;
  neighbors: Array<{
    path: string;
    name: string;
    description: string;
    nodeType: string;
    relation: string;
    linkType: string | null;
    linkDescription: string | null;
  }>;
} | null {
  const node = store.getNode(nodePath);
  if (!node) return null;

  const kw = keyword?.toLowerCase();
  const neighbors: Array<{
    path: string;
    name: string;
    description: string;
    nodeType: string;
    relation: string;
    linkType: string | null;
    linkDescription: string | null;
  }> = [];

  const seen = new Set<string>();

  function matchesKeyword(n: SpandrelNode, edgeDesc?: string): boolean {
    if (!kw) return true;
    return (
      n.name.toLowerCase().includes(kw) ||
      n.description.toLowerCase().includes(kw) ||
      (edgeDesc?.toLowerCase().includes(kw) ?? false)
    );
  }

  function matchesEdgeType(lt?: string): boolean {
    if (!edgeType) return true;
    return lt?.toLowerCase() === edgeType.toLowerCase();
  }

  // Children (only filtered by keyword, not edgeType — children aren't edges)
  if (!edgeType) {
    for (const childPath of node.children) {
      const child = store.getNode(childPath);
      if (child && !seen.has(childPath) && matchesKeyword(child)) {
        seen.add(childPath);
        neighbors.push({
          path: child.path,
          name: child.name,
          description: child.description,
          nodeType: child.nodeType,
          relation: "child",
          linkType: null,
          linkDescription: null,
        });
      }
    }
  }

  // Outgoing links
  for (const edge of store.getEdges({ from: nodePath, type: "link" })) {
    const target = store.getNode(edge.to);
    if (target && !seen.has(edge.to) && matchesEdgeType(edge.linkType) && matchesKeyword(target, edge.description)) {
      seen.add(edge.to);
      neighbors.push({
        path: target.path,
        name: target.name,
        description: target.description,
        nodeType: target.nodeType,
        relation: "outgoing",
        linkType: edge.linkType ?? null,
        linkDescription: edge.description ?? null,
      });
    }
  }

  // Incoming links
  for (const edge of store.getEdges({ to: nodePath, type: "link" })) {
    const source = store.getNode(edge.from);
    if (source && !seen.has(edge.from) && matchesEdgeType(edge.linkType) && matchesKeyword(source, edge.description)) {
      seen.add(edge.from);
      neighbors.push({
        path: source.path,
        name: source.name,
        description: source.description,
        nodeType: source.nodeType,
        relation: "incoming",
        linkType: edge.linkType ?? null,
        linkDescription: edge.description ?? null,
      });
    }
  }

  return {
    path: node.path,
    name: node.name,
    description: node.description,
    neighbors,
  };
}

function resolveGraph(
  store: GraphStore,
  rootPath: string,
  depth: number
) {
  const deadline = Date.now() + QUERY_TIMEOUT_MS;
  const collectedNodes = new Set<string>();
  const collectFromPath = (p: string, d: number) => {
    if (Date.now() > deadline) return; // query timeout guard
    if (collectedNodes.has(p)) return; // cycle detection
    collectedNodes.add(p);
    if (d <= 0) return;
    const node = store.getNode(p);
    if (!node) return;
    for (const child of node.children) {
      collectFromPath(child, d - 1);
    }
  };

  collectFromPath(rootPath, depth);

  const nodes = Array.from(collectedNodes)
    .map((p) => store.getNode(p))
    .filter(Boolean)
    .map((n) => ({
      path: n!.path,
      name: n!.name,
      description: n!.description,
      nodeType: n!.nodeType,
      depth: n!.depth,
      children: n!.children,
    }));

  const edges = store.getEdges().filter(
    (e) => collectedNodes.has(e.from) || collectedNodes.has(e.to)
  );

  return { nodes, edges };
}
