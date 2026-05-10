import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import matter from "gray-matter";
import { scaffoldInit, BASELINE_LINK_TYPES } from "../src/cli-init.js";
import { compile } from "../src/compiler/compiler.js";

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "spandrel-init-"));
}

function rmrf(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe("spandrel init — scaffold", () => {
  let root: string;

  beforeEach(() => {
    root = createTempDir();
  });

  afterEach(() => {
    rmrf(root);
  });

  it("writes root index.md with name + description from options", () => {
    const result = scaffoldInit(root, {
      name: "Acme KG",
      description: "All Acme knowledge",
    });

    expect(result.alreadyInitialized).toBe(false);
    expect(result.filesWritten).toContain("index.md");

    const raw = fs.readFileSync(path.join(root, "index.md"), "utf-8");
    const parsed = matter(raw);
    expect(parsed.data.name).toBe("Acme KG");
    expect(parsed.data.description).toBe("All Acme knowledge");
    expect(parsed.content.trim()).toBe("");
  });

  it("writes .gitignore with the standard entries", () => {
    scaffoldInit(root, { name: "x", description: "y" });
    const gi = fs.readFileSync(path.join(root, ".gitignore"), "utf-8");
    expect(gi).toContain("node_modules/");
    expect(gi).toContain("dist/");
    expect(gi).toContain(".env*");
    expect(gi).toContain(".DS_Store");
  });

  it("writes _links/config.yaml with the baseline link-type vocabulary", () => {
    scaffoldInit(root, { name: "x", description: "y" });
    const yamlPath = path.join(root, "_links/config.yaml");
    expect(fs.existsSync(yamlPath)).toBe(true);
    const body = fs.readFileSync(yamlPath, "utf-8");
    expect(body).toContain("enforce: false");
    expect(body).toContain("min_uses: 0");
    for (const lt of BASELINE_LINK_TYPES) {
      expect(body).toContain(`  ${lt.stem}:`);
    }
  });

  it("does not scaffold a /linkTypes/ Things collection (removed in 0.9)", () => {
    scaffoldInit(root, { name: "x", description: "y" });
    expect(fs.existsSync(path.join(root, "linkTypes"))).toBe(false);
  });

  it("seeds exactly 10 baseline link types", () => {
    expect(BASELINE_LINK_TYPES).toHaveLength(10);
    const stems = new Set(BASELINE_LINK_TYPES.map((t) => t.stem));
    expect(stems.size).toBe(10);
    for (const required of [
      "owns",
      "depends-on",
      "part-of",
      "mentions",
      "supersedes",
      "derived-from",
      "cites",
      "instance-of",
      "authored-by",
      "relates-to",
    ]) {
      expect(stems.has(required)).toBe(true);
    }
  });

  it("scaffolds a GitHub Pages publish workflow", () => {
    const result = scaffoldInit(root, { name: "x", description: "y" });
    expect(result.filesWritten).toContain(".github/workflows/publish.yml");

    const yml = fs.readFileSync(
      path.join(root, ".github/workflows/publish.yml"),
      "utf-8"
    );
    expect(yml).toContain("npm install -g spandrel");
    expect(yml).toContain("spandrel publish");
    expect(yml).toContain("actions/upload-pages-artifact@v3");
    expect(yml).toContain("actions/deploy-pages@v4");
    expect(yml).toContain("--base");
  });

  it("scaffolds an empty CNAME placeholder at the graph root", () => {
    const result = scaffoldInit(root, { name: "x", description: "y" });
    expect(result.filesWritten).toContain("CNAME");
    const cnamePath = path.join(root, "CNAME");
    expect(fs.existsSync(cnamePath)).toBe(true);
    expect(fs.statSync(cnamePath).size).toBe(0);
  });
});

describe("spandrel init — idempotency", () => {
  let root: string;

  beforeEach(() => {
    root = createTempDir();
  });

  afterEach(() => {
    rmrf(root);
  });

  it("returns alreadyInitialized without touching anything when index.md exists", () => {
    const existing = "---\nname: Existing\ndescription: Preserved\n---\n\nHand-written body.\n";
    fs.writeFileSync(path.join(root, "index.md"), existing);

    const result = scaffoldInit(root, { name: "Different", description: "Different" });

    expect(result.alreadyInitialized).toBe(true);
    expect(result.filesWritten).toEqual([]);

    // Existing file is untouched
    expect(fs.readFileSync(path.join(root, "index.md"), "utf-8")).toBe(existing);

    // No files were scaffolded (linkTypes/ and _links/ both absent)
    expect(fs.existsSync(path.join(root, "linkTypes"))).toBe(false);
    expect(fs.existsSync(path.join(root, "_links"))).toBe(false);
  });
});

describe("spandrel init — compilability", () => {
  let root: string;

  beforeEach(() => {
    root = createTempDir();
  });

  afterEach(() => {
    rmrf(root);
  });

  it("produces a graph that compiles cleanly: 1 node, no warnings, 10 linkTypes", async () => {
    scaffoldInit(root, {
      name: "Test Graph",
      description: "A graph for verifying init output",
    });

    const store = await compile(root);
    const nodes = await store.getAllNodes();
    const warnings = await store.getWarnings();
    const linkTypes = await store.getLinkTypes();

    expect(warnings).toHaveLength(0);
    // After init, only the root index node exists (linkTypes/ was removed)
    expect(nodes).toHaveLength(1);
    // Registry has 10 baseline types
    expect(linkTypes.size).toBe(10);
  });
});
