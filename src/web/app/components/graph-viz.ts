/** d3-force graph with collection coloring.
 *
 * Deliberately restrained:
 *   — thin edges, muted fills, typographic labels for larger nodes
 *   — click-to-navigate (updates hash, letting the router re-render)
 *   — current node highlighted
 *   — simulation stops when alpha is low (no infinite CPU)
 */

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { select, type Selection } from "d3-selection";
import { drag, type D3DragEvent } from "d3-drag";
import "d3-transition";

import { currentPath$, derived$, graph$, graphView$, scopePath$, collectionOfPath, type WireNode } from "../state.js";
import { pathToUrl } from "../lib/mode.js";
import type { Graph, SpandrelEdge } from "../../types.js";
import { mountGraphTree } from "./graph-tree.js";

interface VizNode extends SimulationNodeDatum {
  id: string;
  name: string;
  collection: string;
}

interface VizLink extends SimulationLinkDatum<VizNode> {
  source: string | VizNode;
  target: string | VizNode;
  typed: boolean;
}

/** Warm, muted palette drawn from the limestone tokens. */
const COLLECTION_PALETTE = [
  "#a67c3c",
  "#7a6a4a",
  "#927354",
  "#6a7a50",
  "#8e6a52",
  "#706040",
  "#5f7a6a",
  "#8a5c3c",
];

export function mountGraphViz(root: HTMLElement): void {
  root.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Knowledge graph"></svg><div class="tree-view" hidden></div><div class="empty" hidden>No graph loaded.</div><div class="graph-chrome"><div class="view-toggle" role="group" aria-label="View mode"><button type="button" data-view="graph" class="active" aria-pressed="true">Graph</button><button type="button" data-view="tree" aria-pressed="false">Tree</button></div><div class="scope-control"><button type="button" class="scope-pill" aria-haspopup="listbox" aria-expanded="false"></button><div class="scope-menu" role="listbox" hidden></div></div><div class="legend" hidden></div></div><div class="node-tooltip" aria-hidden="true"></div>`;
  const svgEl = root.querySelector("svg") as SVGSVGElement;
  const treeViewEl = root.querySelector(".tree-view") as HTMLElement;
  const emptyEl = root.querySelector(".empty") as HTMLElement;
  const legendEl = root.querySelector(".legend") as HTMLElement;
  const scopeControlEl = root.querySelector(".scope-control") as HTMLElement;
  const scopePillEl = root.querySelector(".scope-pill") as HTMLButtonElement;
  const scopeMenuEl = root.querySelector(".scope-menu") as HTMLElement;
  const viewToggleEl = root.querySelector(".view-toggle") as HTMLElement;
  const tooltipEl = root.querySelector(".node-tooltip") as HTMLElement;

  mountGraphTree(treeViewEl);

  const svg = select(svgEl);
  const gLinks = svg.append("g").attr("class", "links");
  const gNodes = svg.append("g").attr("class", "nodes");

  let simulation: Simulation<VizNode, VizLink> | null = null;
  let nodes: VizNode[] = [];
  let links: VizLink[] = [];
  let collectionColors = new Map<string, string>();
  let justDragged = false;

  // Raised on every drag tick; cleared a tick after drag ends so the
  // follow-up click event (fired synchronously by the browser after mouse-
  // up) can be swallowed before it triggers navigation.
  const setJustDragged = (v: boolean): void => {
    justDragged = v;
  };

  // ── tooltip ───────────────────────────────────────────────────────────
  const rootRect = () => root.getBoundingClientRect();
  const showTooltip = (d: VizNode, event: MouseEvent) => {
    if (justDragged) return;
    const descNode = derived$.get()?.nodeByPath.get(d.id);
    const desc = descNode?.description ?? "";
    tooltipEl.innerHTML = `${escapeHtml(d.name || d.id)}${
      desc ? `<span class="desc">${escapeHtml(desc)}</span>` : ""
    }`;
    positionTooltip(event);
    tooltipEl.classList.add("visible");
  };
  const positionTooltip = (event: MouseEvent) => {
    const r = rootRect();
    const x = event.clientX - r.left;
    const y = event.clientY - r.top - 12;
    tooltipEl.style.left = `${x}px`;
    tooltipEl.style.top = `${y}px`;
  };
  const hideTooltip = () => {
    tooltipEl.classList.remove("visible");
  };

  const rebuild = (graph: Graph | null) => {
    renderScopePill();
    if (!graph || graph.nodes.length === 0) {
      emptyEl.hidden = false;
      legendEl.hidden = true;
      gLinks.selectAll("*").remove();
      gNodes.selectAll("*").remove();
      if (simulation) {
        simulation.stop();
        simulation = null;
      }
      return;
    }
    emptyEl.hidden = true;

    // Filter by subtree scope before anything else. `null` scope =
    // show everything. When scoped to `/architecture`, keep only
    // nodes at that path or under it, and only edges where both
    // endpoints survive the filter.
    const scope = scopePath$.get();
    const inScope = (p: string): boolean =>
      scope === null || p === scope || p.startsWith(scope + "/");
    const scopedNodes = graph.nodes.filter((n) => inScope(n.path));

    // Build node + edge data. Prefer the nodes in graph.nodes as the source
    // of truth; ignore edges referencing unknown nodes (keeps broken-link
    // warnings visible in the drawer without crashing the viz).
    const nodePaths = new Set<string>(scopedNodes.map((n) => n.path));
    nodes = scopedNodes.map((n: WireNode) => ({
      id: n.path,
      name: n.name || stemOf(n.path),
      collection: collectionOfPath(n.path),
    }));

    links = graph.edges
      .filter((e: SpandrelEdge) => nodePaths.has(e.from) && nodePaths.has(e.to))
      .map((e) => ({
        source: e.from,
        target: e.to,
        typed: e.type === "link",
      }));

    // Collection colors, stable by insertion order.
    collectionColors = new Map();
    let i = 0;
    for (const n of nodes) {
      if (!collectionColors.has(n.collection)) {
        collectionColors.set(n.collection, COLLECTION_PALETTE[i % COLLECTION_PALETTE.length]);
        i += 1;
      }
    }
    renderLegend(legendEl, collectionColors, graph, setCollectionHighlight);

    // Build/update selections.
    const linkSel = gLinks
      .selectAll<SVGLineElement, VizLink>("line")
      .data(links, (d) => `${typeof d.source === "string" ? d.source : d.source.id}__${typeof d.target === "string" ? d.target : d.target.id}__${d.typed ? "t" : "h"}`)
      .join((enter) =>
        enter
          .append("line")
          .attr("class", (d) => (d.typed ? "link typed" : "link")),
      );

    const nodeSel = gNodes
      .selectAll<SVGGElement, VizNode>("g.node")
      .data(nodes, (d) => d.id)
      .join((enter) => {
        const g = enter.append("g").attr("class", "node");
        g.append("circle");
        g.append("text").attr("y", 20);
        // Custom HTML tooltip (not SVG <title>) — SVG title rendering is
        // inconsistent across browsers; some delay a full second, others
        // skip entirely when the parent has a click handler.
        g.on("mouseenter", (event: MouseEvent, d) => {
          showTooltip(d, event);
        });
        g.on("mousemove", (event: MouseEvent) => {
          positionTooltip(event);
        });
        g.on("mouseleave", () => {
          hideTooltip();
        });
        g.on("click", (event: MouseEvent, d) => {
          // Drag-end fires a click on browsers that don't natively suppress
          // it after a drag. The `justDragged` flag is raised on drag move
          // and cleared on the next tick — block the click if we just
          // finished dragging.
          if (justDragged) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          // Uniform in both modes: pathToUrl returns a hash fragment in
          // SPA mode (sets hash, fires hashchange) and a real URL in
          // static mode (full navigation to the prerendered page).
          window.location.assign(pathToUrl(d.id));
        });
        g.call(attachDrag(() => simulation, setJustDragged));
        return g;
      });

    // Style and label.
    nodeSel
      .select<SVGCircleElement>("circle")
      .attr("r", (d) => (d.id === "/" ? 10 : d.id.split("/").length <= 2 ? 8 : 6))
      .attr("fill", (d) => collectionColors.get(d.collection) ?? "var(--node-fill)")
      .attr("stroke-width", 1);

    nodeSel
      .select<SVGTextElement>("text")
      .text((d) => (visibleLabel(d) ? d.name : ""));

    // Re-init simulation.
    if (simulation) simulation.stop();
    simulation = forceSimulation<VizNode, VizLink>(nodes)
      .force(
        "link",
        forceLink<VizNode, VizLink>(links)
          .id((d) => d.id)
          .distance((l) => (l.typed ? 90 : 60))
          .strength(0.6),
      )
      .force("charge", forceManyBody<VizNode>().strength(-140))
      .force("collide", forceCollide<VizNode>().radius(18))
      .force("center", forceCenter(center().x, center().y))
      .alphaDecay(0.035);

    simulation.on("tick", () => {
      // Clamp every node to the visible viewport minus a padding equal to
      // the largest node radius. Without this the force-sim can fling
      // nodes off-screen and leave the user chasing nothing — especially
      // bad on phones, where "off-screen" is a few hundred pixels away.
      const rect = svgEl.getBoundingClientRect();
      const pad = 14;
      const maxX = Math.max(pad, rect.width - pad);
      const maxY = Math.max(pad, rect.height - pad);
      for (const d of nodes) {
        d.x = Math.max(pad, Math.min(maxX, d.x ?? rect.width / 2));
        d.y = Math.max(pad, Math.min(maxY, d.y ?? rect.height / 2));
      }
      linkSel
        .attr("x1", (d) => (d.source as VizNode).x ?? 0)
        .attr("y1", (d) => (d.source as VizNode).y ?? 0)
        .attr("x2", (d) => (d.target as VizNode).x ?? 0)
        .attr("y2", (d) => (d.target as VizNode).y ?? 0);
      nodeSel.attr("transform", (d) => `translate(${d.x ?? 0}, ${d.y ?? 0})`);
    });

    applyCurrentHighlight();
  };

  const applyCurrentHighlight = () => {
    const current = currentPath$.get();
    gNodes.selectAll<SVGGElement, VizNode>("g.node").classed("current", (d) => d.id === current);
  };

  // Legend hover: highlight every node in the named collection and dim the
  // rest. `null` clears highlighting. Uses a root-level data attribute plus
  // a per-node class, so the visual state lives in CSS rather than JS.
  const setCollectionHighlight = (coll: string | null): void => {
    if (coll) {
      root.setAttribute("data-highlight-collection", "true");
      gNodes
        .selectAll<SVGGElement, VizNode>("g.node")
        .classed("highlighted", (d) => d.collection === coll);
    } else {
      root.removeAttribute("data-highlight-collection");
      gNodes.selectAll<SVGGElement, VizNode>("g.node").classed("highlighted", false);
    }
  };

  function center(): { x: number; y: number } {
    const rect = svgEl.getBoundingClientRect();
    return { x: rect.width / 2, y: rect.height / 2 };
  }

  // Last viewport the simulation was centered for. When the pane resizes
  // significantly (e.g., hidden → visible on mobile, or browser window
  // resize) we redistribute every node around the new center rather than
  // trust positions from the old viewport — those positions can sit well
  // outside the new bounds and take seconds to drift back.
  let lastCenter = { x: 0, y: 0 };

  function reheat(): void {
    if (!simulation) return;
    const c = center();
    // No meaningful size yet — bail rather than recentering to 0,0. The
    // next ResizeObserver tick (once display flips to block, say) will
    // come back through here with real dimensions.
    if (c.x < 1 || c.y < 1) return;
    simulation.force("center", forceCenter(c.x, c.y));

    const dx = Math.abs(c.x - lastCenter.x);
    const dy = Math.abs(c.y - lastCenter.y);
    const sizeChanged = dx > 40 || dy > 40 || lastCenter.x === 0;
    if (sizeChanged) {
      // Lay nodes out on a ring around the new center. Small enough to
      // start bunched (forces will expand them out); large enough that
      // they don't all stack on top of each other.
      const r = Math.min(c.x, c.y) * 0.5;
      nodes.forEach((d, i) => {
        const theta = (i / Math.max(1, nodes.length)) * Math.PI * 2;
        d.x = c.x + Math.cos(theta) * r;
        d.y = c.y + Math.sin(theta) * r;
        d.vx = 0;
        d.vy = 0;
      });
      lastCenter = c;
    }
    simulation.alpha(0.8).restart();
  }

  // ── scope control ─────────────────────────────────────────────────────
  //
  // Pill shows current scope; clicking opens a dropdown of choices. The
  // interaction pattern mirrors the top-bar search dropdown: `mousedown`
  // on items (not click) so the blur-close race doesn't swallow the
  // selection, plus a document-level click-outside listener to dismiss.
  const renderScopePill = () => {
    const scope = scopePath$.get();
    if (scope === null) {
      scopePillEl.innerHTML = `<span class="scope-label">Scope</span><span class="scope-value">All</span><span class="scope-caret" aria-hidden="true">▾</span>`;
      scopePillEl.classList.remove("scoped");
    } else {
      scopePillEl.innerHTML = `<span class="scope-label">Scope</span><span class="scope-value">${escapeHtml(scope)}</span><span class="scope-clear" data-clear="true" aria-label="Clear scope" role="button">✕</span>`;
      scopePillEl.classList.add("scoped");
    }
  };

  const closeScopeMenu = () => {
    scopeMenuEl.hidden = true;
    scopePillEl.setAttribute("aria-expanded", "false");
  };

  const openScopeMenu = () => {
    const graph = graph$.get();
    const current = currentPath$.get();
    const scope = scopePath$.get();

    // Build the choice set: a current-path option (if it's non-root and
    // has descendants worth scoping to), plus every top-level collection
    // in the graph. Skip collections the user is already scoped to.
    const items: Array<{ path: string | null; label: string; hint?: string }> = [];
    if (scope !== null) {
      items.push({ path: null, label: "All", hint: "clear scope" });
    }
    if (current && current !== "/" && current !== scope) {
      items.push({ path: current, label: current, hint: "scope to current" });
    }
    const seen = new Set<string>([scope ?? "", current]);
    if (graph) {
      const topLevel = new Set<string>();
      for (const n of graph.nodes) {
        const parts = n.path.split("/").filter(Boolean);
        if (parts.length >= 1) topLevel.add("/" + parts[0]);
      }
      for (const p of [...topLevel].sort()) {
        if (seen.has(p)) continue;
        items.push({ path: p, label: p });
      }
    }

    scopeMenuEl.innerHTML = items
      .map(
        (it) =>
          `<button type="button" class="scope-item" role="option" data-path="${escapeAttr(it.path ?? "__all__")}"><span class="item-label">${escapeHtml(it.label)}</span>${it.hint ? `<span class="item-hint">${escapeHtml(it.hint)}</span>` : ""}</button>`,
      )
      .join("");
    scopeMenuEl.hidden = false;
    scopePillEl.setAttribute("aria-expanded", "true");
  };

  scopePillEl.addEventListener("click", (e) => {
    // The ✕ clear affordance is nested inside the pill; catch it before
    // falling through to the open-menu handler.
    const target = e.target as HTMLElement;
    if (target.getAttribute("data-clear") === "true") {
      e.stopPropagation();
      scopePath$.set(null);
      closeScopeMenu();
      return;
    }
    if (scopeMenuEl.hidden) openScopeMenu();
    else closeScopeMenu();
  });

  scopeMenuEl.addEventListener("mousedown", (e) => {
    const target = (e.target as HTMLElement).closest(".scope-item") as HTMLElement | null;
    if (!target) return;
    e.preventDefault();
    const path = target.getAttribute("data-path");
    scopePath$.set(path === "__all__" ? null : path);
    closeScopeMenu();
  });

  document.addEventListener("click", (e) => {
    if (!scopeControlEl.contains(e.target as Node)) closeScopeMenu();
  });

  // ── view toggle (Graph | Tree) ────────────────────────────────────────
  //
  // Two buttons share the graph pane; `graphView$` controls which is
  // visible. Hiding the SVG skips the d3 tick cost while in tree mode;
  // the tree component self-updates via derived$/scopePath$ subs, so
  // no coordination needed here beyond show/hide.
  const applyView = () => {
    const view = graphView$.get();
    const isGraph = view === "graph";
    svgEl.style.display = isGraph ? "" : "none";
    treeViewEl.hidden = isGraph;
    // Legend is meaningful in both views — keep it.
    // Buttons reflect active state.
    viewToggleEl.querySelectorAll<HTMLButtonElement>("button[data-view]").forEach((btn) => {
      const match = btn.getAttribute("data-view") === view;
      btn.classList.toggle("active", match);
      btn.setAttribute("aria-pressed", String(match));
    });
  };

  viewToggleEl.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-view]");
    if (!btn) return;
    const view = btn.getAttribute("data-view");
    if (view === "graph" || view === "tree") {
      graphView$.set(view);
    }
  });

  graphView$.subscribe(applyView);

  // Initial render + subscriptions.
  renderScopePill();
  applyView();
  rebuild(graph$.get());
  graph$.subscribe(rebuild);
  scopePath$.subscribe(() => rebuild(graph$.get()));
  currentPath$.subscribe(applyCurrentHighlight);

  // Size.
  const resizeObserver = new ResizeObserver(() => {
    const rect = svgEl.getBoundingClientRect();
    svgEl.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
    reheat();
  });
  resizeObserver.observe(svgEl);
}

function visibleLabel(d: VizNode): boolean {
  // Show labels for the root and top-level collection nodes; hide otherwise
  // to keep the viz restful. Hovering still reveals the node's hit target.
  if (d.id === "/") return true;
  return d.id.split("/").filter(Boolean).length <= 1;
}

function stemOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(idx + 1) : path;
}

function renderLegend(
  el: HTMLElement,
  colors: Map<string, string>,
  graph: Graph,
  onHover: (collection: string | null) => void,
): void {
  if (colors.size <= 1) {
    el.hidden = true;
    return;
  }
  const nodeByPath = new Map<string, WireNode>();
  for (const n of graph.nodes) nodeByPath.set(n.path, n);
  const rows: string[] = [];
  for (const [collection, color] of colors) {
    if (collection === "/") continue;
    const label = nodeByPath.get(collection)?.name ?? collection.slice(1);
    rows.push(
      `<div class="legend-row" data-collection="${escapeAttr(collection)}"><span class="swatch" style="background:${color}"></span>${escapeHtml(label)}</div>`,
    );
  }
  if (rows.length === 0) {
    el.hidden = true;
    return;
  }
  el.innerHTML = rows.join("");
  el.hidden = false;

  // Delegated hover handlers. Using mouseover/mouseout so the highlight
  // follows the cursor when it moves between rows without flickering off.
  el.onmouseover = (e) => {
    const row = (e.target as HTMLElement).closest(".legend-row") as HTMLElement | null;
    if (!row) return;
    const coll = row.getAttribute("data-collection");
    if (coll) onHover(coll);
  };
  el.onmouseleave = () => onHover(null);
}

function attachDrag(
  getSim: () => Simulation<VizNode, VizLink> | null,
  setJustDragged: (v: boolean) => void,
) {
  type D3Event = D3DragEvent<SVGGElement, VizNode, VizNode>;
  let moved = false;
  return drag<SVGGElement, VizNode>()
    .clickDistance(5)
    .on("start", function (event: D3Event, d: VizNode) {
      moved = false;
      const sim = getSim();
      if (!sim) return;
      if (!event.active) sim.alphaTarget(0.2).restart();
      d.fx = d.x;
      d.fy = d.y;
    })
    .on("drag", function (event: D3Event, d: VizNode) {
      moved = true;
      d.fx = event.x;
      d.fy = event.y;
    })
    .on("end", function (event: D3Event, d: VizNode) {
      const sim = getSim();
      if (!sim) return;
      if (!event.active) sim.alphaTarget(0);
      d.fx = null;
      d.fy = null;
      if (moved) {
        setJustDragged(true);
        // Clear on the next event-loop tick so the synchronous click
        // fired by the browser after mouseup sees the flag.
        setTimeout(() => setJustDragged(false), 0);
      }
    });
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
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

// d3-selection has a TypeScript nuance that tripped me up — export kept to
// silence "declared but not used" if we remove the Selection import.
export type _keep = Selection<SVGSVGElement, unknown, null, undefined>;
