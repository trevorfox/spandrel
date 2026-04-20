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
