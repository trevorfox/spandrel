/** Floating Read/Map pill — mobile-only stage switcher.
 *
 * Controls which surface fills the phone viewport: the content pane
 * (Read) or the graph pane (Map). Hidden on desktop via CSS — at that
 * width both panes are side-by-side and the toggle is meaningless.
 *
 * The selection lives on `#app[data-view]` so CSS can drive the
 * content/graph visibility swap without JS having to re-mount anything,
 * and it's persisted in localStorage so returning visitors keep whatever
 * they were looking at last.
 */

const STORAGE_KEY = "spandrel.view";

type View = "read" | "map";

function readStored(): View {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "map" ? "map" : "read";
  } catch {
    return "read";
  }
}

function writeStored(v: View): void {
  try {
    localStorage.setItem(STORAGE_KEY, v);
  } catch {
    /* private mode, quota, etc — fall through; in-memory attr still wins */
  }
}

export function mountViewPill(root: HTMLElement): void {
  const app = document.getElementById("app");
  if (!app) return;

  app.setAttribute("data-view", readStored());

  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "View");
  root.innerHTML = `
    <button type="button" data-view="read">Read</button>
    <button type="button" data-view="map">Map</button>
  `;

  const buttons = root.querySelectorAll<HTMLButtonElement>("button[data-view]");

  const sync = () => {
    const current = (app.getAttribute("data-view") as View) ?? "read";
    buttons.forEach((b) => {
      b.setAttribute(
        "aria-pressed",
        b.dataset.view === current ? "true" : "false",
      );
    });
  };
  sync();

  root.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
      "button[data-view]",
    );
    if (!btn) return;
    const next: View = btn.dataset.view === "map" ? "map" : "read";
    if (app.getAttribute("data-view") === next) return;
    app.setAttribute("data-view", next);
    writeStored(next);
    sync();
    // Reset the scroll position of the surface we just revealed. Without
    // this, switching Map → Read lands you mid-scroll in whatever article
    // you last left, which is disorienting when the switch also happens
    // to follow a navigation.
    const stage = document.getElementById(
      next === "map" ? "graph-pane" : "content",
    );
    if (stage) stage.scrollTop = 0;
  });
}
