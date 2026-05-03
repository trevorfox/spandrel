/** Theme storage + toggle. Mirrors the inline bootstrap in index.html.
 *
 * The theme attribute can be applied to any element (the viewer's mount
 * root, `document.documentElement`, etc.) — `setThemeRoot()` configures
 * which. Default for the static publish path is `document.documentElement`
 * so the inline bootstrap and the SPA agree. Embedded contexts override.
 */

const KEY = "spandrel.theme";

export type Theme = "light" | "dark";

let themeRoot: HTMLElement = document.documentElement;

export function setThemeRoot(el: HTMLElement): void {
  themeRoot = el;
}

export function getStoredTheme(): Theme | null {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
}

/** Alias for the canonical name used by the mount API. */
export function readStoredTheme(): Theme | null {
  return getStoredTheme();
}

export function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function defaultTheme(): Theme {
  return getStoredTheme() ?? systemTheme();
}

export function currentTheme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  // Fall back to whatever the bootstrap decided, which is the DOM attribute.
  const attr = themeRoot.getAttribute("data-theme");
  return attr === "dark" ? "dark" : "light";
}

export function applyTheme(t: Theme): void {
  themeRoot.setAttribute("data-theme", t);
}

export function setTheme(t: Theme): void {
  applyTheme(t);
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* storage denied, tolerable */
  }
}

export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}
