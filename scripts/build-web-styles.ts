/**
 * Concatenates the viewer's source CSS files into a single stable artifact at
 * `dist/web/styles.css`, exported as `spandrel/web/styles.css`.
 *
 * Why concatenation, not a second Vite build:
 *   The Vite SPA build (`npm run build:web`) emits the viewer JS plus a hashed
 *   CSS file under `dist/web/assets/`. Consumers embedding the viewer via
 *   `mountViewer()` need a predictable path to import the styles — a hashed
 *   filename is unusable as a public export. The CSS is hand-authored, static,
 *   and ordered (tokens → components → base); concatenating at build time is
 *   simpler, faster, and deterministic, with no second bundler invocation to
 *   maintain. If we ever add CSS preprocessing, swap this for a real bundle
 *   step — the export path stays stable.
 *
 * Load order matches `src/web/app/index.html`:
 *   1. tokens.css     — design tokens (CSS custom properties under [data-theme])
 *   2. components.css — per-component visual rules
 *   3. base.css       — reset + element defaults
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const stylesDir = path.resolve(here, "../src/web/app/styles");
const outDir = path.resolve(here, "../dist/web");
const outPath = path.join(outDir, "styles.css");

const files = ["tokens.css", "components.css", "base.css"];

const header = "/* spandrel/web/styles.css — generated; do not edit */\n";

const parts = files.map((name) => {
  const full = path.join(stylesDir, name);
  const body = fs.readFileSync(full, "utf8");
  return `/* ---- ${name} ---- */\n${body}`;
});

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, header + parts.join("\n") + "\n");
console.log(`Wrote ${outPath}`);
