import type { Actor } from "../access/types.js";

/**
 * Build an Actor from an inbound HTTP request.
 *
 * The reference implementation uses two simple headers; production deployments
 * are expected to swap this for OAuth, signed cookies, mTLS, or whatever the
 * host's auth scheme is. The contract is just "given a request, return an
 * Actor" — the access policy never sees the transport details.
 *
 * Defaults:
 *   - Authorization: Bearer …    → authenticated, id=token
 *   - X-Identity-Email: foo@bar  → identified, id=email
 *   - neither                    → anonymous
 */
export function actorFromRequest(req: Request): Actor {
  const auth = req.headers.get("authorization");
  if (auth && /^bearer\s+\S+/i.test(auth)) {
    const token = auth.replace(/^bearer\s+/i, "").trim();
    return { tier: "authenticated", id: token };
  }

  const email = req.headers.get("x-identity-email");
  if (email) return { tier: "identified", id: email };

  return { tier: "anonymous" };
}
