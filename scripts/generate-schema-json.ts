/**
 * Writes `schema.json` at the package root from the TS constant.
 *
 * Runs in the build pipeline (`npm run build`). Single source of truth is
 * `src/compiler/frontmatter-schema.ts`; this script keeps the static JSON
 * file in lockstep so JSON-only consumers can use
 * `node_modules/spandrel/schema.json` directly.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nodeFrontmatterSchema } from "../src/compiler/frontmatter-schema.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(here, "../schema.json");
fs.writeFileSync(outPath, JSON.stringify(nodeFrontmatterSchema, null, 2) + "\n");
console.log(`Wrote ${outPath}`);
