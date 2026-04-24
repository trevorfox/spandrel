/**
 * Dev-server URL → node-path routing.
 *
 * The dev server exposes each node at two shapes that match what
 * `spandrel publish` writes to disk and what the SPA's lazy
 * node-loader fetches:
 *
 *   - `/clients/acme.md`           sibling form emitted next to the node file
 *   - `/clients/acme/index.md`     directory form fetched by the SPA
 *
 * Both normalize to the same node path. The root node is addressed as
 * `/.md` / `/.json` (sentinel) or the directory form `/index.md`.
 */

export function extensionToNodePath(urlPath: string, ext: ".md" | ".json"): string | null {
  if (!urlPath.endsWith(ext)) return null;
  if (urlPath === "/" + ext || urlPath === "/index" + ext) return "/";
  let withoutExt = urlPath.slice(0, -ext.length);
  if (!withoutExt.startsWith("/")) return null;
  // Accept both the sibling form (`/foo/bar.md`) emitted by
  // `spandrel publish` and the directory form (`/foo/bar/index.md`) the
  // SPA's node-loader fetches via `document.baseURI`. Without this,
  // deep-link content fetches in dev mode fall through to the SPA
  // fallback and the viewer renders the HTML shell as a node body.
  if (withoutExt.endsWith("/index")) {
    withoutExt = withoutExt.slice(0, -"/index".length);
  }
  return withoutExt;
}
