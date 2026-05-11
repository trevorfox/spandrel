import { describe, expect, it } from "vitest";
import {
  auditNode,
  detectAbsoluteStaleness,
  detectDifferentialStaleness,
  detectHighFanInLowFreshness,
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

  it("suppresses on composites with ≥3 children (item #6)", () => {
    // Collection-index "How X" framing is correct authoring for a composite
    // that introduces a real subtree.
    const finding = detectTopicOpening(
      "How the practice runs — ClickUp, Google Workspace, automation",
      undefined,
      true,
      5,
    );
    expect(finding).toBeNull();
  });

  it("still fires on a leaf with the same description (item #6 isn't over-suppressing)", () => {
    const finding = detectTopicOpening(
      "How the practice runs — ClickUp, Google Workspace, automation",
      undefined,
      false,
      0,
    );
    expect(finding?.kind).toBe("topic_opening");
  });

  it("still fires on a composite with <3 children", () => {
    const finding = detectTopicOpening(
      "How the practice runs — ClickUp, Google Workspace, automation",
      undefined,
      true,
      2,
    );
    expect(finding?.kind).toBe("topic_opening");
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

  it("suppresses thin on container composites with ≥3 substantive children (item #8)", () => {
    // Composite with a brief 7-word description but ≥3 children whose own
    // descriptions average ≥8 words → suppression applies.
    const finding = detectThinness(
      "Internal services — what EA sells", // 6 words
      true,
      undefined,
      4,
      12,
    );
    expect(finding).toBeNull();
  });

  it("still fires when child descriptions average below the substance threshold", () => {
    const finding = detectThinness(
      "Internal services — what EA sells",
      true,
      undefined,
      4,
      3,
    );
    expect(finding?.kind).toBe("thin");
  });

  it("still fires on a composite with <3 children regardless of child substance", () => {
    const finding = detectThinness(
      "Internal services — what EA sells",
      true,
      undefined,
      2,
      20,
    );
    expect(finding?.kind).toBe("thin");
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

  it("does not fire topic_opening on a composite with ≥3 children (item #6 suppression)", () => {
    // The pre-PR-#14 state of /deployment/index.md was a composite with three
    // children. Item #6 from SPANDREL-FEEDBACK.md suppresses `topic_opening`
    // on composites whose children give the description its real meaning —
    // a collection-index "How X" framing is correct authoring there. The
    // detector still fires on the same description when it's a leaf (see
    // detectTopicOpening unit tests).
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
    expect(kinds).not.toContain("topic_opening");
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
  it("flags TBD as an author_todo stub marker", () => {
    const findings = detectStubMarkers("This section is TBD until we decide.");
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("stub_marker");
    expect(findings[0].detail?.subkind).toBe("author_todo");
    expect(findings[0].detail?.matches).toContain("TBD");
  });

  it("flags TODO as an author_todo stub marker", () => {
    const findings = detectStubMarkers("TODO: write a real explanation here");
    expect(findings).toHaveLength(1);
    expect(findings[0].detail?.subkind).toBe("author_todo");
    expect(findings[0].detail?.matches).toContain("TODO");
  });

  it("flags WIP as an author_todo stub marker", () => {
    const findings = detectStubMarkers("Status: WIP — not yet ready.");
    expect(findings).toHaveLength(1);
    expect(findings[0].detail?.subkind).toBe("author_todo");
    expect(findings[0].detail?.matches).toContain("WIP");
  });

  it("flags `(auto-generated stub)` as framework_scaffold", () => {
    const findings = detectStubMarkers(
      "Some node body. (auto-generated stub) Replace me.",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].detail?.subkind).toBe("framework_scaffold");
    expect(findings[0].detail?.matches).toContain("(auto-generated stub)");
  });

  it("flags `[placeholder]` as template_placeholder", () => {
    const findings = detectStubMarkers("Intro paragraph [placeholder] follow-up.");
    expect(findings).toHaveLength(1);
    expect(findings[0].detail?.subkind).toBe("template_placeholder");
    expect(findings[0].detail?.matches).toContain("[placeholder]");
  });

  it("matches stub markers case-insensitively", () => {
    const findings = detectStubMarkers("tbd: todo this later");
    expect(findings).toHaveLength(1);
    // Both TBD and TODO are author_todo → one finding with both labels.
    expect(findings[0].detail?.subkind).toBe("author_todo");
    const matches = findings[0].detail?.matches as string[];
    expect(matches).toContain("TBD");
    expect(matches).toContain("TODO");
  });

  it("groups same-subkind markers into one finding", () => {
    const findings = detectStubMarkers(
      "TODO: explain. TBD: confirm. WIP later.",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].detail?.subkind).toBe("author_todo");
    const matches = findings[0].detail?.matches as string[];
    expect(matches).toContain("TODO");
    expect(matches).toContain("TBD");
    expect(matches).toContain("WIP");
  });

  it("emits separate findings for different subkinds", () => {
    // Mixed framework_scaffold + author_todo + template_placeholder → 3 findings.
    const findings = detectStubMarkers(
      "Initial body (auto-generated stub). TODO: finish. Section: [placeholder].",
    );
    expect(findings).toHaveLength(3);
    const subkinds = findings.map((f) => f.detail?.subkind);
    expect(subkinds).toContain("framework_scaffold");
    expect(subkinds).toContain("author_todo");
    expect(subkinds).toContain("template_placeholder");
  });

  it("does not flag words that contain marker substrings (word boundary)", () => {
    // `TBD`, `TODO`, `WIP` embedded inside larger words (`TBDriver`, `TODOS`,
    // `WIPing`) must not fire because `\b` is enforced. Without word
    // boundaries, this body would trip all three markers.
    const findings = detectStubMarkers(
      "The TBDriver class extends BaseDriver and tracks unsorted TODOS in a queue. WIPing the disk reformats it.",
    );
    expect(findings).toEqual([]);
  });

  it("returns empty array on null body", () => {
    expect(detectStubMarkers(null)).toEqual([]);
  });

  it("returns empty array on empty / whitespace body", () => {
    expect(detectStubMarkers("")).toEqual([]);
    expect(detectStubMarkers("   \n  ")).toEqual([]);
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

  it("suppresses on container composites — empty body + ≥3 substantive children (item #8)", () => {
    // Composite with 0-word body but 4 children whose descriptions average
    // 12 words → container composite → suppression applies.
    const finding = detectThinBody("", true, 50, 20, 4, 12);
    expect(finding).toBeNull();
  });

  it("still fires on a composite when children are below substance threshold", () => {
    const finding = detectThinBody("", true, 50, 20, 4, 3);
    expect(finding?.kind).toBe("thin_body");
  });

  it("still fires on a leaf with 0-word body even when no children present", () => {
    // Container suppression is composite-only; leaves never have children
    // to defer content to.
    const finding = detectThinBody("", false, 50, 20, 0, 0);
    expect(finding?.kind).toBe("thin_body");
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
    // Description triggers topic_opening + thin (composite with < 3 children
    // so item #6's suppression doesn't kick in, < 8 words, "How"-opening).
    // Body trips stub_marker (TBD) + thin_body (< 50-word composite threshold).
    const findings = auditNode({
      name: "Deployment",
      description: "How to run Spandrel",
      childNames: ["Local Development", "Static + flat-file MCP"],
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

// ---------------------------------------------------------------------------
// Freshness detectors (WS-A3)
// ---------------------------------------------------------------------------
// All timestamps below are anchored against NOW = 2026-05-10T00:00:00Z so the
// arithmetic stays obvious in test diffs.

const NOW = "2026-05-10T00:00:00Z";

/** Returns an ISO timestamp `daysAgo` days before NOW. */
function daysBeforeNow(daysAgo: number): string {
  const ms = Date.parse(NOW) - daysAgo * 86_400_000;
  return new Date(ms).toISOString();
}

describe("detectAbsoluteStaleness", () => {
  it("flags a node updated well past the default threshold", () => {
    const finding = detectAbsoluteStaleness(daysBeforeNow(400), NOW);
    expect(finding?.kind).toBe("staleness");
    expect(finding?.detail?.subkind).toBe("absolute");
    expect(finding?.detail?.ageDays).toBe(400);
  });

  it("does not flag a freshly-updated node", () => {
    const finding = detectAbsoluteStaleness(daysBeforeNow(7), NOW);
    expect(finding).toBeNull();
  });

  it("does not flag exactly at the threshold (strict > semantics)", () => {
    // 180 days old with threshold 180 → clean. Matches the strict-comparison
    // convention shared by the description-level detectors (PR #16) and
    // WS-A2's body-density detectors — readers shouldn't have to remember
    // which detector uses which convention.
    const finding = detectAbsoluteStaleness(daysBeforeNow(180), NOW, 180);
    expect(finding).toBeNull();
  });

  it("does not flag just under the threshold", () => {
    // One day shy of the threshold → no finding.
    const finding = detectAbsoluteStaleness(daysBeforeNow(179), NOW, 180);
    expect(finding).toBeNull();
  });

  it("flags one day past the threshold", () => {
    // 181 days old with threshold 180 → flagged. Symmetric boundary coverage
    // with the just-under and at-threshold cases above.
    const finding = detectAbsoluteStaleness(daysBeforeNow(181), NOW, 180);
    expect(finding).not.toBeNull();
  });

  it("respects a caller-supplied threshold", () => {
    // 100 days old; default 180 wouldn't trip but a tighter 90 should.
    expect(detectAbsoluteStaleness(daysBeforeNow(100), NOW)).toBeNull();
    expect(detectAbsoluteStaleness(daysBeforeNow(100), NOW, 90)).not.toBeNull();
  });

  it("returns null for null/undefined/empty/malformed updated", () => {
    expect(detectAbsoluteStaleness(null, NOW)).toBeNull();
    expect(detectAbsoluteStaleness(undefined, NOW)).toBeNull();
    expect(detectAbsoluteStaleness("", NOW)).toBeNull();
    expect(detectAbsoluteStaleness("   ", NOW)).toBeNull();
    expect(detectAbsoluteStaleness("not-a-date", NOW)).toBeNull();
  });

  it("returns null when now is malformed", () => {
    expect(detectAbsoluteStaleness(daysBeforeNow(400), "garbage")).toBeNull();
  });
});

describe("detectDifferentialStaleness", () => {
  it("flags a node a year behind the median neighbor", () => {
    const finding = detectDifferentialStaleness(daysBeforeNow(500), [
      daysBeforeNow(10),
      daysBeforeNow(20),
      daysBeforeNow(50),
    ]);
    expect(finding?.kind).toBe("staleness");
    expect(finding?.detail?.subkind).toBe("differential");
    expect(finding?.detail?.neighborCount).toBe(3);
  });

  it("does not flag when the gap is below the threshold", () => {
    // Node 100 days old, neighbors clustered at 10/20/50 days → gap ~ 80 days < 365.
    const finding = detectDifferentialStaleness(daysBeforeNow(100), [
      daysBeforeNow(10),
      daysBeforeNow(20),
      daysBeforeNow(50),
    ]);
    expect(finding).toBeNull();
  });

  it("uses median, not max — resists a single recent outlier", () => {
    // One sibling edited yesterday (1 day ago), three siblings ~600 days old,
    // node is 500 days old. Median neighbor ≈ 600 days old → node is more
    // recent than the median → no finding.
    const finding = detectDifferentialStaleness(daysBeforeNow(500), [
      daysBeforeNow(1),
      daysBeforeNow(600),
      daysBeforeNow(610),
      daysBeforeNow(620),
    ]);
    expect(finding).toBeNull();
  });

  it("returns null when neighborUpdates is empty", () => {
    const finding = detectDifferentialStaleness(daysBeforeNow(500), []);
    expect(finding).toBeNull();
  });

  it("silently drops malformed neighbor timestamps", () => {
    // Two malformed, one valid (10 days old). Node is 500 days old →
    // gap ≈ 490 days > 365 → flagged.
    const finding = detectDifferentialStaleness(daysBeforeNow(500), [
      "garbage",
      "",
      daysBeforeNow(10),
    ]);
    expect(finding).not.toBeNull();
    expect(finding?.detail?.neighborCount).toBe(1);
  });

  it("returns null when nodeUpdated is missing", () => {
    expect(
      detectDifferentialStaleness(null, [daysBeforeNow(10)]),
    ).toBeNull();
    expect(
      detectDifferentialStaleness(undefined, [daysBeforeNow(10)]),
    ).toBeNull();
  });

  it("respects a caller-supplied threshold", () => {
    // Gap of ~200 days: default 365 wouldn't trip but a 90-day threshold should.
    const args = [daysBeforeNow(250), [daysBeforeNow(50)]] as const;
    expect(detectDifferentialStaleness(...args)).toBeNull();
    expect(detectDifferentialStaleness(args[0], args[1], 90)).not.toBeNull();
  });
});

describe("detectHighFanInLowFreshness", () => {
  it("flags a heavily-referenced node that hasn't been touched", () => {
    const finding = detectHighFanInLowFreshness(daysBeforeNow(400), NOW, 8);
    expect(finding?.kind).toBe("staleness");
    expect(finding?.detail?.subkind).toBe("high_fanin");
    expect(finding?.detail?.inDegree).toBe(8);
  });

  it("does not flag a low-fan-in node even if stale", () => {
    // Only 2 incoming refs — below default threshold of 5.
    const finding = detectHighFanInLowFreshness(daysBeforeNow(800), NOW, 2);
    expect(finding).toBeNull();
  });

  it("does not flag a fresh hub node", () => {
    const finding = detectHighFanInLowFreshness(daysBeforeNow(30), NOW, 20);
    expect(finding).toBeNull();
  });

  it("does not flag exactly at the fan-in threshold but below the age threshold", () => {
    const finding = detectHighFanInLowFreshness(daysBeforeNow(100), NOW, 5);
    expect(finding).toBeNull();
  });

  it("respects caller-supplied thresholds", () => {
    // 3 refs, 200 days old: defaults skip; a tighter (in=3, days=180) policy trips.
    expect(detectHighFanInLowFreshness(daysBeforeNow(200), NOW, 3)).toBeNull();
    expect(
      detectHighFanInLowFreshness(daysBeforeNow(200), NOW, 3, 3, 180),
    ).not.toBeNull();
  });

  it("returns null for missing/malformed timestamps", () => {
    expect(detectHighFanInLowFreshness(null, NOW, 10)).toBeNull();
    expect(detectHighFanInLowFreshness(undefined, NOW, 10)).toBeNull();
    expect(
      detectHighFanInLowFreshness(daysBeforeNow(400), "garbage", 10),
    ).toBeNull();
  });
});

describe("auditNode (freshness integration)", () => {
  it("combines freshness findings with description-level findings", () => {
    // Description trips `topic_opening`; git metadata trips absolute staleness
    // and high-fan-in staleness simultaneously. Two children — below item
    // #6's ≥3 suppression threshold so topic_opening still fires.
    const findings = auditNode({
      name: "Deployment",
      description:
        "How to run Spandrel — local development and production patterns",
      childNames: ["Local", "Static"],
      updated: daysBeforeNow(400),
      now: NOW,
      inDegree: 10,
    });
    const kinds = findings.map((f) => f.kind);
    expect(kinds).toContain("topic_opening");
    expect(kinds.filter((k) => k === "staleness").length).toBeGreaterThanOrEqual(
      2,
    );
    const subkinds = findings
      .filter((f) => f.kind === "staleness")
      .map((f) => f.detail?.subkind);
    expect(subkinds).toContain("absolute");
    expect(subkinds).toContain("high_fanin");
  });

  it("emits no freshness findings when freshness inputs are absent", () => {
    // Existing call shape — proves backwards compatibility.
    const findings = auditNode({
      name: "Spandrel",
      description:
        "What Spandrel believes about agent-friendly knowledge graphs — structure emerges from content rather than being imposed; conversational coherence with agents is the design target; instruction stays separate from knowledge; paths are addresses",
      childNames: ["Philosophy", "Hypothesis", "Content Model"],
    });
    expect(findings.every((f) => f.kind !== "staleness")).toBe(true);
  });
});
