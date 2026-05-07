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

// Public API stubs — implemented in subsequent tasks.
export function moveThing(
  _rootDir: string,
  _from: string,
  _to: string,
  _graph: SpandrelGraph,
  _options?: MutationOptions,
): MoveResult {
  throw new Error("moveThing: not yet implemented");
}

export function deleteThingWithReferrers(
  _rootDir: string,
  _path: string,
  _graph: SpandrelGraph,
  _options?: DeleteOptions,
): { deleted: string[]; referrersRewritten: string[] } {
  throw new Error("deleteThingWithReferrers: not yet implemented");
}
