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
