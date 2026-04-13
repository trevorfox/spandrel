# Access Layer Design

> This is a `design.md` file for Spandrel's `_access/` system directory. It describes how to implement the access layer — the governance overlay that controls who can see and do what within a Spandrel instance. The architectural spec defines what must be true (see "Access spec" in the main spec). This document describes how to build it.

## Three Questions

Every request to the graph resolves three questions in order:

### 1. Who are you? (Identity)

How the actor identifies themselves. This is transport-level and happens before any graph access.

**Options:**

- **Anonymous** — no identity provided. The actor is treated as `public`. Appropriate for open knowledge bases, public documentation, community wikis.
- **Identified** — the actor provides an email or similar identifier. They receive a magic link or one-time password. No persistent account required. Useful when you want to know who's reading without restricting access. Low friction.
- **Authenticated** — the actor proves their identity via API key, OAuth, SSO, or similar. They have an account in the system. Standard for organizational use.

**Transport considerations:**

- MCP consumers typically authenticate via API key passed in headers
- Web UI users typically authenticate via OAuth or SSO
- CLI users typically configure an API key locally
- Public endpoints may require no authentication at all

Identity is standard infrastructure. Use whatever auth your deployment supports. Spandrel doesn't prescribe an auth provider.

### 2. What role do you have? (Authorization)

Once identity is established, map it to a role. A role is a label that groups actors with similar access needs.

**Example roles:**

- `public` — anonymous users
- `consumer` — authenticated, read-only, scoped access
- `analyst` — authenticated, read-only, broad access
- `builder` — authenticated, read-write access
- `admin` — full access including system configuration
- `partner-a` — external partner, scoped to their relevant content
- `partner-b` — different external partner, different scope

Roles are user-defined. A small team might have two: `reader` and `writer`. A multi-org deployment might have a dozen. The system doesn't prescribe which roles exist.

**Role mapping:**

```yaml
# Example: mapping identities to roles
roles:
  admin:
    members:
      - jane@company.com
      - ops-bot
  builder:
    members:
      - dev-team@company.com
  partner-a:
    members:
      - alice@partner-a.com
      - api-key:pk_partner_a_xxxxx
  public:
    default: true  # any anonymous request
```

### 3. What can that role see and do? (Policy)

Each role maps to a policy. A policy defines:

- **Allowed paths** (coarse filter) — which parts of the tree are accessible
- **Denied attributes** (fine filter, optional) — exceptions based on frontmatter metadata
- **Access level** — how much of each node is visible (none, exists, description, content, traverse)
- **Operations** — what the role can do (read, write, admin)

**Example policies:**

```yaml
policies:
  admin:
    paths: ["/**"]
    access_level: traverse
    operations: [read, write, admin]

  builder:
    paths: ["/**"]
    access_level: traverse
    operations: [read, write]

  analyst:
    paths: ["/**"]
    access_level: content
    operations: [read]

  partner-a:
    paths:
      - /clients/acme/**
      - /projects/shared-alpha/**
      - /guide/**
    deny:
      where:
        tags: [confidential, internal-only]
    access_level: content
    operations: [read]

  public:
    paths:
      - /guide/**
      - /public/**
    access_level: description
    operations: [read]
```

## Access Levels

The access level controls how much of a node is returned in responses. These are progressive disclosure applied to governance:

| Level | What the actor sees |
|---|---|
| **none** | Node is invisible. Actor doesn't know it exists. |
| **exists** | Path and name only. Actor knows it's there. |
| **description** | Name, description, and link metadata. Enough to navigate. |
| **content** | Full markdown body. Can read everything. |
| **traverse** | Full content AND can follow links from this node to others. |

An actor with `description` level on `/clients/acme/` can see it in the tree, read its summary, and see its links — but can't read the full content or follow links to deeper nodes. This is useful for giving external partners awareness of what exists without full access.

## Enforcement

### The `canAccess` function

Every GraphQL resolver calls `canAccess(actor, path, metadata)` before including a node in a response. It returns an access level.

```
canAccess(actor, path, metadata):
  1. Look up actor's role
  2. Look up role's policy
  3. Check if path matches any allowed path pattern
     - If no match: return "none"
  4. Check if metadata matches any deny rules
     - If denied: return "none" (or a reduced level if configured)
  5. Return the policy's access_level
```

### Where enforcement happens

- **GraphQL resolvers** — the single enforcement point. Every query passes through GraphQL, so every query is filtered.
- **MCP tools** — call GraphQL, which enforces access. MCP itself doesn't check permissions.
- **Web UI** — calls GraphQL, which enforces access. The UI renders what it receives.
- **CLI** — calls GraphQL, which enforces access.

No interface has its own permission system. They all defer to GraphQL. One enforcement point, one set of rules.

### What filtered responses look like

When a node is filtered out, it's absent — not redacted, not marked as hidden. The actor's view of the graph is simply smaller.

When a node is partially accessible (e.g., `exists` or `description` level), the response includes only the fields permitted at that level. The GraphQL resolver shapes the response based on the access level.

Links to inaccessible nodes are invisible. If `/clients/acme/` links to `/internal/strategy/` and the actor can't see `/internal/`, that link doesn't appear in the response.

## Common Patterns

### Public documentation site
- Anonymous access allowed
- Everything under `/public/` and `/guide/` visible at `content` level
- Everything else invisible

### Internal team
- OAuth required
- All authenticated users get `builder` role
- Full access to everything

### Multi-org with partners
- API keys for partners, OAuth for internal
- Internal team sees everything
- Each partner sees their scoped paths at `content` level
- Confidential tags denied for all partners

### Tiered access
- Public gets `description` level on most content (can browse the graph structure)
- Identified users get `content` level (can read everything they can see)
- Authenticated users get `traverse` level and broader path access

## Implementation Notes

- Store role mappings and policies in `_access/config.yaml` or similar
- The access configuration itself should be in the `_` system directory (not in the graph)
- Changes to access configuration don't require graph recompilation — they're read at query time
- Consider caching `canAccess` results per actor per session for performance
- Log access queries for audit trails (who accessed what, when)

## What This Design Does NOT Cover

- Specific auth provider integration (use your deployment's auth)
- Write operation permissions in detail (v2 — when write MCP tools exist)
- Federation access (how access works across Spandrel instances — v2)
- Attribute-based deny rules beyond simple tag matching (ABAC at full complexity — build if needed)
- Rate limiting or usage quotas (infrastructure concern, not access layer)
