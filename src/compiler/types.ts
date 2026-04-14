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
  type: "missing_index" | "missing_name" | "missing_description" | "broken_link" | "unlisted_child";
  message: string;
}

export interface SpandrelGraph {
  nodes: Map<string, SpandrelNode>;
  edges: SpandrelEdge[];
  warnings: ValidationWarning[];
}

export interface HistoryEntry {
  hash: string;
  date: string;
  author: string;
  message: string;
}
