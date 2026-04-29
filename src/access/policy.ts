import type { SpandrelNode, SpandrelEdge } from "../compiler/types.js";
import type {
  AccessLevel,
  AccessConfig,
  Actor,
  Policy,
  ShapedNode,
  ShapedEdge,
} from "./types.js";

const ACCESS_LEVEL_ORDER: AccessLevel[] = [
  "none",
  "exists",
  "description",
  "content",
  "traverse",
];

export function accessLevelAtLeast(level: AccessLevel, minimum: AccessLevel): boolean {
  return ACCESS_LEVEL_ORDER.indexOf(level) >= ACCESS_LEVEL_ORDER.indexOf(minimum);
}

function pathMatchesPattern(nodePath: string, pattern: string): boolean {
  if (pattern === "/**") return true;
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return nodePath === prefix || nodePath.startsWith(prefix + "/");
  }
  return nodePath === pattern;
}

function matchesDenyRule(
  metadata: Record<string, unknown>,
  deny: { where: Record<string, string[]> }
): boolean {
  for (const [field, deniedValues] of Object.entries(deny.where)) {
    const nodeValue = metadata[field];
    if (Array.isArray(nodeValue)) {
      if (nodeValue.some((v) => deniedValues.includes(String(v)))) return true;
    } else if (nodeValue !== undefined) {
      if (deniedValues.includes(String(nodeValue))) return true;
    }
  }
  return false;
}

function actorIdentity(actor: Actor): string | null {
  return actor.tier === "anonymous" ? null : actor.id ?? null;
}

function resolveDefaultRole(config: AccessConfig): string {
  for (const [roleName, roleConfig] of Object.entries(config.roles)) {
    if (roleConfig.default) return roleName;
  }
  return "public";
}

function lookupMembershipRole(config: AccessConfig, identity: string | null): string | null {
  if (identity === null) return null;
  for (const [roleName, roleConfig] of Object.entries(config.roles)) {
    if (roleConfig.members?.includes(identity)) return roleName;
  }
  return null;
}

function candidateRoles(config: AccessConfig, actor: Actor): string[] {
  if (actor.roles && actor.roles.length > 0) return actor.roles;
  const identity = actorIdentity(actor);
  const membership = lookupMembershipRole(config, identity);
  if (membership !== null) return [membership];
  return [resolveDefaultRole(config)];
}

function policyForRole(
  config: AccessConfig,
  role: string,
  nodePath: string
): Policy | null {
  const policy = config.policies[role];
  if (!policy) return null;
  if (!policy.paths.some((p) => pathMatchesPattern(nodePath, p))) return null;
  return policy;
}

function maxLevel(a: AccessLevel, b: AccessLevel): AccessLevel {
  return accessLevelAtLeast(a, b) ? a : b;
}

/**
 * The single enforcement contract every wire surface calls into. Constructed
 * once at boot from the loaded access config, then queried per request.
 *
 * Operates on inputs (path, node, edge) given to its methods — never holds
 * a reference to the graph store. This keeps the policy stateless and cheap
 * to share across surfaces.
 */
export class AccessPolicy {
  constructor(private readonly config: AccessConfig | null) {}

  /**
   * Return the access level this actor has at the given path.
   * When no config is loaded, all reads return at level `traverse` (open mode).
   */
  resolveLevel(
    actor: Actor,
    nodePath: string,
    metadata: Record<string, unknown> = {}
  ): AccessLevel {
    if (!this.config) return "traverse";

    const roles = candidateRoles(this.config, actor);
    let best: AccessLevel = "none";
    for (const role of roles) {
      const policy = policyForRole(this.config, role, nodePath);
      if (!policy) continue;
      if (policy.deny && matchesDenyRule(metadata, policy.deny)) continue;
      best = maxLevel(best, policy.access_level);
    }
    return best;
  }

  /**
   * Return whether this actor can write at the given path.
   * When no config is loaded, writes are denied (closed by default).
   *
   * Layering invariant: a yes here implies the actor also has read access at
   * level `content` or higher. Implementations of this contract are required
   * to maintain that property.
   */
  canWrite(actor: Actor, nodePath: string): boolean {
    if (!this.config) return false;

    const roles = candidateRoles(this.config, actor);
    return roles.some((role) => {
      const policy = policyForRole(this.config!, role, nodePath);
      if (!policy) return false;
      return policy.operations.includes("write") || policy.operations.includes("admin");
    });
  }

  /**
   * Trim a node to what's visible at the given level.
   * Returns null when the level is `none`.
   */
  shapeNode(node: SpandrelNode, level: AccessLevel): ShapedNode | null {
    if (level === "none") return null;
    if (level === "exists") {
      return { path: node.path, name: node.name };
    }
    if (level === "description") {
      return {
        path: node.path,
        name: node.name,
        description: node.description,
        nodeType: node.nodeType,
        depth: node.depth,
        parent: node.parent,
        children: node.children,
      };
    }
    return { ...node };
  }

  /**
   * Decorate an edge with its link-type description and gate by endpoint
   * visibility. Returns null when either endpoint is invisible to the actor.
   */
  shapeEdge(
    edge: SpandrelEdge,
    fromLevel: AccessLevel,
    toLevel: AccessLevel,
    linkTypeDescription: string | null = null
  ): ShapedEdge | null {
    if (!accessLevelAtLeast(fromLevel, "exists")) return null;
    if (!accessLevelAtLeast(toLevel, "exists")) return null;
    return {
      from: edge.from,
      to: edge.to,
      type: edge.type,
      linkType: edge.linkType,
      description: edge.description,
      linkTypeDescription,
    };
  }
}
