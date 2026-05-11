import { describe, expect, it } from "vitest";
import {
  auditNode,
  detectMissingEdgeDescription,
  detectTautologousEdgeDescription,
  detectTautology,
  detectThinEdgeDescription,
  detectThinness,
  detectTocOverlap,
  detectTopicOpening,
  detectVagueQualifiers,
} from "../src/audit/heuristics.js";

describe("detectTocOverlap", () => {
  it("flags descriptions that enumerate child names", () => {
    const finding = detectTocOverlap(
      "How Spandrel knowledge graphs are shaped — nodes, links, paths, and companion files",
      ["Nodes", "Links", "Paths", "Companion files"],
    );
    expect(finding?.kind).toBe("toc_overlap");
    expect(finding?.detail?.matches).toBeGreaterThanOrEqual(3);
  });

  it("does not flag substantive descriptions that happen to mention child names", () => {
    // From the actual /content-model/index.md fix on 2026-05-10
    const finding = detectTocOverlap(
      "What Spandrel knowledge graphs are made of — markdown Things addressed by file path, organized via directory hierarchy, connected via frontmatter links, with companion files for design docs and agent instructions",
      ["Nodes", "Links", "Paths", "Companion files"],
    );
    expect(finding).toBeNull();
  });

  it("does not flag leaf nodes (no children)", () => {
    const finding = detectTocOverlap("Some description", []);
    expect(finding).toBeNull();
  });

  it("does not flag descriptions with no em-dash and few overlapping words", () => {
    const finding = detectTocOverlap(
      "Describes how people interact with each other",
      ["Alice", "Bob", "Charlie"],
    );
    expect(finding).toBeNull();
  });
});

describe("detectVagueQualifiers", () => {
  it("flags descriptions with multiple vague words", () => {
    const finding = detectVagueQualifiers(
      "Various decisions related to architecture",
    );
    expect(finding?.kind).toBe("vague_qualifiers");
    expect((finding?.detail?.matches as string[]).length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("does not flag substantive descriptions", () => {
    const finding = detectVagueQualifiers(
      "Architecture decisions and their rationale — RFCs, ADRs, and post-incident reviews from Q1 2024 onward",
    );
    expect(finding).toBeNull();
  });

  it("does not flag a single vague word", () => {
    const finding = detectVagueQualifiers("Decisions related to architecture");
    expect(finding).toBeNull();
  });

  it("matches case-insensitively", () => {
    const finding = detectVagueQualifiers(
      "VARIOUS Different things going on",
    );
    expect(finding).not.toBeNull();
  });
});

describe("detectTopicOpening", () => {
  it("flags short descriptions starting with question words", () => {
    const finding = detectTopicOpening(
      "How to run Spandrel — local development and production patterns",
    );
    expect(finding?.kind).toBe("topic_opening");
  });

  it("does not flag long descriptions even with question-word openings", () => {
    const finding = detectTopicOpening(
      "What Spandrel believes about agent-friendly knowledge graphs — structure emerges from content rather than being imposed; conversational coherence with agents is the design target; instruction stays separate from knowledge; paths are addresses",
    );
    expect(finding).toBeNull();
  });

  it("does not flag descriptions starting with non-question words", () => {
    const finding = detectTopicOpening(
      "Spandrel's three phases — compile markdown to graph, store in a backend, serve via REST and MCP",
    );
    expect(finding).toBeNull();
  });
});

describe("detectThinness", () => {
  it("flags short descriptions on composite nodes", () => {
    const finding = detectThinness("Architecture reviews", true);
    expect(finding?.kind).toBe("thin");
  });

  it("does not flag short descriptions on leaf nodes", () => {
    const finding = detectThinness("Architecture reviews", false);
    expect(finding).toBeNull();
  });

  it("does not flag adequately-detailed composite descriptions", () => {
    const finding = detectThinness(
      "Quarterly architecture review process — runs first Monday of each quarter, produces decisions logged in /decisions/",
      true,
    );
    expect(finding).toBeNull();
  });
});

describe("detectTautology", () => {
  it("flags descriptions that just repeat the node name", () => {
    const finding = detectTautology("The Acme client", "Acme");
    expect(finding?.kind).toBe("tautology");
  });

  it("does not flag substantive descriptions that mention the name", () => {
    const finding = detectTautology(
      "Acme — Enterprise SaaS client, onboarded Q2 2025, $2.4M ARR, primary account lead is Jane",
      "Acme",
    );
    expect(finding).toBeNull();
  });

  it("does not flag when the name is not in the description", () => {
    const finding = detectTautology(
      "Enterprise SaaS client, onboarded Q2 2025",
      "Acme",
    );
    expect(finding).toBeNull();
  });
});

describe("detectMissingEdgeDescription", () => {
  it("flags a typed semantic link with null description", () => {
    const finding = detectMissingEdgeDescription({
      to: "/people/jane",
      type: "led-by",
      description: null,
    });
    expect(finding?.kind).toBe("weak_edge_description");
    expect(finding?.detail?.subkind).toBe("missing");
  });

  it("flags a typed semantic link with empty-string description", () => {
    const finding = detectMissingEdgeDescription({
      to: "/people/jane",
      type: "served-by",
      description: "",
    });
    expect(finding?.detail?.subkind).toBe("missing");
  });

  it("flags a typed semantic link with whitespace-only description", () => {
    const finding = detectMissingEdgeDescription({
      to: "/people/jane",
      type: "works-with",
      description: "   \t  ",
    });
    expect(finding?.detail?.subkind).toBe("missing");
  });

  it("does not flag self-evident structural types (child-of) with no description", () => {
    const finding = detectMissingEdgeDescription({
      to: "/clients/acme",
      type: "child-of",
      description: null,
    });
    expect(finding).toBeNull();
  });

  it("does not flag self-evident structural types (part-of) with no description", () => {
    const finding = detectMissingEdgeDescription({
      to: "/projects/atlas",
      type: "part-of",
      description: null,
    });
    expect(finding).toBeNull();
  });

  it("does not flag a typed link with a real description", () => {
    const finding = detectMissingEdgeDescription({
      to: "/people/jane",
      type: "led-by",
      description: "Jane has owned this account since Q2 2025",
    });
    expect(finding).toBeNull();
  });

  it("honors a custom self-evident-type allowlist", () => {
    // With `mentions` whitelisted, a missing description on it should not flag.
    const finding = detectMissingEdgeDescription(
      { to: "/foo", type: "mentions", description: null },
      ["child-of", "part-of", "mentions"],
    );
    expect(finding).toBeNull();
  });
});

describe("detectTautologousEdgeDescription", () => {
  it("flags a description that exactly restates the link type", () => {
    const finding = detectTautologousEdgeDescription({
      to: "/people/jane",
      type: "led-by",
      description: "led-by",
    });
    expect(finding?.detail?.subkind).toBe("tautologous");
  });

  it("flags a description that restates the type as a phrase (hyphens to spaces)", () => {
    const finding = detectTautologousEdgeDescription({
      to: "/people/jane",
      type: "works-with",
      description: "Works with",
    });
    expect(finding?.detail?.subkind).toBe("tautologous");
  });

  it("flags a description that restates the target path stem", () => {
    const finding = detectTautologousEdgeDescription({
      to: "/clients/acme/accounts",
      type: "child-of",
      description: "accounts",
    });
    expect(finding?.detail?.subkind).toBe("tautologous");
  });

  it("matches case-insensitively", () => {
    const finding = detectTautologousEdgeDescription({
      to: "/people/jane",
      type: "led-by",
      description: "LED-BY",
    });
    expect(finding).not.toBeNull();
  });

  it("does not flag a description that contains the type as part of a longer phrase", () => {
    // "led by Jane since 2024" should not be flagged as a restatement of "led-by".
    const finding = detectTautologousEdgeDescription({
      to: "/people/jane",
      type: "led-by",
      description: "led by Jane since 2024",
    });
    expect(finding).toBeNull();
  });

  it("does not flag descriptions that share substrings but don't equal the type or stem", () => {
    const finding = detectTautologousEdgeDescription({
      to: "/clients/acme/accounts",
      type: "child-of",
      description: "Accounts the team manages on the Acme engagement",
    });
    expect(finding).toBeNull();
  });

  it("does not flag null or empty descriptions (those are 'missing', not 'tautologous')", () => {
    expect(
      detectTautologousEdgeDescription({
        to: "/clients/acme",
        type: "led-by",
        description: null,
      }),
    ).toBeNull();
    expect(
      detectTautologousEdgeDescription({
        to: "/clients/acme",
        type: "led-by",
        description: "   ",
      }),
    ).toBeNull();
  });
});

describe("detectThinEdgeDescription", () => {
  it("flags a single-word description on a typed non-mentions edge", () => {
    const finding = detectThinEdgeDescription({
      to: "/people/jane",
      type: "led-by",
      description: "Jane",
    });
    expect(finding?.detail?.subkind).toBe("thin");
    expect(finding?.detail?.wordCount).toBe(1);
  });

  it("flags a single-word description after surrounding whitespace is trimmed", () => {
    const finding = detectThinEdgeDescription({
      to: "/people/jane",
      type: "works-with",
      description: "  collaborator  ",
    });
    expect(finding?.detail?.subkind).toBe("thin");
  });

  it("does not flag a multi-word description on a typed edge", () => {
    const finding = detectThinEdgeDescription({
      to: "/people/jane",
      type: "led-by",
      description: "Jane Doe owns the account",
    });
    expect(finding).toBeNull();
  });

  it("does not flag a single-word description on a `mentions` edge", () => {
    const finding = detectThinEdgeDescription({
      to: "/concepts/spandrel",
      type: "mentions",
      description: "context",
    });
    expect(finding).toBeNull();
  });

  it("does not flag null or empty descriptions (those are 'missing', not 'thin')", () => {
    expect(
      detectThinEdgeDescription({
        to: "/people/jane",
        type: "led-by",
        description: null,
      }),
    ).toBeNull();
    expect(
      detectThinEdgeDescription({
        to: "/people/jane",
        type: "led-by",
        description: "",
      }),
    ).toBeNull();
    expect(
      detectThinEdgeDescription({
        to: "/people/jane",
        type: "led-by",
        description: "   ",
      }),
    ).toBeNull();
  });
});

describe("auditNode edge-level integration", () => {
  it("reproduces a /clients/definite-style link structure: 4 missing + 4 thin findings", () => {
    // Synthesized after the dry-run that motivated WS-A1: a client node with
    // four semantic typed links missing descriptions, and four `mentions`
    // links with single-word descriptions. The `mentions` ones should NOT
    // produce `thin` findings (mentions is allowed to be terse), so the test
    // asserts exactly four `missing` findings and zero `thin` findings.
    const findings = auditNode({
      name: "Definite",
      description:
        "Definite — analytics consultancy client, onboarded Q1 2025, $1.8M ARR, served by the data team",
      childNames: ["Accounts", "Contracts", "Notes"],
      links: [
        // 4 null-description edges on non-self-evident types.
        { to: "/people/alice", type: "led-by", description: null },
        { to: "/people/bob", type: "works-with", description: null },
        { to: "/people/carol", type: "served-by", description: null },
        { to: "/people/dave", type: "works-with", description: null },
        // 4 single-word descriptions on `mentions` edges (allowed terse).
        { to: "/topics/analytics", type: "mentions", description: "analytics" },
        { to: "/topics/dashboards", type: "mentions", description: "dashboards" },
        { to: "/topics/etl", type: "mentions", description: "etl" },
        { to: "/topics/snowflake", type: "mentions", description: "snowflake" },
      ],
    });

    const edgeFindings = findings.filter(
      (f) => f.kind === "weak_edge_description",
    );
    const missing = edgeFindings.filter(
      (f) => f.detail?.subkind === "missing",
    );
    const thin = edgeFindings.filter((f) => f.detail?.subkind === "thin");

    expect(missing).toHaveLength(4);
    expect(thin).toHaveLength(0);
  });

  it("flags single-word descriptions on non-mentions typed edges as thin", () => {
    const findings = auditNode({
      name: "Project Atlas",
      description:
        "Project Atlas — internal data platform rebuild, scoped for FY26, owned by the infra team",
      childNames: ["Milestones", "Decisions"],
      links: [
        { to: "/people/alice", type: "led-by", description: "Alice" },
        { to: "/people/bob", type: "works-with", description: "Bob" },
        { to: "/people/carol", type: "served-by", description: "Carol" },
        { to: "/teams/infra", type: "works-with", description: "Infra" },
      ],
    });

    const thin = findings.filter(
      (f) => f.kind === "weak_edge_description" && f.detail?.subkind === "thin",
    );
    expect(thin).toHaveLength(4);
  });

  it("returns no edge findings when links are omitted (existing callers stay clean)", () => {
    const findings = auditNode({
      name: "Spandrel",
      description:
        "What Spandrel believes about agent-friendly knowledge graphs — structure emerges from content rather than being imposed; conversational coherence with agents is the design target; instruction stays separate from knowledge; paths are addresses",
      childNames: [
        "Philosophy",
        "Hypothesis",
        "Content Model",
        "Architecture",
        "Patterns",
      ],
    });
    const edgeFindings = findings.filter(
      (f) => f.kind === "weak_edge_description",
    );
    expect(edgeFindings).toEqual([]);
  });
});

describe("auditNode (integration)", () => {
  it("reproduces the 2026-05-10 sweep findings on /content-model/index.md", () => {
    // Original (pre-PR-#14) state of /content-model/index.md
    const findings = auditNode({
      name: "Content Model",
      description:
        "How Spandrel knowledge graphs are shaped — nodes, links, paths, and companion files",
      childNames: ["Nodes", "Links", "Paths", "Companion files"],
    });
    const kinds = findings.map((f) => f.kind);
    expect(kinds).toContain("toc_overlap");
  });

  it("reproduces the 2026-05-10 sweep findings on /deployment/index.md", () => {
    // Original (pre-PR-#14) state of /deployment/index.md
    const findings = auditNode({
      name: "Deployment",
      description:
        "How to run Spandrel — local development and production patterns",
      childNames: [
        "Local Development",
        "Static + flat-file MCP",
        "Production deployment",
      ],
    });
    const kinds = findings.map((f) => f.kind);
    // Should detect topic_opening (≤ 15 words, starts with "How")
    expect(kinds).toContain("topic_opening");
  });

  it("returns no findings on a substantive description", () => {
    const findings = auditNode({
      name: "Spandrel",
      description:
        "What Spandrel believes about agent-friendly knowledge graphs — structure emerges from content rather than being imposed; conversational coherence with agents is the design target; instruction stays separate from knowledge; paths are addresses",
      childNames: ["Philosophy", "Hypothesis", "Content Model", "Architecture", "Patterns"],
    });
    expect(findings).toEqual([]);
  });
});
