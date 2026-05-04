/** Left-rail file-tree navigator.
 *
 * Wraps the existing graph-tree component in a persistent rail with a
 * header strip, a scope picker, and a collapse chevron. The rail and
 * the in-graph-pane Tree view share the same `mountGraphTree`
 * implementation, so expansion state stays in sync between the two
 * surfaces.
 *
 * The scope picker lives here (not on the graph chrome) so there's a
 * single source of truth for changing scope. Per-row ⌘ icons in the
 * tree itself are the direct affordance; this header dropdown handles
 * "All" / "current path" / top-level collections — choices that don't
 * map to a single tree row.
 *
 * Open/closed state lives in `treeRailOpen$` and persists to
 * localStorage. Hidden on phones (CSS); on desktop the rail is the
 * primary file-tree navigator and the in-pane Tree toggle is the
 * fallback for users who collapse it.
 */

import type { ViewerState } from "../state.js";
import { mountGraphTree } from "./graph-tree.js";

const STORAGE_KEY = "spandrel.tree-rail";

export function readStoredRailOpen(): boolean | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "open") return true;
    if (v === "closed") return false;
    return null;
  } catch {
    return null;
  }
}

function writeStoredRailOpen(open: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, open ? "open" : "closed");
  } catch {
    /* private mode, quota — fall back to in-memory signal only */
  }
}

export function mountTreeRail(root: HTMLElement, state: ViewerState): void {
  const { treeRailOpen$, scopePath$, currentPath$, graph$ } = state;
  root.innerHTML = `
    <div class="rail-header">
      <span class="rail-label">Tree</span>
      <button type="button" class="rail-toggle" data-action="rail-toggle" aria-label="Collapse tree">‹</button>
    </div>
    <div class="rail-scope" role="group" aria-label="Scope">
      <button type="button" class="rail-scope-trigger" data-action="rail-scope-toggle" aria-haspopup="listbox" aria-expanded="false">
        <span class="rail-scope-eyebrow">Scope</span>
        <span class="rail-scope-value unscoped">All</span>
        <span class="rail-scope-caret" aria-hidden="true">▾</span>
      </button>
      <button type="button" class="rail-scope-clear" data-action="rail-scope-clear" aria-label="Clear scope" hidden>✕</button>
    </div>
    <div class="rail-scope-menu" role="listbox" hidden></div>
    <div class="rail-body"></div>
    <button type="button" class="rail-reveal" data-action="rail-toggle" aria-label="Expand tree">›</button>
  `;

  const bodyEl = root.querySelector(".rail-body") as HTMLElement;
  const scopeStripEl = root.querySelector(".rail-scope") as HTMLElement;
  const scopeTriggerEl = root.querySelector(".rail-scope-trigger") as HTMLButtonElement;
  const scopeValueEl = root.querySelector(".rail-scope-value") as HTMLElement;
  const scopeClearEl = root.querySelector(".rail-scope-clear") as HTMLButtonElement;
  const scopeMenuEl = root.querySelector(".rail-scope-menu") as HTMLElement;
  mountGraphTree(bodyEl, state);

  const renderScope = () => {
    const scope = scopePath$.get();
    // Hide the whole scope strip when unscoped — initial view stays
    // calm, no "Scope ✕" cruft. To start scoping, the user clicks the
    // ⌘ icon on a tree row; once scope is active, the strip reappears
    // with the dropdown for changing/clearing it.
    scopeStripEl.hidden = scope === null;
    if (scope === null) {
      scopeValueEl.textContent = "All";
      scopeValueEl.classList.add("unscoped");
      scopeClearEl.hidden = true;
      closeScopeMenu();
    } else {
      scopeValueEl.textContent = scope;
      scopeValueEl.classList.remove("unscoped");
      scopeClearEl.hidden = false;
    }
  };

  const closeScopeMenu = () => {
    scopeMenuEl.hidden = true;
    scopeTriggerEl.setAttribute("aria-expanded", "false");
  };

  // Build the choice set. Order: clear first (if scoped), then current
  // path (if meaningful and not already scope), then top-level
  // collections. Skip the active scope so the menu never offers a no-op.
  const openScopeMenu = () => {
    const graph = graph$.get();
    const current = currentPath$.get();
    const scope = scopePath$.get();
    const items: Array<{ path: string | null; label: string; hint?: string }> = [];
    if (scope !== null) items.push({ path: null, label: "All", hint: "clear" });
    if (current && current !== "/" && current !== scope) {
      items.push({ path: current, label: current, hint: "current" });
    }
    const seen = new Set<string>([scope ?? "", current]);
    if (graph) {
      const topLevel = new Set<string>();
      for (const n of graph.nodes) {
        const parts = n.path.split("/").filter(Boolean);
        if (parts.length >= 1) topLevel.add("/" + parts[0]);
      }
      for (const p of [...topLevel].sort()) {
        if (seen.has(p)) continue;
        items.push({ path: p, label: p });
      }
    }
    scopeMenuEl.innerHTML = items
      .map(
        (it) =>
          `<button type="button" class="rail-scope-item" role="option" data-action="rail-scope-pick" data-path="${escapeAttr(it.path ?? "__all__")}"><span class="item-label">${escapeHtml(it.label)}</span>${it.hint ? `<span class="item-hint">${escapeHtml(it.hint)}</span>` : ""}</button>`,
      )
      .join("");
    scopeMenuEl.hidden = false;
    scopeTriggerEl.setAttribute("aria-expanded", "true");
  };

  const apply = () => {
    const open = treeRailOpen$.get();
    root.setAttribute("data-open", open ? "true" : "false");
    const collapseBtn = root.querySelector<HTMLButtonElement>(".rail-toggle");
    const revealBtn = root.querySelector<HTMLButtonElement>(".rail-reveal");
    if (collapseBtn) collapseBtn.setAttribute("aria-label", open ? "Collapse tree" : "Expand tree");
    if (revealBtn) revealBtn.setAttribute("aria-label", open ? "Collapse tree" : "Expand tree");
    if (!open) closeScopeMenu();
  };

  apply();
  renderScope();

  treeRailOpen$.subscribe((open) => {
    apply();
    writeStoredRailOpen(open);
  });
  scopePath$.subscribe(renderScope);

  root.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const action = target.closest("[data-action]");
    if (!action) return;
    const kind = action.getAttribute("data-action");
    if (kind === "rail-toggle") {
      treeRailOpen$.set(!treeRailOpen$.get());
      return;
    }
    if (kind === "rail-scope-toggle") {
      if (scopeMenuEl.hidden) openScopeMenu();
      else closeScopeMenu();
      return;
    }
    if (kind === "rail-scope-clear") {
      scopePath$.set(null);
      closeScopeMenu();
      return;
    }
    if (kind === "rail-scope-pick") {
      const path = action.getAttribute("data-path");
      scopePath$.set(path === "__all__" ? null : path);
      closeScopeMenu();
      return;
    }
  });

  // Click outside the scope strip or its menu → close. Guards the rest
  // of the rail (tree rows, header) from triggering dismissal so users
  // can keep interacting without collapsing the menu unexpectedly.
  document.addEventListener("click", (e) => {
    const t = e.target as Node;
    if (!scopeStripEl.contains(t) && !scopeMenuEl.contains(t)) closeScopeMenu();
  });
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
