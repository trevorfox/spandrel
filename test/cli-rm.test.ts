import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import matter from "gray-matter";
import { runRm } from "../src/cli-rm.js";

function tmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spandrel-cli-rm-"));
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

describe("runRm — refuses without --cascade when referrers exist", () => {
  let root: string;

  beforeEach(() => {
    root = tmpRepo();
  });

  afterEach(() => {
    rmrf(root);
  });

  it("returns non-zero exit code and leaves file intact", async () => {
    const code = await runRm({ rootDir: root, path: "/old" });

    expect(code).not.toBe(0);

    // File must still be there.
    expect(fs.existsSync(path.join(root, "old.md"))).toBe(true);

    // Referrer must be unmodified.
    const raw = fs.readFileSync(path.join(root, "ref.md"), "utf-8");
    const parsed = matter(raw);
    const links = parsed.data.links as Array<{ to: string }>;
    expect(links).toHaveLength(1);
    expect(links[0].to).toBe("/old");
  });
});

describe("runRm — --cascade --yes deletes file and rewrites referrers", () => {
  let root: string;

  beforeEach(() => {
    root = tmpRepo();
  });

  afterEach(() => {
    rmrf(root);
  });

  it("returns 0, removes file, strips dead link from referrer", async () => {
    const code = await runRm({ rootDir: root, path: "/old", cascade: true, yes: true });

    expect(code).toBe(0);

    // Target file must be gone.
    expect(fs.existsSync(path.join(root, "old.md"))).toBe(false);

    // ref.md's dead link entry must be removed.
    const raw = fs.readFileSync(path.join(root, "ref.md"), "utf-8");
    const parsed = matter(raw);
    const links = (parsed.data.links ?? []) as Array<{ to: string }>;
    expect(links.every((l) => l.to !== "/old")).toBe(true);
  });
});

describe("runRm — --dry-run leaves FS unchanged", () => {
  let root: string;

  beforeEach(() => {
    root = tmpRepo();
  });

  afterEach(() => {
    rmrf(root);
  });

  it("returns 0 and makes no filesystem changes", async () => {
    const code = await runRm({ rootDir: root, path: "/old", cascade: true, dryRun: true });

    expect(code).toBe(0);

    // File still present.
    expect(fs.existsSync(path.join(root, "old.md"))).toBe(true);

    // Referrer unmodified.
    const raw = fs.readFileSync(path.join(root, "ref.md"), "utf-8");
    const parsed = matter(raw);
    const links = parsed.data.links as Array<{ to: string }>;
    expect(links[0].to).toBe("/old");
  });
});
