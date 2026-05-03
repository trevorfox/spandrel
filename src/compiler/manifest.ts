/**
 * Build manifest for `spandrel compile --manifest`.
 *
 * Machine-readable summary of a compile result: node count, edge count, warning
 * counts (overall + by type), top-level collection paths, timestamp, framework
 * version. CI pipelines, generated READMEs, and downstream compile pipelines
 * read this instead of parsing stdout.
 *
 * The shape is stable per the public-API contract — adding fields is
 * backwards-compatible; renaming or removing requires a major-version bump.
 */

import type { GraphStore } from "../storage/graph-store.js";

export interface BuildManifest {
  spandrelVersion: string;
  generatedAt: string;
  nodeCount: number;
  edgeCount: number;
  warningCount: number;
  warningsByType: Record<string, number>;
  collections: string[];
}

export interface BuildManifestOptions {
  spandrelVersion: string;
  /** Override the timestamp — useful for deterministic test output. */
  generatedAt?: string;
}

export async function buildManifest(
  store: GraphStore,
  opts: BuildManifestOptions,
): Promise<BuildManifest> {
  const warnings = await store.getWarnings();
  const warningsByType: Record<string, number> = {};
  for (const w of warnings) {
    warningsByType[w.type] = (warningsByType[w.type] ?? 0) + 1;
  }

  // Collections: top-level (depth-1) entries that aren't companion documents.
  // We don't require `nodeType === "composite"` because a depth-1 directory
  // with an `index.md` but no children yet still represents an intended
  // collection — it just hasn't been populated.
  const collections: string[] = [];
  for (const node of await store.getAllNodes()) {
    if (node.depth === 1 && node.kind !== "document") {
      collections.push(node.path);
    }
  }
  collections.sort();

  return {
    spandrelVersion: opts.spandrelVersion,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    nodeCount: store.nodeCount,
    edgeCount: store.edgeCount,
    warningCount: warnings.length,
    warningsByType,
    collections,
  };
}
