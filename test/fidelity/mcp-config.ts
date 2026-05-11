/**
 * Writes the temp MCP-config file passed to `claude -p --mcp-config <path>`.
 *
 * Per spec § "How a task runs internally" / "MCP server lifecycle" — Claude
 * Code spawns its own MCP subprocess from the config we give it (so v1's
 * lifecycle decision is per-task spawn; one Spandrel MCP server per
 * `claude -p` invocation). The config points at `node <dist-cli> mcp <root>`
 * rather than the `spandrel-local` shell function — this keeps the harness
 * portable to CI where shell functions aren't on PATH.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface McpConfigOptions {
  /** Absolute path to the Spandrel graph root. */
  graphRoot: string;
  /**
   * Override the path to `dist/cli.js`. Defaults to the dist/cli.js sibling
   * of this file's compiled location, or to the source tree's dist/ when
   * running under tsx.
   */
  cliPath?: string;
}

/**
 * Write a Claude-Code-compatible MCP config to a temp file. Returns the
 * absolute path; caller is responsible for cleanup (or pass the result to
 * `withMcpConfig` which does it).
 */
export async function writeMcpConfig(opts: McpConfigOptions): Promise<string> {
  const cliPath = opts.cliPath ?? defaultCliPath();
  const config = {
    mcpServers: {
      spandrel: {
        command: "node",
        args: [cliPath, "mcp", opts.graphRoot],
      },
    },
  };

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "spandrel-fidelity-"));
  const cfgPath = path.join(tmpDir, "mcp-config.json");
  await fs.writeFile(cfgPath, JSON.stringify(config, null, 2), "utf8");
  return cfgPath;
}

/**
 * Run `fn` with a temp MCP config; clean up on exit (success or failure).
 */
export async function withMcpConfig<T>(
  opts: McpConfigOptions,
  fn: (configPath: string) => Promise<T>,
): Promise<T> {
  const cfgPath = await writeMcpConfig(opts);
  try {
    return await fn(cfgPath);
  } finally {
    // Best-effort cleanup — the tmpdir holds only the config + (empty)
    // directory. Failures here don't surface to the caller.
    await fs.rm(path.dirname(cfgPath), { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Resolve the default location of `dist/cli.js`. Works under both:
 * - tsx (this file is at .../test/fidelity/mcp-config.ts; cli is at .../dist/cli.js)
 * - compiled (this file is at .../dist-test/.../mcp-config.js; not used today)
 *
 * For v1 we assume tsx — the harness runs via `tsx` per the package script.
 */
function defaultCliPath(): string {
  const thisFile = fileURLToPath(import.meta.url);
  // .../test/fidelity/mcp-config.ts → .../dist/cli.js
  // Walk up to the repo root (parent of test/) and resolve dist/cli.js.
  const repoRoot = path.resolve(path.dirname(thisFile), "..", "..");
  return path.join(repoRoot, "dist", "cli.js");
}
