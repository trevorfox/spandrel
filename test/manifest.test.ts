import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { compile } from "../src/compiler/compiler.js";
import { buildManifest } from "../src/compiler/manifest.js";
import { createTempDir, writeIndex } from "./test-helpers.js";

describe("buildManifest", () => {
  let root: string;

  beforeEach(() => {
    root = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns the expected fields for a small graph", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "clients"), {
      name: "Clients",
      description: "Client roster",
    });
    writeIndex(path.join(root, "clients", "acme"), {
      name: "Acme",
      description: "Test client",
    });

    const store = await compile(root);
    const manifest = await buildManifest(store, {
      spandrelVersion: "test-1.2.3",
      generatedAt: "2026-05-03T00:00:00.000Z",
    });

    expect(manifest.spandrelVersion).toBe("test-1.2.3");
    expect(manifest.generatedAt).toBe("2026-05-03T00:00:00.000Z");
    expect(manifest.nodeCount).toBe(3);
    expect(manifest.edgeCount).toBeGreaterThan(0);
    expect(manifest.warningCount).toBe(0);
    expect(manifest.warningsByType).toEqual({});
    expect(manifest.collections).toEqual(["/clients"]);
  });

  it("counts top-level collections", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "clients"), {
      name: "Clients",
      description: "Clients",
    });
    writeIndex(path.join(root, "projects"), {
      name: "Projects",
      description: "Projects",
    });

    const store = await compile(root);
    const manifest = await buildManifest(store, {
      spandrelVersion: "0.6.0",
    });

    expect(manifest.collections).toEqual(["/clients", "/projects"]);
  });

  it("compile throws on lowercase companion files (0.6.0 hard error)", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    fs.writeFileSync(
      path.join(root, "design.md"),
      "---\ndescription: lowercase\n---\n",
    );

    await expect(compile(root)).rejects.toThrow(/deprecated lowercase form/);
  });
});
