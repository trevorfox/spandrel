# Access — design

Reference implementation of the [Access Policy](../../docs/architecture/access-policy.md) contract. Wraps the policy spec into a concrete TypeScript class with config loading, role resolution, and the conformance suite.

## Files

- `policy.ts` — `AccessPolicy` class. Implements the four contract methods: `resolveLevel`, `canWrite`, `shapeNode`, `shapeEdge`. Stateless after construction.
- `types.ts` — `Actor`, `AccessLevel`, `AccessConfig`, `Policy`, `ShapedNode`, `ShapedEdge`. The Actor is three-tier (anonymous / identified / authenticated), per the access-policy spec.
- `config.ts` — `loadAccessConfig(rootDir)` reads `_access/config.yaml` from a knowledge-repo root.
- `conformance.ts` — `runAccessPolicyConformance(factory)` runs the four invariants against any AccessPolicy implementation. The default factory uses this package's class.

## Where the config lives

A knowledge repo opts into access control by adding `_access/config.yaml` at its root. The compiler skips `_` directories, so the file is invisible to the graph but visible to the policy at query time. When the file is missing or malformed, `loadAccessConfig` returns null and the policy operates in **smart-default mode**:

- All reads return at level `traverse` (open).
- All writes return false (closed).

The asymmetry is deliberate: anyone running `spandrel dev` on a fresh repo can read everything, but nothing on the wire can mutate the filesystem until an explicit policy is declared.

## Config shape

```yaml
roles:
  admin:
    members: [admin@example.test]
  public:
    default: true
policies:
  admin:
    paths: ["/**"]
    access_level: traverse
    operations: [read, write, admin]
  public:
    paths: ["/guide/**"]
    access_level: description
    operations: [read]
```

Each policy is a `(role, path-glob) → (level, operations, deny?)` rule. Path globs support exact match (`/foo`), subtree match (`/foo/**`), and full graph (`/**`). Deny rules filter out nodes whose frontmatter contains specific values:

```yaml
policies:
  partner:
    paths: ["/clients/acme/**"]
    deny: { where: { tags: ["confidential", "internal-only"] } }
    access_level: content
    operations: [read]
```

## Identification mechanism

The policy itself does not look at the wire. Each wire surface — [MCP](../rest/design.md), [REST](../rest/design.md), CLI — is responsible for constructing an `Actor` from its inbound request. This is intentional: identification is a transport concern, and the same graph can be served over multiple surfaces with different auth schemes.

Reference implementations in this package:

- **REST** — reads `X-Identity-Email` for identified, treats `Authorization: Bearer …` as authenticated. See `src/rest/actor.ts`.
- **MCP** — reads `SPANDREL_IDENTITY` env var for stdio. See `src/server/mcp.ts`.

These are sensible defaults, not contract requirements. Production deployments swap them for OAuth, mTLS, signed cookies, or whatever fits the host.

## Role resolution

When an actor carries an explicit `roles` array, the policy uses that. Otherwise it falls back to membership lookup (`actor.id` ∈ `roles[*].members`), then to the default role (`roles[*].default: true`), then to `"public"` if neither is configured. When the actor has multiple candidate roles, the policy returns the **most permissive** read level any role grants and `true` for write if **any** role permits it.

## Conformance

The four invariants are checked in `conformance.ts`. Third-party AccessPolicy implementations (a Postgres-backed policy, a JWT-claims-driven policy, an LDAP-backed policy) should pass `runAccessPolicyConformance` against their own factory. The kit asserts:

1. Every `(actor, path)` with `canWrite=true` has `resolveLevel ≥ content`.
2. Fields visible at level X are visible at every level above X.
3. `shapeNode(node, "none")` returns null for any node.
4. There exist actor pairs that share a read level but differ on write authority.

If any of these fail, the surface contract is broken.
