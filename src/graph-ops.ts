import type { SpandrelNode, LinkTypeInfo } from "./compiler/types.js";
import type { GraphStore } from "./storage/graph-store.js";

/**
 * Pure graph-traversal helpers shared by every wire surface (MCP, REST,
 * any other consumer). Operate on a GraphStore — no access shaping; the
 * caller applies AccessPolicy.shapeNode / shapeEdge to the results.
 *
 * Kept as plain async functions so each wire surface decides its own
 * response shape without re-implementing search ranking, pagination, or
 * backlink computation.
 */

// --- Pagination ----------------------------------------------------------

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
export const MAX_GRAPH_DEPTH = 10;
const QUERY_TIMEOUT_MS = 10_000;

export function encodeCursor(index: number): string {
  return Buffer.from(`i:${index}`).toString("base64");
}

export function decodeCursor(cursor: string): number {
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf-8");
    const m = decoded.match(/^i:(\d+)$/);
    return m ? parseInt(m[1], 10) : -1;
  } catch {
    return -1;
  }
}

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface Page<T> {
  items: T[];
  pageInfo: PageInfo;
}

export function paginateList<T>(
  items: T[],
  first?: number | null,
  after?: string | null
): Page<T> {
  const pageSize = Math.min(first ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const startIndex = after != null ? decodeCursor(after) + 1 : 0;
  const sliced = items.slice(startIndex, startIndex + pageSize);
  const hasNextPage = startIndex + pageSize < items.length;
  const endCursor = sliced.length > 0
    ? encodeCursor(startIndex + sliced.length - 1)
    : null;
  return { items: sliced, pageInfo: { hasNextPage, endCursor } };
}

// --- Link-type decoration ------------------------------------------------

export function lookupLinkTypeDescription(
  linkTypes: Map<string, LinkTypeInfo>,
  linkType: string | null | undefined
): string | null {
  if (!linkType) return null;
  return linkTypes.get(linkType)?.description ?? null;
}

// --- Reference resolution ------------------------------------------------

export interface OutgoingLink {
  to: string;
  type: string | null;
  description: string | null;
  linkTypeDescription: string | null;
}

export async function getOutgoingLinks(
  store: GraphStore,
  nodePath: string
): Promise<OutgoingLink[]> {
  const linkTypes = await store.getLinkTypes();
  return (await store.getEdges({ from: nodePath, type: "link" })).map((e) => ({
    to: e.to,
    type: e.linkType ?? null,
    description: e.description ?? null,
    linkTypeDescription: lookupLinkTypeDescription(linkTypes, e.linkType),
  }));
}

export async function getIncomingLinks(
  store: GraphStore,
  nodePath: string
): Promise<OutgoingLink[]> {
  const linkTypes = await store.getLinkTypes();
  return (await store.getEdges({ to: nodePath, type: "link" })).map((e) => ({
    to: e.from,
    type: e.linkType ?? null,
    description: e.description ?? null,
    linkTypeDescription: lookupLinkTypeDescription(linkTypes, e.linkType),
  }));
}

export interface RichReference {
  path: string;
  name: string;
  description: string;
  linkType: string | null;
  linkDescription: string | null;
  linkTypeDescription: string | null;
  direction: "outgoing" | "incoming";
}

export async function resolveReferences(
  store: GraphStore,
  nodePath: string,
  direction: "outgoing" | "incoming" | "both"
): Promise<RichReference[]> {
  const linkTypes = await store.getLinkTypes();
  const results: RichReference[] = [];

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
        linkTypeDescription: lookupLinkTypeDescription(linkTypes, edge.linkType),
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
        linkTypeDescription: lookupLinkTypeDescription(linkTypes, edge.linkType),
        direction: "incoming",
      });
    }
  }

  return results;
}

// --- Node + children -----------------------------------------------------

export interface NodeSummary {
  path: string;
  name: string;
  description: string;
  nodeType: SpandrelNode["nodeType"];
  depth: number;
  children: string[];
}

export async function resolveChildren(
  store: GraphStore,
  nodePath: string,
  depth: number
): Promise<NodeSummary[]> {
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

  return results.filter(Boolean) as NodeSummary[];
}

export interface ResolvedNode {
  path: string;
  name: string;
  description: string;
  nodeType: SpandrelNode["nodeType"];
  depth: number;
  parent: string | null;
  children: NodeSummary[];
  links: OutgoingLink[];
  referencedBy: OutgoingLink[];
  content: string | null;
  created: string | null;
  updated: string | null;
  author: string | null;
}

export async function resolveNode(
  store: GraphStore,
  nodePath: string,
  depth?: number,
  includeContent?: boolean
): Promise<ResolvedNode | null> {
  const node = await store.getNode(nodePath);
  if (!node) return null;

  const links = await getOutgoingLinks(store, nodePath);
  const referencedBy = await getIncomingLinks(store, nodePath);

  let children: NodeSummary[];
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
      .filter(Boolean) as NodeSummary[];
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

export interface ResolvedContext {
  path: string;
  name: string;
  description: string;
  nodeType: SpandrelNode["nodeType"];
  depth: number;
  parent: string | null;
  content: string;
  children: NodeSummary[];
  outgoing: RichReference[];
  incoming: RichReference[];
  created: string | null;
  updated: string | null;
  author: string | null;
}

export async function resolveContext(
  store: GraphStore,
  nodePath: string
): Promise<ResolvedContext | null> {
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
    .filter(Boolean) as NodeSummary[];

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

// --- Search --------------------------------------------------------------

export interface SearchResult {
  path: string;
  name: string;
  description: string;
  snippet: string | null;
  score: number;
}

export async function resolveSearch(
  store: GraphStore,
  query: string,
  scopePath?: string
): Promise<SearchResult[]> {
  const q = query.toLowerCase();
  const results: SearchResult[] = [];
  const seen = new Set<string>();

  function addResult(node: SpandrelNode, score: number, snippet: string | null) {
    if (seen.has(node.path)) {
      const existing = results.find((r) => r.path === node.path);
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

  function inScope(p: string): boolean {
    return !scopePath || p === scopePath || p.startsWith(scopePath + "/");
  }

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
        for (const p of edgePaths) {
          const node = nodeMap.get(p);
          if (node) addResult(node, linkTypeMatch ? 60 : 40, snippet);
        }
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

// --- Navigate ------------------------------------------------------------

export interface NavigateNeighbor {
  path: string;
  name: string;
  description: string;
  nodeType: SpandrelNode["nodeType"];
  relation: "child" | "outgoing" | "incoming";
  linkType: string | null;
  linkDescription: string | null;
}

export interface NavigateResult {
  path: string;
  name: string;
  description: string;
  neighbors: NavigateNeighbor[];
}

export async function resolveNavigate(
  store: GraphStore,
  nodePath: string,
  keyword?: string,
  edgeType?: string
): Promise<NavigateResult | null> {
  const node = await store.getNode(nodePath);
  if (!node) return null;

  const kw = keyword?.toLowerCase();
  const neighbors: NavigateNeighbor[] = [];
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

// --- Graph subtree -------------------------------------------------------

export interface DecoratedEdge {
  from: string;
  to: string;
  type: "hierarchy" | "link" | "authored_by";
  linkType?: string;
  description?: string;
  linkTypeDescription: string | null;
}

export interface GraphResult {
  nodes: NodeSummary[];
  edges: DecoratedEdge[];
}

export async function resolveGraph(
  store: GraphStore,
  rootPath: string,
  depth: number
): Promise<GraphResult> {
  const deadline = Date.now() + QUERY_TIMEOUT_MS;
  const collectedNodes = new Set<string>();
  const toVisit: Array<{ path: string; d: number }> = [{ path: rootPath, d: depth }];

  while (toVisit.length > 0) {
    if (Date.now() > deadline) break;
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
  const nodes: NodeSummary[] = Array.from(collectedNodes)
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

  const edgeBatch = await store.getEdgesBatch(Array.from(collectedNodes));
  const linkTypes = await store.getLinkTypes();
  const edges = Array.from(edgeBatch.values())
    .flat()
    .filter((e) => collectedNodes.has(e.to))
    .map((e) => ({
      from: e.from,
      to: e.to,
      type: e.type,
      linkType: e.linkType,
      description: e.description,
      linkTypeDescription: lookupLinkTypeDescription(linkTypes, e.linkType),
    }));

  return { nodes, edges };
}
