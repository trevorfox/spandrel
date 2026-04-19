import type { SpandrelNode, SpandrelEdge, ValidationWarning, LinkTypeInfo } from "../compiler/types.js";

export interface EdgeFilter {
  from?: string;
  to?: string;
  type?: SpandrelEdge["type"];
}

export interface GraphStore {
  getNode(path: string): Promise<SpandrelNode | undefined>;
  hasNode(path: string): Promise<boolean>;
  getAllNodes(): Promise<SpandrelNode[]>;
  getNodes(paths: string[]): Promise<Map<string, SpandrelNode>>;
  getEdges(filter?: EdgeFilter): Promise<SpandrelEdge[]>;
  getEdgesBatch(paths: string[]): Promise<Map<string, SpandrelEdge[]>>;
  getWarnings(): Promise<ValidationWarning[]>;
  /**
   * Returns the link-type vocabulary declared under `/linkTypes/`, keyed by
   * filename stem (e.g. `"owns"` for `/linkTypes/owns.md`). Returns an empty
   * Map when the graph has no `/linkTypes/` collection.
   */
  getLinkTypes(): Promise<Map<string, LinkTypeInfo>>;

  setNode(node: SpandrelNode): Promise<void>;
  deleteNode(path: string): Promise<void>;
  replaceEdges(edges: SpandrelEdge[]): Promise<void>;
  replaceWarnings(warnings: ValidationWarning[]): Promise<void>;
  clear(): Promise<void>;

  readonly nodeCount: number;
  readonly edgeCount: number;
}
