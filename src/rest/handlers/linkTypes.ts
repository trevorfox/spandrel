import type { RestHandler } from "../types.js";
import { jsonResponse } from "../router.js";
import { accessLevelAtLeast } from "../../access/policy.js";
import { nodeHref } from "../shape.js";

/**
 * GET /linkTypes — return the declared link-type vocabulary.
 *
 * Only surfaces link types the actor can see at description-level access —
 * consistent with how other read endpoints filter.
 */
export const handleLinkTypes: RestHandler = async (_req, _url, ctx) => {
  const linkTypes = await ctx.store.getLinkTypes();

  const all = Array.from(linkTypes.values());
  const visible = await Promise.all(
    all.map(async (lt) => {
      const node = await ctx.store.getNode(lt.path);
      const level = ctx.policy.resolveLevel(ctx.actor, lt.path, node?.frontmatter ?? {});
      return accessLevelAtLeast(level, "description") ? lt : null;
    })
  );

  return jsonResponse(200, {
    linkTypes: visible.filter(Boolean).map((lt) => ({
      ...lt!,
      _links: { self: { href: nodeHref(lt!.path) } },
    })),
    _links: { self: { href: "/linkTypes" } },
  });
};
