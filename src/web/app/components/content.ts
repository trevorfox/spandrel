/** Content pane: metadata header + node body in the selected format. */

import { currentPath$, derived$, pathToHash, viewFormat$ } from "../state.js";
import { renderMarkdown } from "../lib/markdown.js";
import { renderNodeAsMarkdown } from "../lib/render-node-markdown.js";
import type { SpandrelNode } from "../../types.js";

export function mountContent(root: HTMLElement): void {
  const render = () => {
    const path = currentPath$.get();
    const maps = derived$.get();
    if (!maps) {
      root.innerHTML = `<div class="content-body"><p class="empty">Loading graph…</p></div>`;
      return;
    }
    const node = maps.nodeByPath.get(path);
    if (!node) {
      root.innerHTML = `
        <div class="content-body">
          <header class="meta">
            <div class="path">${escapeHtml(path)}</div>
            <h1>Not found</h1>
            <p class="description">No node exists at this path.</p>
          </header>
          <article>
            <p><a href="${pathToHash("/")}">Back to root</a></p>
          </article>
        </div>
      `;
      return;
    }
    const format = viewFormat$.get();
    if (format === "markdown") {
      root.innerHTML = renderNodeRawMarkdown(node);
    } else if (format === "json") {
      root.innerHTML = renderNodeJson(node);
    } else {
      root.innerHTML = renderNode(node, maps);
    }
    // Scroll to top for the new node.
    root.scrollTop = 0;
  };

  render();
  currentPath$.subscribe(render);
  derived$.subscribe(render);
  viewFormat$.subscribe(render);
}

function renderNode(
  node: SpandrelNode,
  maps: NonNullable<ReturnType<typeof derived$.get>>,
): string {
  const fmPairs = collectFrontmatterPairs(node.frontmatter);
  const fmHtml =
    fmPairs.length > 0
      ? `<dl class="fm">${fmPairs
          .map(
            ([k, v]) =>
              `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`,
          )
          .join("")}</dl>`
      : "";

  const bodyHtml = node.content && node.content.trim()
    ? renderMarkdown(node.content)
    : `<p class="empty">No body content.</p>`;

  const childIds = maps.hierarchyChildren.get(node.path) ?? node.children ?? [];
  const childrenHtml =
    childIds.length > 0
      ? `
        <section class="children">
          <h2>Children</h2>
          <ul>
            ${childIds
              .map((p) => {
                const child = maps.nodeByPath.get(p);
                const name = child?.name ?? p;
                const desc = child?.description ?? "";
                return `
                  <li>
                    <a href="${pathToHash(p)}">${escapeHtml(name)}</a>
                    ${desc ? `<span class="child-desc">${escapeHtml(desc)}</span>` : ""}
                  </li>`;
              })
              .join("")}
          </ul>
        </section>`
      : "";

  const description = node.description?.trim()
    ? `<p class="description">${escapeHtml(node.description)}</p>`
    : "";

  return `
    <div class="content-body">
      <header class="meta">
        <div class="path">${escapeHtml(node.path)}</div>
        <h1>${escapeHtml(node.name || node.path)}</h1>
        ${description}
        ${fmHtml}
      </header>
      <article>${bodyHtml}</article>
      ${childrenHtml}
    </div>
  `;
}

/** Raw-markdown view: the node as a markdown source file.
 *  Frontmatter is syntax-highlighted as YAML-ish; body code fences get a
 *  very restrained palette — string literals warmed slightly, comments muted.
 */
function renderNodeRawMarkdown(node: SpandrelNode): string {
  const raw = renderNodeAsMarkdown(node);
  const highlighted = highlightMarkdownSource(raw);
  return `
    <div class="content-body raw">
      <header class="meta">
        <div class="path">${escapeHtml(node.path)}<span class="ext">.md</span></div>
        <span class="label">Markdown source</span>
      </header>
      <pre class="raw-markdown"><code>${highlighted}</code></pre>
    </div>
  `;
}

/** Raw-JSON view: the full node object as pretty JSON, lightly colored. */
function renderNodeJson(node: SpandrelNode): string {
  const json = JSON.stringify(node, null, 2);
  return `
    <div class="content-body raw">
      <header class="meta">
        <div class="path">${escapeHtml(node.path)}<span class="ext">.json</span></div>
        <span class="label">JSON</span>
      </header>
      <pre class="raw-json"><code>${highlightJson(json)}</code></pre>
    </div>
  `;
}

/** Tokenize a markdown source into HTML spans.
 *
 * Three zones get light styling:
 *   - YAML frontmatter between the `---` fences (keys vs. values).
 *   - Fenced code blocks in the body (comments + strings only).
 *   - Everything else passes through as body text.
 *
 * We keep the tokenizer deliberately small — one pass, line-based.
 */
function highlightMarkdownSource(raw: string): string {
  const lines = raw.split("\n");
  const out: string[] = [];
  let inFrontmatter = false;
  let inCodeBlock = false;
  let closedFrontmatter = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line === "---") {
      if (!closedFrontmatter && !inFrontmatter && i === 0) {
        inFrontmatter = true;
        out.push(`<span class="md-fence">${escapeHtml(line)}</span>`);
        continue;
      }
      if (inFrontmatter) {
        inFrontmatter = false;
        closedFrontmatter = true;
        out.push(`<span class="md-fence">${escapeHtml(line)}</span>`);
        continue;
      }
    }

    if (inFrontmatter) {
      out.push(highlightYamlLine(line));
      continue;
    }

    const fenceMatch = line.match(/^(\s*)(```+)(.*)$/);
    if (fenceMatch) {
      inCodeBlock = !inCodeBlock;
      out.push(`<span class="md-fence">${escapeHtml(line)}</span>`);
      continue;
    }

    if (inCodeBlock) {
      out.push(highlightCodeLine(line));
      continue;
    }

    out.push(escapeHtml(line));
  }
  return out.join("\n");
}

function highlightYamlLine(line: string): string {
  // Comment-only line.
  const commentOnly = line.match(/^(\s*)(#.*)$/);
  if (commentOnly) {
    return `${escapeHtml(commentOnly[1])}<span class="md-comment">${escapeHtml(commentOnly[2])}</span>`;
  }
  // key: value (value may be empty).
  const kv = line.match(/^(\s*-?\s*)([A-Za-z_][\w\-]*)(\s*:)(\s*)(.*)$/);
  if (kv) {
    const [, lead, key, colon, space, rest] = kv;
    return (
      escapeHtml(lead) +
      `<span class="md-key">${escapeHtml(key)}</span>` +
      escapeHtml(colon) +
      escapeHtml(space) +
      highlightYamlValue(rest)
    );
  }
  // List item with scalar.
  const listItem = line.match(/^(\s*)-\s+(.*)$/);
  if (listItem) {
    const [, lead, rest] = listItem;
    return escapeHtml(lead) + `<span class="md-punct">-</span> ` + highlightYamlValue(rest);
  }
  return escapeHtml(line);
}

function highlightYamlValue(value: string): string {
  if (!value) return "";
  // Strings in quotes.
  if (/^(['"]).*\1\s*$/.test(value)) {
    return `<span class="md-string">${escapeHtml(value)}</span>`;
  }
  // Booleans / null.
  if (/^(true|false|null|yes|no)\s*$/i.test(value)) {
    return `<span class="md-lit">${escapeHtml(value)}</span>`;
  }
  // Numbers.
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/.test(value)) {
    return `<span class="md-num">${escapeHtml(value)}</span>`;
  }
  return escapeHtml(value);
}

function highlightCodeLine(line: string): string {
  // Single-line comment? We treat # and // as comments — close enough for
  // the restrained palette the brief asks for.
  const comment = line.match(/^(.*?)(\s*(?:#|\/\/).*)$/);
  if (comment && !/["']/.test(comment[1])) {
    return `${highlightCodeStrings(comment[1])}<span class="md-comment">${escapeHtml(comment[2])}</span>`;
  }
  return highlightCodeStrings(line);
}

function highlightCodeStrings(line: string): string {
  // Wrap single- and double-quoted strings in a string span; everything else
  // passes through with HTML escape.
  let out = "";
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < line.length && line[j] !== quote) {
        if (line[j] === "\\") j += 2;
        else j += 1;
      }
      const end = Math.min(j + 1, line.length);
      out += `<span class="md-string">${escapeHtml(line.slice(i, end))}</span>`;
      i = end;
      continue;
    }
    out += escapeHtml(ch);
    i += 1;
  }
  return out;
}

/** JSON tokenizer: keys, strings, numbers, literals, punctuation. */
function highlightJson(src: string): string {
  // Single-pass regex walk. `(?:^|[\s,{[])` + `"..."\s*:` distinguishes keys
  // from values, and the remaining alternations pick up strings, numbers,
  // booleans, nulls, and punctuation.
  const pattern = /("(?:\\.|[^"\\])*")\s*:|("(?:\\.|[^"\\])*")|\b(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\b|\b(true|false|null)\b|([{}\[\],:])/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(src)) !== null) {
    out += escapeHtml(src.slice(last, m.index));
    if (m[1] !== undefined) {
      out += `<span class="j-key">${escapeHtml(m[1])}</span><span class="j-punct">:</span>`;
    } else if (m[2] !== undefined) {
      out += `<span class="j-string">${escapeHtml(m[2])}</span>`;
    } else if (m[3] !== undefined) {
      out += `<span class="j-num">${escapeHtml(m[3])}</span>`;
    } else if (m[4] !== undefined) {
      out += `<span class="j-lit">${escapeHtml(m[4])}</span>`;
    } else if (m[5] !== undefined) {
      out += `<span class="j-punct">${escapeHtml(m[5])}</span>`;
    }
    last = m.index + m[0].length;
  }
  out += escapeHtml(src.slice(last));
  return out;
}

/** Pull a small set of "interesting" frontmatter fields for the header.
 *  We skip name/description (already shown) and links (rendered in drawer).
 *  Complex values stringify as compact JSON.
 */
function collectFrontmatterPairs(fm: Record<string, unknown>): Array<[string, string]> {
  if (!fm) return [];
  const out: Array<[string, string]> = [];
  const skip = new Set(["name", "description", "links"]);
  for (const [k, v] of Object.entries(fm)) {
    if (skip.has(k)) continue;
    if (v === null || v === undefined) continue;
    let rendered: string;
    if (typeof v === "string") rendered = v;
    else if (typeof v === "number" || typeof v === "boolean") rendered = String(v);
    else {
      try {
        rendered = JSON.stringify(v);
      } catch {
        rendered = String(v);
      }
    }
    if (rendered.length > 120) rendered = rendered.slice(0, 117) + "…";
    out.push([k, rendered]);
  }
  return out;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return c;
    }
  });
}
