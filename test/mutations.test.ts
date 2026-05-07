import { describe, expect, it } from "vitest";
import type { MoveResult, EditList } from "../src/server/mutations.js";

describe("mutations module exports", () => {
  it("exports MoveResult type", () => {
    const r: MoveResult = {
      written: [],
      deleted: [],
      referrersRewritten: [],
      danglingMentions: [],
    };
    expect(r.written).toEqual([]);
  });

  it("exports EditList type", () => {
    const e: EditList = {
      moves: [],
      deletes: [],
      rewrites: [],
      danglingMentions: [],
    };
    expect(e.moves).toEqual([]);
  });
});

import { findReferrers } from "../src/server/mutations.js";
import type { SpandrelGraph } from "../src/compiler/types.js";

function makeGraph(): SpandrelGraph {
  return {
    nodes: new Map([
      ["/a", {
        path: "/a", name: "A", description: "", nodeType: "leaf",
        depth: 1, parent: "/", children: [], content: "",
        frontmatter: { links: [{ to: "/target" }] },
        created: null, updated: null, author: null,
      }],
      ["/b", {
        path: "/b", name: "B", description: "", nodeType: "leaf",
        depth: 1, parent: "/", children: [], content: "",
        frontmatter: { links: [{ to: "/target/child" }, { to: "/other" }] },
        created: null, updated: null, author: null,
      }],
      ["/c", {
        path: "/c", name: "C", description: "", nodeType: "leaf",
        depth: 1, parent: "/", children: [], content: "",
        frontmatter: { links: [{ to: "/elsewhere" }] },
        created: null, updated: null, author: null,
      }],
    ]),
    edges: [],
    warnings: [],
    linkTypes: new Map(),
  };
}

describe("findReferrers", () => {
  it("finds nodes with links matching the exact path", () => {
    const refs = findReferrers(makeGraph(), "/target");
    expect(refs.map(r => r.node.path)).toContain("/a");
  });

  it("finds nodes with links to descendants when prefix=true", () => {
    const refs = findReferrers(makeGraph(), "/target", { prefix: true });
    const paths = refs.map(r => r.node.path);
    expect(paths).toContain("/a");
    expect(paths).toContain("/b");
  });

  it("excludes descendants when prefix=false", () => {
    const refs = findReferrers(makeGraph(), "/target", { prefix: false });
    expect(refs.map(r => r.node.path)).toEqual(["/a"]);
  });

  it("returns the matched link entries per referrer", () => {
    const refs = findReferrers(makeGraph(), "/target", { prefix: true });
    const b = refs.find(r => r.node.path === "/b");
    expect(b?.matchedLinks).toEqual([{ to: "/target/child" }]);
  });
});

import { rewriteLinkTarget } from "../src/server/mutations.js";

describe("rewriteLinkTarget", () => {
  it("rewrites exact match", () => {
    expect(rewriteLinkTarget("/old", "/old", "/new")).toBe("/new");
  });

  it("rewrites prefix match (descendant)", () => {
    expect(rewriteLinkTarget("/old/child", "/old", "/new")).toBe("/new/child");
  });

  it("preserves trailing path segments on prefix rewrite", () => {
    expect(rewriteLinkTarget("/old/a/b", "/old", "/new")).toBe("/new/a/b");
  });

  it("returns null when neither exact nor prefix match", () => {
    expect(rewriteLinkTarget("/elsewhere", "/old", "/new")).toBe(null);
  });

  it("does not match a sibling that shares a path prefix string", () => {
    // /oldname is not a descendant of /old
    expect(rewriteLinkTarget("/oldname", "/old", "/new")).toBe(null);
  });
});

import { buildEditList } from "../src/server/mutations.js";
import path from "node:path";

function leafGraph(rootDir: string): SpandrelGraph {
  return {
    nodes: new Map([
      ["/", {
        path: "/", name: "Root", description: "", nodeType: "composite",
        depth: 0, parent: null, children: ["/old", "/ref"], content: "",
        frontmatter: {}, created: null, updated: null, author: null,
      }],
      ["/old", {
        path: "/old", name: "Old", description: "", nodeType: "leaf",
        depth: 1, parent: "/", children: [], content: "",
        frontmatter: {}, created: null, updated: null, author: null,
      }],
      ["/ref", {
        path: "/ref", name: "Ref", description: "", nodeType: "leaf",
        depth: 1, parent: "/", children: [], content: "",
        frontmatter: { links: [{ to: "/old", description: "important edge" }] },
        created: null, updated: null, author: null,
      }],
    ]),
    edges: [], warnings: [], linkTypes: new Map(),
  };
}

describe("buildEditList — leaf moves", () => {
  it("emits a single file move for a leaf", () => {
    const root = "/tmp/spandrel-test";
    const edits = buildEditList(root, "/old", "/new", leafGraph(root), "move");
    expect(edits.moves).toEqual([{
      fromFile: path.join(root, "old.md"),
      toFile: path.join(root, "new.md"),
      isDirectory: false,
    }]);
  });

  it("emits a frontmatter rewrite for each referrer", () => {
    const root = "/tmp/spandrel-test";
    const edits = buildEditList(root, "/old", "/new", leafGraph(root), "move");
    expect(edits.rewrites).toEqual([{
      file: path.join(root, "ref.md"),
      fromPath: "/old",
      toPath: "/new",
      prefix: false,
    }]);
  });

  it("emits no deletes for a move", () => {
    const root = "/tmp/spandrel-test";
    const edits = buildEditList(root, "/old", "/new", leafGraph(root), "move");
    expect(edits.deletes).toEqual([]);
  });
});

import { findDanglingMentions } from "../src/server/mutations.js";

describe("findDanglingMentions", () => {
  it("finds inline markdown links to the target path", () => {
    const graph: SpandrelGraph = {
      nodes: new Map([
        ["/a", {
          path: "/a", name: "A", description: "", nodeType: "leaf",
          depth: 1, parent: "/", children: [], content: "see [acme](/clients/acme) for more",
          frontmatter: {}, created: null, updated: null, author: null,
        }],
      ]),
      edges: [], warnings: [], linkTypes: new Map(),
    };
    expect(findDanglingMentions(graph, "/clients/acme", { prefix: true }))
      .toEqual([{ in: "/a", to: "/clients/acme" }]);
  });

  it("finds prefix matches (descendant paths) when prefix=true", () => {
    const graph: SpandrelGraph = {
      nodes: new Map([
        ["/a", {
          path: "/a", name: "A", description: "", nodeType: "leaf",
          depth: 1, parent: "/", children: [], content: "see [team](/clients/acme/team)",
          frontmatter: {}, created: null, updated: null, author: null,
        }],
      ]),
      edges: [], warnings: [], linkTypes: new Map(),
    };
    expect(findDanglingMentions(graph, "/clients/acme", { prefix: true }))
      .toEqual([{ in: "/a", to: "/clients/acme/team" }]);
  });

  it("does not flag mentions inside fenced code blocks", () => {
    const graph: SpandrelGraph = {
      nodes: new Map([
        ["/a", {
          path: "/a", name: "A", description: "", nodeType: "leaf",
          depth: 1, parent: "/", children: [], content: "```\n[example](/clients/acme)\n```",
          frontmatter: {}, created: null, updated: null, author: null,
        }],
      ]),
      edges: [], warnings: [], linkTypes: new Map(),
    };
    expect(findDanglingMentions(graph, "/clients/acme", { prefix: true })).toEqual([]);
  });
});

function compositeGraph(): SpandrelGraph {
  return {
    nodes: new Map([
      ["/", {
        path: "/", name: "Root", description: "", nodeType: "composite",
        depth: 0, parent: null, children: ["/old", "/ref"], content: "",
        frontmatter: {}, created: null, updated: null, author: null,
      }],
      ["/old", {
        path: "/old", name: "Old", description: "", nodeType: "composite",
        depth: 1, parent: "/", children: ["/old/child"], content: "",
        frontmatter: {}, created: null, updated: null, author: null,
      }],
      ["/old/child", {
        path: "/old/child", name: "Child", description: "", nodeType: "leaf",
        depth: 2, parent: "/old", children: [], content: "",
        frontmatter: {}, created: null, updated: null, author: null,
      }],
      ["/ref", {
        path: "/ref", name: "Ref", description: "", nodeType: "leaf",
        depth: 1, parent: "/", children: [], content: "",
        frontmatter: { links: [{ to: "/old/child" }, { to: "/old" }] },
        created: null, updated: null, author: null,
      }],
    ]),
    edges: [], warnings: [], linkTypes: new Map(),
  };
}

describe("buildEditList — composite moves", () => {
  it("emits a single directory move for a composite source", () => {
    const root = "/tmp/spandrel-test";
    const edits = buildEditList(root, "/old", "/new", compositeGraph(), "move");
    expect(edits.moves).toEqual([{
      fromFile: path.join(root, "old"),
      toFile: path.join(root, "new"),
      isDirectory: true,
    }]);
  });

  it("rewrites referrers to descendants too (prefix=true)", () => {
    const root = "/tmp/spandrel-test";
    const edits = buildEditList(root, "/old", "/new", compositeGraph(), "move");
    expect(edits.rewrites.length).toBe(1);
    expect(edits.rewrites[0]).toMatchObject({
      file: path.join(root, "ref.md"),
      fromPath: "/old",
      toPath: "/new",
      prefix: true,
    });
  });
});

import { applyEdits } from "../src/server/mutations.js";
import fs from "node:fs";
import os from "node:os";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "spandrel-mut-"));
}

describe("applyEdits", () => {
  it("rewrites referrer frontmatter then moves the source file", () => {
    const root = tmpDir();
    fs.writeFileSync(path.join(root, "old.md"), "---\nname: Old\ndescription: o\n---\n");
    fs.writeFileSync(
      path.join(root, "ref.md"),
      "---\nname: Ref\ndescription: r\nlinks:\n  - to: /old\n---\nbody\n",
    );

    const result = applyEdits({
      moves: [{
        fromFile: path.join(root, "old.md"),
        toFile: path.join(root, "new.md"),
        isDirectory: false,
      }],
      deletes: [],
      rewrites: [{
        file: path.join(root, "ref.md"),
        fromPath: "/old",
        toPath: "/new",
        prefix: false,
      }],
      danglingMentions: [],
    }, "move");

    expect(result.written).toEqual([path.join(root, "ref.md")]);
    expect(fs.existsSync(path.join(root, "new.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "old.md"))).toBe(false);
    const ref = fs.readFileSync(path.join(root, "ref.md"), "utf-8");
    expect(ref).toContain("to: /new");
    expect(ref).not.toContain("to: /old");

    fs.rmSync(root, { recursive: true });
  });

  it("removes link entries entirely on a delete cascade", () => {
    const root = tmpDir();
    fs.writeFileSync(path.join(root, "old.md"), "---\nname: Old\ndescription: o\n---\n");
    fs.writeFileSync(
      path.join(root, "ref.md"),
      "---\nname: Ref\ndescription: r\nlinks:\n  - to: /old\n  - to: /keep\n---\n",
    );

    applyEdits({
      moves: [],
      deletes: [{ file: path.join(root, "old.md"), isDirectory: false }],
      rewrites: [{
        file: path.join(root, "ref.md"),
        fromPath: "/old",
        toPath: "",
        prefix: false,
      }],
      danglingMentions: [],
    }, "delete");

    const ref = fs.readFileSync(path.join(root, "ref.md"), "utf-8");
    expect(ref).not.toContain("to: /old");
    expect(ref).toContain("to: /keep");

    fs.rmSync(root, { recursive: true });
  });
});

import { validateMove } from "../src/server/mutations.js";

describe("validateMove", () => {
  it("rejects moving the root", () => {
    expect(() => validateMove("/", "/new", leafGraph("/tmp/x"))).toThrow(/cannot move root/i);
  });

  it("rejects when target already exists in graph", () => {
    const g = leafGraph("/tmp/x");
    g.nodes.set("/existing", {
      path: "/existing", name: "X", description: "", nodeType: "leaf",
      depth: 1, parent: "/", children: [], content: "",
      frontmatter: {}, created: null, updated: null, author: null,
    });
    expect(() => validateMove("/old", "/existing", g)).toThrow(/target exists/i);
  });

  it("rejects circular move (target is descendant of source)", () => {
    expect(() => validateMove("/old", "/old/child", compositeGraph())).toThrow(/circular/i);
  });

  it("rejects when source does not exist", () => {
    expect(() => validateMove("/missing", "/new", leafGraph("/tmp/x"))).toThrow(/source.*does not exist/i);
  });

  it("accepts a valid leaf move", () => {
    expect(() => validateMove("/old", "/new", leafGraph("/tmp/x"))).not.toThrow();
  });
});
