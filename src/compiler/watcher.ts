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

  const handleChange = async (filePath: string) => {
    const basename = path.basename(filePath);
    if (!basename.endsWith(".md")) return;
    if (EXCLUDED_LEAF_MD_FILES.has(basename)) return;
    if (basename.startsWith(".") || basename.startsWith("_")) return;

    console.log(`[spandrel] Change detected: ${path.relative(rootDir, filePath)}`);
    await recompileNode(store, rootDir, filePath);
    onChange?.(filePath);
  };

  watcher.on("add", handleChange);
  watcher.on("change", handleChange);
  watcher.on("unlink", handleChange);

  return watcher;
}
