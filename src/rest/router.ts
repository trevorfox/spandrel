import type { RestContext, RestHandler, ParsedUrl } from "./types.js";
import type { GraphStore } from "../storage/graph-store.js";
import type { AccessPolicy } from "../access/policy.js";
import { actorFromRequest } from "./actor.js";
import { handleContent } from "./handlers/content.js";
import { handleGetNode, handlePutNode, handleDeleteNode } from "./handlers/node.js";
import { handleGraph } from "./handlers/graph.js";
import { handleSearch } from "./handlers/search.js";
import { handleLinkTypes } from "./handlers/linkTypes.js";

export interface RestRouterOptions {
  store: GraphStore;
  policy: AccessPolicy;
  rootDir?: string;
  getHistory?: RestContext["getHistory"];
}

/**
 * Returns a Web-standard handler that dispatches to the REST handlers and
 * resolves to `null` when no route matched — letting the host server fall
 * through to other routes (SSE, static SPA, etc.).
 *
 * Web-standard primitives (`Request` / `Response`) work natively on Next.js,
 * Hono, Bun, Cloudflare Workers, Deno Deploy, Vercel Functions, and any other
 * runtime that follows the Fetch API. For `node:http` consumers, wrap with
 * `createNodeAdapter` from `./node-adapter.js`.
 */
export function createRestRouter(options: RestRouterOptions) {
  return async function router(req: Request): Promise<Response | null> {
    const url = parseUrl(req);
    const handler = matchRoute(req.method, url.pathname);
    if (!handler) return null;

    const ctx: RestContext = {
      store: options.store,
      policy: options.policy,
      actor: actorFromRequest(req),
      rootDir: options.rootDir,
      getHistory: options.getHistory,
    };

    try {
      return await handler(req, url, ctx);
    } catch (err) {
      return errorResponse(500, `internal error: ${(err as Error).message}`);
    }
  };
}

function matchRoute(method: string, pathname: string): RestHandler | null {
  if (method === "GET") {
    if (pathname === "/graph") return handleGraph;
    if (pathname === "/search") return handleSearch;
    if (pathname === "/linkTypes") return handleLinkTypes;
    if (pathname === "/content" || pathname.startsWith("/content/")) return handleContent;
    if (pathname === "/node" || pathname.startsWith("/node/")) return handleGetNode;
    return null;
  }
  if (method === "PUT" && (pathname === "/node" || pathname.startsWith("/node/"))) {
    return handlePutNode;
  }
  if (method === "DELETE" && (pathname === "/node" || pathname.startsWith("/node/"))) {
    return handleDeleteNode;
  }
  return null;
}

function parseUrl(req: Request): ParsedUrl {
  const u = new URL(req.url);
  return { pathname: u.pathname, searchParams: u.searchParams };
}

// --- Response helpers ----------------------------------------------------

const NO_STORE = { "Cache-Control": "no-store" };

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...NO_STORE,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export function textResponse(
  status: number,
  body: string,
  contentType = "text/plain; charset=utf-8"
): Response {
  return new Response(body, {
    status,
    headers: {
      ...NO_STORE,
      "Content-Type": contentType,
    },
  });
}

export function errorResponse(status: number, message: string): Response {
  return jsonResponse(status, { error: message });
}

export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (!text) return {};
  return JSON.parse(text);
}
