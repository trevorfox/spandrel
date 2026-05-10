import type { RestHandler } from "../types.js";
import { jsonResponse } from "../router.js";

/**
 * GET /linkTypes — return the declared link-type vocabulary loaded from
 * `_links/config.yaml`. The registry is treated as system config (like
 * `_access/config.yaml`); not subject to per-row access shaping.
 */
export const handleLinkTypes: RestHandler = async (_req, _url, ctx) => {
  const linkTypes = await ctx.store.getLinkTypes();
  const items = Array.from(linkTypes.values()).map((lt) => ({
    stem: lt.stem,
    description: lt.description,
  }));
  return jsonResponse(200, {
    linkTypes: items,
    _links: { self: { href: "/linkTypes" } },
  });
};
