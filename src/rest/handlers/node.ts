import type { RestHandler } from "../types.js";
import { shapeNodeAsJson } from "../shape.js";
import { jsonResponse, errorResponse, readJsonBody } from "../router.js";
import { createThing, updateThing, resolveSourcePath } from "../../server/writer.js";
import { recompileNode } from "../../compiler/compiler.js";
import { storeToGraph } from "../../storage/store-to-graph.js";
import { moveThing, deleteThingWithReferrers } from "../../server/mutations.js";

const DEFAULT_DEPTH = 0;
const MAX_DEPTH = 10;

/**
 * GET /node/{...path} — return a shaped node JSON with HAL `_links`.
 *
 * Query params:
 *   depth                — recurse children to this depth (default 0, max 10)
 *   includeContent       — embed markdown body inline at content-level access
 *   includeNonNavigable  — include companion documents (`navigable: false`) in
 *                          child listings; default false
 */
export const handleGetNode: RestHandler = async (_req, url, ctx) => {
  const nodePath = stripPrefix(url.pathname, "/node");

  const depthRaw = url.searchParams.get("depth");
  const depth = depthRaw ? parseInt(depthRaw, 10) : DEFAULT_DEPTH;
  if (Number.isNaN(depth) || depth < 0) {
    return errorResponse(400, "invalid depth");
  }
  if (depth > MAX_DEPTH) {
    return errorResponse(400, `depth exceeds maximum of ${MAX_DEPTH}`);
  }

  const includeContent = url.searchParams.get("includeContent") === "true";
  const includeNonNavigable = url.searchParams.get("includeNonNavigable") === "true";

  const shaped = await shapeNodeAsJson(ctx.store, ctx.policy, ctx.actor, nodePath, {
    depth,
    includeContent,
    includeNonNavigable,
  });
  if (!shaped) return errorResponse(404, "not found");

  return jsonResponse(200, shaped);
};

/**
 * PUT /node/{...path} — create or update a node. Body: ThingData JSON.
 */
export const handlePutNode: RestHandler = async (req, url, ctx) => {
  if (!ctx.rootDir) return errorResponse(405, "writes not enabled");

  const nodePath = stripPrefix(url.pathname, "/node");

  if (!ctx.policy.canWrite(ctx.actor, nodePath)) {
    return errorResponse(403, "write denied");
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return errorResponse(400, `invalid JSON body: ${(err as Error).message}`);
  }

  const existing = await ctx.store.getNode(nodePath);

  try {
    if (existing) {
      updateThing(ctx.rootDir, nodePath, body);
    } else {
      if (typeof body.name !== "string" || typeof body.description !== "string") {
        return errorResponse(400, "name and description are required");
      }
      createThing(ctx.rootDir, nodePath, body as unknown as Parameters<typeof createThing>[2]);
    }
    const { sourcePath } = resolveSourcePath(ctx.rootDir, nodePath);
    await recompileNode(ctx.store, ctx.rootDir, sourcePath);
  } catch (err) {
    return errorResponse(400, (err as Error).message);
  }

  const warnings = (await ctx.store.getWarnings()).filter(
    (w) => w.path === nodePath || w.path.startsWith(nodePath + "/")
  );
  return jsonResponse(existing ? 200 : 201, {
    success: true,
    path: nodePath,
    warnings,
  });
};

/**
 * DELETE /node/{...path} — remove a node and its subtree.
 *
 * Query params:
 *   cascade — how to handle inbound referrers. Accepted value: `remove-link`.
 *             Omit (or any other value) to refuse when referrers exist.
 */
export const handleDeleteNode: RestHandler = async (_req, url, ctx) => {
  if (!ctx.rootDir) return errorResponse(405, "writes not enabled");

  const nodePath = stripPrefix(url.pathname, "/node");

  if (!ctx.policy.canWrite(ctx.actor, nodePath)) {
    return errorResponse(403, "write denied");
  }

  const cascadeParam = url.searchParams.get("cascade");
  const cascade = cascadeParam === "remove-link" ? "remove-link" : "refuse";

  try {
    // Resolve old source path BEFORE the delete so we can recompile it away.
    const { sourcePath: oldSourcePath } = resolveSourcePath(ctx.rootDir, nodePath);

    const graph = await storeToGraph(ctx.store);
    const deleteResult = deleteThingWithReferrers(ctx.rootDir, nodePath, graph, { cascade });

    // Recompile: deleted node (removes it from the store), then each rewritten referrer.
    await recompileNode(ctx.store, ctx.rootDir, oldSourcePath);
    for (const fsPath of deleteResult.referrersRewritten) {
      await recompileNode(ctx.store, ctx.rootDir, fsPath);
    }

    return jsonResponse(200, { success: true, path: nodePath, deleteResult });
  } catch (err) {
    return errorResponse(400, (err as Error).message);
  }
};

/**
 * POST /node/{...path}/move — rename/move a node to a new path.
 *
 * Body: `{ to: string }` — the destination graph path.
 * Both source and target paths are gated by `canWrite`.
 */
export const handleMoveNode: RestHandler = async (req, url, ctx) => {
  if (!ctx.rootDir) return errorResponse(405, "writes not enabled");

  // Strip /node prefix and /move suffix to get the source graph path.
  const fromPath = stripSuffix(stripPrefix(url.pathname, "/node"), "/move");

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return errorResponse(400, `invalid JSON body: ${(err as Error).message}`);
  }

  if (typeof body.to !== "string" || !body.to) {
    return errorResponse(400, "missing or invalid 'to' in body");
  }
  const toPath = body.to as string;

  if (!ctx.policy.canWrite(ctx.actor, fromPath)) {
    return errorResponse(403, "write denied");
  }
  if (!ctx.policy.canWrite(ctx.actor, toPath)) {
    return errorResponse(403, "write denied");
  }

  try {
    // Resolve old source path before the move so we can recompile it away.
    const { sourcePath: oldSourcePath } = resolveSourcePath(ctx.rootDir, fromPath);

    const graph = await storeToGraph(ctx.store);
    const moveResult = moveThing(ctx.rootDir, fromPath, toPath, graph);

    // Recompile: old path (remove), new path (add), rewritten referrers.
    await recompileNode(ctx.store, ctx.rootDir, oldSourcePath);
    const { sourcePath: newSourcePath } = resolveSourcePath(ctx.rootDir, toPath);
    await recompileNode(ctx.store, ctx.rootDir, newSourcePath);
    for (const fsPath of moveResult.written) {
      await recompileNode(ctx.store, ctx.rootDir, fsPath);
    }

    const warnings = (await ctx.store.getWarnings()).filter(
      (w) => w.path === toPath || w.path.startsWith(toPath + "/")
    );
    return jsonResponse(200, { success: true, from: fromPath, to: toPath, moveResult, warnings });
  } catch (err) {
    return errorResponse(400, (err as Error).message);
  }
};

function stripPrefix(pathname: string, prefix: string): string {
  if (pathname === prefix) return "/";
  const stripped = pathname.slice(prefix.length);
  return stripped.startsWith("/") ? stripped : "/" + stripped;
}

function stripSuffix(pathname: string, suffix: string): string {
  if (pathname.endsWith(suffix)) {
    return pathname.slice(0, -suffix.length) || "/";
  }
  return pathname;
}
