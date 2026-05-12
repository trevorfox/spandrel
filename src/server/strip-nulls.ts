/**
 * Recursively walk a value and drop object keys whose value is null,
 * undefined, or empty string. Preserves false, 0, empty arrays, and
 * empty objects — those carry meaning. Returns a new structure; does
 * not mutate the input.
 *
 * Used at the MCP tool-response serialization boundary (asTextResult)
 * to keep wire output free of fields that signal absence rather than
 * information. REST wire surfaces deliberately do not use this — see
 * src/server/design.md "MCP vs REST hygiene divergence" and
 * specs/2026-05-11-context-pack-hygiene.md.
 */
export function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripNulls);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === null || v === undefined || v === "") continue;
      out[k] = stripNulls(v);
    }
    return out;
  }
  return value;
}
