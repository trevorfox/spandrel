import { describe, expect, it } from "vitest";
import {
  auditNode,
  detectMissingEdgeDescription,
  detectOverlongBody,
  detectStubMarkers,
  detectTautologousEdgeDescription,
  detectTautology,
  detectThinBody,
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

// ---------------------------------------------------------------------------
// Body-content heuristics (WS-A2)
// ---------------------------------------------------------------------------

describe("detectStubMarkers", () => {
  it("flags TBD as a stub marker", () => {
    const finding = detectStubMarkers("This section is TBD until we decide.");
    expect(finding?.kind).toBe("stub_marker");
    expect(finding?.detail?.matches).toContain("TBD");
  });

  it("flags TODO as a stub marker", () => {
    const finding = detectStubMarkers("TODO: write a real explanation here");
    expect(finding?.kind).toBe("stub_marker");
    expect(finding?.detail?.matches).toContain("TODO");
  });

  it("flags WIP as a stub marker", () => {
    const finding = detectStubMarkers("Status: WIP — not yet ready.");
    expect(finding?.kind).toBe("stub_marker");
    expect(finding?.detail?.matches).toContain("WIP");
  });

  it("flags `(auto-generated stub)` literal", () => {
    const finding = detectStubMarkers(
      "Some node body. (auto-generated stub) Replace me.",
    );
    expect(finding?.kind).toBe("stub_marker");
    expect(finding?.detail?.matches).toContain("(auto-generated stub)");
  });

  it("flags `[placeholder]` literal", () => {
    const finding = detectStubMarkers("Intro paragraph [placeholder] follow-up.");
    expect(finding?.kind).toBe("stub_marker");
    expect(finding?.detail?.matches).toContain("[placeholder]");
  });

  it("matches stub markers case-insensitively", () => {
    const finding = detectStubMarkers("tbd: todo this later");
    expect(finding?.kind).toBe("stub_marker");
    const matches = finding?.detail?.matches as string[];
    expect(matches).toContain("TBD");
    expect(matches).toContain("TODO");
  });

  it("reports multiple stub markers in one finding", () => {
    const finding = detectStubMarkers(
      "TODO: explain. TBD: confirm. WIP placeholder paragraph.",
    );
    expect(finding?.kind).toBe("stub_marker");
    const matches = finding?.detail?.matches as string[];
    expect(matches).toContain("TODO");
    expect(matches).toContain("TBD");
    expect(matches).toContain("WIP");
  });

  it("does not flag words that contain marker substrings (word boundary)", () => {
    // "tbdriver" / "TODOS" inside other words must not fire because \b is
    // enforced. Use an obviously substantive body.
    const finding = detectStubMarkers(
      "The team broke down the brittle subdocument workflow and reassembled it.",
    );
    expect(finding).toBeNull();
  });

  it("returns null on null body", () => {
    expect(detectStubMarkers(null)).toBeNull();
  });

  it("returns null on empty / whitespace body", () => {
    expect(detectStubMarkers("")).toBeNull();
    expect(detectStubMarkers("   \n  ")).toBeNull();
  });
});

describe("detectThinBody", () => {
  it("flags empty body on a leaf", () => {
    const finding = detectThinBody("", false);
    expect(finding?.kind).toBe("thin_body");
    expect(finding?.detail?.wordCount).toBe(0);
  });

  it("flags null body on a composite", () => {
    const finding = detectThinBody(null, true);
    expect(finding?.kind).toBe("thin_body");
    expect(finding?.detail?.wordCount).toBe(0);
  });

  it("flags a leaf body just under the leaf threshold (19 words)", () => {
    const body = Array(19).fill("word").join(" ");
    const finding = detectThinBody(body, false);
    expect(finding?.kind).toBe("thin_body");
    expect(finding?.detail?.wordCount).toBe(19);
    expect(finding?.detail?.threshold).toBe(20);
  });

  it("does not flag a leaf body exactly at the leaf threshold (20 words)", () => {
    const body = Array(20).fill("word").join(" ");
    const finding = detectThinBody(body, false);
    expect(finding).toBeNull();
  });

  it("flags a composite body just under the composite threshold (49 words)", () => {
    const body = Array(49).fill("word").join(" ");
    const finding = detectThinBody(body, true);
    expect(finding?.kind).toBe("thin_body");
    expect(finding?.detail?.wordCount).toBe(49);
    expect(finding?.detail?.threshold).toBe(50);
  });

  it("does not flag a composite body exactly at the composite threshold (50 words)", () => {
    const body = Array(50).fill("word").join(" ");
    const finding = detectThinBody(body, true);
    expect(finding).toBeNull();
  });

  it("applies the stricter threshold for composites versus leaves", () => {
    const body = Array(30).fill("word").join(" "); // 30 words
    // 30 < 50 (composite threshold) → flags as composite
    expect(detectThinBody(body, true)?.kind).toBe("thin_body");
    // 30 >= 20 (leaf threshold) → does not flag as leaf
    expect(detectThinBody(body, false)).toBeNull();
  });

  it("honours custom thresholds", () => {
    const body = Array(5).fill("word").join(" "); // 5 words
    // Default leaf threshold 20 → flags
    expect(detectThinBody(body, false)?.kind).toBe("thin_body");
    // Custom leaf threshold 5 → does not flag (exact threshold)
    expect(detectThinBody(body, false, 50, 5)).toBeNull();
  });
});

describe("detectOverlongBody", () => {
  it("flags a body just over the default 3000-word threshold", () => {
    const body = Array(3001).fill("word").join(" ");
    const finding = detectOverlongBody(body);
    expect(finding?.kind).toBe("overlong_body");
    expect(finding?.detail?.wordCount).toBe(3001);
  });

  it("does not flag a body exactly at the threshold (3000 words)", () => {
    const body = Array(3000).fill("word").join(" ");
    expect(detectOverlongBody(body)).toBeNull();
  });

  it("does not flag a short body", () => {
    expect(detectOverlongBody("Just a few words here.")).toBeNull();
  });

  it("returns null on null body", () => {
    expect(detectOverlongBody(null)).toBeNull();
  });

  it("returns null on empty / whitespace body", () => {
    expect(detectOverlongBody("")).toBeNull();
    expect(detectOverlongBody("   ")).toBeNull();
  });

  it("honours a custom threshold", () => {
    const body = Array(50).fill("word").join(" ");
    // Default threshold 3000 → does not flag
    expect(detectOverlongBody(body)).toBeNull();
    // Custom threshold 40 → flags
    expect(detectOverlongBody(body, 40)?.kind).toBe("overlong_body");
  });
});

describe("auditNode body integration (WS-A2)", () => {
  it("returns no body findings when body is undefined (back-compat)", () => {
    const findings = auditNode({
      name: "Spandrel",
      description:
        "What Spandrel believes about agent-friendly knowledge graphs — structure emerges from content rather than being imposed; conversational coherence with agents is the design target; instruction stays separate from knowledge; paths are addresses",
      childNames: ["Philosophy", "Hypothesis", "Content Model", "Architecture", "Patterns"],
    });
    // No body kinds should appear.
    const kinds = findings.map((f) => f.kind);
    expect(kinds).not.toContain("stub_marker");
    expect(kinds).not.toContain("thin_body");
    expect(kinds).not.toContain("overlong_body");
  });

  it("combines body-level findings with description-level findings", () => {
    // Description that already triggers topic_opening + thin (composite, < 8
    // words, "How"-opening) plus a TBD-marked thin body on a composite node.
    const findings = auditNode({
      name: "Deployment",
      description: "How to run Spandrel",
      childNames: [
        "Local Development",
        "Static + flat-file MCP",
        "Production deployment",
      ],
      body: "TBD — fill this in.",
    });
    const kinds = findings.map((f) => f.kind);
    // Description-level findings still fire.
    expect(kinds).toContain("topic_opening");
    expect(kinds).toContain("thin");
    // Body-level findings also fire: TBD marker + thin body (< 50 composite
    // threshold).
    expect(kinds).toContain("stub_marker");
    expect(kinds).toContain("thin_body");
  });

  it("treats `body: null` as a present-but-empty body that fires thin_body", () => {
    const findings = auditNode({
      name: "Acme",
      description:
        "Acme — Enterprise SaaS client, onboarded Q2 2025, $2.4M ARR, primary account lead is Jane",
      childNames: [],
      body: null,
    });
    const kinds = findings.map((f) => f.kind);
    expect(kinds).toContain("thin_body");
    expect(kinds).not.toContain("stub_marker");
    expect(kinds).not.toContain("overlong_body");
  });
});
