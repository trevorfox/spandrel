/**
 * Serialize a SpandrelNode back into its source markdown form — YAML
 * frontmatter followed by the body. This is effectively the inverse of the
 * gray-matter parse the compiler does, producing a round-trippable view.
 *
 * Used by:
 *   - `spandrel dev`: the HTTP handler at `/:path.md` returns this string.
 *   - `spandrel publish`: emits `_site/<path>.md` siblings per node.
 *
 * The frontmatter block is re-synthesized from `node.frontmatter`, so the
 * authoritative fields (name, description, links) are always present even
 * if the original file omitted them. This matches the "graph is source of
 * truth once compiled" framing — the .md view represents the node as the
 * graph knows it, not necessarily as it was written on disk.
 */

import yaml from "js-yaml";
import type { SpandrelNode } from "../compiler/types.js";

export function renderNodeAsMarkdown(node: SpandrelNode): string {
  // Start with a minimal, predictable frontmatter shape so tooling can
  // depend on field order. Merge any extra frontmatter the author wrote
  // on top, letting their values win.
  const frontmatter: Record<string, unknown> = {
    name: node.name,
    description: node.description,
  };

  // `node.frontmatter` already contains the full parsed frontmatter,
  // including name/description/links/etc. Merge it in so every original
  // field reappears in the output, while keeping name/description at the
  // top for legibility.
  if (node.frontmatter && typeof node.frontmatter === "object") {
    for (const [k, v] of Object.entries(node.frontmatter)) {
      if (v === undefined) continue;
      frontmatter[k] = v;
    }
  }

  const yamlBlock = yaml.dump(frontmatter, {
    // Deterministic key order (we've already constructed the object above);
    // `sortKeys: false` keeps the insertion order, which is what we want.
    sortKeys: false,
    lineWidth: -1, // no wrapping — long descriptions stay on one line.
    noRefs: true,
  });

  // Trim the trailing newline js-yaml adds so we can control spacing.
  const fm = yamlBlock.replace(/\n+$/, "");
  const body = (node.content ?? "").replace(/^\n+/, "");

  if (!body) return `---\n${fm}\n---\n`;
  return `---\n${fm}\n---\n\n${body}`;
}
