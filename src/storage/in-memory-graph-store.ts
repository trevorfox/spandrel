import type { SpandrelNode, SpandrelEdge, ValidationWarning } from "../compiler/types.js";
import type { EdgeFilter, GraphStore } from "./graph-store.js";

export class InMemoryGraphStore implements GraphStore {
  private nodes = new Map<string, SpandrelNode>();
  private edges: SpandrelEdge[] = [];
  private warnings: ValidationWarning[] = [];

  getNode(path: string): SpandrelNode | undefined {
    return this.nodes.get(path);
  }

  hasNode(path: string): boolean {
    return this.nodes.has(path);
  }

  getAllNodes(): IterableIterator<SpandrelNode> {
    return this.nodes.values();
  }

  getEdges(filter?: EdgeFilter): SpandrelEdge[] {
    if (!filter) return this.edges;
    return this.edges.filter(
      (e) =>
        (!filter.from || e.from === filter.from) &&
        (!filter.to || e.to === filter.to) &&
        (!filter.type || e.type === filter.type),
    );
  }

  getWarnings(): ValidationWarning[] {
    return this.warnings;
  }

  setNode(node: SpandrelNode): void {
    this.nodes.set(node.path, node);
  }

  deleteNode(path: string): void {
    this.nodes.delete(path);
  }

  replaceEdges(edges: SpandrelEdge[]): void {
    this.edges = edges;
  }

  replaceWarnings(warnings: ValidationWarning[]): void {
    this.warnings = warnings;
  }

  clear(): void {
    this.nodes.clear();
    this.edges = [];
    this.warnings = [];
  }

  get nodeCount(): number {
    return this.nodes.size;
  }

  get edgeCount(): number {
    return this.edges.length;
  }
}
