import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { LinkRegistry, LinkTypeEntry } from "./types.js";
import { EMPTY_LINK_REGISTRY } from "./types.js";

const require = createRequire(import.meta.url);
const yaml = require("js-yaml");

/**
 * Load `_links/config.yaml` from a knowledge-repo root. Returns an empty
 * registry when the file is absent or unparseable — the compiler treats
 * an empty registry as "no governance, no declared types" (smart default,
 * matches the `_access/config.yaml` posture).
 */
export function loadLinksConfig(rootDir: string): LinkRegistry {
  const configPath = path.join(rootDir, "_links", "config.yaml");
  if (!fs.existsSync(configPath)) return cloneEmpty();

  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf-8");
  } catch (err) {
    console.error(`[spandrel] failed to read ${configPath}:`, err);
    return cloneEmpty();
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    console.error(`[spandrel] malformed YAML in ${configPath}:`, err);
    return cloneEmpty();
  }

  if (!parsed || typeof parsed !== "object") return cloneEmpty();
  const obj = parsed as Record<string, unknown>;

  const enforce = obj.enforce === true;
  const minUses =
    typeof obj.min_uses === "number" && Number.isFinite(obj.min_uses) && obj.min_uses >= 0
      ? Math.floor(obj.min_uses)
      : 0;

  const types = new Map<string, LinkTypeEntry>();
  const typesField = obj.types;
  if (typesField && typeof typesField === "object" && !Array.isArray(typesField)) {
    for (const [stem, entry] of Object.entries(typesField as Record<string, unknown>)) {
      if (typeof stem !== "string" || stem.length === 0) continue;
      const description =
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? (entry as Record<string, unknown>).description
          : undefined;
      types.set(stem, {
        description: typeof description === "string" ? description : undefined,
      });
    }
  }

  return { enforce, minUses, types };
}

function cloneEmpty(): LinkRegistry {
  return {
    enforce: EMPTY_LINK_REGISTRY.enforce,
    minUses: EMPTY_LINK_REGISTRY.minUses,
    types: new Map(),
  };
}
