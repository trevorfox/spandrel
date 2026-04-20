/** Top bar: breadcrumb, search, theme toggle. */

import { currentPath$, derived$, graph$, pathToHash } from "../state.js";
import { currentTheme, toggleTheme } from "../lib/theme.js";
import type { SearchHit } from "./search.js";

export function mountTopBar(root: HTMLElement): void {
  root.innerHTML = `
    <nav class="breadcrumb" aria-label="Path"></nav>
    <div class="search" role="search">
      <input type="search" placeholder="Search nodes…" aria-label="Search nodes" autocomplete="off" />
      <div class="results" role="listbox" hidden></div>
    </div>
    <button type="button" class="theme-toggle" aria-label="Toggle theme"></button>
  `;

  const crumbEl = root.querySelector(".breadcrumb") as HTMLElement;
  const searchWrap = root.querySelector(".search") as HTMLElement;
  const input = searchWrap.querySelector("input") as HTMLInputElement;
  const resultsEl = searchWrap.querySelector(".results") as HTMLElement;
  const themeBtn = root.querySelector(".theme-toggle") as HTMLButtonElement;

  const renderBreadcrumb = () => {
    const path = currentPath$.get();
    const graph = graph$.get();
    const nodeByPath = derived$.get()?.nodeByPath;
    const rootName = nodeByPath?.get("/")?.name ?? graph?.nodes.find((n) => n.path === "/")?.name ?? "home";
    const segs = path === "/" ? [] : path.split("/").filter(Boolean);

    const parts: string[] = [];
    parts.push(
      path === "/"
        ? `<span class="crumb-current">${escapeHtml(rootName)}</span>`
        : `<a href="${pathToHash("/")}">${escapeHtml(rootName)}</a>`,
    );
    let acc = "";
    segs.forEach((seg, i) => {
      acc += "/" + seg;
      const label = nodeByPath?.get(acc)?.name ?? seg;
      parts.push('<span class="crumb-sep" aria-hidden="true">/</span>');
      if (i === segs.length - 1) {
        parts.push(`<span class="crumb-current">${escapeHtml(label)}</span>`);
      } else {
        parts.push(`<a href="${pathToHash(acc)}">${escapeHtml(label)}</a>`);
      }
    });
    crumbEl.innerHTML = parts.join(" ");
  };

  const renderTheme = () => {
    const t = currentTheme();
    themeBtn.textContent = t === "dark" ? "☾ dark" : "☀ light";
    themeBtn.setAttribute("aria-pressed", t === "dark" ? "true" : "false");
  };

  themeBtn.addEventListener("click", () => {
    toggleTheme();
    renderTheme();
  });

  // ── search
  let selectedIndex = -1;
  let lastHits: SearchHit[] = [];

  const closeResults = () => {
    resultsEl.hidden = true;
    resultsEl.innerHTML = "";
    selectedIndex = -1;
    lastHits = [];
  };

  const runSearch = () => {
    const q = input.value.trim();
    const idx = derived$.get()?.searchIndex;
    if (!idx || !q) {
      closeResults();
      return;
    }
    const hits = idx.search(q, 12);
    lastHits = hits;
    selectedIndex = hits.length > 0 ? 0 : -1;
    if (hits.length === 0) {
      resultsEl.innerHTML = `<div class="no-results">No matches.</div>`;
      resultsEl.hidden = false;
      return;
    }
    resultsEl.innerHTML = hits
      .map(
        (h, i) => `
          <button type="button" class="result" role="option" data-path="${escapeAttr(h.entry.path)}" aria-selected="${i === selectedIndex}">
            <span class="name">${escapeHtml(h.entry.name)}</span>
            <span class="path">${escapeHtml(h.entry.path)}</span>
          </button>`,
      )
      .join("");
    resultsEl.hidden = false;
  };

  const go = (path: string) => {
    closeResults();
    input.value = "";
    window.location.hash = pathToHash(path);
  };

  input.addEventListener("input", runSearch);
  input.addEventListener("focus", runSearch);

  input.addEventListener("keydown", (e) => {
    if (resultsEl.hidden || lastHits.length === 0) {
      if (e.key === "Escape") input.blur();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, lastHits.length - 1);
      syncSelection();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      syncSelection();
    } else if (e.key === "Enter") {
      if (selectedIndex >= 0) {
        e.preventDefault();
        go(lastHits[selectedIndex].entry.path);
      }
    } else if (e.key === "Escape") {
      closeResults();
      input.blur();
    }
  });

  const syncSelection = () => {
    const items = resultsEl.querySelectorAll<HTMLElement>(".result");
    items.forEach((el, i) => {
      el.setAttribute("aria-selected", i === selectedIndex ? "true" : "false");
      if (i === selectedIndex) el.scrollIntoView({ block: "nearest" });
    });
  };

  resultsEl.addEventListener("mousedown", (e) => {
    // mousedown, not click — the input's blur handler would close the
    // dropdown before a click fires otherwise.
    const target = (e.target as HTMLElement).closest(".result") as HTMLElement | null;
    if (!target) return;
    e.preventDefault();
    const path = target.getAttribute("data-path");
    if (path) go(path);
  });

  document.addEventListener("click", (e) => {
    if (!searchWrap.contains(e.target as Node)) closeResults();
  });

  // ── wiring
  renderTheme();
  renderBreadcrumb();

  currentPath$.subscribe(() => renderBreadcrumb());
  graph$.subscribe(() => renderBreadcrumb());
  derived$.subscribe(() => renderBreadcrumb());
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
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
