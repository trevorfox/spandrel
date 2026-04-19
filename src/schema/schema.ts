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

export function createSchema(store: GraphStore, ctx?: SchemaContext): GraphQLSchema {
  function checkAccess(nodePath: string, metadata: Record<string, unknown> = {}): AccessLevel {
    if (!ctx?.accessConfig || !ctx?.actor) return "traverse";
    return canAccess(ctx.accessConfig, ctx.actor, nodePath, metadata);
  }

  async function filterAccessible<T extends { path: string }>(
    items: (T | null | undefined)[],
    minLevel: AccessLevel = "exists"
  ): Promise<T[]> {
    const validItems = items.filter(Boolean) as T[];
    const nodeMap = await store.getNodes(validItems.map((i) => i.path));
    return validItems.filter((item) => {
      const node = nodeMap.get(item.path);
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
          resolve: async (_root, args: { path: string; depth?: number; includeContent?: boolean }) => {
            const node = await store.getNode(args.path);
            if (!node) return null;
            const level = checkAccess(args.path, node.frontmatter);
            if (level === "none") return null;
            const includeContent = args.includeContent && accessLevelAtLeast(level, "content");
            const result = await resolveNode(store, args.path, args.depth, includeContent);
            if (!result) return null;
            // Filter children and links by access
            if (result.children) {
              result.children = await filterAccessible(result.children);
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
          resolve: async (_root, args: { path: string }) => {
            const node = await store.getNode(args.path);
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
          resolve: async (_root, args: { path: string }) => {
            const node = await store.getNode(args.path);
            if (!node) return null;
            const level = checkAccess(args.path, node.frontmatter);
            if (level === "none") return null;
            const result = await resolveContext(store, args.path);
            if (!result) return null;
            // Filter by access
            if (result.children) {
              result.children = await filterAccessible(result.children);
            }
            if (result.outgoing) {
              result.outgoing = await filterAccessible(result.outgoing);
            }
            if (result.incoming) {
              result.incoming = await filterAccessible(result.incoming);
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
          resolve: async (_root, args: { path: string; depth?: number }) => {
            const level = checkAccess(args.path);
            if (!accessLevelAtLeast(level, "description")) return [];
            const children = await resolveChildren(store, args.path, args.depth ?? 1);
            return filterAccessible(children);
          },
        },

        references: {
          type: new GraphQLList(new GraphQLNonNull(RichReferenceType)),
          args: {
            path: { type: new GraphQLNonNull(GraphQLString) },
            direction: { type: DirectionEnum },
          },
          resolve: async (_root, args: { path: string; direction?: string }) => {
            const level = checkAccess(args.path);
            if (!accessLevelAtLeast(level, "description")) return [];
            const refs = await resolveReferences(store, args.path, args.direction ?? "outgoing");
            return filterAccessible(refs);
          },
        },

        search: {
          type: new GraphQLList(new GraphQLNonNull(SearchResultType)),
          args: {
            query: { type: new GraphQLNonNull(GraphQLString) },
            path: { type: GraphQLString },
          },
          resolve: async (_root, args: { query: string; path?: string }) => {
            const results = await resolveSearch(store, args.query, args.path);
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
          resolve: async (_root, args: { path: string; keyword?: string; edgeType?: string }) => {
            const level = checkAccess(args.path);
            if (!accessLevelAtLeast(level, "description")) return null;
            const result = await resolveNavigate(store, args.path, args.keyword, args.edgeType);
            if (!result) return null;
            result.neighbors = await filterAccessible(result.neighbors);
            return result;
          },
        },

        graph: {
          type: GraphResultType,
          args: {
            path: { type: GraphQLString },
            depth: { type: GraphQLInt },
          },
          resolve: async (
            _root,
            args: { path?: string; depth?: number }
          ) => {
            const result = await resolveGraph(
              store,
              args.path ?? "/",
              args.depth ?? 999
            );
            result.nodes = await filterAccessible(result.nodes);
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
          resolve: async (_root, args: { path?: string }) => {
            // Validate requires at least content-level access
            const warnings = await store.getWarnings();
            if (args.path) {
              const level = checkAccess(args.path);
              if (!accessLevelAtLeast(level, "content")) return [];
              return warnings.filter(
                (w) =>
                  w.path === args.path || w.path.startsWith(args.path + "/")
              );
            }
            // Full validate — filter to accessible warnings only
            return warnings.filter((w) =>
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

      async function executeMutation(thingPath: string, action: () => void) {
        if (ctx?.accessConfig && ctx?.actor) {
          if (!canWrite(ctx.accessConfig, ctx.actor, thingPath)) {
            return { success: false, path: thingPath, message: "Write access denied", warnings: [] };
          }
        }
        try {
          action();
          const { sourcePath } = resolveSourcePath(rootDir, thingPath);
          await recompileNode(store, rootDir, sourcePath);
          const warnings = (await store.getWarnings()).filter(
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

async function getOutgoingLinks(store: GraphStore, nodePath: string) {
  return (await store.getEdges({ from: nodePath, type: "link" }))
    .map((e) => ({
      to: e.to,
      type: e.linkType ?? null,
      description: e.description ?? null,
    }));
}

async function getIncomingLinks(store: GraphStore, nodePath: string) {
  return (await store.getEdges({ to: nodePath, type: "link" }))
    .map((e) => ({
      to: e.from,
      type: e.linkType ?? null,
      description: e.description ?? null,
    }));
}

async function resolveReferences(
  store: GraphStore,
  nodePath: string,
  direction: string
): Promise<Array<{
  path: string;
  name: string;
  description: string;
  linkType: string | null;
  linkDescription: string | null;
  direction: string;
}>> {
  const results: Array<{
    path: string;
    name: string;
    description: string;
    linkType: string | null;
    linkDescription: string | null;
    direction: string;
  }> = [];

  if (direction === "outgoing" || direction === "both") {
    const outEdges = await store.getEdges({ from: nodePath, type: "link" });
    const targetMap = await store.getNodes(outEdges.map((e) => e.to));
    for (const edge of outEdges) {
      const target = targetMap.get(edge.to);
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
    const inEdges = await store.getEdges({ to: nodePath, type: "link" });
    const sourceMap = await store.getNodes(inEdges.map((e) => e.from));
    for (const edge of inEdges) {
      const source = sourceMap.get(edge.from);
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

async function resolveNode(
  store: GraphStore,
  nodePath: string,
  depth?: number,
  includeContent?: boolean
) {
  const node = await store.getNode(nodePath);
  if (!node) return null;

  const links = await getOutgoingLinks(store, nodePath);
  const referencedBy = await getIncomingLinks(store, nodePath);

  let children;
  if (depth !== undefined && depth > 0) {
    children = await resolveChildren(store, nodePath, depth);
  } else {
    const childMap = await store.getNodes(node.children);
    children = node.children
      .map((cp) => {
        const child = childMap.get(cp);
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
  }

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

async function resolveContext(store: GraphStore, nodePath: string) {
  const node = await store.getNode(nodePath);
  if (!node) return null;

  const outgoing = await resolveReferences(store, nodePath, "outgoing");
  const incoming = await resolveReferences(store, nodePath, "incoming");

  const childMap = await store.getNodes(node.children);
  const children = node.children
    .map((cp) => {
      const child = childMap.get(cp);
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

async function resolveChildren(
  store: GraphStore,
  nodePath: string,
  depth: number
): Promise<Array<{
  path: string;
  name: string;
  description: string;
  nodeType: string;
  depth: number;
  children: string[];
}>> {
  const node = await store.getNode(nodePath);
  if (!node || depth <= 0) return [];

  const childMap = await store.getNodes(node.children);

  const results = await Promise.all(
    node.children.map(async (cp) => {
      const child = childMap.get(cp);
      if (!child) return null;

      const grandchildren = depth > 1 ? await resolveChildren(store, cp, depth - 1) : [];

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
  );

  return results.filter(Boolean) as Array<{
    path: string;
    name: string;
    description: string;
    nodeType: string;
    depth: number;
    children: string[];
  }>;
}

async function resolveSearch(store: GraphStore, query: string, scopePath?: string) {
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

  function addResult(node: SpandrelNode, score: number, snippet: string | null) {
    if (seen.has(node.path)) {
      // Keep the higher score
      const existing = results.find(r => r.path === node.path);
      if (existing && score > existing.score) {
        existing.score = score;
        if (snippet) existing.snippet = snippet;
      }
      return;
    }
    seen.add(node.path);
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

  // 1. Match against node text
  for (const node of await store.getAllNodes()) {
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
      addResult(node, score, snippet);
    }
  }

  // 2. Match against edge linkType and description
  for (const edge of await store.getEdges({ type: "link" })) {
    const linkTypeMatch = edge.linkType?.toLowerCase().includes(q);
    const linkDescMatch = edge.description?.toLowerCase().includes(q);

    if (linkTypeMatch || linkDescMatch) {
      const snippet = `${edge.from} —${edge.linkType ?? "link"}→ ${edge.to}: ${edge.description ?? ""}`;
      const edgePaths = [
        inScope(edge.from) ? edge.from : null,
        inScope(edge.to) ? edge.to : null,
      ].filter(Boolean) as string[];

      if (edgePaths.length > 0) {
        const nodeMap = await store.getNodes(edgePaths);
        for (const path of edgePaths) {
          const node = nodeMap.get(path);
          if (node) addResult(node, linkTypeMatch ? 60 : 40, snippet);
        }
      }
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results;
}

async function resolveNavigate(
  store: GraphStore,
  nodePath: string,
  keyword?: string,
  edgeType?: string
): Promise<{
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
} | null> {
  const node = await store.getNode(nodePath);
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
    const childMap = await store.getNodes(node.children);
    for (const childPath of node.children) {
      const child = childMap.get(childPath);
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
  const outEdges = await store.getEdges({ from: nodePath, type: "link" });
  const outTargetMap = await store.getNodes(outEdges.map((e) => e.to));
  for (const edge of outEdges) {
    const target = outTargetMap.get(edge.to);
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
  const inEdges = await store.getEdges({ to: nodePath, type: "link" });
  const inSourceMap = await store.getNodes(inEdges.map((e) => e.from));
  for (const edge of inEdges) {
    const source = inSourceMap.get(edge.from);
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

async function resolveGraph(
  store: GraphStore,
  rootPath: string,
  depth: number
) {
  const collectedNodes = new Set<string>();
  const toVisit: Array<{ path: string; d: number }> = [{ path: rootPath, d: depth }];

  while (toVisit.length > 0) {
    const { path: p, d } = toVisit.pop()!;
    if (collectedNodes.has(p)) continue;
    collectedNodes.add(p);
    if (d <= 0) continue;
    const node = await store.getNode(p);
    if (!node) continue;
    for (const child of node.children) {
      toVisit.push({ path: child, d: d - 1 });
    }
  }

  const nodeMap = await store.getNodes(Array.from(collectedNodes));
  const nodes = Array.from(collectedNodes)
    .map((p) => nodeMap.get(p))
    .filter(Boolean)
    .map((n) => ({
      path: n!.path,
      name: n!.name,
      description: n!.description,
      nodeType: n!.nodeType,
      depth: n!.depth,
      children: n!.children,
    }));

  // Use getEdgesBatch to fetch outgoing edges for all collected nodes at once
  const edgeBatch = await store.getEdgesBatch(Array.from(collectedNodes));
  const edges = Array.from(edgeBatch.values())
    .flat()
    .filter((e) => collectedNodes.has(e.to));

  return { nodes, edges };
}
