/**
 * Public mount API for the embeddable viewer.
 *
 * Hosts call `mountViewer(rootEl, options)` to render the viewer inside
 * `rootEl`. The viewer expects a specific DOM skeleton to be present inside
 * `rootEl` (the same skeleton `spandrel publish` ships in `index.html`).
 *
 * Each call instantiates an isolated `ViewerState` (per-mount state), so
 * multiple viewers on one page navigate independently. Hosts get true
 * multi-mount: two `mountViewer()` calls under different roots can read
 * different paths, scope to different subtrees, and toggle their rails
 * without interfering.
 *
 * Phase A surface (0.5.0):
 *   - Pluggable data source (`createStaticDataSource()` for bundles,
 *     `createRestDataSource()` for any spec-conformant REST endpoint).
 *   - Theme root local to the viewer (defaults to the mount root, falls back
 *     to `document.documentElement` only for the static publish case where
 *     the viewer owns the page).
 *   - CSS isolation: component rules are wrapped in `:where()` so host
 *     stylesheets can override without `!important`. Token CSS is keyed off
 *     `[data-theme]` rather than `:root[data-theme]` so it scopes to whatever
 *     element carries the attribute.
 */

import {
  createViewerState,
  parseHash,
  type ViewerState,
} from "./state.js";
import { fetchGraph, setDataSource } from "./graph-data.js";
import {
  createStaticDataSource,
  type ViewerDataSource,
} from "./data-source.js";
import { mountTopBar } from "./components/top-bar.js";
import { mountContent } from "./components/content.js";
import { mountGraphViz } from "./components/graph-viz.js";
import { mountDrawer } from "./components/drawer.js";
import { mountSiteBanner } from "./components/site-banner.js";
import { mountViewPill } from "./components/view-pill.js";
import { mountTreeRail, readStoredRailOpen } from "./components/tree-rail.js";
import { startSse } from "./lib/sse.js";
import { updateMeta } from "./lib/meta.js";
import {
  isStaticMode,
  setStaticMode,
  staticPathFromLocation,
} from "./lib/mode.js";
import { startNodeLoader } from "./lib/node-loader.js";
import { setThemeRoot, applyTheme, readStoredTheme, defaultTheme } from "./lib/theme.js";

export interface ViewerOptions {
  /**
   * Where graph and node data come from. Defaults to a static data source
   * (reads `graph.json` and per-node `index.md` files relative to
   * `document.baseURI`) — the published-bundle behavior. Live consumers
   * (hosts that serve Spandrel REST per-request) pass
   * `createRestDataSource(...)` here.
   */
  data?: ViewerDataSource;

  /**
   * Element that receives the `data-theme` attribute. Defaults to the mount
   * root. Pass `document.documentElement` for the published-bundle case
   * where the viewer owns the page.
   */
  themeRoot?: HTMLElement;

  /**
   * Initial path. Defaults to "/".
   */
  initialPath?: string;

  /**
   * `"hash"` (default): viewer manages hash routing. `"external"`: host
   * manages routing; the viewer calls `onNavigate` instead of mutating
   * `window.location.hash`. Use `"external"` when embedding inside a host
   * with its own router (Next.js, etc.).
   */
  routing?: "hash" | "external";

  /**
   * Called on intra-viewer navigation when `routing === "external"`. Hosts
   * use this to reflect the path in their own router (e.g. Next.js
   * `router.push`).
   */
  onNavigate?: (path: string) => void;
}

export interface ViewerHandle {
  /** Programmatically navigate to a path. */
  navigate(path: string): void;
  /** Tear down listeners and remove DOM. Idempotent. */
  destroy(): void;
}

/**
 * Mount the viewer inside `rootEl`. `rootEl` must contain the standard
 * skeleton (elements with ids `site-banner`, `top-bar`, `content`,
 * `graph-pane`, `drawer`, `view-pill`, `tree-rail`). The simplest way to
 * obtain the skeleton is to copy it from `spandrel publish` output's
 * `index.html`.
 */
export function mountViewer(rootEl: HTMLElement, options: ViewerOptions = {}): ViewerHandle {
  // 1. Create per-mount state. All component subscriptions and updates flow
  //    through this object, so two simultaneous mounts on the same page
  //    don't share signals.
  const state: ViewerState = createViewerState();

  // 2. Wire the data source first so any subsequent fetch goes through it.
  //    The data-source registry is module-level (shared across mounts) — it
  //    holds I/O configuration, not viewer state. Two mounts that want
  //    different sources call `setDataSource` in sequence; the last write
  //    wins, which matches Phase A scope.
  const dataSource = options.data ?? createStaticDataSource();
  setDataSource(dataSource);

  // 3. Choose the theme root. Default to the mount element so embedded
  //    viewers don't fight a host page's own theming. Static publish
  //    explicitly passes `document.documentElement` for whole-page styling.
  const themeHost = options.themeRoot ?? rootEl;
  setThemeRoot(themeHost);
  applyTheme(readStoredTheme() ?? defaultTheme());

  // 4. Look up layout regions inside the mount root.
  const find = <T extends HTMLElement>(id: string): T => {
    const el = rootEl.querySelector<T>(`#${CSS.escape(id)}`) ?? document.getElementById(id);
    if (!el) throw new Error(`Spandrel viewer: missing element #${id} in mount root`);
    return el as T;
  };

  const siteBanner = find<HTMLElement>("site-banner");
  const topBar = find<HTMLElement>("top-bar");
  const content = find<HTMLElement>("content");
  const graphPane = find<HTMLElement>("graph-pane");
  const drawer = find<HTMLElement>("drawer");
  const viewPill = find<HTMLElement>("view-pill");
  const treeRail = find<HTMLElement>("tree-rail");

  // 5. Static-mode detection: a prerender block in the page is the signal.
  //    Embedded contexts won't have one, so `isStaticMode()` returns false
  //    naturally.
  const prerender = document.getElementById("prerender-content");
  setStaticMode(prerender !== null);
  prerender?.remove();

  // 6. Tree rail default.
  const stored = readStoredRailOpen();
  state.treeRailOpen$.set(stored !== null ? stored : !isStaticMode());

  // 7. Mount components, threading state into each.
  mountSiteBanner(siteBanner, state);
  mountTopBar(topBar, state);
  mountContent(content, state);
  mountTreeRail(treeRail, state);
  mountGraphViz(graphPane, state);
  mountDrawer(drawer, state);
  mountViewPill(viewPill);

  // 8. Fatal-error surface.
  const errorUnsub = state.error$.subscribe((msg) => {
    if (msg) renderFatalError(content, msg);
  });

  // 9. Route handling.
  const routing = options.routing ?? "hash";
  const syncRoute = (): void => {
    const staticPath = staticPathFromLocation();
    if (staticPath !== null) {
      state.currentPath$.set(staticPath);
      state.viewFormat$.set("rendered");
      return;
    }
    const { path, format } = parseHash(window.location.hash);
    state.currentPath$.set(path);
    state.viewFormat$.set(format);
  };

  let navigateUnsub: () => void = () => {};
  if (routing === "hash") {
    syncRoute();
    window.addEventListener("hashchange", syncRoute);
    window.addEventListener("popstate", syncRoute);
    navigateUnsub = () => {
      window.removeEventListener("hashchange", syncRoute);
      window.removeEventListener("popstate", syncRoute);
    };
  } else {
    // External routing: caller drives currentPath$ via the returned handle's
    // navigate(). Notify caller of internal navigations (link clicks).
    if (options.initialPath) {
      state.currentPath$.set(options.initialPath);
    }
    if (options.onNavigate) {
      navigateUnsub = state.currentPath$.subscribe(options.onNavigate);
    }
  }

  // 10. Lazy content loader.
  startNodeLoader(state);

  // 11. Meta sync (only meaningful when the viewer owns the document).
  function syncMeta(): void {
    if (themeHost !== document.documentElement) return;
    const g = state.graph$.get();
    const path = state.currentPath$.get();
    if (!g) return;
    const node = g.nodes.find((n) => n.path === path);
    if (!node) return;
    const root = g.nodes.find((n) => n.path === "/");
    updateMeta(node, root?.name ?? "");
  }
  const metaUnsubA = state.graph$.subscribe(syncMeta);
  const metaUnsubB = state.currentPath$.subscribe(syncMeta);

  // 12. Initial data load.
  void loadGraph(state);

  // 13. Live updates. Prefer the data source's own `subscribe` if it has
  //     one; fall back to the legacy SSE channel for the static-publish
  //     case where the dev server pushes `reload` on `/events`.
  let liveUnsub: () => void = () => {};
  if (typeof dataSource.subscribe === "function") {
    liveUnsub = dataSource.subscribe(() => {
      void loadGraph(state);
    });
  } else if (!isStaticMode()) {
    liveUnsub = startSse(() => {
      void loadGraph(state);
    });
  }

  return {
    navigate(path: string) {
      state.currentPath$.set(path);
    },
    destroy() {
      navigateUnsub();
      errorUnsub();
      metaUnsubA();
      metaUnsubB();
      liveUnsub();
    },
  };
}

async function loadGraph(state: ViewerState): Promise<void> {
  try {
    const g = await fetchGraph();
    state.graph$.set(g);
    state.error$.set(null);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error("[spandrel] graph fetch failed:", msg);
    state.error$.set(msg);
  }
}

function renderFatalError(content: HTMLElement, message: string): void {
  content.innerHTML = `
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

// Re-exports for the public surface.
export {
  createStaticDataSource,
  createRestDataSource,
} from "./data-source.js";
export type { ViewerDataSource } from "./data-source.js";
