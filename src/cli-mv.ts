import { compile } from "./compiler/compiler.js";
import type { SpandrelGraph } from "./compiler/types.js";
import { moveThing } from "./server/mutations.js";

export interface MvOptions {
  rootDir: string;
  from: string;
  to: string;
  dryRun?: boolean;
  yes?: boolean;
}

/**
 * Build a SpandrelGraph from a compiled GraphStore.
 *
 * moveThing expects a Map-keyed SpandrelGraph (the in-process graph type),
 * but compile() returns a GraphStore (the async storage interface). This
 * helper bridges the two without introducing a new public export or touching
 * the compiler.
 */
async function storeToGraph(
  store: Awaited<ReturnType<typeof compile>>,
): Promise<SpandrelGraph> {
  const [nodes, edges, warnings, linkTypes] = await Promise.all([
    store.getAllNodes(),
    store.getEdges(),
    store.getWarnings(),
    store.getLinkTypes(),
  ]);
  return {
    nodes: new Map(nodes.map((n) => [n.path, n])),
    edges,
    warnings,
    linkTypes,
  };
}

export async function runMv(options: MvOptions): Promise<number> {
  const store = await compile(options.rootDir);
  const graph = await storeToGraph(store);

  const preview = moveThing(options.rootDir, options.from, options.to, graph, {
    dryRun: true,
  });

  console.error(`Move ${options.from} → ${options.to}`);
  console.error(`  Referrers to rewrite: ${preview.referrersRewritten.length}`);
  for (const r of preview.referrersRewritten) console.error(`    - ${r}`);
  if (preview.danglingMentions.length > 0) {
    console.error(
      `  Inline mentions (not auto-rewritten): ${preview.danglingMentions.length}`,
    );
    for (const m of preview.danglingMentions) {
      console.error(`    - ${m.in} → ${m.to}`);
    }
  }

  if (options.dryRun) return 0;

  if (!options.yes) {
    console.error("Pass --yes to apply.");
    return 2;
  }

  const result = moveThing(options.rootDir, options.from, options.to, graph);
  console.error(`Wrote ${result.referrersRewritten.length} referrer(s).`);
  if (result.danglingMentions.length > 0) {
    console.error(
      `Note: ${result.danglingMentions.length} inline mention(s) left for manual fix.`,
    );
  }
  return 0;
}

/**
 * Parse argv slice for `spandrel mv <from> <to> [--dry-run] [--yes]`.
 *
 * Positional args: first non-flag → from, second non-flag → to.
 * Flags: --dry-run, --yes (boolean; also supports --no-dry-run, --no-yes).
 */
export function parseMvArgs(
  argv: string[],
): { rootDir: string; from: string; to: string; dryRun: boolean; yes: boolean } {
  let rootDir = process.cwd();
  let from: string | undefined;
  let to: string | undefined;
  let dryRun = false;
  let yes = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") {
      dryRun = true;
    } else if (a === "--no-dry-run") {
      dryRun = false;
    } else if (a === "--yes") {
      yes = true;
    } else if (a === "--no-yes") {
      yes = false;
    } else if (!a.startsWith("--")) {
      if (from === undefined) {
        from = a;
      } else if (to === undefined) {
        to = a;
      } else {
        rootDir = a;
      }
    }
  }

  if (!from || !to) {
    throw new Error("Usage: spandrel mv <from> <to> [root-dir] [--dry-run] [--yes]");
  }

  return { rootDir, from, to, dryRun, yes };
}
