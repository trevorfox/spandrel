/**
 * Deploy-mode detection and URL composition.
 *
 * Every internal link in the viewer needs to know whether this deploy
 * ships prerendered HTML at every node path. If it does, clicks should
 * navigate to real URLs. If it doesn't (i.e. the bare SPA over a single
 * index.html), clicks should stay inside the SPA via hash routing.
 *
 * The signal is presence of `#prerender-content` in the initial document.
 * `main.ts` sets the flag once on startup, before components render their
 * first hrefs.
 */

let staticMode = false;

export function setStaticMode(enabled: boolean): void {
  staticMode = enabled;
}

export function isStaticMode(): boolean {
  return staticMode;
}

/**
 * Build the href for a link that targets a graph node.
 *
 * - Static mode: real URL relative to `<base href>`, matching the
 *   directory-style location of the prerendered page (`clients/acme/`).
 *   Browsers resolve against `document.baseURI` so the same output works
 *   in `/` and `/spandrel/` deploys.
 * - Non-static mode: hash route (`#/clients/acme`) so the SPA intercepts
 *   without a page load.
 */
export function pathToUrl(path: string): string {
  if (!staticMode) return `#${path}`;
  if (path === "/" || path === "") return "./";
  return path.replace(/^\/+/, "") + "/";
}

/**
 * Read the current node path from the browser's address bar.
 *
 * - Static mode: the real URL *is* the route. Strip `<base href>` off
 *   `location.pathname`, drop any `/index.html` or trailing slash, and
 *   what's left is the graph node's path. The hash is ignored; a real
 *   navigation set the URL, not the hash.
 * - Non-static mode: hash routing. Returns `null` so the caller falls
 *   through to `parseHash(location.hash)`.
 *
 * Returns `null` when not in static mode so the caller can run the
 * existing hash-parsing path without branching on mode.
 */
export function staticPathFromLocation(): string | null {
  if (!staticMode) return null;
  let basePath = "/";
  try {
    basePath = new URL(".", document.baseURI).pathname;
  } catch {
    /* fall through */
  }
  let p = window.location.pathname;
  if (basePath !== "/" && p.startsWith(basePath)) {
    p = "/" + p.slice(basePath.length);
  }
  p = p.replace(/\/index\.html$/, "");
  if (p.length > 1) p = p.replace(/\/$/, "");
  return p || "/";
}
