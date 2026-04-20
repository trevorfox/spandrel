/** Markdown renderer with internal-link rewriting.
 *
 * Internal links — those starting with "/" — get rewritten. In SPA mode
 * they become hash routes so the viewer can intercept them without a page
 * load. In static-site mode (the prerendered deploy), they stay as real
 * URLs so clicks navigate to the prerendered pages directly.
 *
 * External links (http, https, mailto, tel, relative) pass through
 * unchanged.
 */

import { marked, Renderer, type Tokens } from "marked";

let staticMode = false;

/**
 * Tell the renderer the site ships prerendered HTML at every node path.
 * Called once at SPA startup when `#prerender-content` is present in the
 * initial document — that's the signal that `spandrel publish --static`
 * produced this bundle.
 */
export function setStaticMode(enabled: boolean): void {
  staticMode = enabled;
}

function isInternalPath(href: string | null | undefined): boolean {
  if (!href) return false;
  if (href.startsWith("#")) return false;
  if (href.startsWith("mailto:") || href.startsWith("tel:")) return false;
  if (/^[a-z]+:\/\//i.test(href)) return false;
  return href.startsWith("/");
}

function rewriteHref(href: string): string {
  if (!isInternalPath(href)) return href;
  if (staticMode) {
    // Prerender emits `<base>/<path>/` per node. Browsers resolve a bare
    // relative URL against `<base href>`, so "clients/acme/" is correct
    // whether the deploy lives at `/` or `/spandrel/`.
    return href.replace(/^\/+/, "") + (href.endsWith("/") ? "" : "/");
  }
  return `#${href}`;
}

const renderer = new Renderer();
const baseLink = renderer.link.bind(renderer);
renderer.link = function (token: Tokens.Link): string {
  const rewritten = { ...token, href: rewriteHref(token.href) };
  return baseLink(rewritten);
};

marked.use({
  gfm: true,
  breaks: false,
  renderer,
});

export function renderMarkdown(md: string): string {
  if (!md || !md.trim()) return "";
  const html = marked.parse(md, { async: false }) as string;
  return html;
}
