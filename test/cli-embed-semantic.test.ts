/**
 * Integration tests for `spandrel embed` + `spandrel audit --semantic`.
 *
 * End-to-end flow with a deterministic mock provider:
 *   1. Materialize a tiny graph fixture.
 *   2. Run `runEmbed` with a `providerOverride` that returns vectors
 *      encoding the node's name.
 *   3. Re-run `runEmbed` — should skip everything (idempotent).
 *   4. Run `runAudit({ semantic: true })` — should surface missing-link
 *      warnings for the high-similarity pair.
 *   5. Mutate a node's content, re-run audit — should error with a
 *      "stale store" message pointing at `spandrel embed`.
 *
 * Plus one env-gated E2E (`SPANDREL_EMBED_E2E=1`) that hits the real OpenAI
 * API on a 3-node fixture. Skipped by default.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runEmbed } from "../src/cli-embed.js";
import { runAudit } from "../src/cli-audit.js";
import type { EmbeddingProvider } from "../src/audit/embedding-provider.js";
import { openStore } from "../src/audit/embeddings-store.js";

/**
 * Build a deterministic mock provider whose embedding is a function of the
 * input text. Two texts that share their first few chars end up nearly
 * collinear → high cosine similarity → surfaces as a missing-link candidate.
 *
 * The trick: take the SHA-like spread of the first 8 chars across 32 dims.
 * "people - alice" and "people - bob" share the prefix "people - " so they're
 * very close; "unrelated topic about cats" lives in a different region.
 */
function makeDeterministicProvider(): EmbeddingProvider {
  return {
    model: "mock-deterministic",
    dim: 32,
    async embed(texts: string[]): Promise<Float32Array[]> {
      return texts.map((t) => {
        const out = new Float32Array(32);
        // First 16 dims: prefix signal — encodes the first 16 chars.
        // Later dims: stay near zero.
        for (let i = 0; i < 16 && i < t.length; i++) {
          out[i] = t.charCodeAt(i) / 128;
        }
        // Tiny perturbation in the last dim from the full content's first
        // char, so identical-prefix nodes still produce distinct vectors
        // (similarity slightly less than 1.0).
        out[31] = (t.length > 0 ? t.charCodeAt(t.length - 1) : 0) / 16384;
        return out;
      });
    },
  };
}

function makeGraph(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spandrel-e1-graph-"));
  fs.writeFileSync(
    path.join(dir, "index.md"),
    "---\nname: Root\ndescription: The root node of a small test graph with multiple people and topic nodes\n---\n\nThe root body has enough substance to clear the thin-body threshold easily and represent the top of the tree.\n",
  );
  fs.mkdirSync(path.join(dir, "people"));
  fs.writeFileSync(
    path.join(dir, "people", "index.md"),
    "---\nname: People\ndescription: People involved in operations and engineering across the organization\n---\n\nThe People collection covers everyone we work with on a recurring basis across multiple projects.\n",
  );
  // Two people with very similar content — should cluster.
  fs.writeFileSync(
    path.join(dir, "people", "alice.md"),
    "---\nname: people-alice\ndescription: People-Alice runs operations and engineering work for the team across all projects\n---\n\nPeople-Alice is the operations lead and runs every engineering coordination meeting we hold.\n",
  );
  fs.writeFileSync(
    path.join(dir, "people", "bob.md"),
    "---\nname: people-bob\ndescription: People-Bob runs operations and engineering work for the team alongside Alice\n---\n\nPeople-Bob also leads operations work and partners on engineering coordination week to week.\n",
  );
  // One unrelated node.
  fs.mkdirSync(path.join(dir, "topics"));
  fs.writeFileSync(
    path.join(dir, "topics", "index.md"),
    "---\nname: Topics\ndescription: Topics catalog covering research areas independent of the people roster\n---\n\nThe Topics collection enumerates research areas the team studies, separate from individual people.\n",
  );
  fs.writeFileSync(
    path.join(dir, "topics", "cats.md"),
    "---\nname: topics-cats\ndescription: Topics-Cats covers feline research wholly unrelated to operations or engineering\n---\n\nTopics-Cats catalogs research on domestic cats, completely separate from any operations or engineering work.\n",
  );
  return dir;
}

function makeSink(): { lines: string[]; write: (line: string) => void } {
  const lines: string[] = [];
  return {
    lines,
    write: (line: string) => lines.push(line),
  };
}

describe("runEmbed — mock provider", () => {
  let root: string;
  beforeEach(() => {
    root = makeGraph();
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("embeds every non-companion node on the first pass", async () => {
    const out = makeSink();
    const err = makeSink();
    const result = await runEmbed({
      rootDir: root,
      providerOverride: makeDeterministicProvider(),
      yes: true,
      stdout: out.write,
      stderr: err.write,
    });
    expect(result.code).toBe(0);
    // 6 nodes in the fixture (root, people, alice, bob, topics, cats).
    expect(result.total).toBeGreaterThanOrEqual(5);
    expect(result.embedded).toBe(result.total);
    expect(result.skipped).toBe(0);

    // Verify store contents.
    const store = openStore(root);
    try {
      expect(store.count()).toBe(result.embedded);
      const all = store.getAllForGraph("mock-deterministic");
      expect(all.size).toBe(result.embedded);
    } finally {
      store.close();
    }
  });

  it("is idempotent — re-running embeds zero new rows", async () => {
    const out = makeSink();
    const err = makeSink();
    const provider = makeDeterministicProvider();
    await runEmbed({
      rootDir: root,
      providerOverride: provider,
      yes: true,
      stdout: out.write,
      stderr: err.write,
    });
    const r2 = await runEmbed({
      rootDir: root,
      providerOverride: provider,
      yes: true,
      stdout: out.write,
      stderr: err.write,
    });
    expect(r2.embedded).toBe(0);
    expect(r2.skipped).toBe(r2.total);
  });
});

describe("runAudit({ semantic: true }) — mock provider end-to-end", () => {
  let root: string;
  beforeEach(() => {
    root = makeGraph();
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("errors when no embedding store exists", async () => {
    const out = makeSink();
    const err = makeSink();
    const r = await runAudit({
      rootDir: root,
      semantic: true,
      semanticModel: "mock-deterministic",
      stdout: out.write,
      stderr: err.write,
    });
    expect(r.code).toBe(1);
    expect(err.lines.join("\n")).toMatch(
      /no embedding store found.*spandrel embed/,
    );
  });

  it("emits missing_link warnings for the high-similarity pair", async () => {
    // Embed first.
    const eOut = makeSink();
    const eErr = makeSink();
    await runEmbed({
      rootDir: root,
      providerOverride: makeDeterministicProvider(),
      yes: true,
      stdout: eOut.write,
      stderr: eErr.write,
    });

    const out = makeSink();
    const err = makeSink();
    const r = await runAudit({
      rootDir: root,
      semantic: true,
      semanticModel: "mock-deterministic",
      // Loosen threshold so the deterministic prefix-hash test vectors clear it.
      similarityThreshold: 0.5,
      kinds: ["missing_link"],
      stdout: out.write,
      stderr: err.write,
    });
    expect(r.code).toBe(0);
    const missingLinkWarnings = r.warnings.filter(
      (w) => w.type === "missing_link",
    );
    expect(missingLinkWarnings.length).toBeGreaterThan(0);
    // Each message should reference a target and a cos value.
    for (const w of missingLinkWarnings) {
      expect(w.message).toMatch(/\[missing_link\] Considered linking to .* \(cos \d+\.\d+\)/);
    }
  });

  it("auto-detects the embedding model when only one is in the store", async () => {
    // No --semantic-model passed. The store has exactly one model
    // ("mock-deterministic"), so audit should pick it without complaint.
    const eOut = makeSink();
    const eErr = makeSink();
    await runEmbed({
      rootDir: root,
      providerOverride: makeDeterministicProvider(),
      yes: true,
      stdout: eOut.write,
      stderr: eErr.write,
    });

    const out = makeSink();
    const err = makeSink();
    const r = await runAudit({
      rootDir: root,
      semantic: true,
      // semanticModel intentionally omitted — auto-detect path.
      similarityThreshold: 0.5,
      kinds: ["missing_link"],
      stdout: out.write,
      stderr: err.write,
    });
    expect(r.code).toBe(0);
    expect(r.warnings.filter((w) => w.type === "missing_link").length).toBeGreaterThan(0);
  });

  it("errors with a disambiguation hint when the store has multiple models", async () => {
    // Embed with two distinct mock providers, leaving the store with two
    // model namespaces.
    const eOut = makeSink();
    const eErr = makeSink();
    const providerA: import("../src/audit/embedding-provider.js").EmbeddingProvider = {
      model: "mock-a",
      dim: 32,
      async embed(texts) {
        return texts.map(() => {
          const v = new Float32Array(32);
          v[0] = 0.1;
          return v;
        });
      },
    };
    const providerB: import("../src/audit/embedding-provider.js").EmbeddingProvider = {
      model: "mock-b",
      dim: 32,
      async embed(texts) {
        return texts.map(() => {
          const v = new Float32Array(32);
          v[0] = 0.2;
          return v;
        });
      },
    };
    await runEmbed({
      rootDir: root,
      providerOverride: providerA,
      yes: true,
      stdout: eOut.write,
      stderr: eErr.write,
    });
    await runEmbed({
      rootDir: root,
      providerOverride: providerB,
      yes: true,
      stdout: eOut.write,
      stderr: eErr.write,
    });

    const out = makeSink();
    const err = makeSink();
    const r = await runAudit({
      rootDir: root,
      semantic: true,
      // No semanticModel — should error with disambiguation hint.
      stdout: out.write,
      stderr: err.write,
    });
    expect(r.code).toBe(1);
    expect(err.lines.join("\n")).toMatch(/multiple models.*mock-a.*mock-b.*--semantic-model/);
  });

  it("errors with a stale-store hint when a node's content changes", async () => {
    // Embed.
    const eOut = makeSink();
    const eErr = makeSink();
    await runEmbed({
      rootDir: root,
      providerOverride: makeDeterministicProvider(),
      yes: true,
      stdout: eOut.write,
      stderr: eErr.write,
    });

    // Mutate a node's body.
    fs.writeFileSync(
      path.join(root, "people", "alice.md"),
      "---\nname: people-alice\ndescription: People-Alice now does completely different work in a brand new role\n---\n\nNew body explaining the new role at length, sufficient to clear all body-length thresholds.\n",
    );

    const out = makeSink();
    const err = makeSink();
    const r = await runAudit({
      rootDir: root,
      semantic: true,
      semanticModel: "mock-deterministic",
      stdout: out.write,
      stderr: err.write,
    });
    expect(r.code).toBe(1);
    expect(err.lines.join("\n")).toMatch(/stale.*spandrel embed/);
  });
});

// =====================================================================
// E2E — real OpenAI API. Skipped unless SPANDREL_EMBED_E2E=1.
// =====================================================================
//
// Documented in README + PUBLIC-API. The E2E exists so we have a single
// canonical "this works against a real provider" check; CI does NOT need
// this to be green.

const e2eIt = process.env.SPANDREL_EMBED_E2E === "1" ? it : it.skip;

describe("E2E — real OpenAI provider (env-gated)", () => {
  let root: string;
  beforeEach(() => {
    root = makeGraph();
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  e2eIt("embeds and surfaces missing-link candidates against the real API", async () => {
    const out = makeSink();
    const err = makeSink();
    const er = await runEmbed({
      rootDir: root,
      provider: "openai",
      yes: true,
      stdout: out.write,
      stderr: err.write,
    });
    expect(er.code).toBe(0);
    expect(er.embedded).toBeGreaterThan(0);

    const auditOut = makeSink();
    const auditErr = makeSink();
    const ar = await runAudit({
      rootDir: root,
      semantic: true,
      stdout: auditOut.write,
      stderr: auditErr.write,
    });
    expect(ar.code).toBe(0);
    // Don't assert a specific count — real models vary — but expect at least
    // some structure to come back.
    expect(ar.warnings).toBeDefined();
  }, 120_000);
});
