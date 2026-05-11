/**
 * Integration test for the collection-schema validator (WS-C3) end-to-end
 * through `compile → addGitMetadata → runAuditPass`. Two static fixtures
 * under `test/fixtures/collection-schemas/`:
 *
 *   - `valid/` — one strict client schema, one passing member. Expectation:
 *     zero schema-validator warnings (heuristic findings may still fire and
 *     are filtered out here).
 *   - `violating/` — same strict schema, one member that violates every axis
 *     of Example A in the spec. Expectation: the six listed warnings fire.
 *
 * Schema-validator warnings are identified by the nine new
 * `ValidationWarning.type` codes added in this workstream.
 */
import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile, addGitMetadata } from "../src/compiler/compiler.js";
import { runAuditPass } from "../src/compiler/audit-pass.js";
import type { ValidationWarning } from "../src/compiler/types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(here, "fixtures/collection-schemas");

const SCHEMA_TYPES: ReadonlySet<ValidationWarning["type"]> = new Set([
  "missing_required_field",
  "field_enum_violation",
  "schema_violation",
  "missing_required_link",
  "disallowed_link_type",
  "link_target_mismatch",
  "missing_required_subcollection",
  "naming_violation",
  "invalid_graph_schema",
]);

async function schemaWarningsFor(fixture: string): Promise<ValidationWarning[]> {
  const root = path.join(FIXTURES, fixture);
  const store = await compile(root);
  await addGitMetadata(store, root);
  await runAuditPass(store, "2026-05-10T00:00:00Z", root);
  const all = await store.getWarnings();
  return all.filter((w) => SCHEMA_TYPES.has(w.type));
}

describe("collection-schemas — valid fixture", () => {
  it("compiles with zero schema-validator warnings", async () => {
    const warnings = await schemaWarningsFor("valid");
    expect(warnings).toEqual([]);
  });
});

describe("collection-schemas — violating fixture", () => {
  it("fires the six warning codes spec Example A predicts", async () => {
    const warnings = await schemaWarningsFor("violating");
    const codes = new Set(warnings.map((w) => w.type));
    // Spec Example A lists exactly these six.
    expect(codes).toEqual(
      new Set([
        "missing_required_field",
        "missing_required_link",
        "link_target_mismatch",
        "disallowed_link_type",
        "missing_required_subcollection",
        "naming_violation",
      ]),
    );
  });

  it("emits exactly one warning per code (no duplicate firings)", async () => {
    const warnings = await schemaWarningsFor("violating");
    // The violating fixture has one member; each rule fires once. (Multiple
    // failures of the same rule on the same member would each get a row;
    // we constructed the fixture to fire each rule exactly once.)
    expect(warnings.length).toBe(6);
  });

  it("attaches every warning to the violating member's path", async () => {
    const warnings = await schemaWarningsFor("violating");
    for (const w of warnings) {
      expect(w.path).toBe("/clients/Globex_Industries");
    }
  });

  it("includes the offending value in field-level warnings", async () => {
    const warnings = await schemaWarningsFor("violating");
    const missing = warnings.find((w) => w.type === "missing_required_field");
    expect(missing?.message).toContain("tier");
    const mismatch = warnings.find((w) => w.type === "link_target_mismatch");
    expect(mismatch?.message).toContain("/people/jane-doe");
    expect(mismatch?.message).toContain("/teams/");
    const naming = warnings.find((w) => w.type === "naming_violation");
    expect(naming?.message).toContain("Globex_Industries");
  });
});
