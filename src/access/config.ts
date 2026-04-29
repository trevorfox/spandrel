import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { AccessConfig } from "./types.js";

const require = createRequire(import.meta.url);
const yaml = require("js-yaml");

/**
 * Load `_access/config.yaml` from a knowledge-repo root. Returns null when no
 * config file exists or the file is malformed; the policy treats null as
 * "open reads, closed writes" (smart defaults).
 */
export function loadAccessConfig(rootDir: string): AccessConfig | null {
  const configPath = path.join(rootDir, "_access", "config.yaml");
  if (!fs.existsSync(configPath)) return null;

  const raw = fs.readFileSync(configPath, "utf-8");
  const config = yaml.load(raw) as AccessConfig;

  if (!config?.roles || !config?.policies) return null;
  return config;
}
