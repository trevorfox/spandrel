/**
 * Collection-schema validator (WS-C3). Implements the spec in
 * `specs/2026-05-10-collection-schemas.md`.
 *
 * A collection's `DESIGN.md` may declare two optional top-level frontmatter
 * keys: `schema:` (a JSON Schema document, Draft 2020-12, validating member
 * frontmatter) and `graph:` (a small Spandrel extension block for link
 * semantics, subcollection invariants, and naming rules JSON Schema can't
 * naturally express). This module validates every member of such a
 * collection against both declarations and produces advisory
 * `SchemaWarning`s that the caller maps onto `ValidationWarning`s.
 *
 * Design notes:
 * - **Pure.** No I/O, no compiler/store access. Callers pass everything in
 *   via `MemberValidationInput`. Same posture as `src/audit/heuristics.ts`.
 * - **JSON Schema library: Ajv 2020-12.** `strict: false` lets unknown
 *   keywords degrade gracefully instead of throwing — important because the
 *   spec promises authors that "you bring your knowledge" and Ajv's strict
 *   mode rejects perfectly-valid Draft 2020-12 documents that happen to use
 *   newer keywords. `allErrors: true` so every member violation surfaces as
 *   its own warning (not just the first).
 * - **Meta-schema for `graph:`.** Hardcoded as a TS const below — small
 *   enough that an external file would obscure rather than clarify. The
 *   meta-schema is the source of truth for what the `graph:` vocabulary
 *   accepts; typos and unknown keys produce `invalid_graph_schema`.
 * - **Strictness asymmetry (per spec).** Malformed `graph:` skips graph
 *   validation for that collection but doesn't disable the `schema:` half.
 *   Malformed `schema:` (Ajv throws on `addSchema`) also surfaces as
 *   `invalid_graph_schema` — one umbrella code, simpler vocabulary.
 * - **`target:` prefix semantics — descendants-or-self.** `target: /teams/`
 *   matches `/teams` exactly *and* every descendant `/teams/...`, but NOT
 *   `/teamsX/`. The match is on segment boundaries, not character prefix.
 */

import { Ajv2020 } from "ajv/dist/2020.js";
import * as addFormatsModule from "ajv-formats";
import type { ErrorObject } from "ajv";

// ajv-formats ships as a CJS module with the plugin on `default` and also on
// `module.exports`. Under Node16 ESM module resolution TypeScript sees the
// namespace shape; pluck the callable plugin off either form so
// `addFormats(ajv)` works regardless of the interop bridge.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormats: (ajv: Ajv2020) => Ajv2020 = ((addFormatsModule as any).default ??
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addFormatsModule) as (ajv: Ajv2020) => Ajv2020;

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------

/**
 * A `DESIGN.md`'s collection-schema declaration — the parsed `schema:` and
 * `graph:` keys from its frontmatter. Either or both may be present.
 */
export interface CollectionSchema {
  /** Raw JSON Schema for member frontmatter (Draft 2020-12). Opaque to this module. */
  schema?: object;
  /** Spandrel graph-extension block. See the spec for the vocabulary. */
  graph?: GraphSchema;
}

/**
 * The Spandrel `graph:` extension block. Each field is opt-in; absent
 * fields mean "no constraint." See the WS-C1 spec for the full vocabulary
 * rationale.
 */
export interface GraphSchema {
  /** Per-link-type declarations: required-ness and target-prefix constraints. */
  outgoing_links?: Record<string, GraphOutgoingLink>;
  /**
   * Closed vocabulary toggle. When `true`, members may only carry the link
   * types listed in `outgoing_links` — anything else fires `disallowed_link_type`.
   */
  enforce?: boolean;
  /** Subcollections every composite member must have. */
  required_subcollections?: string[];
  /** Path-stem patterns for naming validation. */
  naming?: { child_path_pattern?: string };
}

export interface GraphOutgoingLink {
  /** When `true`, members without at least one edge of this type fire `missing_required_link`. */
  required?: boolean;
  /** Path prefix that edges of this type must target (descendants-or-self). */
  target?: string;
}

/**
 * One member to validate. The caller (audit-pass) extracts everything from
 * the compiled graph; this module never touches the store directly.
 */
export interface MemberValidationInput {
  /** Member path (e.g. `/clients/acme`). */
  path: string;
  /** Member's parsed frontmatter (the object compared against `schema:`). */
  frontmatter: Record<string, unknown>;
  /** Member's outgoing links (already extracted from frontmatter). */
  links: Array<{ to: string; type: string; description: string | null }>;
  /** True for composite members (have a directory form). False for leaves. */
  isComposite: boolean;
  /** Direct subcollection paths — paths of subdirectories that have nodes (or stems of subcollections). */
  childPaths: string[];
}

export type SchemaWarningCode =
  | "missing_required_field"
  | "field_enum_violation"
  | "schema_violation"
  | "missing_required_link"
  | "disallowed_link_type"
  | "link_target_mismatch"
  | "missing_required_subcollection"
  | "naming_violation"
  | "invalid_graph_schema";

export interface SchemaWarning {
  path: string;
  code: SchemaWarningCode;
  message: string;
}

// ----------------------------------------------------------------------------
// Meta-schema for the `graph:` block
// ----------------------------------------------------------------------------

/**
 * Meta-schema describing the shape of `graph:`. Strict on keys
 * (`additionalProperties: false`) so a typo like `outgouing_links` surfaces
 * as `invalid_graph_schema` rather than silently disabling enforcement.
 *
 * Kept small and inline — every new key here costs one more decision an
 * author has to make. Extend with care.
 */
export const GRAPH_META_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://spandrel.org/schema/graph-meta.json",
  title: "Spandrel Collection `graph:` block",
  type: "object",
  additionalProperties: false,
  properties: {
    outgoing_links: {
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        properties: {
          required: { type: "boolean" },
          target: { type: "string" },
        },
      },
    },
    enforce: { type: "boolean" },
    required_subcollections: {
      type: "array",
      items: { type: "string" },
    },
    naming: {
      type: "object",
      additionalProperties: false,
      properties: {
        child_path_pattern: { type: "string" },
      },
    },
  },
} as const;

// ----------------------------------------------------------------------------
// Ajv setup
// ----------------------------------------------------------------------------

/**
 * Build a fresh Ajv instance for one validator pass.
 *
 * Why fresh-per-call rather than module-level: Ajv accumulates compiled
 * schemas in its internal cache. The validator is called once per
 * `DESIGN.md` declaration; resetting the cache each time keeps memory bounded
 * and avoids cross-collection schema-id collisions when authors don't supply
 * `$id`s.
 *
 * Config rationale:
 * - `strict: false` — accept perfectly-valid 2020-12 schemas that use
 *   keywords Ajv doesn't recognize. The spec promises author freedom; strict
 *   mode would punish authors for being current.
 * - `allErrors: true` — collect every violation, not just the first. Authors
 *   want the full picture per member, not a stream of "fix this, recompile,
 *   fix the next."
 */
function makeAjv(): Ajv2020 {
  const ajv = new Ajv2020({
    strict: false,
    allErrors: true,
    // `verbose: true` makes Ajv attach the original data value to each error
    // under `err.data`. We surface it in `field_enum_violation` so authors
    // see "value `enterprise`" instead of "<missing>". Cost is per-error
    // memory; for our scale (one DESIGN per collection) it's negligible.
    verbose: true,
  });
  // Allow `format: "uri"`, `"email"`, etc. inside member schemas. Cheap to
  // register; failure mode is "format not recognized → no validation," same
  // as `strict: false`.
  addFormats(ajv);
  return ajv;
}

// ----------------------------------------------------------------------------
// Meta-schema validator (cached at module load — cheap, stable)
// ----------------------------------------------------------------------------

const META_AJV = makeAjv();
const validateGraphAgainstMeta = META_AJV.compile(GRAPH_META_SCHEMA);

/**
 * Validate a `graph:` declaration against the meta-schema. Returns a list of
 * `invalid_graph_schema` warnings — empty when the declaration is well-formed.
 *
 * Callers should apply this before using the declaration to validate
 * members; if any warnings come back, the spec requires skipping the
 * `graph:` half of validation for that collection (the `schema:` half is
 * independent).
 *
 * @param graph - The candidate `graph:` block. May be any unknown shape.
 * @param designPath - The `DESIGN.md` node's path — used as the warning path.
 */
export function validateGraphSchema(
  graph: unknown,
  designPath: string,
): SchemaWarning[] {
  if (graph === undefined || graph === null) return [];
  if (typeof graph !== "object" || Array.isArray(graph)) {
    return [
      {
        path: designPath,
        code: "invalid_graph_schema",
        message: "`graph:` must be a mapping (object), got " +
          (Array.isArray(graph) ? "array" : typeof graph) + ".",
      },
    ];
  }

  const valid = validateGraphAgainstMeta(graph);
  if (valid) return [];

  const errors = validateGraphAgainstMeta.errors ?? [];
  return errors.map((err) => ({
    path: designPath,
    code: "invalid_graph_schema" as const,
    message: formatGraphMetaError(err),
  }));
}

function formatGraphMetaError(err: ErrorObject): string {
  // `instancePath` is `/outgoing_links/served-by/foo`; collapse to a
  // human-readable location for the warning.
  const where = err.instancePath || "graph:";
  if (err.keyword === "additionalProperties") {
    const extra = (err.params as { additionalProperty?: string })
      .additionalProperty;
    return `Unknown key \`${extra}\` at \`${where}\` (typo or unsupported key).`;
  }
  if (err.keyword === "type") {
    const expected = (err.params as { type?: string }).type;
    return `Expected \`${expected}\` at \`${where}\`: ${err.message}.`;
  }
  return `\`${where}\`: ${err.message ?? "invalid `graph:` block"}.`;
}

// ----------------------------------------------------------------------------
// Member validator
// ----------------------------------------------------------------------------

/**
 * Validate one member against the collection's declared schema(s). Returns
 * every `SchemaWarning` that fires; empty array means the member conforms.
 *
 * Order of operations:
 *   1. `schema:` half — Ajv-validate the member's frontmatter; map each Ajv
 *      error to the most specific of the three schema codes.
 *   2. `graph:` half — apply the meta-validated declaration's rules: required
 *      links, disallowed link types (under `enforce: true`), target prefix
 *      checks, required subcollections (composites only), naming regex.
 *
 * The two halves are independent — failure of one doesn't disable the other.
 */
export function validateMember(
  schema: CollectionSchema,
  member: MemberValidationInput,
): SchemaWarning[] {
  const warnings: SchemaWarning[] = [];

  // --- schema: half -------------------------------------------------------
  if (schema.schema !== undefined && schema.schema !== null) {
    const ajv = makeAjv();
    let validate;
    try {
      validate = ajv.compile(schema.schema);
    } catch (err) {
      // Malformed JSON Schema (e.g. invalid `type` value) — Ajv throws on
      // compile. Per spec convention, treat as `invalid_graph_schema` (one
      // umbrella code; not worth a separate `invalid_member_schema` for v1).
      // The warning lives on the member path so authors see it in context,
      // though strictly it's the DESIGN that's at fault. Caller may also
      // surface a DESIGN-level invalid_graph_schema when iterating.
      const reason = err instanceof Error ? err.message : String(err);
      warnings.push({
        path: member.path,
        code: "invalid_graph_schema",
        message: `\`schema:\` block on the collection's DESIGN is malformed: ${reason}`,
      });
      // Skip schema-half validation for this member; continue with graph half.
    }
    if (validate) {
      const ok = validate(member.frontmatter);
      if (!ok) {
        for (const err of validate.errors ?? []) {
          warnings.push(mapAjvError(err, member.path));
        }
      }
    }
  }

  // --- graph: half --------------------------------------------------------
  if (schema.graph) {
    const graph = schema.graph;

    // outgoing_links: required + target checks. enforce: disallowed types.
    const declaredTypes = new Set(Object.keys(graph.outgoing_links ?? {}));

    if (graph.outgoing_links) {
      for (const [linkType, decl] of Object.entries(graph.outgoing_links)) {
        if (decl.required) {
          const hasEdge = member.links.some((l) => l.type === linkType);
          if (!hasEdge) {
            warnings.push({
              path: member.path,
              code: "missing_required_link",
              message: `Member missing required outgoing link of type \`${linkType}\`.`,
            });
          }
        }
        if (decl.target !== undefined) {
          for (const link of member.links) {
            if (link.type !== linkType) continue;
            if (!matchesTargetPrefix(link.to, decl.target)) {
              warnings.push({
                path: member.path,
                code: "link_target_mismatch",
                message: `Link of type \`${linkType}\` targets \`${link.to}\` but declared target prefix is \`${decl.target}\` (descendants-or-self).`,
              });
            }
          }
        }
      }
    }

    if (graph.enforce === true) {
      // Closed vocabulary: every outgoing link type must be declared.
      // Note: `mentions` (inline-prose) edges are still emitted by the
      // compiler. The spec doesn't carve them out explicitly; treat them
      // like any other typed link. If a graph wants to allow ambient
      // mentions everywhere, it adds `mentions: {}` to its declaration.
      for (const link of member.links) {
        if (!declaredTypes.has(link.type)) {
          warnings.push({
            path: member.path,
            code: "disallowed_link_type",
            message: `Link type \`${link.type}\` is not declared in this collection's \`outgoing_links\` (enforce: true).`,
          });
        }
      }
    }

    // required_subcollections: only enforced on composite members.
    if (graph.required_subcollections && member.isComposite) {
      const childStems = new Set(
        member.childPaths.map((p) => stemOf(p)),
      );
      for (const required of graph.required_subcollections) {
        if (!childStems.has(required)) {
          warnings.push({
            path: member.path,
            code: "missing_required_subcollection",
            message: `Member missing required subcollection \`${required}\`.`,
          });
        }
      }
    }

    // naming: regex on the member's stem.
    if (graph.naming?.child_path_pattern !== undefined) {
      const pattern = graph.naming.child_path_pattern;
      let re: RegExp;
      try {
        re = new RegExp(pattern);
      } catch (err) {
        // Unparseable regex on the DESIGN — surface as invalid_graph_schema
        // (the meta-schema can only check string-ness, not regex validity).
        const reason = err instanceof Error ? err.message : String(err);
        warnings.push({
          path: member.path,
          code: "invalid_graph_schema",
          message: `\`graph.naming.child_path_pattern\` is not a valid regex: ${reason}`,
        });
        return warnings;
      }
      const stem = stemOf(member.path);
      if (!re.test(stem)) {
        warnings.push({
          path: member.path,
          code: "naming_violation",
          message: `Path stem \`${stem}\` does not match \`graph.naming.child_path_pattern\` (\`${pattern}\`).`,
        });
      }
    }
  }

  return warnings;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/**
 * Map an Ajv error to the most specific `SchemaWarning`. The spec singles
 * out two common codes (`missing_required_field`, `field_enum_violation`)
 * because they're the most common author-facing failures; everything else
 * falls under `schema_violation` with the keyword + path in the message.
 */
function mapAjvError(err: ErrorObject, memberPath: string): SchemaWarning {
  if (err.keyword === "required") {
    const missing = (err.params as { missingProperty?: string })
      .missingProperty ?? "<unknown>";
    return {
      path: memberPath,
      code: "missing_required_field",
      message: `Field \`${missing}\` is required but missing.`,
    };
  }
  if (err.keyword === "enum") {
    const allowed =
      (err.params as { allowedValues?: unknown[] }).allowedValues ?? [];
    const where = err.instancePath || "/";
    const observed = err.data ?? "<missing>";
    return {
      path: memberPath,
      code: "field_enum_violation",
      message: `Field \`${where}\` has value \`${String(observed)}\` but must be one of: ${allowed
        .map((v) => String(v))
        .join(", ")}.`,
    };
  }
  // Fallback: every other JSON Schema failure. Ajv's `message` is typically
  // short and human-readable; combine with the instancePath for context.
  const where = err.instancePath || "/";
  const reason = err.message ?? "schema violation";
  return {
    path: memberPath,
    code: "schema_violation",
    message: `Field \`${where}\`: ${reason} (keyword: ${err.keyword}).`,
  };
}

/**
 * Match a path against a prefix declaration with descendants-or-self
 * semantics. The spec calls this out explicitly:
 *
 *   `target: /teams/` matches `/teams`, `/teams/data`, `/teams/data/leads`
 *   `target: /teams/` does NOT match `/teamsX/`
 *
 * Implementation: strip trailing slash from prefix; match exact OR
 * prefix-followed-by-slash (so the comparison happens on segment
 * boundaries).
 */
export function matchesTargetPrefix(to: string, prefix: string): boolean {
  const p = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  return to === p || to.startsWith(p + "/");
}

/**
 * Final path segment — the "stem." For `/clients/acme-corp` returns
 * `acme-corp`. The compiler already strips the `.md` extension when it
 * builds node paths, so this is just the last segment of the slash-delimited
 * path. The root path `/` has an empty stem.
 */
function stemOf(path: string): string {
  const segments = path.split("/").filter((s) => s.length > 0);
  return segments.length > 0 ? segments[segments.length - 1] : "";
}
