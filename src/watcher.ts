import chokidar from "chokidar";
import path from "node:path";
import { recompileNode } from "./compiler.js";
import type { SpandrelGraph } from "./types.js";

export function watchTree(
  rootDir: string,
  graph: SpandrelGraph,
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

  const handleChange = (filePath: string) => {
    // Only react to index.md changes
    if (!filePath.endsWith("index.md")) return;
    // Skip design.md (shouldn't match but be safe)
    if (filePath.endsWith("design.md")) return;

    console.log(`[spandrel] Change detected: ${path.relative(rootDir, filePath)}`);
    recompileNode(graph, rootDir, filePath);
    onChange?.(filePath);
  };

  watcher.on("add", handleChange);
  watcher.on("change", handleChange);
  watcher.on("unlink", handleChange);

  return watcher;
}
