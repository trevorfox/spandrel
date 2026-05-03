/**
 * Multi-mount state-isolation test.
 *
 * Wave 2 (B2) refactored `src/web/app/state.ts` from module-level Signal
 * singletons to a per-mount `ViewerState` threaded through every component.
 * The bug it fixes: two `mountViewer()` calls on the same page used to
 * share one set of signals, so navigating one viewer dragged the others
 * along. This test mounts two viewers, navigates the first, and asserts
 * the second's `currentPath$` (read via the breadcrumb the per-mount
 * state drives) is unchanged.
 *
 * Implementation note: each mount runs against its own JSDOM window. We
 * could host both mounts inside a single document, but JSDOM's
 * `querySelector("#id")` is non-compliant for scoped lookups when the same
 * id appears twice — it falls back to the global table, so the second
 * mount's `find()` calls would resolve to the first mount's elements and
 * the test would measure DOM-lookup confusion instead of state isolation.
 * Two DOMs side-by-side is the right primitive for the property under
 * test (separate `ViewerState` per call) and avoids JSDOM's quirk. Real
 * browsers handle scoped `#id` lookups correctly and this is documented
 * in the multi-mount embed guidance.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import type { Graph } from "../../src/web/types.js";

// Skeleton matches what `spandrel publish` emits — the elements
// `mountViewer` looks up by id.
const VIEWER_SKELETON = `
  <header id="site-banner"></header>
  <header id="top-bar"></header>
  <aside id="tree-rail"></aside>
  <main id="content"></main>
  <section id="graph-pane"></section>
  <footer id="drawer"></footer>
  <div id="view-pill"></div>
`;

const SAMPLE_GRAPH: Graph = {
  nodes: [
    {
      path: "/",
      name: "Root",
      description: "root node",
      nodeType: "composite",
      depth: 0,
      parent: null,
      children: ["/alpha", "/beta"],
      frontmatter: {},
      created: null,
      updated: null,
      author: null,
    },
    {
      path: "/alpha",
      name: "Alpha",
      description: "alpha leaf",
      nodeType: "leaf",
      depth: 1,
      parent: "/",
      children: [],
      frontmatter: {},
      created: null,
      updated: null,
      author: null,
    },
    {
      path: "/beta",
      name: "Beta",
      description: "beta leaf",
      nodeType: "leaf",
      depth: 1,
      parent: "/",
      children: [],
      frontmatter: {},
      created: null,
      updated: null,
      author: null,
    },
  ],
  edges: [
    { from: "/", to: "/alpha", type: "hierarchy" },
    { from: "/", to: "/beta", type: "hierarchy" },
  ],
  linkTypes: [],
  warnings: [],
};

interface MountFixture {
  dom: JSDOM;
  root: HTMLElement;
}

let fixtures: MountFixture[] = [];

function makeFixture(label: string): MountFixture {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body>${VIEWER_SKELETON}</body></html>`,
    { url: `http://localhost/${label}` },
  );
  return { dom, root: dom.window.document.body };
}

/**
 * Activate one fixture's globals so module code that references `window`,
 * `document`, `localStorage`, etc. by bareword sees that fixture's DOM.
 * Component mount work runs synchronously inside `mountViewer`, so we can
 * swap the active globals between calls without races.
 */
function activate(fx: MountFixture): void {
  const w = fx.dom.window as unknown as Window & typeof globalThis;
  (globalThis as unknown as { window: typeof w }).window = w;
  (globalThis as unknown as { document: Document }).document = w.document;
  (globalThis as unknown as { localStorage: Storage }).localStorage = w.localStorage;
  (globalThis as unknown as { HTMLElement: typeof HTMLElement }).HTMLElement = w.HTMLElement;
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
  // JSDOM lacks `CSS.escape` — the viewer's `find()` helper uses it to
  // build safe id selectors. The identity escape is sound for our test ids.
  const cssStub = {
    escape: (s: string) => String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&"),
  };
  (globalThis as unknown as { CSS: typeof CSS }).CSS = cssStub as unknown as typeof CSS;
  (w as unknown as { CSS: typeof CSS }).CSS = cssStub as unknown as typeof CSS;
  // JSDOM lacks `matchMedia`; the theme helper queries
  // `prefers-color-scheme` on first mount. Stub returns light.
  Object.defineProperty(w, "matchMedia", {
    configurable: true,
    value: (q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

/**
 * Drain the microtask queue and a couple of macrotasks. The viewer's mount
 * path chains promises (fetchGraph → graph$.set → derived$.set → subscriber
 * renders), and a single `await Promise.resolve()` only advances one rung.
 */
async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  fixtures = [];
});

afterEach(() => {
  for (const fx of fixtures) fx.dom.window.close();
  fixtures = [];
});

const dataStub = {
  fetchGraph: async () => SAMPLE_GRAPH,
  fetchNodeContent: async () => "",
};

const currentCrumb = (root: HTMLElement): string =>
  (root.querySelector(".breadcrumb .crumb-current")?.textContent ?? "").trim();

describe("multi-mount viewer isolation", () => {
  it("two mounts have independent currentPath$ — navigating one does not move the other", async () => {
    const fxA = makeFixture("a");
    const fxB = makeFixture("b");
    fixtures.push(fxA, fxB);

    // Activate before importing — `theme.ts` reads `document.documentElement`
    // at module load, and dynamic `import()` is cached, so the first import
    // wins on globals. We activate fxA first; subsequent activations swap
    // the active document for runtime calls.
    activate(fxA);
    const { mountViewer } = await import("../../src/web/app/mount.js");

    // Mount A under its document.
    const handleA = mountViewer(fxA.root, { routing: "external", data: dataStub });

    // Mount B under its own document.
    activate(fxB);
    const handleB = mountViewer(fxB.root, { routing: "external", data: dataStub });

    // Let both `fetchGraph` promises resolve and subscribers render.
    await flushMicrotasks();

    // Both default to "/" → breadcrumb shows the root name.
    expect(currentCrumb(fxA.root)).toBe("Root");
    expect(currentCrumb(fxB.root)).toBe("Root");

    // Navigate A. B's currentPath$ must not change.
    handleA.navigate("/alpha");
    await flushMicrotasks();

    expect(currentCrumb(fxA.root)).toBe("Alpha");
    expect(currentCrumb(fxB.root)).not.toBe("Alpha");
    expect(currentCrumb(fxB.root)).toBe("Root");

    // Navigate B independently. A stays on /alpha.
    handleB.navigate("/beta");
    await flushMicrotasks();

    expect(currentCrumb(fxA.root)).toBe("Alpha");
    expect(currentCrumb(fxB.root)).toBe("Beta");

    handleA.destroy();
    handleB.destroy();
  });

  it("createViewerState produces fully independent signals", async () => {
    const { createViewerState } = await import("../../src/web/app/state.js");

    const s1 = createViewerState();
    const s2 = createViewerState();

    expect(s1).not.toBe(s2);
    expect(s1.currentPath$).not.toBe(s2.currentPath$);
    expect(s1.scopePath$).not.toBe(s2.scopePath$);
    expect(s1.treeRailOpen$).not.toBe(s2.treeRailOpen$);

    s1.currentPath$.set("/foo");
    s1.scopePath$.set("/clients");
    expect(s2.currentPath$.get()).toBe("/");
    expect(s2.scopePath$.get()).toBeNull();
  });

  it("state mutations on one mount do not fire subscribers on the other", async () => {
    const fxA = makeFixture("a");
    const fxB = makeFixture("b");
    fixtures.push(fxA, fxB);

    activate(fxA);
    const { mountViewer } = await import("../../src/web/app/mount.js");
    const handleA = mountViewer(fxA.root, { routing: "external", data: dataStub });
    activate(fxB);
    const handleB = mountViewer(fxB.root, { routing: "external", data: dataStub });

    await flushMicrotasks();

    // Capture B's content pane before A navigates. The content pane is
    // wired to currentPath$ + derived$; if state were shared, A's nav
    // would re-render B's pane.
    const beforeB = (fxB.root.querySelector("#content")?.innerHTML ?? "");

    handleA.navigate("/alpha");
    await flushMicrotasks();

    const afterB = (fxB.root.querySelector("#content")?.innerHTML ?? "");

    // A's content reflects /alpha; B's content is byte-identical to before.
    expect(fxA.root.querySelector("#content")?.innerHTML ?? "").toContain("Alpha");
    expect(afterB).toBe(beforeB);

    handleA.destroy();
    handleB.destroy();
  });
});
