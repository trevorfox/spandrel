import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { SpandrelNode } from "../compiler/types.js";
import type {
  AccessLevel,
  AccessConfig,
  Actor,
  Policy,
} from "./types.js";

const require = createRequire(import.meta.url);
const yaml = require("js-yaml");

/**
 * Returns null if no config file exists (open access mode).
 */
export function loadAccessConfig(rootDir: string): AccessConfig | null {
  const configPath = path.join(rootDir, "_access", "config.yaml");
  if (!fs.existsSync(configPath)) return null;

  const raw = fs.readFileSync(configPath, "utf-8");
  const config = yaml.load(raw) as AccessConfig;

  if (!config?.roles || !config?.policies) return null;
  return config;
}

export function resolveRole(config: AccessConfig, identity: string): string {
  for (const [roleName, roleConfig] of Object.entries(config.roles)) {
    if (roleConfig.members?.includes(identity)) {
      return roleName;
    }
  }

  for (const [roleName, roleConfig] of Object.entries(config.roles)) {
    if (roleConfig.default) {
      return roleName;
    }
  }

  return "public";
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

function resolvePolicy(
  config: AccessConfig,
  actor: Actor,
  nodePath: string
): Policy | null {
  const role = actor.role ?? resolveRole(config, actor.identity);
  const policy = config.policies[role];
  if (!policy) return null;
  const pathAllowed = policy.paths.some((p) => pathMatchesPattern(nodePath, p));
  if (!pathAllowed) return null;
  return policy;
}

/**
 * Returns "traverse" when config is null (open access).
 */
export function canAccess(
  config: AccessConfig | null,
  actor: Actor,
  nodePath: string,
  metadata: Record<string, unknown> = {}
): AccessLevel {
  if (!config) return "traverse";

  const policy = resolvePolicy(config, actor, nodePath);
  if (!policy) return "none";

  if (policy.deny && matchesDenyRule(metadata, policy.deny)) {
    return "none";
  }

  return policy.access_level;
}

export function canWrite(
  config: AccessConfig | null,
  actor: Actor,
  nodePath: string
): boolean {
  if (!config) return true;

  const policy = resolvePolicy(config, actor, nodePath);
  if (!policy) return false;

  return policy.operations.includes("write") || policy.operations.includes("admin");
}

const ACCESS_LEVEL_ORDER: AccessLevel[] = ["none", "exists", "description", "content", "traverse"];

export function accessLevelAtLeast(level: AccessLevel, minimum: AccessLevel): boolean {
  return ACCESS_LEVEL_ORDER.indexOf(level) >= ACCESS_LEVEL_ORDER.indexOf(minimum);
}

export function filterNodeFields(
  node: SpandrelNode,
  level: AccessLevel
): Partial<SpandrelNode> | null {
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
