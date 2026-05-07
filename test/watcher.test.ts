import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { compile } from "../src/compiler/compiler.js";
import { watchTree } from "../src/compiler/watcher.js";

function writeIndex(dir: string, name: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "index.md"),
    `---\nname: ${name}\ndescription: ${name}\n---\n`,
  );
}

function writeLeaf(filePath: string, name: string): void {
  fs.writeFileSync(
    filePath,
    `---\nname: ${name}\ndescription: ${name}\n---\n`,
  );
}

describe("Watcher — concurrent change handling", () => {
  let root: string;
  let watcher: ReturnType<typeof watchTree> | null = null;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "spandrel-watcher-"));
  });

  afterEach(async () => {
    if (watcher) {
      await watcher.close();
      watcher = null;
    }
    fs.rmSync(root, { recursive: true, force: true });
  });

  // Regression for the multi-delete race: chokidar fires `unlink` for each
  // deleted file and the watcher used to invoke `recompileNode` concurrently
  // for each. Each call did read-filter-write on the store's edge list, so
  // the second write clobbered the first's deletion and a stale hierarchy
  // edge survived. Symptom in the dev viewer: rail showed a "deleted" node
  // that no longer existed.
  it("two concurrent unlinks both fully remove their hierarchy edges", async () => {
    writeIndex(root, "Root");
    writeIndex(path.join(root, "patterns"), "Patterns");
    writeLeaf(path.join(root, "patterns", "a.md"), "A");
    writeLeaf(path.join(root, "patterns", "b.md"), "B");

    const store = await compile(root);
    expect(await store.hasNode("/patterns/a")).toBe(true);
    expect(await store.hasNode("/patterns/b")).toBe(true);

    let observed = 0;
    watcher = watchTree(root, store, () => {
      observed += 1;
    });

    // Wait for chokidar to be ready before mutating the tree, otherwise the
    // unlink events can be missed entirely on some platforms.
    await new Promise<void>((resolve) => watcher!.on("ready", () => resolve()));

    fs.unlinkSync(path.join(root, "patterns", "a.md"));
    fs.unlinkSync(path.join(root, "patterns", "b.md"));

    // Poll until both events have been processed and the store has settled.
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (observed >= 2 && !(await store.hasNode("/patterns/a")) && !(await store.hasNode("/patterns/b"))) {
        break;
      }
      await new Promise((r) => setTimeout(r, 25));
    }

    expect(await store.hasNode("/patterns/a")).toBe(false);
    expect(await store.hasNode("/patterns/b")).toBe(false);

    // The bug surfaced as a stale hierarchy edge whose `to` pointed at a
    // node that had just been deleted. After the fix, /patterns has no
    // children left.
    const hierarchy = await store.getEdges({ type: "hierarchy", from: "/patterns" });
    expect(hierarchy.map((e) => e.to)).toEqual([]);
  });
});
