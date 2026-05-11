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
    | "staleness";              // 3 freshness subkinds (subkind in message)
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
