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
import { pathToUrl } from "./mode.js";

function isInternalPath(href: string | null | undefined): boolean {
  if (!href) return false;
  if (href.startsWith("#")) return false;
  if (href.startsWith("mailto:") || href.startsWith("tel:")) return false;
  if (/^[a-z]+:\/\//i.test(href)) return false;
  return href.startsWith("/");
}

function rewriteHref(href: string): string {
  if (!isInternalPath(href)) return href;
  return pathToUrl(href);
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
