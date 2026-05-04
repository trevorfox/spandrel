// Regression: the viewer's stylesheets must use cascade layers so hosts
// embedding the viewer can override visual rules from outside any layer
// (or from a later layer) without fighting specificity. Layered rules lose
// to unlayered rules at any specificity, which is the property we rely on.
//
// This test asserts the structural setup, not specificity outcomes:
//   - components.css declares the layer order (spandrel-base, spandrel-components)
//   - components.css wraps its rules in @layer spandrel-components
//   - base.css wraps its rules in @layer spandrel-base
//
// If any author edits these files and breaks the wrap, hosts silently lose
// override priority. The test catches that at build time.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STYLES_DIR = path.resolve(__dirname, "../../src/web/app/styles");

function read(file: string): string {
  return fs.readFileSync(path.join(STYLES_DIR, file), "utf8");
}

describe("viewer stylesheet cascade-layer setup", () => {
  it("components.css declares the layer order", () => {
    const src = read("components.css");
    expect(src).toMatch(/@layer\s+spandrel-base\s*,\s*spandrel-components\s*;/);
  });

  it("components.css wraps content in @layer spandrel-components", () => {
    const src = read("components.css");
    // Find the wrapping block start.
    const open = src.match(/@layer\s+spandrel-components\s*\{/);
    expect(open).not.toBeNull();
    // Confirm at least one component selector lives inside the layer block.
    const afterLayer = src.slice((open?.index ?? 0) + (open?.[0].length ?? 0));
    expect(afterLayer).toMatch(/\.top-bar\b/);
    expect(afterLayer).toMatch(/\.tree-rail\b/);
  });

  it("base.css wraps content in @layer spandrel-base", () => {
    const src = read("base.css");
    expect(src).toMatch(/@layer\s+spandrel-base\s*\{/);
    // Confirm at least one base selector lives inside the layer.
    const open = src.match(/@layer\s+spandrel-base\s*\{/);
    const afterLayer = src.slice((open?.index ?? 0) + (open?.[0].length ?? 0));
    expect(afterLayer).toMatch(/\bbody\b|\bbutton\b/);
  });

  it("components.css does not use :where() (we rely on layer order, not zero specificity)", () => {
    const src = read("components.css");
    expect(src.includes(":where(")).toBe(false);
  });
});
