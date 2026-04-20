/** Frontend twin of `src/web/render-node.ts`.
 *
 * Serializes a node back into its source-like markdown form: YAML
 * frontmatter block followed by the body. Output should match the dev
 * server / publish bundle closely enough that the `M` toggle looks like
 * opening the file.
 *
 * We hand-roll a tiny YAML emitter here to keep the frontend bundle lean.
 * The output covers the shapes a Spandrel node can realistically contain:
 *   - primitives (string, number, boolean, null)
 *   - nested objects
 *   - arrays (inline when small + primitive, block otherwise)
 * Dates, functions, Maps, and cyclic graphs fall back to JSON.
 */

import type { SpandrelNode } from "../../types.js";

export function renderNodeAsMarkdown(node: SpandrelNode): string {
  const fm: Record<string, unknown> = {
    name: node.name,
    description: node.description,
  };
  if (node.frontmatter && typeof node.frontmatter === "object") {
    for (const [k, v] of Object.entries(node.frontmatter)) {
      if (v === undefined) continue;
      fm[k] = v;
    }
  }

  const yamlBody = emitYamlObject(fm, 0).trimEnd();
  const body = (node.content ?? "").replace(/^\n+/, "");
  if (!body) return `---\n${yamlBody}\n---\n`;
  return `---\n${yamlBody}\n---\n\n${body}`;
}

function emitYamlObject(obj: Record<string, unknown>, indent: number): string {
  const pad = "  ".repeat(indent);
  const lines: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    lines.push(...emitKeyedValue(pad, k, v, indent));
  }
  return lines.join("\n");
}

function emitKeyedValue(
  pad: string,
  key: string,
  value: unknown,
  indent: number,
): string[] {
  const safeKey = yamlKey(key);
  if (value === null || value === undefined) {
    return [`${pad}${safeKey}: null`];
  }
  if (typeof value === "string") {
    return [`${pad}${safeKey}: ${yamlScalar(value)}`];
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return [`${pad}${safeKey}: ${value}`];
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${pad}${safeKey}: []`];
    const inline = value.every(
      (item) => item === null || typeof item === "string" || typeof item === "number" || typeof item === "boolean"
    );
    if (inline) {
      // Short inline flow for simple primitive arrays.
      const parts = value.map((item) =>
        item === null ? "null" : typeof item === "string" ? yamlScalar(item) : String(item)
      );
      return [`${pad}${safeKey}: [${parts.join(", ")}]`];
    }
    const lines: string[] = [`${pad}${safeKey}:`];
    for (const item of value) {
      lines.push(...emitArrayItem(pad, item, indent));
    }
    return lines;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined,
    );
    if (entries.length === 0) return [`${pad}${safeKey}: {}`];
    const lines: string[] = [`${pad}${safeKey}:`];
    for (const [k, v] of entries) {
      lines.push(...emitKeyedValue(pad + "  ", k, v, indent + 1));
    }
    return lines;
  }
  // Fallback — JSON scalar.
  return [`${pad}${safeKey}: ${JSON.stringify(value)}`];
}

function emitArrayItem(pad: string, item: unknown, indent: number): string[] {
  const dashPad = pad + "  ";
  if (item === null) return [`${pad}- null`];
  if (typeof item === "string") return [`${pad}- ${yamlScalar(item)}`];
  if (typeof item === "number" || typeof item === "boolean") {
    return [`${pad}- ${item}`];
  }
  if (Array.isArray(item)) {
    // Nested arrays are rare in Spandrel frontmatter — punt to JSON.
    return [`${pad}- ${JSON.stringify(item)}`];
  }
  if (typeof item === "object") {
    const entries = Object.entries(item as Record<string, unknown>).filter(
      ([, v]) => v !== undefined,
    );
    if (entries.length === 0) return [`${pad}- {}`];
    const lines: string[] = [];
    entries.forEach(([k, v], i) => {
      const keyPad = i === 0 ? `${pad}- ` : dashPad;
      const subLines = emitKeyedValue(keyPad, k, v, indent + 1);
      // emitKeyedValue already added the prefix; for the first line keep it,
      // for subsequent nested lines they already carry their own indent.
      lines.push(...subLines);
    });
    return lines;
  }
  return [`${pad}- ${JSON.stringify(item)}`];
}

/** YAML key: quote only if it contains characters that would confuse the parser. */
function yamlKey(k: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(k)) return k;
  return JSON.stringify(k);
}

/** YAML scalar: emit unquoted when safe, double-quoted otherwise. */
function yamlScalar(s: string): string {
  if (s === "") return '""';
  // Force-quote when the string looks like a non-string YAML literal or
  // contains characters that need escaping.
  const problematic = /^(true|false|null|yes|no|on|off|~)$/i.test(s)
    || /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)
    || /^[\s\-?:,\[\]{}&*!|>'"%@`#]/.test(s)
    || /[\n\r\t]/.test(s)
    || s.endsWith(":")
    || s.includes(": ")
    || s.includes(" #");
  if (!problematic) return s;
  return JSON.stringify(s);
}
