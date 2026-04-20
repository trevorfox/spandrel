/** Markdown renderer with internal-link rewriting.
 *
 * Internal links — those starting with "/" — get rewritten. In SPA mode
 * they become hash routes so the viewer can intercept them without a page
 * load. In static-site mode (the prerendered deploy), they stay as real
 * URLs so clicks navigate to the prerendered pages directly.
 *
 * External links (http, https, mailto, tel, relative) pass through
 * unchanged.
 *
 * Implementation note: we mutate the token's `href` via `walkTokens` rather
 * than overriding the `link` renderer. marked v14's default link renderer
 * relies on `this.parser.parseInline(token.tokens)` to render inline child
 * content, and that binding only exists while marked is actively parsing.
 * A standalone `Renderer` instance (the shape we'd need to override link on)
 * has no `parser` attached, so any link containing inline text would throw.
 * Mutating the href in `walkTokens` lets marked's own renderer do its job.
 */

import { marked, type Tokens } from "marked";
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

marked.use({
  gfm: true,
  breaks: false,
  walkTokens(token) {
    if (token.type === "link") {
      const link = token as Tokens.Link;
      link.href = rewriteHref(link.href);
    }
  },
});

export function renderMarkdown(md: string): string {
  if (!md || !md.trim()) return "";
  const html = marked.parse(md, { async: false }) as string;
  return html;
}
