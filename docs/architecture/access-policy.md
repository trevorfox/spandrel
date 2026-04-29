---
name: Access Policy
description: The single enforcement contract for read shaping and write gating across all wire surfaces
links:
  - to: /architecture/access
    type: relates-to
  - to: /architecture/mcp
    type: relates-to
  - to: /architecture/rest
    type: relates-to
---

# Access Policy

The Access Policy is the single enforcement contract for both read shaping and write gating. Every wire surface — [MCP](/architecture/mcp), [REST](/architecture/rest), [CLI](/architecture/cli), any future surface — calls into the same policy before serializing a response or performing a write. One policy, one set of rules, one place to audit.

## What the policy answers

Every conformant Access Policy answers four questions, two for reads and two for shaping:

- **Resolve level** — given an actor and a path, return the [access level](/architecture/access) that actor has at that path.
- **Check write** — given an actor and a path, return whether that actor can modify the node at that path.
- **Shape node** — given a node and an access level, trim the node to what's visible at that level. Returns null if the level is `none`.
- **Shape edge** — given an edge and an access level, trim the edge to what's visible. Returns null if the actor can't see the target.

Together these answer everything a wire surface needs: what to include in a response, and whether to allow a write.

## Actor

The actor is the entity making a request. The framework defines its shape; wire surfaces extract it from each request using whatever auth scheme the implementation chose.

Three tiers:

| Tier | Meaning |
|---|---|
| anonymous | No claim of identity. Default for unauthenticated requests. |
| identified | Asserted identifier (typically email), unverified or weakly verified. Supports lead-capture flows — "give me your email and I'll show you the whitepaper." |
| authenticated | Verified via the implementation's auth scheme. |

Authenticated actors may carry roles. The framework defines no standard role names — implementations and graph owners declare their own.

## Invariants

Every conformant implementation preserves these:

- **Layering** — write authority requires read access at level `content` or higher. Writing without the ability to read what's being written is forbidden.
- **Monotonicity** — information visible at a level is also visible at all higher levels. Higher access never hides information.
- **Null shaping** — shaping a node at level `none` returns null. There is no "redacted shell" state distinct from invisibility.
- **Read–write orthogonality** — read level and write capability are independent axes. Write is not a level above traverse; it is a separate gate.

## Wire surface contract

Every wire surface must:

1. Construct an actor from the request. The mechanism is per-surface and per-implementation.
2. For reads — call the policy to resolve the level, then shape the node or edge before serializing.
3. For writes — call the policy to check write authority before performing the write. If denied, return the surface's idiomatic forbidden response.
4. Treat write authority as gated solely by the policy. The protocol does not gate independently.

This is the property the framework reaches for: one policy, one enforcement point, every surface consistent.

## Wire access vs file access

The Access Policy governs **wire access**, not file access. Local edits to markdown files via an editor, the file system, or `git pull` bypass the policy entirely — those are governed by file system permissions. The policy applies only at served boundaries.

This means editing a file with `vim` is always allowed; writing through MCP or REST is gated. Editing `_access/config.yaml` directly is also allowed at the file level — the policy source is intentionally self-modifying, the same way `/etc/sudoers` is editable by root.

## Reference implementation

See `src/access/design.md` for implementation specifics: where the policy is stored, how identification is established, default behaviors, and how configuration maps to per-path access.
