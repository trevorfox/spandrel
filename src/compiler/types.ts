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
    | "undeclared_link_type"
    | "companion_file_lowercase";
  message: string;
}

/**
 * Metadata about a link type declared as a Thing under `/linkTypes/`.
 * The canonical key for a link type is its filename stem (e.g. `owns.md`
 * → `"owns"`), not the `name` frontmatter field — the stem stays stable
 * across display-name renames.
 */
export interface LinkTypeInfo {
  name: string;
  description: string;
  path: string;
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
