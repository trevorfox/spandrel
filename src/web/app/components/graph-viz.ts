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

import { currentPath$, derived$, graph$, collectionOfPath } from "../state.js";
import { pathToUrl } from "../lib/mode.js";
import type { Graph, SpandrelEdge, SpandrelNode } from "../../types.js";

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
  root.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Knowledge graph"></svg><div class="empty" hidden>No graph loaded.</div><div class="legend" hidden></div>`;
  const svgEl = root.querySelector("svg") as SVGSVGElement;
  const emptyEl = root.querySelector(".empty") as HTMLElement;
  const legendEl = root.querySelector(".legend") as HTMLElement;

  const svg = select(svgEl);
  const gLinks = svg.append("g").attr("class", "links");
  const gNodes = svg.append("g").attr("class", "nodes");

  let simulation: Simulation<VizNode, VizLink> | null = null;
  let nodes: VizNode[] = [];
  let links: VizLink[] = [];
  let collectionColors = new Map<string, string>();

  const rebuild = (graph: Graph | null) => {
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

    // Build node + edge data. Prefer the nodes in graph.nodes as the source
    // of truth; ignore edges referencing unknown nodes (keeps broken-link
    // warnings visible in the drawer without crashing the viz).
    const nodePaths = new Set<string>(graph.nodes.map((n) => n.path));
    nodes = graph.nodes.map((n: SpandrelNode) => ({
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
    renderLegend(legendEl, collectionColors, graph);

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
        g.on("click", (_event, d) => {
          // Uniform in both modes: pathToUrl returns a hash fragment in
          // SPA mode (sets hash, fires hashchange) and a real URL in
          // static mode (full navigation to the prerendered page).
          window.location.assign(pathToUrl(d.id));
        });
        g.call(attachDrag(() => simulation));
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

  function center(): { x: number; y: number } {
    const rect = svgEl.getBoundingClientRect();
    return { x: rect.width / 2, y: rect.height / 2 };
  }

  function reheat(): void {
    if (!simulation) return;
    simulation.force("center", forceCenter(center().x, center().y));
    simulation.alpha(0.5).restart();
  }

  // Initial render + subscriptions.
  rebuild(graph$.get());
  graph$.subscribe(rebuild);
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

function renderLegend(el: HTMLElement, colors: Map<string, string>, graph: Graph): void {
  if (colors.size <= 1) {
    el.hidden = true;
    return;
  }
  const nodeByPath = new Map<string, SpandrelNode>();
  for (const n of graph.nodes) nodeByPath.set(n.path, n);
  const rows: string[] = [];
  for (const [collection, color] of colors) {
    if (collection === "/") continue;
    const label = nodeByPath.get(collection)?.name ?? collection.slice(1);
    rows.push(`<div><span class="swatch" style="background:${color}"></span>${escapeHtml(label)}</div>`);
  }
  if (rows.length === 0) {
    el.hidden = true;
    return;
  }
  el.innerHTML = rows.join("");
  el.hidden = false;
}

function attachDrag(getSim: () => Simulation<VizNode, VizLink> | null) {
  type D3Event = D3DragEvent<SVGGElement, VizNode, VizNode>;
  return drag<SVGGElement, VizNode>()
    .on("start", function (event: D3Event, d: VizNode) {
      const sim = getSim();
      if (!sim) return;
      if (!event.active) sim.alphaTarget(0.2).restart();
      d.fx = d.x;
      d.fy = d.y;
    })
    .on("drag", function (event: D3Event, d: VizNode) {
      d.fx = event.x;
      d.fy = event.y;
    })
    .on("end", function (event: D3Event, d: VizNode) {
      const sim = getSim();
      if (!sim) return;
      if (!event.active) sim.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    });
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
