import type { GraphStore } from "../storage/graph-store.js";
import type { AccessPolicy } from "../access/policy.js";
import type { Actor } from "../access/types.js";

/**
 * Per-request context handed to every REST handler.
 */
export interface RestContext {
  store: GraphStore;
  policy: AccessPolicy;
  actor: Actor;
  rootDir?: string;
  getHistory?: (rootDir: string, nodePath: string) => Promise<{
    hash: string;
    date: string;
    author: string;
    message: string;
  }[]>;
}

export interface ParsedUrl {
  pathname: string;
  searchParams: URLSearchParams;
}

/**
 * Web-standard handler signature.
 *
 * Receives a `Request` plus pre-parsed URL and per-request context, returns a
 * `Response`. Hosts on Next.js, Hono, Bun, Cloudflare Workers, Deno Deploy,
 * Vercel Functions consume this directly. The reference Node CLI consumes
 * via `createNodeAdapter` from `./node-adapter.js`.
 */
export type RestHandler = (
  req: Request,
  url: ParsedUrl,
  ctx: RestContext
) => Promise<Response> | Response;
