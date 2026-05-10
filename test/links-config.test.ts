import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadLinksConfig } from "../src/links/config.js";

function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "spandrel-links-"));
}

describe("loadLinksConfig", () => {
  it("returns an empty registry when no _links/config.yaml exists", () => {
    const root = tempRoot();
    const reg = loadLinksConfig(root);
    expect(reg.enforce).toBe(false);
    expect(reg.minUses).toBe(0);
    expect(reg.types.size).toBe(0);
  });

  it("loads a minimal registry with one type", () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, "_links"));
    fs.writeFileSync(
      path.join(root, "_links/config.yaml"),
      `types:\n  realized-by:\n    description: Target implements the source.\n`
    );
    const reg = loadLinksConfig(root);
    expect(reg.types.size).toBe(1);
    expect(reg.types.get("realized-by")?.description).toBe(
      "Target implements the source."
    );
  });

  it("reads enforce and min_uses governance knobs", () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, "_links"));
    fs.writeFileSync(
      path.join(root, "_links/config.yaml"),
      `enforce: true\nmin_uses: 2\ntypes:\n  affects:\n    description: x\n`
    );
    const reg = loadLinksConfig(root);
    expect(reg.enforce).toBe(true);
    expect(reg.minUses).toBe(2);
  });

  it("supports types without descriptions (description is optional)", () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, "_links"));
    fs.writeFileSync(
      path.join(root, "_links/config.yaml"),
      `types:\n  owns: {}\n  depends-on: {}\n`
    );
    const reg = loadLinksConfig(root);
    expect(reg.types.size).toBe(2);
    expect(reg.types.get("owns")?.description).toBeUndefined();
  });

  it("returns an empty registry on malformed YAML, not a crash", () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, "_links"));
    fs.writeFileSync(
      path.join(root, "_links/config.yaml"),
      `types:\n  realized-by:\n    description: : : :\n  - this is invalid\n`
    );
    // Capture console output so the test doesn't print noise
    const errs: unknown[] = [];
    const origErr = console.error;
    console.error = (...a: unknown[]) => errs.push(a);
    try {
      const reg = loadLinksConfig(root);
      expect(reg.types.size).toBe(0);
      expect(reg.enforce).toBe(false);
    } finally {
      console.error = origErr;
    }
  });

  it("ignores top-level keys other than enforce, min_uses, types", () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, "_links"));
    fs.writeFileSync(
      path.join(root, "_links/config.yaml"),
      `enforce: false\nfoo: bar\ntypes:\n  owns: {}\n`
    );
    const reg = loadLinksConfig(root);
    expect(reg.types.size).toBe(1);
    expect(reg.enforce).toBe(false);
  });

  it("rejects non-integer or negative min_uses with a warning, defaults to 0", () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, "_links"));
    fs.writeFileSync(
      path.join(root, "_links/config.yaml"),
      `min_uses: 2.9\ntypes: {}\n`
    );
    const errs: unknown[] = [];
    const origErr = console.error;
    console.error = (...a: unknown[]) => errs.push(a);
    try {
      const reg = loadLinksConfig(root);
      expect(reg.minUses).toBe(0);
      expect(errs.length).toBeGreaterThan(0);
    } finally {
      console.error = origErr;
    }
  });
});
