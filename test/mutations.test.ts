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
