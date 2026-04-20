/** Bottom drawer: related nodes by link type + warnings strip. Collapsible. */

import { currentPath$, derived$ } from "../state.js";
import { pathToUrl } from "../lib/mode.js";
import type { LinkTypeInfo, SpandrelEdge } from "../../types.js";

export function mountDrawer(root: HTMLElement): void {
  root.setAttribute("data-collapsed", "false");
  root.innerHTML = `
    <button type="button" class="drawer-handle" aria-expanded="true">
      <span class="title">Related &amp; warnings</span>
      <span class="chev" aria-hidden="true">▾</span>
    </button>
    <div class="drawer-body">
      <div class="related"></div>
      <div class="warnings"></div>
    </div>
  `;

  const handle = root.querySelector(".drawer-handle") as HTMLButtonElement;
  const relatedEl = root.querySelector(".related") as HTMLElement;
  const warningsEl = root.querySelector(".warnings") as HTMLElement;

  handle.addEventListener("click", () => {
    const collapsed = root.getAttribute("data-collapsed") === "true";
    const next = !collapsed;
    root.setAttribute("data-collapsed", String(next));
    handle.setAttribute("aria-expanded", String(!next));
  });

  const render = () => {
    const path = currentPath$.get();
    const maps = derived$.get();
    if (!maps) {
      relatedEl.innerHTML = "";
      warningsEl.innerHTML = "";
      return;
    }

    // Related (outgoing typed and untyped links).
    const outgoing = maps.outgoingLinks.get(path) ?? [];
    relatedEl.innerHTML = renderRelated(outgoing, maps);

    // Warnings for this path.
    const warnings = maps.warningsByPath.get(path) ?? [];
    warningsEl.innerHTML = warnings.length > 0 ? renderWarnings(warnings) : "";
  };

  render();
  currentPath$.subscribe(render);
  derived$.subscribe(render);
}

function renderRelated(
  outgoing: SpandrelEdge[],
  maps: NonNullable<ReturnType<typeof derived$.get>>,
): string {
  if (outgoing.length === 0) {
    return `<div class="empty">No outgoing links.</div>`;
  }

  // Group by linkType stem; untyped edges become a "links" group.
  const groups = new Map<string, SpandrelEdge[]>();
  for (const e of outgoing) {
    const key = e.linkType ?? "__untyped__";
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }

  const blocks: string[] = [];
  for (const [stem, edges] of groups) {
    const typeInfo: LinkTypeInfo | undefined =
      stem === "__untyped__" ? undefined : maps.linkTypeByStem.get(stem);
    const header =
      stem === "__untyped__"
        ? "Links"
        : typeInfo?.name ?? stem;
    const desc = typeInfo?.description ?? "";
    blocks.push(`
      <div class="group">
        <h3 class="group-header">${escapeHtml(header)}</h3>
        ${desc ? `<div class="group-desc">${escapeHtml(desc)}</div>` : ""}
        <ul>
          ${edges
            .map((e) => {
              const target = maps.nodeByPath.get(e.to);
              const name = target?.name ?? e.to;
              const d = e.description ?? target?.description ?? "";
              return `
                <li>
                  <a href="${pathToUrl(e.to)}">${escapeHtml(name)}</a>
                  ${d ? `<span class="rel-desc">${escapeHtml(d)}</span>` : ""}
                </li>`;
            })
            .join("")}
        </ul>
      </div>`);
  }
  return blocks.join("");
}

function renderWarnings(warnings: { type: string; message: string }[]): string {
  return `
    <div class="warnings-strip" role="status">
      <div class="warn-header">Warnings</div>
      <ul>
        ${warnings
          .map(
            (w) =>
              `<li><span class="warn-type">${escapeHtml(w.type)}</span>${escapeHtml(w.message)}</li>`,
          )
          .join("")}
      </ul>
    </div>
  `;
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
