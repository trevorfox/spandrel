import type { SpandrelNode, SpandrelEdge, ValidationWarning } from "../compiler/types.js";

export interface EdgeFilter {
  from?: string;
  to?: string;
  type?: SpandrelEdge["type"];
}

export interface GraphStore {
  getNode(path: string): SpandrelNode | undefined;
  hasNode(path: string): boolean;
  getAllNodes(): IterableIterator<SpandrelNode>;
  getEdges(filter?: EdgeFilter): SpandrelEdge[];
  getWarnings(): ValidationWarning[];

  setNode(node: SpandrelNode): void;
  deleteNode(path: string): void;
  replaceEdges(edges: SpandrelEdge[]): void;
  replaceWarnings(warnings: ValidationWarning[]): void;
  clear(): void;

  readonly nodeCount: number;
  readonly edgeCount: number;
}
