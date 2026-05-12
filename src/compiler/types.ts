export interface SpandrelNode {
  path: string;
  name: string;
  description: string;
  nodeType: "leaf" | "composite";
  depth: number;
  parent: string | null;
  children: string[];
  content: string;
  frontmatter: Record<string, unknown>;
  created: string | null;
  updated: string | null;
  author: string | null;
  /**
   * Distinguishes curated graph content (`node`, default) from reference
   * material (`document`). Documents are searchable and linkable but excluded
   * from default child listings unless `includeNonNavigable` is requested.
   * Companion files (DESIGN.md, SKILL.md, AGENT.md, README.md, CLAUDE.md,
   * AGENTS.md) compile as `document` nodes with `navigable: false`.
   */
  kind?: "node" | "document";
  /**
   * When false, excluded from default `getChildren` and collection-index
   * listings. Default true. Companion-file nodes are emitted with
   * `navigable: false`.
   */
  navigable?: boolean;
}

export interface SpandrelEdge {
  from: string;
  to: string;
  type: "hierarchy" | "link" | "authored_by";
  linkType?: string;
  description?: string;
}

export interface ValidationWarning {
  path: string;
  type:
    | "missing_index"
    | "missing_name"
    | "missing_description"
    | "broken_link"
    | "unlisted_child"
    | "file_too_large"
    | "compile_timeout"
    | "invalid_frontmatter"
    | "unknown_link_type"      // replaces undeclared_link_type
    | "underused_link_type"    // new: min_uses governance
    | "companion_file_lowercase"
    // --- Audit-pass warnings (WS-B1) ---
    // These come from `src/audit/` heuristics and are advisory. The specific
    // Finding kind/subkind is encoded in the `message` as `[<kind>]` or
    // `[<kind>.<subkind>]` so CI/skill consumers can grep without parsing
    // a separate detail field (G6 decision: no `detail` on warnings).
    | "weak_description"        // covers 5 node-level Finding kinds (kind in message)
    | "weak_edge_description"   // edge descriptions (subkind in message)
    | "stub_marker"             // body contains TBD/TODO/WIP/etc.
    | "thin_body"               // body shorter than threshold
    | "overlong_body"           // body longer than threshold
    | "staleness"               // 3 freshness subkinds (subkind in message)
    // --- Collection-schema validator warnings (WS-C3) ---
    // Emitted by `src/audit/schemas.ts` when a DESIGN.md declares
    // `schema:` and/or `graph:` and a member doesn't conform. Advisory;
    // shape constraints layer on top of the framework-wide minimum.
    | "missing_required_field"        // schema: `required` names a key the member doesn't have
    | "field_enum_violation"          // schema: a field's value isn't in the declared `enum`
    | "schema_violation"              // schema: any other JSON Schema failure (catch-all)
    | "missing_required_link"         // graph: required outgoing-link type is absent
    | "disallowed_link_type"          // graph: enforce: true + link type not declared
    | "link_target_mismatch"          // graph: edge targets outside the declared prefix
    | "missing_required_subcollection"// graph: required subcollection missing (composites only)
    | "naming_violation"              // graph: stem doesn't match child_path_pattern
    | "invalid_graph_schema"          // DESIGN's own graph: (or schema:) block is malformed
    // --- Semantic-tier audit warnings (Phase E1) ---
    // Emitted by `spandrel audit --semantic` after `spandrel embed` has
    // populated the per-graph embedding store. Advisory; surfaces pairs of
    // nodes that are semantically close but graph-distant (no link-type
    // edge connects them). See `src/audit/missing-links.ts` and the spec
    // at `specs/2026-05-11-phase-e1-missing-link-detection.md`.
    | "missing_link";                 // pair semantically close, no link edge
  message: string;
}

/**
 * The wire-shape of a link-type entry, exposed via REST `GET /linkTypes`,
 * `Graph.linkTypes` in the prerendered manifest, and consumed by the web
 * viewer's drawer for type-grouped edge rendering.
 *
 * Sourced from `_links/config.yaml` (NOT from `/linkTypes/{stem}.md` Things
 * — that pattern was removed in 0.9.0). The canonical key is `stem`; there
 * is no separate display name. Description is optional.
 */
export interface LinkTypeInfo {
  stem: string;
  description?: string;
}

export interface SpandrelGraph {
  nodes: Map<string, SpandrelNode>;
  edges: SpandrelEdge[];
  warnings: ValidationWarning[];
  linkTypes: Map<string, LinkTypeInfo>;
}

export interface HistoryEntry {
  hash: string;
  date: string;
  author: string;
  message: string;
}
