/** Indented tree view of the graph hierarchy.
 *
 * Reads `derived$.hierarchyChildren` (parent→children adjacency,
 * already built by the state layer). Rows are navigable like graph
 * nodes — click body = navigate. Each row also exposes a hover-only
 * scope icon that sets `scopePath$`, the same signal the force graph
 * reads, so the scope control and the tree share one contract.
 *
 * Expansion state lives in `treeExpanded$` (Set<string> of paths).
 * Seeded on first render from the current path's ancestors so users
 * land in the tree with the breadcrumb already unfolded.
 */

import {
  currentPath$,
  derived$,
  scopePath$,
  treeExpanded$,
  collectionOfPath,
} from "../state.js";
import { pathToUrl } from "../lib/mode.js";

const COLLECTION_PALETTE = [
  "#a67c3c",
  "#7a6a4a",
  "#927354",
  "#6a7a50",
  "#8e6a52",
  "#706040",
  "#5f7a6a",
  "#8a5c3c",
];

export function mountGraphTree(root: HTMLElement): void {
  root.innerHTML = `<div class="tree-empty" hidden>No graph loaded.</div><ul class="tree-root" role="tree"></ul>`;
  const emptyEl = root.querySelector(".tree-empty") as HTMLElement;
  const listEl = root.querySelector(".tree-root") as HTMLUListElement;

  const render = () => {
    const maps = derived$.get();
    if (!maps) {
      emptyEl.hidden = false;
      listEl.innerHTML = "";
      return;
    }
    emptyEl.hidden = true;

    // Compute stable collection colors (same order as the graph-viz
    // legend) so the two views agree visually. Seeded from nodeByPath
    // iteration order, which matches graph.nodes.
    const collectionColors = new Map<string, string>();
    let ci = 0;
    for (const [, n] of maps.nodeByPath) {
      const coll = collectionOfPath(n.path);
      if (!collectionColors.has(coll)) {
        collectionColors.set(coll, COLLECTION_PALETTE[ci % COLLECTION_PALETTE.length]);
        ci += 1;
      }
    }

    // If scoped, root the tree at the scope path; otherwise at `/`.
    const scope = scopePath$.get();
    const rootPath = scope ?? "/";

    // Seed expansion: ancestors of currentPath (so the reader's
    // position is visible), plus the root.
    let expanded = treeExpanded$.get();
    if (expanded.size === 0) {
      const seed = new Set<string>();
      seed.add(rootPath);
      const cur = currentPath$.get();
      if (cur && cur !== "/") {
        const parts = cur.split("/").filter(Boolean);
        let acc = "";
        for (const p of parts) {
          acc += "/" + p;
          seed.add(acc);
        }
      }
      // Also expand root's direct children so the first view isn't
      // a single bullet at the top.
      expanded = seed;
    }

    const current = currentPath$.get();

    const renderRows = (path: string, depth: number): string => {
      const children = maps.hierarchyChildren.get(path) ?? [];
      if (children.length === 0) return "";
      const sorted = [...children].sort((a, b) => {
        const an = maps.nodeByPath.get(a)?.name ?? a;
        const bn = maps.nodeByPath.get(b)?.name ?? b;
        return an.localeCompare(bn);
      });
      const items: string[] = [];
      for (const childPath of sorted) {
        const node = maps.nodeByPath.get(childPath);
        const name = node?.name ?? stemOf(childPath);
        const hasChildren = (maps.hierarchyChildren.get(childPath) ?? []).length > 0;
        const isExpanded = expanded.has(childPath);
        const isCurrent = childPath === current;
        const coll = collectionOfPath(childPath);
        const swatchColor = collectionColors.get(coll) ?? "var(--node-fill)";
        items.push(`
          <li role="treeitem" aria-expanded="${hasChildren ? String(isExpanded) : ""}" data-path="${escapeAttr(childPath)}">
            <div class="tree-row${isCurrent ? " current" : ""}" style="padding-left: ${depth * 16 + 8}px">
              <span class="tree-chev${hasChildren ? "" : " invisible"}" data-action="toggle" aria-hidden="${hasChildren ? "false" : "true"}">▸</span>
              <span class="tree-swatch" style="background:${swatchColor}"></span>
              <button type="button" class="tree-name" data-action="navigate" data-path="${escapeAttr(childPath)}">${escapeHtml(name)}</button>
              <button type="button" class="tree-scope" data-action="scope" data-path="${escapeAttr(childPath)}" aria-label="Scope graph to ${escapeAttr(childPath)}" title="Scope graph to this subtree">⌘</button>
            </div>
            ${hasChildren && isExpanded ? `<ul role="group">${renderRows(childPath, depth + 1)}</ul>` : ""}
          </li>
        `);
      }
      return items.join("");
    };

    listEl.innerHTML = renderRows(rootPath, 0);

    // Persist any seed we just computed so subsequent renders skip it.
    if (treeExpanded$.get().size === 0) {
      treeExpanded$.set(expanded);
    }
  };

  // Delegated click handler for the three actions: toggle / navigate / scope.
  root.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const action = target.closest("[data-action]") as HTMLElement | null;
    if (!action) return;
    const kind = action.getAttribute("data-action");
    if (kind === "toggle") {
      const li = action.closest("li[data-path]") as HTMLElement | null;
      const path = li?.getAttribute("data-path");
      if (!path) return;
      const next = new Set(treeExpanded$.get());
      if (next.has(path)) next.delete(path);
      else next.add(path);
      treeExpanded$.set(next);
      return;
    }
    if (kind === "navigate") {
      const path = action.getAttribute("data-path");
      if (!path) return;
      window.location.assign(pathToUrl(path));
      return;
    }
    if (kind === "scope") {
      const path = action.getAttribute("data-path");
      if (!path) return;
      e.stopPropagation();
      scopePath$.set(path);
    }
  });

  render();
  derived$.subscribe(render);
  currentPath$.subscribe(render);
  scopePath$.subscribe(render);
  treeExpanded$.subscribe(render);
}

function stemOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(idx + 1) : path;
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

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
