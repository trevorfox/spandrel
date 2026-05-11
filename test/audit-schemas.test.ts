/**
 * Unit tests for the collection-schema validator (`src/audit/schemas.ts`).
 *
 * Pure-function tests: build a `CollectionSchema` and a `MemberValidationInput`,
 * call `validateMember`, assert on the returned `SchemaWarning[]`. No
 * filesystem, no compile pipeline.
 *
 * Spec under test: `specs/2026-05-10-collection-schemas.md`. Cases below map
 * 1:1 onto the worked examples and warning-vocabulary table in the spec.
 */
import { describe, expect, it } from "vitest";
import {
  validateGraphSchema,
  validateMember,
  matchesTargetPrefix,
  type CollectionSchema,
  type MemberValidationInput,
} from "../src/audit/schemas.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeMember(
  overrides: Partial<MemberValidationInput> = {},
): MemberValidationInput {
  return {
    path: "/clients/acme-corp",
    frontmatter: {
      name: "Acme Corp",
      description: "Industrial supplier; strategic account since 2023",
      tier: "strategic",
    },
    links: [],
    isComposite: true,
    childPaths: [],
    ...overrides,
  };
}

/** Spec Example A's strict client schema — the canonical fixture. */
const STRICT_CLIENT_SCHEMA: CollectionSchema = {
  schema: {
    type: "object",
    required: ["name", "description", "tier"],
    properties: {
      tier: {
        type: "string",
        enum: ["strategic", "growth", "transactional"],
      },
      industry: { type: "string" },
    },
  },
  graph: {
    outgoing_links: {
      "served-by": { required: true, target: "/teams/" },
      "account-lead": { required: true, target: "/people/" },
      "relates-to": {},
    },
    enforce: true,
    required_subcollections: ["contracts"],
    naming: { child_path_pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" },
  },
};

// ---------------------------------------------------------------------------
// validateMember — JSON Schema (`schema:`) half
// ---------------------------------------------------------------------------

describe("validateMember — schema: half", () => {
  it("passes a fully-conforming member with zero warnings", () => {
    const member = makeMember({
      path: "/clients/acme-corp",
      links: [
        { to: "/teams/data", type: "served-by", description: "Data team owns this account" },
        { to: "/people/jane", type: "account-lead", description: "Account lead since Q2 2024" },
      ],
      childPaths: ["/clients/acme-corp/contracts"],
    });
    const warnings = validateMember(STRICT_CLIENT_SCHEMA, member);
    expect(warnings).toEqual([]);
  });

  it("fires missing_required_field when a required key is absent", () => {
    const member = makeMember({
      frontmatter: { name: "Globex", description: "Logistics conglomerate" },
      // `tier` is missing.
      links: [
        { to: "/teams/data", type: "served-by", description: "X" },
        { to: "/people/jane", type: "account-lead", description: "Y" },
      ],
      childPaths: ["/clients/acme-corp/contracts"],
    });
    const warnings = validateMember(STRICT_CLIENT_SCHEMA, member);
    const missing = warnings.find((w) => w.code === "missing_required_field");
    expect(missing).toBeDefined();
    expect(missing?.message).toContain("`tier`");
  });

  it("fires field_enum_violation when an enum value is wrong", () => {
    const member = makeMember({
      frontmatter: {
        name: "Acme",
        description: "Acme co",
        tier: "enterprise", // not in [strategic, growth, transactional]
      },
      links: [
        { to: "/teams/data", type: "served-by", description: "X" },
        { to: "/people/jane", type: "account-lead", description: "Y" },
      ],
      childPaths: ["/clients/acme-corp/contracts"],
    });
    const warnings = validateMember(STRICT_CLIENT_SCHEMA, member);
    const enumViolation = warnings.find((w) => w.code === "field_enum_violation");
    expect(enumViolation).toBeDefined();
    expect(enumViolation?.message).toContain("enterprise");
    expect(enumViolation?.message).toContain("strategic");
    expect(enumViolation?.message).toContain("growth");
    expect(enumViolation?.message).toContain("transactional");
  });

  it("fires schema_violation for other JSON Schema failures (pattern, minLength, type, …)", () => {
    const schema: CollectionSchema = {
      schema: {
        type: "object",
        required: ["name", "description"],
        properties: {
          description: { type: "string", minLength: 40 },
        },
      },
    };
    const member = makeMember({
      path: "/patterns/x",
      frontmatter: { name: "TBD", description: "covers stuff" }, // 12 chars
      isComposite: false,
    });
    const warnings = validateMember(schema, member);
    const violation = warnings.find((w) => w.code === "schema_violation");
    expect(violation).toBeDefined();
    expect(violation?.message).toContain("/description");
  });
});

// ---------------------------------------------------------------------------
// validateMember — graph: half (outgoing_links + enforce)
// ---------------------------------------------------------------------------

describe("validateMember — graph: outgoing_links and enforce", () => {
  it("fires missing_required_link when a required link type is absent", () => {
    const member = makeMember({
      path: "/clients/globex",
      frontmatter: { name: "Globex", description: "x", tier: "growth" },
      links: [
        // served-by present, account-lead missing.
        { to: "/teams/data", type: "served-by", description: "X" },
      ],
      childPaths: ["/clients/globex/contracts"],
    });
    const warnings = validateMember(STRICT_CLIENT_SCHEMA, member);
    const missing = warnings.find((w) => w.code === "missing_required_link");
    expect(missing).toBeDefined();
    expect(missing?.message).toContain("account-lead");
  });

  it("fires disallowed_link_type when enforce: true and a link's type isn't declared", () => {
    const member = makeMember({
      links: [
        { to: "/teams/data", type: "served-by", description: "X" },
        { to: "/people/jane", type: "account-lead", description: "Y" },
        { to: "/vendors/widget", type: "depends-on", description: "Sources widgets" },
      ],
      childPaths: ["/clients/acme-corp/contracts"],
    });
    const warnings = validateMember(STRICT_CLIENT_SCHEMA, member);
    const disallowed = warnings.find((w) => w.code === "disallowed_link_type");
    expect(disallowed).toBeDefined();
    expect(disallowed?.message).toContain("depends-on");
  });

  it("fires link_target_mismatch when an edge targets outside the declared prefix", () => {
    const member = makeMember({
      links: [
        // served-by should point at /teams/, but here it points at /people/.
        { to: "/people/jane", type: "served-by", description: "Jane handles this" },
        { to: "/people/jane", type: "account-lead", description: "Y" },
      ],
      childPaths: ["/clients/acme-corp/contracts"],
    });
    const warnings = validateMember(STRICT_CLIENT_SCHEMA, member);
    const mismatch = warnings.find((w) => w.code === "link_target_mismatch");
    expect(mismatch).toBeDefined();
    expect(mismatch?.message).toContain("served-by");
    expect(mismatch?.message).toContain("/people/jane");
    expect(mismatch?.message).toContain("/teams/");
  });

  it("implicitly allows `mentions` under enforce: true even when not declared", () => {
    const schema: CollectionSchema = {
      graph: {
        outgoing_links: {
          "served-by": { required: true, target: "/teams/" },
        },
        enforce: true,
      },
    };
    const member = makeMember({
      links: [
        { to: "/teams/data", type: "served-by", description: "X" },
        { to: "/topics/snowflake", type: "mentions", description: "Inline prose link" },
      ],
      childPaths: [],
    });
    const warnings = validateMember(schema, member);
    expect(warnings.find((w) => w.code === "disallowed_link_type")).toBeUndefined();
  });

  it("allows constraining mentions explicitly when declared", () => {
    // When mentions IS declared (with constraints), the implicit allow no
    // longer applies — the declaration takes over. A mentions edge to a
    // target outside the declared prefix still fires link_target_mismatch.
    const schema: CollectionSchema = {
      graph: {
        outgoing_links: {
          mentions: { target: "/topics/" },
        },
        enforce: true,
      },
    };
    const member = makeMember({
      links: [
        { to: "/people/jane", type: "mentions", description: "Inline mention" },
      ],
    });
    const warnings = validateMember(schema, member);
    expect(warnings.find((w) => w.code === "link_target_mismatch")).toBeDefined();
  });

  it("accepts a link pointing exactly AT the collection root (descendants-or-self)", () => {
    const schema: CollectionSchema = {
      graph: {
        outgoing_links: {
          "served-by": { required: true, target: "/teams/" },
        },
      },
    };
    const member = makeMember({
      links: [
        // Point AT /teams (not /teams/data) — must still be accepted.
        { to: "/teams", type: "served-by", description: "Some collective team responsibility" },
      ],
      childPaths: [],
    });
    const warnings = validateMember(schema, member);
    const mismatch = warnings.find((w) => w.code === "link_target_mismatch");
    expect(mismatch).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// validateMember — graph: required_subcollections + naming
// ---------------------------------------------------------------------------

describe("validateMember — required_subcollections", () => {
  it("fires missing_required_subcollection on composites missing the subcollection", () => {
    const member = makeMember({
      path: "/clients/globex",
      isComposite: true,
      childPaths: [], // no contracts/
      links: [
        { to: "/teams/data", type: "served-by", description: "X" },
        { to: "/people/jane", type: "account-lead", description: "Y" },
      ],
    });
    const warnings = validateMember(STRICT_CLIENT_SCHEMA, member);
    const subcollectionMissing = warnings.find(
      (w) => w.code === "missing_required_subcollection",
    );
    expect(subcollectionMissing).toBeDefined();
    expect(subcollectionMissing?.message).toContain("contracts");
  });

  it("silently skips required_subcollections on leaf members (per WS-C1 clarification)", () => {
    const member = makeMember({
      path: "/clients/quick-note",
      isComposite: false, // leaf — no directory form, no subcollections possible
      childPaths: [],
      links: [
        { to: "/teams/data", type: "served-by", description: "X" },
        { to: "/people/jane", type: "account-lead", description: "Y" },
      ],
    });
    const warnings = validateMember(STRICT_CLIENT_SCHEMA, member);
    const subcollectionMissing = warnings.find(
      (w) => w.code === "missing_required_subcollection",
    );
    expect(subcollectionMissing).toBeUndefined();
  });
});

describe("validateMember — naming", () => {
  it("fires naming_violation when the stem doesn't match the regex", () => {
    const member = makeMember({
      path: "/clients/Globex_Industries",
      isComposite: true,
      childPaths: ["/clients/Globex_Industries/contracts"],
      links: [
        { to: "/teams/data", type: "served-by", description: "X" },
        { to: "/people/jane", type: "account-lead", description: "Y" },
      ],
    });
    const warnings = validateMember(STRICT_CLIENT_SCHEMA, member);
    const naming = warnings.find((w) => w.code === "naming_violation");
    expect(naming).toBeDefined();
    expect(naming?.message).toContain("Globex_Industries");
  });

  it("respects ECMAScript regex semantics and no implicit anchoring", () => {
    // Pattern without anchors — `bar` matches anywhere in the stem.
    const schema: CollectionSchema = {
      graph: { naming: { child_path_pattern: "bar" } },
    };
    const matching = makeMember({ path: "/x/foo-bar-baz" });
    const notMatching = makeMember({ path: "/x/foo" });
    expect(
      validateMember(schema, matching).find((w) => w.code === "naming_violation"),
    ).toBeUndefined();
    expect(
      validateMember(schema, notMatching).find((w) => w.code === "naming_violation"),
    ).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// validateGraphSchema — meta-schema check
// ---------------------------------------------------------------------------

describe("validateGraphSchema — meta-schema", () => {
  it("accepts a well-formed graph: block", () => {
    const warnings = validateGraphSchema(STRICT_CLIENT_SCHEMA.graph, "/clients/DESIGN");
    expect(warnings).toEqual([]);
  });

  it("fires invalid_graph_schema for a typo'd top-level key", () => {
    const warnings = validateGraphSchema(
      { outgouing_links: {} }, // typo
      "/clients/DESIGN",
    );
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].code).toBe("invalid_graph_schema");
    expect(warnings[0].path).toBe("/clients/DESIGN");
    expect(warnings[0].message).toContain("outgouing_links");
  });

  it("fires invalid_graph_schema when enforce isn't a boolean", () => {
    const warnings = validateGraphSchema(
      { enforce: "yes" }, // should be boolean
      "/clients/DESIGN",
    );
    expect(warnings.some((w) => w.code === "invalid_graph_schema")).toBe(true);
  });

  it("rejects non-object inputs (arrays, strings)", () => {
    const arrWarnings = validateGraphSchema([], "/clients/DESIGN");
    expect(arrWarnings.some((w) => w.code === "invalid_graph_schema")).toBe(true);
    const strWarnings = validateGraphSchema("strict", "/clients/DESIGN");
    expect(strWarnings.some((w) => w.code === "invalid_graph_schema")).toBe(true);
  });

  it("returns no warnings for undefined / null (no declaration is fine)", () => {
    expect(validateGraphSchema(undefined, "/clients/DESIGN")).toEqual([]);
    expect(validateGraphSchema(null, "/clients/DESIGN")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Composability — schema and graph are independent
// ---------------------------------------------------------------------------

describe("validateMember — schema/graph independence", () => {
  it("a malformed graph at the audit layer doesn't disable schema: validation", () => {
    // Note: the audit-pass layer is what filters out malformed graph blocks
    // before they reach validateMember. This test exercises the converse —
    // when validateMember receives ONLY a schema (no graph), it still
    // produces schema-half warnings as usual.
    const schema: CollectionSchema = {
      schema: {
        type: "object",
        required: ["name", "description", "tier"],
      },
    };
    const member = makeMember({
      frontmatter: { name: "X", description: "Y" }, // tier missing
    });
    const warnings = validateMember(schema, member);
    const missing = warnings.find((w) => w.code === "missing_required_field");
    expect(missing).toBeDefined();
  });

  it("a malformed JSON Schema yields invalid_graph_schema (not a crash)", () => {
    // Ajv throws on `compile` when the schema itself is malformed. We use an
    // input Ajv rejects unambiguously regardless of strictness: `required`
    // must be an array of strings, not a scalar. (Earlier drafts used
    // `type: 42`, which can be silently ignored under `strict: false`.)
    const schema: CollectionSchema = {
      schema: {
        type: "object",
        required: "not-an-array",
      } as object,
    };
    const warnings = validateMember(schema, makeMember());
    const invalid = warnings.find((w) => w.code === "invalid_graph_schema");
    expect(invalid).toBeDefined();
    expect(invalid?.message.toLowerCase()).toContain("schema");
  });
});

// ---------------------------------------------------------------------------
// matchesTargetPrefix — descendants-or-self semantics
// ---------------------------------------------------------------------------

describe("matchesTargetPrefix — descendants-or-self", () => {
  it("matches the collection root itself", () => {
    expect(matchesTargetPrefix("/teams", "/teams/")).toBe(true);
    expect(matchesTargetPrefix("/teams", "/teams")).toBe(true);
  });

  it("matches descendants at any depth", () => {
    expect(matchesTargetPrefix("/teams/data", "/teams/")).toBe(true);
    expect(matchesTargetPrefix("/teams/data/leads", "/teams/")).toBe(true);
  });

  it("does NOT match sibling collections with the same prefix string", () => {
    // `/teamsX/` looks like it starts with `/teams` as a string prefix but
    // is a different collection — the segment-boundary check rejects it.
    expect(matchesTargetPrefix("/teamsX/data", "/teams/")).toBe(false);
    expect(matchesTargetPrefix("/teamsX", "/teams/")).toBe(false);
  });

  it("does NOT match unrelated paths", () => {
    expect(matchesTargetPrefix("/people/jane", "/teams/")).toBe(false);
    expect(matchesTargetPrefix("/", "/teams/")).toBe(false);
  });
});
