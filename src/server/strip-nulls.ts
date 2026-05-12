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
 *
 * Assumes plain JSON-serializable input: plain objects (literal or
 * Object.create(null)), arrays, and primitives. Non-plain instances
 * (Date, Map, Set, RegExp, class instances) pass through untouched so
 * JSON.stringify can apply its own serialization rules — without the
 * prototype guard they would be reduced to {} via enumerable-own-key
 * copy. Circular references are not handled; they will recurse
 * infinitely. Neither case is reachable from current graph-ops
 * outputs, but the assumption is worth being explicit about.
 */
export function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripNulls);
  }
  if (value !== null && typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== null && proto !== Object.prototype) {
      return value;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === null || v === undefined || v === "") continue;
      out[k] = stripNulls(v);
    }
    return out;
  }
  return value;
}
