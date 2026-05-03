/**
 * Companion files — non-content markdown files that travel with a node.
 *
 * Six canonical forms exist:
 *
 *   - DESIGN.md   implementation and design notes for the containing node
 *   - SKILL.md    agent-readable skill: traversal recipes, mode detection
 *   - AGENT.md    agent-readable instructions: tool surface, conventions
 *   - README.md   human-readable orientation
 *   - CLAUDE.md   Claude-Code-flavored agent instructions
 *   - AGENTS.md   plural form (Claude Code convention for agent instructions)
 *
 * Through 0.4.x these files were excluded from compilation. Starting in 0.5.0,
 * they compile as document nodes (kind: document, navigable: false) under
 * their containing composite. The path is stem-based and uppercase-canonical
 * so it stays stable across the lowercase to uppercase migration. Examples:
 *
 *   docs/architecture/compiler/design.md  becomes  /architecture/compiler/DESIGN
 *   docs/SKILL.md                         becomes  /SKILL
 *   docs/clients/acme/AGENT.md            becomes  /clients/acme/AGENT
 *
 * Lowercase forms are accepted with a companion_file_lowercase warning.
 * Lowercase support drops in 0.6.0.
 */

/**
 * Canonical (uppercase) companion-file basenames. The stem (without the `.md`)
 * is what becomes the path segment.
 */
export const CANONICAL_COMPANION_FILES = [
  "DESIGN.md",
  "SKILL.md",
  "AGENT.md",
  "README.md",
  "CLAUDE.md",
  "AGENTS.md",
] as const;

/**
 * Per-stem metadata. Each entry maps the canonical basename to its uppercase
 * stem (used for the path segment). Lookups are case-insensitive.
 */
const STEM_BY_LOWER = new Map<string, string>(
  CANONICAL_COMPANION_FILES.map((name) => {
    const lower = name.toLowerCase();
    const stem = name.replace(/\.md$/, "");
    return [lower, stem];
  }),
);

export interface CompanionFileMatch {
  /** The uppercase stem (e.g. "DESIGN", "SKILL"). Used as the path segment. */
  stem: string;
  /** True when the on-disk basename uses the canonical uppercase form. */
  isCanonical: boolean;
}

/**
 * If `basename` is a recognized companion file (case-insensitive), return its
 * canonical stem and whether the on-disk form is the canonical uppercase
 * variant. Otherwise return null.
 */
export function matchCompanionFile(basename: string): CompanionFileMatch | null {
  const lower = basename.toLowerCase();
  const stem = STEM_BY_LOWER.get(lower);
  if (!stem) return null;
  const isCanonical = (CANONICAL_COMPANION_FILES as readonly string[]).includes(basename);
  return { stem, isCanonical };
}

/**
 * Convenience: true when the basename matches any companion-file form.
 */
export function isCompanionFile(basename: string): boolean {
  return STEM_BY_LOWER.has(basename.toLowerCase());
}
