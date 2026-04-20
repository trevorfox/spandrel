/** Markdown renderer with internal-link rewriting.
 *
 * Internal links — those starting with "/" — become hash routes so the SPA
 * can intercept them without a page load. External links (http, https,
 * mailto) pass through unchanged.
 */

import { marked, Renderer, type Tokens } from "marked";

function isInternalPath(href: string | null | undefined): boolean {
  if (!href) return false;
  if (href.startsWith("#")) return false;
  if (href.startsWith("mailto:") || href.startsWith("tel:")) return false;
  if (/^[a-z]+:\/\//i.test(href)) return false;
  return href.startsWith("/");
}

function rewriteHref(href: string): string {
  if (!isInternalPath(href)) return href;
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
