import type { SpandrelGraph } from "../compiler/types.js";

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
