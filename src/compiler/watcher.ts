import chokidar from "chokidar";
import path from "node:path";
import { recompileNode, EXCLUDED_LEAF_MD_FILES } from "./compiler.js";
import type { GraphStore } from "../storage/graph-store.js";

export function watchTree(
  rootDir: string,
  store: GraphStore,
  onChange?: (filePath: string) => void
): ReturnType<typeof chokidar.watch> {
  const watcher = chokidar.watch(rootDir, {
    ignored: [
      /(^|[/\\])\./,          // dotfiles
      /(^|[/\\])_/,           // underscore-prefixed
      /(^|[/\\])node_modules/, // node_modules
      /(^|[/\\])dist/,        // dist
      /(^|[/\\])src/,         // src (our own code)
    ],
    ignoreInitial: true,
    persistent: true,
  });

  // Serialize change handling. `recompileNode` does a read-modify-write on
  // the store's edge list (read all edges, filter out the changed node's
  // edges, replace). Two concurrent runs race: each filters from the same
  // snapshot, and the later write clobbers the earlier deletion. Symptom:
  // delete two files in quick succession and one of them comes back as a
  // stale hierarchy edge. The fix is a single-slot queue — events are still
  // observed in order, just executed one at a time.
  let chain: Promise<void> = Promise.resolve();

  const handleChange = (filePath: string): void => {
    const basename = path.basename(filePath);
    if (!basename.endsWith(".md")) return;
    if (EXCLUDED_LEAF_MD_FILES.has(basename)) return;
    if (basename.startsWith(".") || basename.startsWith("_")) return;

    chain = chain.then(async () => {
      console.log(`[spandrel] Change detected: ${path.relative(rootDir, filePath)}`);
      try {
        await recompileNode(store, rootDir, filePath);
      } catch (err) {
        console.error(`[spandrel] Recompile failed for ${filePath}:`, err);
      }
      onChange?.(filePath);
    });
  };

  watcher.on("add", handleChange);
  watcher.on("change", handleChange);
  watcher.on("unlink", handleChange);

  return watcher;
}
