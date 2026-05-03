/**
 * Static-publish entry point.
 *
 * The viewer's logic lives in `mountViewer` (./mount.ts) so it can be
 * embedded in any host. This file is the thin caller for the published
 * static bundle: mount against `document.documentElement` (the page is
 * ours), use the static data source (reads `graph.json` and per-node
 * `index.md` relative to baseURI), and let hash routing handle navigation.
 */

import { mountViewer } from "./mount.js";

function init(): void {
  // Static publish hosts the viewer at the page root, so we mount against
  // `document.body` and pass `document.documentElement` as the theme root
  // so the inline bootstrap and the SPA agree on the same element.
  mountViewer(document.body, {
    themeRoot: document.documentElement,
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
