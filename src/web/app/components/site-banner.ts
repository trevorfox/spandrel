/**
 * Persistent site-wide banner shown above the top bar. Renders the root
 * node's name and description as same-size text — think journal masthead,
 * not hero title. Stays visible across all routes so readers always know
 * what graph they're in.
 *
 * Tagline is one-line-with-ellipsis by default. When the text fits (wide
 * viewport) nothing is truncated and the banner looks the same as it used
 * to. When it doesn't fit (phones, narrow windows) the CSS ellipsis
 * appears; tapping the tagline toggles a data-expanded flag that lets it
 * wrap to its natural height. Tapping again collapses back to one line.
 */

import { graph$ } from "../state.js";
import { pathToUrl } from "../lib/mode.js";

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
  el.setAttribute("data-expanded", "false");

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

    const homeHref = pathToUrl("/");
    const name = root.name ? escapeHtml(root.name) : "";
    const tagline = root.description ? escapeHtml(root.description) : "";

    el.innerHTML = `
      <div class="site-banner-inner">
        <a class="site-banner-home" href="${homeHref}">
          <span class="site-banner-name">${name}</span>
        </a>
        ${
          tagline
            ? `
              <span class="site-banner-sep" aria-hidden="true">·</span>
              <button type="button" class="site-banner-tagline" aria-expanded="false" aria-label="Toggle tagline">${tagline}</button>
            `
            : ""
        }
      </div>
    `;

    const tag = el.querySelector<HTMLButtonElement>(".site-banner-tagline");
    if (tag) {
      tag.addEventListener("click", () => {
        const next = el.getAttribute("data-expanded") !== "true";
        el.setAttribute("data-expanded", String(next));
        tag.setAttribute("aria-expanded", String(next));
      });
    }
  }

  graph$.subscribe(render);
  render();
}
