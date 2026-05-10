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
   * Returns the link-type registry loaded from `_links/config.yaml`, keyed by
   * the canonical stem (e.g. `"owns"`). Returns an empty Map when the graph
   * has no `_links/config.yaml`. The registry is an authoring artifact —
   * agents do not see it at traversal time.
   */
  getLinkTypes(): Promise<Map<string, LinkTypeInfo>>;

  setNode(node: SpandrelNode): Promise<void>;
  deleteNode(path: string): Promise<void>;
  replaceEdges(edges: SpandrelEdge[]): Promise<void>;
  replaceWarnings(warnings: ValidationWarning[]): Promise<void>;
  replaceLinkTypes(linkTypes: Map<string, LinkTypeInfo>): Promise<void>;
  clear(): Promise<void>;

  readonly nodeCount: number;
  readonly edgeCount: number;
}
