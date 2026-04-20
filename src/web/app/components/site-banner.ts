/**
 * Persistent site-wide banner shown above the top bar. Renders the root
 * node's name and description as same-size text — think journal masthead,
 * not hero title. Stays visible across all routes so readers always know
 * what graph they're in.
 */

import { graph$ } from "../state.js";

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

export function mountSiteBanner(el: HTMLElement): void {
  function render(): void {
    const g = graph$.get();
    if (!g) {
      el.innerHTML = "";
      return;
    }
    const root = g.nodes.find((n) => n.path === "/");
    if (!root || (!root.name && !root.description)) {
      el.innerHTML = "";
      return;
    }
    const parts: string[] = [];
    if (root.name) {
      parts.push(`<span class="site-banner-name">${escapeHtml(root.name)}</span>`);
    }
    if (root.description) {
      if (parts.length) parts.push(`<span class="site-banner-sep" aria-hidden="true">·</span>`);
      parts.push(`<span class="site-banner-tagline">${escapeHtml(root.description)}</span>`);
    }
    el.innerHTML = `<a class="site-banner-inner" href="#/">${parts.join("")}</a>`;
  }

  graph$.subscribe(render);
  render();
}
