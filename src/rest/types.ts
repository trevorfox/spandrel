import type { IncomingMessage, ServerResponse } from "node:http";
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

export type RestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  url: ParsedUrl,
  ctx: RestContext
) => Promise<void> | void;
