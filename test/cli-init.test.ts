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

  it("writes linkTypes/index.md as a composite landing page", () => {
    scaffoldInit(root, { name: "x", description: "y" });
    const raw = fs.readFileSync(path.join(root, "linkTypes/index.md"), "utf-8");
    const parsed = matter(raw);
    expect(parsed.data.name).toBe("Link Types");
    expect(parsed.data.description).toBeTruthy();
    // Every baseline stem should be mentioned somewhere in the landing page
    // so the compiler does not emit unlisted_child warnings.
    for (const lt of BASELINE_LINK_TYPES) {
      expect(raw).toContain(lt.stem);
    }
  });

  it("writes one leaf .md per baseline link type, each with name + description", () => {
    scaffoldInit(root, { name: "x", description: "y" });
    for (const lt of BASELINE_LINK_TYPES) {
      const filePath = path.join(root, "linkTypes", `${lt.stem}.md`);
      expect(fs.existsSync(filePath)).toBe(true);
      const parsed = matter(fs.readFileSync(filePath, "utf-8"));
      expect(parsed.data.name).toBe(lt.name);
      expect(typeof parsed.data.description).toBe("string");
      expect((parsed.data.description as string).length).toBeGreaterThan(40);
    }
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

    // No linkTypes collection was scaffolded
    expect(fs.existsSync(path.join(root, "linkTypes"))).toBe(false);
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

  it("produces a graph that compiles cleanly: 12 nodes, no warnings, 10 linkTypes", async () => {
    scaffoldInit(root, {
      name: "Test Graph",
      description: "A graph for verifying init output",
    });

    const store = await compile(root);
    const nodes = await store.getAllNodes();
    const warnings = await store.getWarnings();
    const linkTypes = await store.getLinkTypes();

    expect(nodes).toHaveLength(12); // root + linkTypes landing + 10 leaves
    expect(warnings).toEqual([]);
    expect(linkTypes.size).toBe(10);

    for (const lt of BASELINE_LINK_TYPES) {
      const info = linkTypes.get(lt.stem);
      expect(info).toBeDefined();
      expect(info!.name).toBe(lt.name);
      expect(info!.description).toBe(lt.description);
    }
  });
});
