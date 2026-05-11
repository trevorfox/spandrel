/**
 * Audit pass — runs the cheap heuristics from `src/audit/heuristics.ts` against
 * every node in the store and pushes their Findings onto the store's
 * `ValidationWarning` list. Wired into the compile pipeline (WS-B1).
 *
 * Design notes:
 * - Pure side effect: mutates the store's warnings via `replaceWarnings`. Never
 *   throws — audit is advisory and must not block compile.
 * - `now` is captured once at function entry so every node sees the same
 *   reference time. Callers (CI, tests) can inject a fixed `now` for
 *   deterministic output; otherwise we default to `new Date().toISOString()`.
 * - `inDegree` is pre-computed once via a single edge sweep, giving O(n) total
 *   instead of the O(n²) of calling `resolveReferences` per node.
 * - `neighborUpdates` are the `updated` timestamps of a node's parent plus all
 *   siblings, no filter — the differential detector's median does the work.
 *
 * The Finding → ValidationWarning conversion is documented in the plan
 * (WS-B1) and the type mapping comments below. The short of it: one
 * `weak_description` covers 5 node-level Finding kinds (kind goes in the
 * message); `weak_edge_description` and `staleness` collapse multi-subkind
 * Finding families to one ValidationWarning.type each (subkind in message);
 * `stub_marker` / `thin_body` / `overlong_body` stay distinct because the
 * Finding layer already chose three on purpose.
 */

import type { GraphStore } from "../storage/graph-store.js";
import type { ValidationWarning } from "./types.js";
import { auditNode } from "../audit/heuristics.js";
import type {
  EdgeAuditInput,
  Finding,
  NodeAuditInput,
} from "../audit/types.js";

/**
 * Map a Finding kind to its ValidationWarning.type. Node-level Finding kinds
 * collapse to `weak_description`; body and freshness kinds map by their own
 * names. See `src/compiler/types.ts` for the warning-type vocabulary.
 */
function findingKindToWarningType(
  kind: Finding["kind"],
): ValidationWarning["type"] {
  switch (kind) {
    case "toc_overlap":
    case "vague_qualifiers":
    case "topic_opening":
    case "thin":
    case "tautology":
      return "weak_description";
    case "weak_edge_description":
      return "weak_edge_description";
    case "stub_marker":
      return "stub_marker";
    case "thin_body":
      return "thin_body";
    case "overlong_body":
      return "overlong_body";
    case "staleness":
      return "staleness";
  }
}

/**
 * Format a Finding's `message` for the ValidationWarning. Prefixes with the
 * Finding kind in brackets (e.g. `[toc_overlap]`); if the Finding carries a
 * `subkind` in `detail`, includes it as `[kind.subkind]`. The bracketed prefix
 * lets CLI consumers grep on subcode without parsing a separate detail field.
 */
function formatFindingMessage(finding: Finding): string {
  const subkind = finding.detail?.subkind;
  const prefix =
    typeof subkind === "string" ? `[${finding.kind}.${subkind}]` : `[${finding.kind}]`;
  return `${prefix} ${finding.message}`;
}

/**
 * Run the audit pass against every node in the store and append the resulting
 * ValidationWarnings to the existing warnings list.
 *
 * Must be called after `walkTree()` + `validate()` + `addGitMetadata()` — the
 * freshness detectors need `updated` timestamps populated by `addGitMetadata`.
 * If `addGitMetadata` didn't run (no git repo), freshness detectors silently
 * skip per their contract in `auditNode`.
 *
 * Audit findings ride the same warnings pipeline as other validation
 * warnings — they surface in the CLI output, manifest counts, and any
 * downstream consumer of `store.getWarnings()`.
 *
 * @param store - The graph store. Warnings are mutated in place.
 * @param now - Optional reference time (ISO string). Injecting a fixed `now`
 *   makes audit output deterministic across runs — useful for CI and tests.
 *   Defaults to `new Date().toISOString()` captured once at function entry.
 */
export async function runAuditPass(
  store: GraphStore,
  now?: string,
): Promise<void> {
  const referenceNow = now ?? new Date().toISOString();

  const allNodes = await store.getAllNodes();
  const allEdges = await store.getEdges();

  // Pre-compute in-degree map: count of incoming `link`-type edges per
  // node. O(n) sweep beats calling `resolveReferences` per node O(n²).
  // We count only `link` edges to match the semantics of `getIncomingLinks`
  // in graph-ops (hierarchy and authored_by edges aren't "references" in
  // the audit sense).
  const inDegree = new Map<string, number>();
  for (const edge of allEdges) {
    if (edge.type !== "link") continue;
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  // Pre-compute outgoing link edges per node — same O(n) idea. We need
  // `linkType` and `description` to build `EdgeAuditInput`; only `link`
  // edges qualify (hierarchy edges have no description).
  const outgoingLinks = new Map<string, EdgeAuditInput[]>();
  for (const edge of allEdges) {
    if (edge.type !== "link") continue;
    const list = outgoingLinks.get(edge.from) ?? [];
    list.push({
      to: edge.to,
      type: edge.linkType ?? "",
      description: edge.description ?? null,
    });
    outgoingLinks.set(edge.from, list);
  }

  // Index nodes by path for parent/sibling lookup.
  const nodesByPath = new Map<string, (typeof allNodes)[number]>();
  for (const node of allNodes) {
    nodesByPath.set(node.path, node);
  }

  const auditWarnings: ValidationWarning[] = [];

  for (const node of allNodes) {
    // Skip companion documents (DESIGN.md, SKILL.md, etc.) — they have
    // generic default names/descriptions and aren't authored content the
    // audit is trying to improve. Mirrors `validate()`'s same exemption.
    if (node.kind === "document") continue;

    // Build neighborUpdates: parent's `updated` + every sibling's `updated`.
    // No filter on recency — the differential detector's median takes care
    // of the noise. Skip neighbors with no `updated` timestamp.
    const neighborUpdates: string[] = [];
    if (node.parent) {
      const parent = nodesByPath.get(node.parent);
      if (parent?.updated) neighborUpdates.push(parent.updated);
      if (parent) {
        for (const siblingPath of parent.children) {
          if (siblingPath === node.path) continue;
          const sibling = nodesByPath.get(siblingPath);
          if (sibling?.updated) neighborUpdates.push(sibling.updated);
        }
      }
    }

    // Build childNames from the node's direct children. We look up each
    // child by path and use its `name` (frontmatter) — the audit's TOC
    // detector wants display names, not path segments.
    const childNames: string[] = [];
    for (const childPath of node.children) {
      const child = nodesByPath.get(childPath);
      if (child) childNames.push(child.name);
    }

    // Body: `content` is the parsed markdown body (post-frontmatter). When
    // the node has no body, `content` is "" — pass it through so the
    // body detectors fire `thin_body` rather than skipping. Callers can
    // omit the field entirely (pass `undefined`) to disable body audits,
    // but here we always have *something* to audit.
    const body: string = node.content;

    const input: NodeAuditInput = {
      name: node.name,
      description: node.description,
      childNames,
      links: outgoingLinks.get(node.path) ?? [],
      body,
      updated: node.updated,
      created: node.created,
      inDegree: inDegree.get(node.path) ?? 0,
      neighborUpdates,
      now: referenceNow,
    };

    const findings = auditNode(input);
    for (const finding of findings) {
      auditWarnings.push({
        path: node.path,
        type: findingKindToWarningType(finding.kind),
        message: formatFindingMessage(finding),
      });
    }
  }

  if (auditWarnings.length === 0) return;

  const existing = await store.getWarnings();
  await store.replaceWarnings([...existing, ...auditWarnings]);
}
