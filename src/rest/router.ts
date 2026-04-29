import type { IncomingMessage, ServerResponse } from "node:http";
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
 * Returns a node:http handler that dispatches to the REST handlers and
 * resolves to `false` (via the boolean return) when no route matched —
 * letting the host server fall through to other routes (SSE, static SPA).
 */
export function createRestRouter(options: RestRouterOptions) {
  return async function router(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = parseUrl(req);
    const handler = matchRoute(req.method ?? "GET", url.pathname);
    if (!handler) return false;

    const ctx: RestContext = {
      store: options.store,
      policy: options.policy,
      actor: actorFromRequest(req),
      rootDir: options.rootDir,
      getHistory: options.getHistory,
    };

    try {
      await handler(req, res, url, ctx);
    } catch (err) {
      sendError(res, 500, `internal error: ${(err as Error).message}`);
    }
    return true;
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

function parseUrl(req: IncomingMessage): ParsedUrl {
  const raw = req.url ?? "/";
  const u = new URL(raw, "http://localhost");
  return { pathname: u.pathname, searchParams: u.searchParams };
}

// --- Response helpers ----------------------------------------------------

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

export function sendText(
  res: ServerResponse,
  status: number,
  body: string,
  contentType = "text/plain; charset=utf-8"
): void {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

export function sendError(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify({ error: message }));
}

export async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw) return {};
  return JSON.parse(raw);
}
