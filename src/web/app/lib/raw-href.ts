/** Relative href to a node's raw .md or .json sibling file.
 *
 * Directory-style canonical form (`<path>/index.ext`) matches how the
 * prerendered HTML is served and avoids the dot-prefix MIME trap on
 * GitHub Pages, where bare `.json` files come back as
 * application/octet-stream and force a download.
 *
 * Relative hrefs resolve against <base href>, so the same code works in
 * dev (base=/) and in a subpath deploy (base=/spandrel/).
 */
export function rawHref(nodePath: string, ext: "md" | "json"): string {
  if (nodePath === "/" || nodePath === "") return `index.${ext}`;
  return `${nodePath.replace(/^\/+/, "")}/index.${ext}`;
}
