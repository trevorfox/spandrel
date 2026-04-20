export type AccessLevel = "none" | "exists" | "description" | "content" | "traverse";

export interface Actor {
  /**
   * Identity from the transport layer (API key, OAuth subject, ...).
   * `null` represents an anonymous caller — used by `spandrel publish` when
   * stripping non-public nodes for a static bundle, and any other context
   * where no identity has been established.
   */
  identity: string | null;
  role?: string;
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
