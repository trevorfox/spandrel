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
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return cloneEmpty();
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
  let minUses = 0;
  if (obj.min_uses !== undefined) {
    if (Number.isInteger(obj.min_uses) && (obj.min_uses as number) >= 0) {
      minUses = obj.min_uses as number;
    } else {
      console.error(
        `[spandrel] min_uses in ${configPath} must be a non-negative integer; got ${JSON.stringify(obj.min_uses)} — defaulting to 0.`
      );
    }
  }

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
