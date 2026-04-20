/** App entry. Wires route, data, and component mounts. */

import { currentPath$, graph$, parseHash, viewFormat$, error$ } from "./state.js";
import { fetchGraph } from "./graph-data.js";
import { mountTopBar } from "./components/top-bar.js";
import { mountContent } from "./components/content.js";
import { mountGraphViz } from "./components/graph-viz.js";
import { mountDrawer } from "./components/drawer.js";
import { mountSiteBanner } from "./components/site-banner.js";
import { startSse } from "./lib/sse.js";
import { updateMeta } from "./lib/meta.js";

function syncRouteFromHash(): void {
  const { path, format } = parseHash(window.location.hash);
  currentPath$.set(path);
  viewFormat$.set(format);
}

async function loadGraph(): Promise<void> {
  try {
    const g = await fetchGraph();
    graph$.set(g);
    error$.set(null);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error("[spandrel] graph fetch failed:", msg);
    error$.set(msg);
  }
}

function renderFatalError(message: string): void {
  const root = document.getElementById("content");
  if (!root) return;
  root.innerHTML = `
    <div class="content-body">
      <header class="meta">
        <h1>Unable to load graph</h1>
        <p class="description">${escapeHtml(message)}</p>
      </header>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return c;
    }
  });
}

function init(): void {
  const siteBanner = document.getElementById("site-banner") as HTMLElement;
  const topBar = document.getElementById("top-bar") as HTMLElement;
  const content = document.getElementById("content") as HTMLElement;
  const graphPane = document.getElementById("graph-pane") as HTMLElement;
  const drawer = document.getElementById("drawer") as HTMLElement;

  if (!siteBanner || !topBar || !content || !graphPane || !drawer) {
    throw new Error("App layout elements missing from index.html");
  }

  // Remove the prerendered content block now that the SPA is taking over.
  // The prerender exists only for crawlers and no-JS users; once we're
  // mounted, keeping it around would visually duplicate every node body
  // above the SPA's own render. The SEO value is already captured in the
  // initial HTML the server sent.
  document.getElementById("prerender-content")?.remove();

  mountSiteBanner(siteBanner);
  mountTopBar(topBar);
  mountContent(content);
  mountGraphViz(graphPane);
  mountDrawer(drawer);

  // Surface fatal fetch errors in the content pane.
  error$.subscribe((msg) => {
    if (msg) renderFatalError(msg);
  });

  // Route.
  syncRouteFromHash();
  window.addEventListener("hashchange", syncRouteFromHash);

  // Keep <title>, <meta description>, and <link rel=canonical> in sync with
  // whichever node we're viewing. Canonical resolves against document.baseURI
  // so it always points at the real HTTP URL, never the hash form.
  function syncMeta(): void {
    const g = graph$.get();
    const path = currentPath$.get();
    if (!g) return;
    const node = g.nodes.find((n) => n.path === path);
    if (!node) return;
    const root = g.nodes.find((n) => n.path === "/");
    updateMeta(node, root?.name ?? "");
  }
  graph$.subscribe(syncMeta);
  currentPath$.subscribe(syncMeta);

  // Initial data.
  void loadGraph();

  // Live reload — best effort.
  startSse(() => {
    void loadGraph();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
