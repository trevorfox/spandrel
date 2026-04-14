export type AccessLevel = "none" | "exists" | "description" | "content" | "traverse";

export interface Actor {
  identity: string;
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
