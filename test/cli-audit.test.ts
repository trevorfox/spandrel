/**
 * Tests for `spandrel audit` (WS-B2). We exercise the `runAudit` entry point
 * with a captured stdout/stderr sink so we can assert on output without
 * spawning a subprocess or mucking with global console state.
 *
 * Strategy: every test materializes a tiny temp graph that fires the audit
 * findings we want to observe, runs `runAudit` against it, and inspects the
 * captured lines. Staleness is intentionally skipped — its detectors need git
 * commit timestamps via `addGitMetadata`, and a temp fixture with no `git
 * init` produces no `updated` values for those detectors to fire on.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runAudit, parseAuditArgs, normalizeNodePath, filterAuditWarnings } from "../src/cli-audit.js";
import type { ValidationWarning } from "../src/compiler/types.js";

function tmpGraph(): string {
  // A multi-finding graph: composite with TOC-overlapping description (fires
  // weak_description), a child with a `led-by`-typed link missing description
  // (fires weak_edge_description.missing), and a stub-marker body (fires
  // stub_marker). Three distinct audit types from one fixture.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spandrel-cli-audit-"));
  fs.writeFileSync(
    path.join(dir, "index.md"),
    "---\nname: Root\ndescription: Root of the test graph — plenty of substance here to avoid thinness flagging\n---\n\nA real body for the root so it does not flag thin_body.\n",
  );
  // Composite whose description is a TOC of its children's names.
  fs.mkdirSync(path.join(dir, "people"));
  fs.writeFileSync(
    path.join(dir, "people", "index.md"),
    "---\nname: People\ndescription: People — alice, bob, carol, and dave\n---\n\nThe People collection groups every person we work with into a navigable list with attributes for each. This body is long enough to clear the thin-body threshold of twenty words easily.\n",
  );
  fs.writeFileSync(
    path.join(dir, "people", "alice.md"),
    "---\nname: Alice\ndescription: Alice is one of the people we work with on a recurring basis across multiple projects\nlinks:\n  - to: /people/bob\n    type: led-by\n---\n\nAlice has a substantive body here that is well over twenty words long, with enough substance to clear both the thinness threshold and avoid any topic-opening flag.\n",
  );
  fs.writeFileSync(
    path.join(dir, "people", "bob.md"),
    "---\nname: Bob\ndescription: Bob is another person we work with — distinctive description that should not fire any weak-description flag\n---\n\nTBD — body still being figured out.\n",
  );
  fs.writeFileSync(
    path.join(dir, "people", "carol.md"),
    "---\nname: Carol\ndescription: Carol is yet another person we work with — distinctive description that should not fire any weak-description flag\n---\n\nCarol's body is intentionally long enough to clear the thinness threshold so this node fires no findings at all and serves as the empty-control case.\n",
  );
  fs.writeFileSync(
    path.join(dir, "people", "dave.md"),
    "---\nname: Dave\ndescription: Dave is the fourth person we work with — distinctive description that should not fire any weak-description flag\n---\n\nDave's body is also long enough to clear the thinness threshold so this node fires no findings either and balances the fixture nicely.\n",
  );
  return dir;
}

function emptyGraph(): string {
  // A graph with one composite whose descriptions / bodies are all crisp.
  // Should produce zero audit findings.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spandrel-cli-audit-clean-"));
  fs.writeFileSync(
    path.join(dir, "index.md"),
    "---\nname: Pristine\ndescription: A pristine knowledge graph with one node and crisp authoring throughout — nothing should flag here\n---\n\nThis body is long enough to clear the thinness threshold and avoid the topic-opening trap and any other detector that might fire on a small graph.\n",
  );
  return dir;
}

function rmrf(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function makeSink(): { lines: string[]; write: (line: string) => void } {
  const lines: string[] = [];
  return {
    lines,
    write: (line: string) => {
      lines.push(line);
    },
  };
}

describe("runAudit — default invocation", () => {
  let root: string;
  beforeEach(() => {
    root = tmpGraph();
  });
  afterEach(() => {
    rmrf(root);
  });

  it("emits human-format findings covering multiple audit types", async () => {
    const out = makeSink();
    const err = makeSink();
    const result = await runAudit({ rootDir: root, stdout: out.write, stderr: err.write });

    expect(result.code).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);

    const combined = out.lines.join("\n");
    // Should see at least one of each fixture-induced finding type.
    expect(combined).toMatch(/\[weak_edge_description\.missing\]/);
    expect(combined).toMatch(/\[stub_marker\]/);
    // weak_description's TOC subkind fires on /people because the description
    // enumerates the children's names.
    expect(combined).toMatch(/\[toc_overlap\]/);
  });
});

describe("runAudit — --format json", () => {
  let root: string;
  beforeEach(() => {
    root = tmpGraph();
  });
  afterEach(() => {
    rmrf(root);
  });

  it("produces parseable JSON whose contents match the human invocation", async () => {
    const jsonOut = makeSink();
    const humanOut = makeSink();
    const errSink = makeSink();

    const jsonResult = await runAudit({
      rootDir: root,
      format: "json",
      stdout: jsonOut.write,
      stderr: errSink.write,
    });
    const humanResult = await runAudit({
      rootDir: root,
      format: "human",
      stdout: humanOut.write,
      stderr: errSink.write,
    });

    const parsed: ValidationWarning[] = JSON.parse(jsonOut.lines.join("\n"));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(humanResult.warnings.length);
    expect(parsed.length).toBe(jsonResult.warnings.length);

    // Every path that shows up in human output should appear in the JSON.
    const jsonPaths = new Set(parsed.map((w) => w.path));
    for (const w of humanResult.warnings) {
      expect(jsonPaths.has(w.path)).toBe(true);
    }
  });
});

describe("runAudit — --kinds filter", () => {
  let root: string;
  beforeEach(() => {
    root = tmpGraph();
  });
  afterEach(() => {
    rmrf(root);
  });

  it("--kinds weak_description filters to only that type", async () => {
    const out = makeSink();
    const err = makeSink();
    const result = await runAudit({
      rootDir: root,
      kinds: ["weak_description"],
      stdout: out.write,
      stderr: err.write,
    });

    expect(result.code).toBe(0);
    for (const w of result.warnings) {
      expect(w.type).toBe("weak_description");
    }
    // Stub-marker findings from the fixture should not appear.
    expect(out.lines.join("\n")).not.toMatch(/\[stub_marker\]/);
  });

  it("--kinds weak_description,stub_marker includes both", async () => {
    const out = makeSink();
    const err = makeSink();
    const result = await runAudit({
      rootDir: root,
      kinds: ["weak_description", "stub_marker"],
      stdout: out.write,
      stderr: err.write,
    });

    const types = new Set(result.warnings.map((w) => w.type));
    expect(types.has("weak_description")).toBe(true);
    expect(types.has("stub_marker")).toBe(true);
    // weak_edge_description should be excluded from this run.
    expect(types.has("weak_edge_description")).toBe(false);
  });
});

describe("runAudit — --node filter", () => {
  let root: string;
  beforeEach(() => {
    root = tmpGraph();
  });
  afterEach(() => {
    rmrf(root);
  });

  it("--node /people/bob limits output to that node only", async () => {
    const out = makeSink();
    const err = makeSink();
    const result = await runAudit({
      rootDir: root,
      node: "/people/bob",
      stdout: out.write,
      stderr: err.write,
    });

    expect(result.code).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    for (const w of result.warnings) {
      expect(w.path).toBe("/people/bob");
    }
  });

  it("accepts --node without a leading slash and normalizes to absolute", async () => {
    const out = makeSink();
    const err = makeSink();
    const result = await runAudit({
      rootDir: root,
      node: "people/bob",
      stdout: out.write,
      stderr: err.write,
    });

    for (const w of result.warnings) {
      expect(w.path).toBe("/people/bob");
    }
  });
});

describe("runAudit — --severity", () => {
  let root: string;
  beforeEach(() => {
    root = tmpGraph();
  });
  afterEach(() => {
    rmrf(root);
  });

  it("--severity warning produces empty output (G1: no severity field today)", async () => {
    const out = makeSink();
    const err = makeSink();
    const result = await runAudit({
      rootDir: root,
      severity: "warning",
      stdout: out.write,
      stderr: err.write,
    });

    expect(result.code).toBe(0);
    expect(result.warnings.length).toBe(0);
    // Human-mode renders "No audit findings." when the filter yields nothing.
    expect(out.lines.join("\n")).toMatch(/No audit findings\./);
  });
});

describe("runAudit — --priority punt", () => {
  let root: string;
  beforeEach(() => {
    root = tmpGraph();
  });
  afterEach(() => {
    rmrf(root);
  });

  it("prints the WS-C2 punt message to stderr and exits 0 without running audit", async () => {
    const out = makeSink();
    const err = makeSink();
    const result = await runAudit({
      rootDir: root,
      priority: true,
      stdout: out.write,
      stderr: err.write,
    });

    expect(result.code).toBe(0);
    expect(result.warnings.length).toBe(0);
    expect(out.lines.length).toBe(0);
    expect(err.lines.join("\n")).toMatch(/--priority is not yet implemented — see WS-C2/);
  });
});

describe("runAudit — empty graph", () => {
  let root: string;
  beforeEach(() => {
    root = emptyGraph();
  });
  afterEach(() => {
    rmrf(root);
  });

  it("prints 'No audit findings.' in human mode and exits 0", async () => {
    const out = makeSink();
    const err = makeSink();
    const result = await runAudit({
      rootDir: root,
      stdout: out.write,
      stderr: err.write,
    });

    expect(result.code).toBe(0);
    expect(result.warnings.length).toBe(0);
    expect(out.lines.join("\n")).toMatch(/No audit findings\./);
  });

  it("prints '[]' in JSON mode and exits 0", async () => {
    const out = makeSink();
    const err = makeSink();
    const result = await runAudit({
      rootDir: root,
      format: "json",
      stdout: out.write,
      stderr: err.write,
    });

    expect(result.code).toBe(0);
    const parsed = JSON.parse(out.lines.join("\n"));
    expect(parsed).toEqual([]);
  });
});

describe("parseAuditArgs", () => {
  it("parses bare path as rootDir", () => {
    const opts = parseAuditArgs(["/tmp/graph"]);
    expect(opts.rootDir).toBe("/tmp/graph");
  });

  it("parses --kinds with comma separation", () => {
    const opts = parseAuditArgs(["/tmp/graph", "--kinds", "weak_description,stub_marker"]);
    expect(opts.kinds).toEqual(["weak_description", "stub_marker"]);
  });

  it("parses --format=human and --format=json", () => {
    expect(parseAuditArgs(["--format=json"]).format).toBe("json");
    expect(parseAuditArgs(["--format", "human"]).format).toBe("human");
  });

  it("throws on invalid --format", () => {
    expect(() => parseAuditArgs(["--format=xml"])).toThrow(/--format must be one of/);
  });

  it("throws on invalid --severity", () => {
    expect(() => parseAuditArgs(["--severity=critical"])).toThrow(/--severity must be one of/);
  });

  it("parses --priority as boolean", () => {
    expect(parseAuditArgs(["--priority"]).priority).toBe(true);
  });
});

describe("normalizeNodePath", () => {
  it("preserves leading slash", () => {
    expect(normalizeNodePath("/clients/acme")).toBe("/clients/acme");
  });

  it("prepends slash when missing", () => {
    expect(normalizeNodePath("clients/acme")).toBe("/clients/acme");
  });

  it("leaves root as /", () => {
    expect(normalizeNodePath("/")).toBe("/");
  });
});

describe("filterAuditWarnings", () => {
  // Pure-function tests — exercise the filter logic without spinning up
  // compile. Covers the AND-combine semantics and the audit-type gate.
  const sample: ValidationWarning[] = [
    { path: "/a", type: "weak_description", message: "[toc_overlap] x" },
    { path: "/a", type: "broken_link", message: "non-audit" },
    { path: "/b", type: "stub_marker", message: "[stub_marker] y" },
    { path: "/b", type: "weak_edge_description", message: "[weak_edge_description.missing] z" },
  ];

  it("filters out non-audit warnings even when no other filter is set", () => {
    const result = filterAuditWarnings(sample, {});
    expect(result.length).toBe(3);
    for (const w of result) {
      expect(w.type).not.toBe("broken_link");
    }
  });

  it("AND-combines --node and --kinds", () => {
    const result = filterAuditWarnings(sample, {
      node: "/b",
      kinds: ["stub_marker"],
    });
    expect(result.length).toBe(1);
    expect(result[0].path).toBe("/b");
    expect(result[0].type).toBe("stub_marker");
  });

  it("severity=warning yields empty", () => {
    expect(filterAuditWarnings(sample, { severity: "warning" })).toEqual([]);
  });
});
