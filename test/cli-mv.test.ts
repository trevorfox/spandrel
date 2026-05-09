import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import matter from "gray-matter";
import { runMv } from "../src/cli-mv.js";

function tmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spandrel-cli-mv-"));
  fs.writeFileSync(
    path.join(dir, "index.md"),
    "---\nname: R\ndescription: r\n---\n",
  );
  fs.writeFileSync(
    path.join(dir, "old.md"),
    "---\nname: Old\ndescription: o\n---\n",
  );
  fs.writeFileSync(
    path.join(dir, "ref.md"),
    "---\nname: Ref\ndescription: r\nlinks:\n  - to: /old\n---\n",
  );
  return dir;
}

function rmrf(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe("runMv — --yes applies the move", () => {
  let root: string;

  beforeEach(() => {
    root = tmpRepo();
  });

  afterEach(() => {
    rmrf(root);
  });

  it("renames the file and rewrites referrers, returns 0", async () => {
    const code = await runMv({ rootDir: root, from: "/old", to: "/new", yes: true });

    expect(code).toBe(0);

    // Source file gone, destination file present.
    expect(fs.existsSync(path.join(root, "old.md"))).toBe(false);
    expect(fs.existsSync(path.join(root, "new.md"))).toBe(true);

    // ref.md link was rewritten from /old → /new.
    const raw = fs.readFileSync(path.join(root, "ref.md"), "utf-8");
    const parsed = matter(raw);
    const links = parsed.data.links as Array<{ to: string }>;
    expect(links).toHaveLength(1);
    expect(links[0].to).toBe("/new");
  });
});

describe("runMv — --dry-run leaves files unchanged", () => {
  let root: string;

  beforeEach(() => {
    root = tmpRepo();
  });

  afterEach(() => {
    rmrf(root);
  });

  it("does not touch the filesystem, returns 0", async () => {
    const code = await runMv({ rootDir: root, from: "/old", to: "/new", dryRun: true });

    expect(code).toBe(0);

    // Source still exists, destination does not.
    expect(fs.existsSync(path.join(root, "old.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "new.md"))).toBe(false);

    // ref.md is unmodified.
    const raw = fs.readFileSync(path.join(root, "ref.md"), "utf-8");
    const parsed = matter(raw);
    const links = parsed.data.links as Array<{ to: string }>;
    expect(links[0].to).toBe("/old");
  });
});

describe("runMv — danglingMentions printed to stderr when inline prose mentions exist", () => {
  let root: string;
  let stderrLines: string[];

  beforeEach(() => {
    root = tmpRepo();
    // Add a node whose body contains an inline prose mention of /old.
    fs.writeFileSync(
      path.join(root, "prose.md"),
      "---\nname: Prose\ndescription: p\n---\nSee [old](/old) for context.\n",
    );
    stderrLines = [];
    const orig = console.error;
    // Capture stderr output lines during runMv.
    (console as unknown as { _origError: typeof console.error })._origError = orig;
    (console.error as unknown) = (...args: unknown[]) => {
      stderrLines.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    rmrf(root);
    const orig = (console as unknown as { _origError: typeof console.error })._origError;
    if (orig) console.error = orig;
  });

  it("prints inline-mention warning lines when --dry-run", async () => {
    const code = await runMv({ rootDir: root, from: "/old", to: "/new", dryRun: true });

    expect(code).toBe(0);
    const output = stderrLines.join("\n");
    expect(output).toContain("Inline mentions (not auto-rewritten):");
    expect(output).toContain("/prose");
  });
});

describe("runMv — no --yes and no --dry-run requires confirmation", () => {
  let root: string;

  beforeEach(() => {
    root = tmpRepo();
  });

  afterEach(() => {
    rmrf(root);
  });

  it("leaves files unchanged and returns 2", async () => {
    const code = await runMv({ rootDir: root, from: "/old", to: "/new" });

    expect(code).toBe(2);

    // Nothing was moved.
    expect(fs.existsSync(path.join(root, "old.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "new.md"))).toBe(false);
  });
});
