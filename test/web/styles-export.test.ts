import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Verifies the stable `spandrel/web/styles.css` export ships at a predictable
 * path and contains the concatenated source CSS in the documented load order
 * (tokens → components → base).
 *
 * Pre-req: `npm run build` must have produced dist/web/styles.css. The
 * `build:web-styles` script (scripts/build-web-styles.ts) is responsible for
 * the artifact; this test pins the file path and a few sentinel strings so
 * the public export contract can't silently drift.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const stylesPath = path.resolve(here, "../../dist/web/styles.css");

describe("spandrel/web/styles.css export", () => {
  it("dist/web/styles.css exists after build", () => {
    expect(fs.existsSync(stylesPath)).toBe(true);
  });

  it("contains the generated-file header", () => {
    const css = fs.readFileSync(stylesPath, "utf8");
    expect(css).toContain("spandrel/web/styles.css");
    expect(css).toContain("generated; do not edit");
  });

  it("contains a known token from tokens.css", () => {
    const css = fs.readFileSync(stylesPath, "utf8");
    // Sentinel: --font-serif is declared in tokens.css and is part of the
    // viewer's typography contract.
    expect(css).toContain("--font-serif");
  });

  it("contains a known class from components.css", () => {
    const css = fs.readFileSync(stylesPath, "utf8");
    // Sentinel: .top-bar .breadcrumb is the top-bar component selector.
    expect(css).toContain(".top-bar .breadcrumb");
  });

  it("preserves load order — tokens before components before base", () => {
    const css = fs.readFileSync(stylesPath, "utf8");
    const tokensIdx = css.indexOf("--font-serif");
    const componentsIdx = css.indexOf(".top-bar .breadcrumb");
    // base.css has the universal box-sizing reset
    const baseIdx = css.indexOf("box-sizing: border-box");
    expect(tokensIdx).toBeGreaterThan(-1);
    expect(componentsIdx).toBeGreaterThan(tokensIdx);
    expect(baseIdx).toBeGreaterThan(componentsIdx);
  });
});
