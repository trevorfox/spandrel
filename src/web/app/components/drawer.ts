/** Bottom drawer: outlinks · inlinks · warnings. Three columns. Collapsible. */

import { currentPath$, derived$ } from "../state.js";
import { pathToUrl } from "../lib/mode.js";
import type { LinkTypeInfo, SpandrelEdge } from "../../types.js";

// Mobile collapses the drawer by default — on a 375px viewport an open
// drawer eats the stage, and "related" is a secondary surface. Desktop
// has room and keeps it open so users see relations alongside content.
const MOBILE_BP = 600;

export function mountDrawer(root: HTMLElement): void {
  const startCollapsed = window.innerWidth <= MOBILE_BP;
  root.setAttribute("data-collapsed", String(startCollapsed));
  root.innerHTML = `
    <button type="button" class="drawer-handle" aria-expanded="${!startCollapsed}">
      <span class="title">Related &amp; warnings</span>
      <span class="chev" aria-hidden="true">▾</span>
    </button>
    <div class="drawer-body">
      <section class="drawer-col outlinks" aria-labelledby="drawer-outlinks-h">
        <h3 class="col-header" id="drawer-outlinks-h">Outlinks</h3>
        <div class="col-body"></div>
      </section>
      <section class="drawer-col inlinks" aria-labelledby="drawer-inlinks-h">
        <h3 class="col-header" id="drawer-inlinks-h">Inlinks</h3>
        <div class="col-body"></div>
      </section>
      <section class="drawer-col warnings" aria-labelledby="drawer-warnings-h">
        <h3 class="col-header" id="drawer-warnings-h">Warnings</h3>
        <div class="col-body"></div>
      </section>
    </div>
  `;

  const handle = root.querySelector(".drawer-handle") as HTMLButtonElement;
  const outEl = root.querySelector(".outlinks .col-body") as HTMLElement;
  const inEl = root.querySelector(".inlinks .col-body") as HTMLElement;
  const warnEl = root.querySelector(".warnings .col-body") as HTMLElement;

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
      outEl.innerHTML = "";
      inEl.innerHTML = "";
      warnEl.innerHTML = "";
      return;
    }

    const outgoing = maps.outgoingLinks.get(path) ?? [];
    outEl.innerHTML = renderEdges(outgoing, maps, "out");

    const incoming = maps.incomingLinks.get(path) ?? [];
    inEl.innerHTML = renderEdges(incoming, maps, "in");

    const warnings = maps.warningsByPath.get(path) ?? [];
    warnEl.innerHTML = warnings.length > 0
      ? renderWarnings(warnings)
      : `<div class="empty">No warnings.</div>`;
  };

  render();
  currentPath$.subscribe(render);
  derived$.subscribe(render);
}

function renderEdges(
  edges: SpandrelEdge[],
  maps: NonNullable<ReturnType<typeof derived$.get>>,
  direction: "in" | "out",
): string {
  if (edges.length === 0) {
    return `<div class="empty">${direction === "out" ? "No outgoing links." : "No incoming links."}</div>`;
  }

  // Group by linkType stem; untyped edges become a "links" group.
  const groups = new Map<string, SpandrelEdge[]>();
  for (const e of edges) {
    const key = e.linkType ?? "__untyped__";
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }

  const blocks: string[] = [];
  for (const [stem, es] of groups) {
    const typeInfo: LinkTypeInfo | undefined =
      stem === "__untyped__" ? undefined : maps.linkTypeByStem.get(stem);
    const header =
      stem === "__untyped__"
        ? "Links"
        : typeInfo?.name ?? stem;
    const desc = typeInfo?.description ?? "";
    blocks.push(`
      <div class="group">
        <h4 class="group-header">${escapeHtml(header)}</h4>
        ${desc ? `<div class="group-desc">${escapeHtml(desc)}</div>` : ""}
        <ul>
          ${es
            .map((e) => {
              // For outlinks, show the edge target; for inlinks, show the source.
              const otherPath = direction === "out" ? e.to : e.from;
              const target = maps.nodeByPath.get(otherPath);
              const name = target?.name ?? otherPath;
              const d = e.description ?? target?.description ?? "";
              return `
                <li>
                  <a href="${pathToUrl(otherPath)}">${escapeHtml(name)}</a>
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
    <ul class="warn-list">
      ${warnings
        .map(
          (w) =>
            `<li><span class="warn-type">${escapeHtml(w.type)}</span>${escapeHtml(w.message)}</li>`,
        )
        .join("")}
    </ul>
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
