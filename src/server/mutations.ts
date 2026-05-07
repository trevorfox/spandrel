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
// Filesystem path helpers — derived from graph nodeType, not filesystem state.
// This keeps buildEditList pure (no I/O) and testable against in-memory graphs.
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

function graphPathToCompositeDir(rootDir: string, graphPath: string): string {
  const segments = graphPath.split("/").filter(Boolean);
  if (segments.length === 0) return rootDir;
  return path.join(rootDir, ...segments);
}

function graphPathToFile(rootDir: string, graphPath: string, isComposite: boolean): string {
  return isComposite
    ? graphPathToCompositeDir(rootDir, graphPath)
    : graphPathToLeafFile(rootDir, graphPath);
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

  const isComposite = fromNode.nodeType === "composite";
  const fromFile = graphPathToFile(rootDir, from, isComposite);

  const moves: FileMove[] = [];
  const deletes: FileDelete[] = [];

  if (op === "move") {
    if (to === null) throw new Error("move requires a target path");
    const toFile = graphPathToFile(rootDir, to, isComposite);
    moves.push({ fromFile, toFile, isDirectory: isComposite });
  } else {
    deletes.push({ file: fromFile, isDirectory: isComposite });
  }

  // Find referrers — exact + descendants for composite, exact-only for leaf.
  const referrers = findReferrers(graph, from, { prefix: isComposite });
  const rewrites: FrontmatterRewrite[] = [];
  for (const ref of referrers) {
    const refIsComposite = ref.node.nodeType === "composite";
    const refFile = graphPathToFile(rootDir, ref.node.path, refIsComposite);
    rewrites.push({
      file: refFile,
      fromPath: from,
      toPath: to ?? "", // delete: removed entirely; signaled by op=delete in applyEdits
      prefix: isComposite,
    });
  }

  const danglingMentions = findDanglingMentions(graph, from, { prefix: isComposite });

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
    const parsed = matter(raw);
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
  _rootDir: string,
  _path: string,
  _graph: SpandrelGraph,
  _options?: DeleteOptions,
): { deleted: string[]; referrersRewritten: string[] } {
  throw new Error("deleteThingWithReferrers: not yet implemented");
}
