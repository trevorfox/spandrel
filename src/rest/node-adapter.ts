/**
 * Node `node:http` adapter for the Web-standard REST router.
 *
 * `createRestRouter` returns a Web-standard `(req: Request) => Promise<Response | null>`
 * handler. Hosts that run `node:http` (the reference dev server, anyone using
 * `createServer`) wrap that handler with `createNodeAdapter` to consume from
 * the classic `(req, res) => Promise<boolean>` signature where `false` means
 * "no route matched, fall through to the next handler."
 */

import type { IncomingMessage, ServerResponse } from "node:http";

export type WebRouter = (req: Request) => Promise<Response | null>;

export type NodeRouter = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;

export function createNodeAdapter(router: WebRouter): NodeRouter {
  return async function nodeRouter(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const webReq = await nodeRequestToWebRequest(req);
    const webRes = await router(webReq);
    if (webRes === null) return false;
    await writeWebResponseToNodeResponse(webRes, res);
    return true;
  };
}

async function nodeRequestToWebRequest(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host ?? "localhost";
  const protocol = (req.socket as { encrypted?: boolean }).encrypted ? "https" : "http";
  const url = `${protocol}://${host}${req.url ?? "/"}`;

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(name, v);
    } else {
      headers.set(name, String(value));
    }
  }

  const init: RequestInit = {
    method: req.method ?? "GET",
    headers,
  };

  // Web `Request` only carries a body for non-GET/HEAD methods. For methods
  // that can carry a payload, drain the Node stream into a buffer and pass
  // it through. Streaming bodies aren't supported here — Spandrel's REST
  // surface uses small JSON payloads, so buffering is fine.
  const method = (req.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    if (chunks.length > 0) {
      init.body = Buffer.concat(chunks);
      // Required by Node's undici when sending a body with fetch-like Request.
      (init as { duplex?: string }).duplex = "half";
    }
  }

  return new Request(url, init);
}

async function writeWebResponseToNodeResponse(
  webRes: Response,
  res: ServerResponse
): Promise<void> {
  const headers: Record<string, string | string[]> = {};
  for (const [name, value] of webRes.headers) {
    const existing = headers[name];
    if (existing === undefined) {
      headers[name] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      headers[name] = [existing, value];
    }
  }
  res.writeHead(webRes.status, headers);

  if (webRes.body) {
    // Drain the Web stream into the Node response. Same buffering caveat as
    // above — fine for Spandrel's payload shapes.
    const text = await webRes.text();
    res.end(text);
  } else {
    res.end();
  }
}
