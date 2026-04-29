import type { RestHandler } from "../types.js";
import { sendJson, sendError } from "../router.js";
import { resolveSearch } from "../../graph-ops.js";
import { accessLevelAtLeast } from "../../access/policy.js";
import { nodeHref } from "../shape.js";

/**
 * GET /search?q=&path= — keyword search across node text and edge metadata.
 *
 * Results below `description` access for the actor are dropped before
 * serialization. Optional `path` parameter scopes search to a subtree.
 */
export const handleSearch: RestHandler = async (_req, res, url, ctx) => {
  const q = url.searchParams.get("q");
  if (!q) return sendError(res, 400, "missing q parameter");

  const scopePath = url.searchParams.get("path") ?? undefined;
  const results = await resolveSearch(ctx.store, q, scopePath);

  const nodeMap = await ctx.store.getNodes(results.map((r) => r.path));
  const accessible = results.filter((r) => {
    const fullNode = nodeMap.get(r.path);
    const level = ctx.policy.resolveLevel(ctx.actor, r.path, fullNode?.frontmatter ?? {});
    return accessLevelAtLeast(level, "description");
  });

  return sendJson(res, 200, {
    results: accessible.map((r) => ({
      ...r,
      _links: { self: { href: nodeHref(r.path) } },
    })),
  });
};
