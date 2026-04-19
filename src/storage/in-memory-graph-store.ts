import type { SpandrelNode, SpandrelEdge, ValidationWarning } from "../compiler/types.js";
import type { EdgeFilter, GraphStore } from "./graph-store.js";

export class InMemoryGraphStore implements GraphStore {
  private nodes = new Map<string, SpandrelNode>();
  private edges: SpandrelEdge[] = [];
  private warnings: ValidationWarning[] = [];

  async getNode(path: string): Promise<SpandrelNode | undefined> {
    return this.nodes.get(path);
  }

  async hasNode(path: string): Promise<boolean> {
    return this.nodes.has(path);
  }

  async getAllNodes(): Promise<SpandrelNode[]> {
    return [...this.nodes.values()];
  }

  async getNodes(paths: string[]): Promise<Map<string, SpandrelNode>> {
    const result = new Map<string, SpandrelNode>();
    for (const path of paths) {
      const node = this.nodes.get(path);
      if (node) result.set(path, node);
    }
    return result;
  }

  async getEdges(filter?: EdgeFilter): Promise<SpandrelEdge[]> {
    if (!filter) return this.edges;
    return this.edges.filter(
      (e) =>
        (!filter.from || e.from === filter.from) &&
        (!filter.to || e.to === filter.to) &&
        (!filter.type || e.type === filter.type),
    );
  }

  async getEdgesBatch(paths: string[]): Promise<Map<string, SpandrelEdge[]>> {
    const pathSet = new Set(paths);
    const result = new Map<string, SpandrelEdge[]>();
    for (const path of paths) result.set(path, []);
    for (const edge of this.edges) {
      if (pathSet.has(edge.from)) {
        result.get(edge.from)!.push(edge);
      }
    }
    return result;
  }

  async getWarnings(): Promise<ValidationWarning[]> {
    return this.warnings;
  }

  async setNode(node: SpandrelNode): Promise<void> {
    this.nodes.set(node.path, node);
  }

  async deleteNode(path: string): Promise<void> {
    this.nodes.delete(path);
  }

  async replaceEdges(edges: SpandrelEdge[]): Promise<void> {
    this.edges = edges;
  }

  async replaceWarnings(warnings: ValidationWarning[]): Promise<void> {
    this.warnings = warnings;
  }

  async clear(): Promise<void> {
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
