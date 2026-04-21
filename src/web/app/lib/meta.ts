/**
 * Dynamic document-level metadata updates for SPA navigation.
 *
 * The prerendered HTML ships with correct `<title>`, `<meta description>`,
 * and `<link rel=canonical>` for the URL the crawler first fetched. When the
 * SPA navigates client-side (hash routing) we need to keep those in sync —
 * otherwise JS-executing crawlers and social-share scrapers see stale values,
 * and users who "Copy Link" from the browser address bar get the wrong
 * canonical.
 *
 * Canonical URLs always point to the real HTTP URL of the prerendered page
 * (`<base>/<path>/`), never to the hash URL. We resolve against
 * `document.baseURI` so the same code works in dev (base=`/`) and in a
 * project-pages deploy (base=`/spandrel/`).
 */

import type { SpandrelNode } from "../../types.js";

/** updateMeta only reads name/description/path, so it works on either the
 *  full node or the skeleton shape from graph.json. */
type MetaNode = Pick<SpandrelNode, "name" | "description" | "path">;

function canonicalHref(nodePath: string): string {
  const rel = nodePath === "/" ? "" : nodePath.replace(/^\/+/, "") + "/";
  try {
    return new URL(rel, document.baseURI).href;
  } catch {
    return rel;
  }
}

function ensureLink(id: string, rel: string): HTMLLinkElement {
  let el = document.getElementById(id) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.id = id;
    el.rel = rel;
    document.head.appendChild(el);
  }
  return el;
}

function ensureMeta(name: string, id: string): HTMLMetaElement {
  let el = document.getElementById(id) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.id = id;
    el.name = name;
    document.head.appendChild(el);
  }
  return el;
}

export function updateMeta(node: MetaNode, siteName: string): void {
  const title =
    node.path === "/" || !siteName || node.name === siteName
      ? node.name || siteName || "Spandrel"
      : `${node.name} — ${siteName}`;
  if (document.title !== title) document.title = title;

  const desc = ensureMeta("description", "meta-description");
  if (desc.content !== node.description) desc.content = node.description || "";

  const canonical = ensureLink("canonical", "canonical");
  const href = canonicalHref(node.path);
  if (canonical.href !== href) canonical.href = href;
}
