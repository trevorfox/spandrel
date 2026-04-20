/** Content pane: metadata header + rendered markdown body. */

import { currentPath$, derived$, pathToHash } from "../state.js";
import { renderMarkdown } from "../lib/markdown.js";
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
    root.innerHTML = renderNode(node, maps);
    // Scroll to top for the new node.
    root.scrollTop = 0;
  };

  render();
  currentPath$.subscribe(render);
  derived$.subscribe(render);
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
