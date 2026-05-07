import path from "node:path";
import fs from "node:fs";
import matter from "gray-matter";
import type { SpandrelGraph, SpandrelNode } from "../compiler/types.js";

export interface FrontmatterRewrite {
  /** Absolute filesystem path of the referrer file. */
  file: string;
  /** Path in the referrer's `links[].to` to replace. */
  fromPath: string;
  /** New value for `links[].to`. */
  toPath: string;
  /** True when the rewrite is a path-prefix substitution (composite move). */
  prefix: boolean;
}

export interface FileMove {
  /** Absolute filesystem path being moved from. */
  fromFile: string;
  /** Absolute filesystem path being moved to. */
  toFile: string;
  /** True when this is a directory move (composite). */
  isDirectory: boolean;
}

export interface FileDelete {
  /** Absolute filesystem path being deleted. */
  file: string;
  /** True when this is a directory delete (composite). */
  isDirectory: boolean;
}

export interface DanglingMention {
  /** Graph path of the node containing the mention. */
  in: string;
  /** Graph path the mention points at (now stale). */
  to: string;
}

export interface EditList {
  moves: FileMove[];
  deletes: FileDelete[];
  rewrites: FrontmatterRewrite[];
  danglingMentions: DanglingMention[];
}

export interface DeleteResult {
  deleted: string[];
  referrersRewritten: string[];
  danglingMentions: DanglingMention[];
}

export interface MoveResult {
  written: string[];
  deleted: string[];
  referrersRewritten: string[];
  danglingMentions: DanglingMention[];
}

export interface MutationOptions {
  dryRun?: boolean;
}

export interface DeleteOptions extends MutationOptions {
  cascade?: "remove-link" | "refuse";
}

export interface Referrer {
  node: SpandrelNode;
  matchedLinks: Array<{ to: string; type?: string; description?: string }>;
}

export function findReferrers(
  graph: SpandrelGraph,
  targetPath: string,
  options: { prefix?: boolean } = {},
): Referrer[] {
  const includeDescendants = options.prefix ?? false;
  const prefix = targetPath.endsWith("/") ? targetPath : targetPath + "/";
  const out: Referrer[] = [];
  for (const node of graph.nodes.values()) {
    const links = node.frontmatter.links;
    if (!Array.isArray(links)) continue;
    const matched: Referrer["matchedLinks"] = [];
    for (const link of links) {
      if (typeof link !== "object" || link == null) continue;
      const to = (link as { to?: unknown }).to;
      if (typeof to !== "string") continue;
      if (to === targetPath) {
        matched.push(link as Referrer["matchedLinks"][number]);
      } else if (includeDescendants && to.startsWith(prefix)) {
        matched.push(link as Referrer["matchedLinks"][number]);
      }
    }
    if (matched.length > 0) out.push({ node, matchedLinks: matched });
  }
  return out;
}

/**
 * Returns the rewritten link target if `link` is `from` or a descendant of
 * `from`. Returns null otherwise.
 */
export function rewriteLinkTarget(
  link: string,
  from: string,
  to: string,
): string | null {
  if (link === from) return to;
  const prefix = from.endsWith("/") ? from : from + "/";
  if (link.startsWith(prefix)) {
    return to + link.slice(from.length);
  }
  return null;
}

/**
 * Strips fenced code blocks and inline code spans from markdown content,
 * returning the prose surface for link extraction. Mirrors the compiler's
 * 0.7.1 honesty pass behavior so we don't flag mentions in code examples.
 */
function stripCodeBlocks(content: string): string {
  let out = content;
  // Fenced code blocks: ```...``` and ~~~...~~~
  out = out.replace(/```[\s\S]*?```/g, "");
  out = out.replace(/~~~[\s\S]*?~~~/g, "");
  // Inline code spans: `...`
  out = out.replace(/`[^`\n]*`/g, "");
  return out;
}

const INLINE_LINK_RE = /\[[^\]]*\]\((\/[^)\s#]*)(?:#[^)]*)?\)/g;

export function findDanglingMentions(
  graph: SpandrelGraph,
  targetPath: string,
  options: { prefix?: boolean } = {},
): DanglingMention[] {
  const includeDescendants = options.prefix ?? false;
  const prefix = targetPath.endsWith("/") ? targetPath : targetPath + "/";
  const out: DanglingMention[] = [];
  for (const node of graph.nodes.values()) {
    if (!node.content) continue;
    const stripped = stripCodeBlocks(node.content);
    INLINE_LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = INLINE_LINK_RE.exec(stripped)) !== null) {
      const to = m[1];
      if (to === targetPath || (includeDescendants && to.startsWith(prefix))) {
        out.push({ in: node.path, to });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Filesystem path helpers.
// ---------------------------------------------------------------------------

function graphPathToLeafFile(rootDir: string, graphPath: string): string {
  const segments = graphPath.split("/").filter(Boolean);
  if (segments.length === 0) {
    return path.join(rootDir, "index.md");
  }
  const parentSegments = segments.slice(0, -1);
  const name = segments[segments.length - 1];
  const parentDir = parentSegments.length > 0
    ? path.join(rootDir, ...parentSegments)
    : rootDir;
  return path.join(parentDir, name + ".md");
}

function graphPathToCompositeIndex(rootDir: string, graphPath: string): string {
  const segments = graphPath.split("/").filter(Boolean);
  if (segments.length === 0) return path.join(rootDir, "index.md");
  return path.join(rootDir, ...segments, "index.md");
}

/**
 * Detect whether a node's source lives in a directory (index.md form) or as a
 * plain leaf .md file.
 *
 * `nodeType` is the primary signal — when `"composite"`, the source is always
 * `dir/index.md`. When `"leaf"`, we do a filesystem check: a directory node
 * with no child nodes (e.g. a childless index.md) is classified as `"leaf"` by
 * the compiler but physically lives at `dir/index.md`. The filesystem check
 * disambiguates. When no files exist on disk (unit-test graphs), `nodeType` is
 * the sole signal.
 */
function resolveNodeFile(
  rootDir: string,
  graphPath: string,
  nodeType: "leaf" | "composite",
): { file: string; isDir: boolean } {
  if (nodeType === "composite") {
    return { file: graphPathToCompositeIndex(rootDir, graphPath), isDir: true };
  }
  // nodeType === "leaf": check if the node is actually stored as a directory
  const compositeCandidate = graphPathToCompositeIndex(rootDir, graphPath);
  if (fs.existsSync(compositeCandidate)) {
    return { file: compositeCandidate, isDir: true };
  }
  return { file: graphPathToLeafFile(rootDir, graphPath), isDir: false };
}

/**
 * Resolve the destination filesystem path for a move, given knowledge of
 * whether the source is a directory-based node.
 */
function resolveDestFile(rootDir: string, graphPath: string, isDir: boolean): string {
  if (isDir) {
    // The destination directory doesn't exist yet — return the directory path
    // (the parent of index.md) so renameSync moves the whole directory.
    const segments = graphPath.split("/").filter(Boolean);
    if (segments.length === 0) return rootDir;
    return path.join(rootDir, ...segments);
  }
  return graphPathToLeafFile(rootDir, graphPath);
}

// ---------------------------------------------------------------------------

export type Operation = "move" | "delete";

export function buildEditList(
  rootDir: string,
  from: string,
  to: string | null, // null for delete
  graph: SpandrelGraph,
  op: Operation,
): EditList {
  const fromNode = graph.nodes.get(from);
  if (!fromNode) {
    throw new Error(`Source path does not exist in graph: ${from}`);
  }

  const { file: fromFile, isDir: sourceIsDir } = resolveNodeFile(rootDir, from, fromNode.nodeType);

  const moves: FileMove[] = [];
  const deletes: FileDelete[] = [];

  if (op === "move") {
    if (to === null) throw new Error("move requires a target path");
    const toFile = resolveDestFile(rootDir, to, sourceIsDir);
    moves.push({ fromFile: sourceIsDir ? path.dirname(fromFile) : fromFile, toFile, isDirectory: sourceIsDir });
  } else {
    deletes.push({ file: sourceIsDir ? path.dirname(fromFile) : fromFile, isDirectory: sourceIsDir });
  }

  // Find referrers — exact + descendants for directory-based nodes, exact-only for leaf.
  const referrers = findReferrers(graph, from, { prefix: sourceIsDir });
  const rewrites: FrontmatterRewrite[] = [];
  for (const ref of referrers) {
    const { file: refFile } = resolveNodeFile(rootDir, ref.node.path, ref.node.nodeType);
    rewrites.push({
      file: refFile,
      fromPath: from,
      toPath: to ?? "", // delete: removed entirely; signaled by op=delete in applyEdits
      prefix: sourceIsDir,
    });
  }

  const danglingMentions = findDanglingMentions(graph, from, { prefix: sourceIsDir });

  return { moves, deletes, rewrites, danglingMentions };
}

export function validateMove(from: string, to: string, graph: SpandrelGraph): void {
  if (from === "/") {
    throw new Error("Cannot move root");
  }
  if (!graph.nodes.has(from)) {
    throw new Error(`Source path does not exist: ${from}`);
  }
  // Circular check before target-exists: moving into a descendant is a more
  // specific error and should be surfaced even when the descendant exists.
  const fromPrefix = from.endsWith("/") ? from : from + "/";
  if (to.startsWith(fromPrefix)) {
    throw new Error(`Circular move: ${to} is a descendant of ${from}`);
  }
  if (graph.nodes.has(to)) {
    throw new Error(`Target exists: ${to}`);
  }
}

export function validateDelete(path: string, graph: SpandrelGraph): void {
  if (path === "/") {
    throw new Error("Cannot delete root");
  }
  if (!graph.nodes.has(path)) {
    throw new Error(`Path does not exist: ${path}`);
  }
}

// ---------------------------------------------------------------------------
// applyEdits — execute the edit list (real filesystem I/O)
// ---------------------------------------------------------------------------

export interface ApplyResult {
  written: string[];
  deleted: string[];
}

export function applyEdits(edits: EditList, op: Operation): ApplyResult {
  const written: string[] = [];
  const deleted: string[] = [];

  // Phase 1: Rewrite referrers first. They keep working through the move.
  for (const r of edits.rewrites) {
    const raw = fs.readFileSync(r.file, "utf-8");
    // Pass an options object to bypass gray-matter's cache. The cache is
    // keyed by raw string content; without this, a later compile() call that
    // reads the same original raw string (e.g. in a dry-run→apply sequence)
    // would receive the stale mutated data object from the cache.
    const parsed = matter(raw, {});
    const links = parsed.data.links;
    if (Array.isArray(links)) {
      const next: typeof links = [];
      for (const link of links) {
        if (typeof link !== "object" || link == null) {
          next.push(link);
          continue;
        }
        const to = (link as { to?: unknown }).to;
        if (typeof to !== "string") {
          next.push(link);
          continue;
        }
        const rewritten = rewriteLinkTarget(to, r.fromPath, r.toPath);
        if (rewritten === null) {
          next.push(link);
          continue;
        }
        if (op === "delete") {
          // Drop the entry entirely on cascade-delete.
          continue;
        }
        next.push({ ...(link as Record<string, unknown>), to: rewritten });
      }
      parsed.data.links = next;
    }
    const body = parsed.content.startsWith("\n") ? parsed.content : "\n" + parsed.content;
    fs.writeFileSync(r.file, matter.stringify(body, parsed.data));
    written.push(r.file);
  }

  // Phase 2: Apply filesystem moves and deletes.
  for (const m of edits.moves) {
    fs.mkdirSync(path.dirname(m.toFile), { recursive: true });
    fs.renameSync(m.fromFile, m.toFile);
  }
  for (const d of edits.deletes) {
    if (d.isDirectory) {
      fs.rmSync(d.file, { recursive: true });
    } else {
      fs.unlinkSync(d.file);
    }
    deleted.push(d.file);
  }

  return { written, deleted };
}

// ---------------------------------------------------------------------------

// Public API stubs — implemented in subsequent tasks.
export function moveThing(
  rootDir: string,
  from: string,
  to: string,
  graph: SpandrelGraph,
  options: MutationOptions = {},
): MoveResult {
  validateMove(from, to, graph);
  const edits = buildEditList(rootDir, from, to, graph, "move");

  if (options.dryRun) {
    return {
      written: [],
      deleted: [],
      referrersRewritten: edits.rewrites.map(r => r.file),
      danglingMentions: edits.danglingMentions,
    };
  }

  const applied = applyEdits(edits, "move");
  return {
    written: applied.written,
    deleted: applied.deleted,
    referrersRewritten: applied.written,
    danglingMentions: edits.danglingMentions,
  };
}

export function deleteThingWithReferrers(
  rootDir: string,
  thingPath: string,
  graph: SpandrelGraph,
  options: DeleteOptions = {},
): DeleteResult {
  validateDelete(thingPath, graph);
  const edits = buildEditList(rootDir, thingPath, null, graph, "delete");
  const cascade = options.cascade ?? "refuse";

  if (edits.rewrites.length > 0 && cascade === "refuse") {
    const referrerPaths = edits.rewrites.map(r => r.file).join(", ");
    throw new Error(
      `Cannot delete ${thingPath}: ${edits.rewrites.length} referrers exist (${referrerPaths}). ` +
      `Pass cascade: "remove-link" to remove the dead link entries.`,
    );
  }

  if (options.dryRun) {
    return { deleted: [], referrersRewritten: edits.rewrites.map(r => r.file), danglingMentions: edits.danglingMentions };
  }

  const applied = applyEdits(edits, "delete");
  return { deleted: applied.deleted, referrersRewritten: applied.written, danglingMentions: edits.danglingMentions };
}
