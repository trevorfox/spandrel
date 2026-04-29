import type { SpandrelNode, SpandrelEdge } from "../compiler/types.js";

export type AccessLevel = "none" | "exists" | "description" | "content" | "traverse";

/**
 * Three-tier actor identity. Wire surfaces construct an Actor from each
 * request; the policy never sees the underlying transport details.
 */
export interface Actor {
  tier: "anonymous" | "identified" | "authenticated";
  id?: string;
  roles?: string[];
}

export interface DenyRule {
  where: Record<string, string[]>;
}

export interface Policy {
  paths: string[];
  deny?: DenyRule;
  access_level: AccessLevel;
  operations: string[];
}

export interface RoleConfig {
  members?: string[];
  default?: boolean;
}

export interface AccessConfig {
  roles: Record<string, RoleConfig>;
  policies: Record<string, Policy>;
}

/**
 * A node with fields trimmed to what the actor's access level allows.
 * Always a strict subset of SpandrelNode — never has fields the source
 * node didn't have. Returned by AccessPolicy.shapeNode.
 */
export type ShapedNode = Partial<SpandrelNode>;

/**
 * An edge decorated with the link-type description from `/linkTypes/{stem}.md`,
 * trimmed by visibility of its endpoints. Returned by AccessPolicy.shapeEdge.
 */
export interface ShapedEdge {
  from: string;
  to: string;
  type: SpandrelEdge["type"];
  linkType?: string;
  description?: string;
  linkTypeDescription: string | null;
}
