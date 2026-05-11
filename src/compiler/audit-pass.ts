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

import fs from "node:fs";
import path from "node:path";
import type { GraphStore } from "../storage/graph-store.js";
import type { ValidationWarning } from "./types.js";
import { auditNode } from "../audit/heuristics.js";
import type {
  EdgeAuditInput,
  Finding,
  NodeAuditInput,
} from "../audit/types.js";
import {
  validateGraphSchema,
  validateMember,
  type CollectionSchema,
  type GraphSchema,
  type MemberValidationInput,
  type SchemaWarning,
} from "../audit/schemas.js";

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
 * @param rootDir - Optional graph root directory. When provided, the
 *   collection-schema validator (WS-C3) can distinguish leaf members
 *   (`/clients/foo.md`) from composite members (`/clients/foo/index.md`)
 *   by stat'ing each member's source file. Without `rootDir`, the validator
 *   falls back to the compiled `nodeType` — which marks zero-children
 *   composites as `leaf`, causing `required_subcollections` to skip them.
 *   CLI callers (`compileOnly`, `runAudit`, watcher) supply this; the
 *   pure-store tests in `test/audit-pass.test.ts` omit it.
 */
export async function runAuditPass(
  store: GraphStore,
  now?: string,
  rootDir?: string,
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

  // --- Collection-schema validation pass (WS-C3) ----------------------------
  // After the heuristic pass, walk every DESIGN.md companion node, parse its
  // `schema:` and `graph:` declarations, and validate each member of its
  // containing collection. Shares the pre-computed maps above to keep the
  // total cost O(n + m) where n is node count and m is edge count.
  const schemaWarnings = collectSchemaWarnings(
    allNodes,
    nodesByPath,
    outgoingLinks,
    rootDir,
  );
  for (const sw of schemaWarnings) auditWarnings.push(sw);

  if (auditWarnings.length === 0) return;

  const existing = await store.getWarnings();
  await store.replaceWarnings([...existing, ...auditWarnings]);
}

/**
 * Walk every `DESIGN.md` companion-file node and validate its containing
 * collection's members against the declared `schema:` and `graph:` blocks.
 *
 * Identification rule (per WS-C1 spec): a companion-file node at path
 * `<collection>/DESIGN` (with `kind: document`) governs the direct children
 * of `<collection>`. The DESIGN node itself is exempt (it's a companion
 * document), as are its sibling companion nodes (DESIGN, SKILL, AGENT, etc.).
 * Subcollections are NOT inherited — `/clients/DESIGN.md`'s declarations
 * don't apply to members of `/clients/acme/contracts/`; that subcollection
 * needs its own `DESIGN.md`.
 *
 * Both halves of the declaration (`schema:` and `graph:`) are validated
 * independently per spec — a malformed `graph:` doesn't disable the
 * `schema:` half, and vice versa.
 */
function collectSchemaWarnings(
  allNodes: Awaited<ReturnType<GraphStore["getAllNodes"]>>,
  nodesByPath: Map<string, (typeof allNodes)[number]>,
  outgoingLinks: Map<string, EdgeAuditInput[]>,
  rootDir: string | undefined,
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  for (const node of allNodes) {
    // Only DESIGN companions carry collection-schema declarations. SKILL /
    // AGENT / README are companion files too but the spec scopes the
    // declarations to DESIGN (see "Where the declaration lives" — design.md
    // is the documented home for collection conventions).
    if (node.kind !== "document") continue;
    if (!node.path.endsWith("/DESIGN")) continue;
    if (node.parent === null) continue;

    const fm = node.frontmatter;
    const rawSchema = fm.schema;
    const rawGraph = fm.graph;
    if (rawSchema === undefined && rawGraph === undefined) continue;

    // Meta-validate the graph: block first. Per spec strictness rule: if
    // meta-validation fails, the graph half is disabled for this collection
    // (the schema half is independent and still runs).
    const collectionSchema: CollectionSchema = {};
    if (rawSchema !== undefined && rawSchema !== null) {
      if (typeof rawSchema !== "object" || Array.isArray(rawSchema)) {
        warnings.push({
          path: node.path,
          type: "invalid_graph_schema",
          message: `\`schema:\` must be a mapping (object), got ${
            Array.isArray(rawSchema) ? "array" : typeof rawSchema
          }.`,
        });
        // Don't set collectionSchema.schema — skip this half.
      } else {
        collectionSchema.schema = rawSchema as object;
      }
    }
    if (rawGraph !== undefined && rawGraph !== null) {
      const metaWarnings = validateGraphSchema(rawGraph, node.path);
      if (metaWarnings.length > 0) {
        for (const w of metaWarnings) {
          warnings.push(schemaToValidation(w));
        }
        // Skip the graph half for this collection — partial enforcement
        // confuses authors more than no enforcement.
      } else {
        collectionSchema.graph = rawGraph as GraphSchema;
      }
    }

    // Nothing usable left after meta-validation? Move on.
    if (
      collectionSchema.schema === undefined &&
      collectionSchema.graph === undefined
    ) {
      continue;
    }

    // The collection's root is the DESIGN node's parent (`/clients/DESIGN`'s
    // parent is `/clients`). Direct children of that root are the members,
    // EXCEPT for companion-file nodes (DESIGN, SKILL, etc.) which are not
    // collection members.
    const collectionRoot = nodesByPath.get(node.parent);
    if (!collectionRoot) continue;

    for (const memberPath of collectionRoot.children) {
      const member = nodesByPath.get(memberPath);
      if (!member) continue;
      if (member.kind === "document") continue; // companion files exempt

      // Determine compositeness for `required_subcollections` (per WS-C1
      // review clarification: leaves are silently skipped).
      //
      // The "composite" signal we want is "has a directory form on disk"
      // (i.e., `<member-path>/index.md`), NOT "has compiled children." A
      // directory-form member with no subdirectories is conceptually
      // composite — the directory exists, but the subcollections aren't
      // there yet, which is exactly the case `required_subcollections`
      // wants to catch.
      //
      // With `rootDir`, we resolve the source file to discriminate
      // directory-form from leaf-form. Without `rootDir`, we fall back to
      // the compiled `nodeType` — which marks zero-child composites as
      // `leaf`, so this fallback understates compositeness. That's
      // acceptable for the pure-store tests, which don't exercise
      // `required_subcollections`.
      const isComposite = isCompositeForm(rootDir, member);

      // childPaths: direct children of THIS member, used by
      // `required_subcollections` to check sub-stems. Filter out companion
      // documents — `/clients/acme/DESIGN` shouldn't satisfy a required
      // `contracts` subcollection.
      const childPaths = member.children.filter((p) => {
        const child = nodesByPath.get(p);
        return child !== undefined && child.kind !== "document";
      });

      const memberLinks = (outgoingLinks.get(member.path) ?? []).map((l) => ({
        to: l.to,
        type: l.type,
        description: l.description,
      }));

      const input: MemberValidationInput = {
        path: member.path,
        frontmatter: member.frontmatter,
        links: memberLinks,
        isComposite,
        childPaths,
      };

      const memberWarnings = validateMember(collectionSchema, input);
      for (const w of memberWarnings) {
        warnings.push(schemaToValidation(w));
      }
    }
  }

  return warnings;
}

function schemaToValidation(w: SchemaWarning): ValidationWarning {
  return {
    path: w.path,
    type: w.code,
    message: w.message,
  };
}

/**
 * Determine whether a member has a directory form (`<path>/index.md` exists
 * under `rootDir`).
 *
 * The "composite" signal we want here is "has a directory form on disk"
 * (i.e., `<member-path>/index.md`), not "has compiled children." A
 * directory-form member with no subdirectories is conceptually composite —
 * the directory exists, but the subcollections aren't there yet, which is
 * exactly the case `required_subcollections` wants to catch.
 *
 * When `rootDir` is undefined, fall back to the compiled `nodeType` — which
 * marks zero-child composites as `leaf`, so this fallback understates
 * compositeness. That's acceptable for the pure-store tests
 * (`test/audit-pass.test.ts`), which don't exercise
 * `required_subcollections`.
 */
function isCompositeForm(
  rootDir: string | undefined,
  member: { path: string; nodeType: "leaf" | "composite" },
): boolean {
  if (!rootDir) return member.nodeType === "composite";
  const rel = member.path === "/" ? "" : member.path.slice(1);
  if (rel === "") return true; // root is always composite
  const dirIndex = path.join(rootDir, rel, "index.md");
  if (fs.existsSync(dirIndex)) return true;
  // No directory form — leaf member, or directory exists without index.md
  // (rare; the compiler still treats it as a node but it's not a curated
  // collection member). Fall back to compiled nodeType.
  return member.nodeType === "composite";
}
