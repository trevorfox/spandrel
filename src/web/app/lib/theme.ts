/** Theme storage + toggle. Mirrors the inline bootstrap in index.html. */

const KEY = "spandrel.theme";

export type Theme = "light" | "dark";

export function getStoredTheme(): Theme | null {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
}

export function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function currentTheme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  // Fall back to whatever the inline bootstrap decided, which is the DOM attribute.
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "dark" ? "dark" : "light";
}

export function setTheme(t: Theme): void {
  document.documentElement.setAttribute("data-theme", t);
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
