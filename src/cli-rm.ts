import { compile } from "./compiler/compiler.js";
import { deleteThingWithReferrers } from "./server/mutations.js";
import { storeToGraph } from "./storage/store-to-graph.js";

export interface RmOptions {
  rootDir: string;
  path: string;
  cascade?: boolean;
  dryRun?: boolean;
  yes?: boolean;
}

export async function runRm(options: RmOptions): Promise<number> {
  const store = await compile(options.rootDir);
  const graph = await storeToGraph(store);

  let preview: { deleted: string[]; referrersRewritten: string[] };
  try {
    preview = deleteThingWithReferrers(options.rootDir, options.path, graph, {
      dryRun: true,
      cascade: options.cascade ? "remove-link" : "refuse",
    });
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    return 2;
  }

  console.error(`Delete ${options.path}`);
  console.error(`  Referrers affected: ${preview.referrersRewritten.length}`);
  for (const r of preview.referrersRewritten) console.error(`    - ${r}`);

  if (options.dryRun) return 0;

  if (!options.yes) {
    console.error("Pass --yes to apply.");
    return 2;
  }

  deleteThingWithReferrers(options.rootDir, options.path, graph, {
    cascade: options.cascade ? "remove-link" : "refuse",
  });
  return 0;
}

/**
 * Parse argv slice for `spandrel rm <path> [root-dir] [--cascade] [--dry-run] [--yes]`.
 *
 * Positional args: first non-flag → path, second non-flag → root-dir.
 * Flags: --cascade, --dry-run, --yes (boolean; also supports --no-* variants).
 */
export function parseRmArgs(
  argv: string[],
): { rootDir: string; path: string; cascade: boolean; dryRun: boolean; yes: boolean } {
  let rootDir = process.cwd();
  let nodePath: string | undefined;
  let cascade = false;
  let dryRun = false;
  let yes = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cascade") {
      cascade = true;
    } else if (a === "--no-cascade") {
      cascade = false;
    } else if (a === "--dry-run") {
      dryRun = true;
    } else if (a === "--no-dry-run") {
      dryRun = false;
    } else if (a === "--yes") {
      yes = true;
    } else if (a === "--no-yes") {
      yes = false;
    } else if (!a.startsWith("--")) {
      if (nodePath === undefined) {
        nodePath = a;
      } else {
        rootDir = a;
      }
    }
  }

  if (!nodePath) {
    throw new Error("Usage: spandrel rm <path> [root-dir] [--cascade] [--dry-run] [--yes]");
  }

  return { rootDir, path: nodePath, cascade, dryRun, yes };
}
