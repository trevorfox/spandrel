/** App entry. Wires route, data, and component mounts. */

import { currentPath$, graph$, hashToPath, error$ } from "./state.js";
import { fetchGraph } from "./graph-data.js";
import { mountTopBar } from "./components/top-bar.js";
import { mountContent } from "./components/content.js";
import { mountGraphViz } from "./components/graph-viz.js";
import { mountDrawer } from "./components/drawer.js";
import { startSse } from "./lib/sse.js";

function syncRouteFromHash(): void {
  currentPath$.set(hashToPath(window.location.hash));
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
  const topBar = document.getElementById("top-bar") as HTMLElement;
  const content = document.getElementById("content") as HTMLElement;
  const graphPane = document.getElementById("graph-pane") as HTMLElement;
  const drawer = document.getElementById("drawer") as HTMLElement;

  if (!topBar || !content || !graphPane || !drawer) {
    throw new Error("App layout elements missing from index.html");
  }

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
