import type { RestHandler } from "../types.js";
import { accessLevelAtLeast } from "../../access/policy.js";
import { sendError, sendText } from "../router.js";

/**
 * GET /content/{...path} — return the markdown body of a node.
 *
 * Responds 404 when the node is invisible or below `content` level for the
 * actor; the surface deliberately does not distinguish between "no such node"
 * and "you can't see it" to avoid leaking presence.
 */
export const handleContent: RestHandler = async (_req, res, url, ctx) => {
  const nodePath = stripPrefix(url.pathname, "/content");
  const node = await ctx.store.getNode(nodePath);
  if (!node) return sendError(res, 404, "not found");

  const level = ctx.policy.resolveLevel(ctx.actor, nodePath, node.frontmatter);
  if (!accessLevelAtLeast(level, "content")) {
    return sendError(res, 404, "not found");
  }

  return sendText(res, 200, node.content, "text/markdown; charset=utf-8");
};

function stripPrefix(pathname: string, prefix: string): string {
  if (pathname === prefix) return "/";
  const stripped = pathname.slice(prefix.length);
  return stripped.startsWith("/") ? stripped : "/" + stripped;
}
