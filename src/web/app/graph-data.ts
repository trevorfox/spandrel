/** Loader for graph.json — always relative to document.baseURI. */

import type { Graph } from "../types.js";

export async function fetchGraph(): Promise<Graph> {
  // Cache-bust so SSE-triggered reloads always see fresh data.
  const url = new URL(`graph.json?t=${Date.now()}`, document.baseURI).toString();
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load graph.json: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as Graph;
  return normalize(json);
}

/** Defensive defaults so the SPA doesn't crash on partial payloads. */
function normalize(g: Partial<Graph>): Graph {
  return {
    nodes: g.nodes ?? [],
    edges: g.edges ?? [],
    linkTypes: g.linkTypes ?? [],
    warnings: g.warnings ?? [],
  };
}
