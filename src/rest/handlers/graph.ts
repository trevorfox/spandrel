import type { RestHandler } from "../types.js";
import { jsonResponse, errorResponse } from "../router.js";
import { resolveGraph, MAX_GRAPH_DEPTH } from "../../graph-ops.js";
import { nodeHref } from "../shape.js";
import { accessLevelAtLeast } from "../../access/policy.js";

/**
 * GET /graph?root=&depth=&includeNonNavigable= — return the subgraph rooted at `root`.
 *
 * Defaults: root="/", depth=10, includeNonNavigable=false. Nodes the actor
 * cannot see at level `exists` are dropped along with any edges that touch
 * them. Companion documents (`navigable: false`) are excluded from the walk
 * unless `includeNonNavigable=true`.
 */
export const handleGraph: RestHandler = async (_req, url, ctx) => {
  const root = url.searchParams.get("root") ?? "/";
  const depthRaw = url.searchParams.get("depth");
  const depth = depthRaw ? parseInt(depthRaw, 10) : MAX_GRAPH_DEPTH;
  const includeNonNavigable = url.searchParams.get("includeNonNavigable") === "true";

  if (Number.isNaN(depth) || depth < 0) {
    return errorResponse(400, "invalid depth");
  }
  if (depth > MAX_GRAPH_DEPTH) {
    return errorResponse(400, `depth exceeds maximum of ${MAX_GRAPH_DEPTH}`);
  }

  const result = await resolveGraph(ctx.store, root, depth, { includeNonNavigable });

  // Filter nodes by access; drop edges whose endpoints are invisible.
  const nodeMap = await ctx.store.getNodes(result.nodes.map((n) => n.path));
  const visiblePaths = new Set<string>();
  const visibleNodes = result.nodes.filter((n) => {
    const fullNode = nodeMap.get(n.path);
    const level = ctx.policy.resolveLevel(ctx.actor, n.path, fullNode?.frontmatter ?? {});
    if (!accessLevelAtLeast(level, "exists")) return false;
    visiblePaths.add(n.path);
    return true;
  });

  const visibleEdges = result.edges.filter(
    (e) => visiblePaths.has(e.from) && visiblePaths.has(e.to)
  );

  return jsonResponse(200, {
    nodes: visibleNodes.map((n) => ({
      ...n,
      _links: { self: { href: nodeHref(n.path) } },
    })),
    edges: visibleEdges.map((e) => ({
      ...e,
      _links: {
        from: { href: nodeHref(e.from) },
        to: { href: nodeHref(e.to) },
      },
    })),
    _links: {
      self: {
        href: `/graph?root=${encodeURIComponent(root)}&depth=${depth}`,
      },
    },
  });
};
