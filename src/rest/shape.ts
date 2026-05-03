import type { GraphStore } from "../storage/graph-store.js";
import type { AccessPolicy } from "../access/policy.js";
import type { AccessLevel, Actor, ShapedEdge } from "../access/types.js";
import type { SpandrelEdge } from "../compiler/types.js";
import {
  accessLevelAtLeast,
} from "../access/policy.js";
import {
  getOutgoingLinks,
  getIncomingLinks,
  lookupLinkTypeDescription,
} from "../graph-ops.js";

export const NODE_PREFIX = "/node";
export const CONTENT_PREFIX = "/content";

export function nodeHref(nodePath: string): string {
  return nodePath === "/" ? NODE_PREFIX : NODE_PREFIX + nodePath;
}

export function contentHref(nodePath: string): string {
  return nodePath === "/" ? CONTENT_PREFIX : CONTENT_PREFIX + nodePath;
}

export interface NodeReference {
  href: string;
  path: string;
  name?: string;
  description?: string;
  linkType: string | null;
  linkDescription: string | null;
  linkTypeDescription: string | null;
}

export interface NodeJson {
  path: string;
  name: string;
  description?: string;
  nodeType?: "leaf" | "composite";
  depth?: number;
  parent?: string | null;
  content?: string | null;
  created?: string | null;
  updated?: string | null;
  author?: string | null;
  children?: NodeJson[];
  outgoing?: NodeReference[];
  incoming?: NodeReference[];
  _links: NodeJsonLinks;
}

export interface NodeJsonLinks {
  self: { href: string };
  content?: { href: string };
  parent?: { href: string };
  children?: { href: string };
  outgoing?: { href: string };
  incoming?: { href: string };
  graph?: { href: string };
}

/**
 * Render a Node as REST JSON, gated by the access policy.
 *
 * Returns null when the actor cannot see the node at all (level `none`).
 * At `exists` returns the minimum HAL skeleton (path + name + self link).
 * At `description` adds metadata and `_links` to children/outgoing/incoming.
 * At `content` adds the markdown body.
 *
 * `depth > 0` recurses into children with the same shaping rules per child.
 * Children invisible to the actor are dropped (not rendered as null shells).
 */
export async function shapeNodeAsJson(
  store: GraphStore,
  policy: AccessPolicy,
  actor: Actor,
  nodePath: string,
  options: {
    depth?: number;
    includeContent?: boolean;
    includeNonNavigable?: boolean;
  } = {}
): Promise<NodeJson | null> {
  const node = await store.getNode(nodePath);
  if (!node) return null;

  const level = policy.resolveLevel(actor, nodePath, node.frontmatter);
  if (level === "none") return null;

  const _links: NodeJsonLinks = { self: { href: nodeHref(nodePath) } };

  if (level === "exists") {
    return { path: node.path, name: node.name, _links };
  }

  if (node.parent !== null) {
    _links.parent = { href: nodeHref(node.parent) };
  }
  _links.children = { href: `/graph?root=${encodeURIComponent(nodePath)}&depth=1` };

  const out: NodeJson = {
    path: node.path,
    name: node.name,
    description: node.description,
    nodeType: node.nodeType,
    depth: node.depth,
    parent: node.parent,
    _links,
  };

  if (accessLevelAtLeast(level, "content")) {
    _links.content = { href: contentHref(nodePath) };
    if (options.includeContent) {
      out.content = node.content;
    }
    out.created = node.created;
    out.updated = node.updated;
    out.author = node.author;
  }

  // Children — nested Node JSON to the requested depth, or a flat summary list.
  const depth = options.depth ?? 0;
  const includeNonNavigable = options.includeNonNavigable ?? false;
  const childMap = await store.getNodes(node.children);
  const children: NodeJson[] = [];
  for (const childPath of node.children) {
    const child = childMap.get(childPath);
    if (!child) continue;
    // Filter non-navigable children (companion documents) unless explicitly requested.
    if (!includeNonNavigable && child.navigable === false) continue;
    if (depth > 0) {
      const shaped = await shapeNodeAsJson(store, policy, actor, childPath, {
        depth: depth - 1,
        includeContent: options.includeContent,
        includeNonNavigable,
      });
      if (shaped) children.push(shaped);
    } else {
      const childLevel = policy.resolveLevel(actor, childPath, child.frontmatter);
      if (childLevel === "none") continue;
      if (childLevel === "exists") {
        children.push({
          path: child.path,
          name: child.name,
          _links: { self: { href: nodeHref(childPath) } },
        });
      } else {
        children.push({
          path: child.path,
          name: child.name,
          description: child.description,
          nodeType: child.nodeType,
          depth: child.depth,
          _links: { self: { href: nodeHref(childPath) } },
        });
      }
    }
  }
  out.children = children;

  // Links — outgoing and incoming, gated by target visibility.
  const outgoing = await getOutgoingLinks(store, nodePath);
  const incoming = await getIncomingLinks(store, nodePath);

  out.outgoing = await collectVisibleReferences(store, policy, actor, outgoing);
  out.incoming = await collectVisibleReferences(store, policy, actor, incoming);

  return out;
}

async function collectVisibleReferences(
  store: GraphStore,
  policy: AccessPolicy,
  actor: Actor,
  refs: Array<{
    to: string;
    type: string | null;
    description: string | null;
    linkTypeDescription: string | null;
  }>
): Promise<NodeReference[]> {
  const targetMap = await store.getNodes(refs.map((r) => r.to));
  const out: NodeReference[] = [];
  for (const ref of refs) {
    const target = targetMap.get(ref.to);
    const level = policy.resolveLevel(actor, ref.to, target?.frontmatter ?? {});
    if (level === "none") continue;
    out.push({
      href: nodeHref(ref.to),
      path: ref.to,
      name: target?.name,
      description: accessLevelAtLeast(level, "description") ? target?.description : undefined,
      linkType: ref.type,
      linkDescription: ref.description,
      linkTypeDescription: ref.linkTypeDescription,
    });
  }
  return out;
}

/**
 * Decorate a graph edge with HAL hrefs and shape it through the policy.
 */
export async function shapeGraphEdge(
  store: GraphStore,
  policy: AccessPolicy,
  actor: Actor,
  edge: SpandrelEdge,
  fromLevel: AccessLevel,
  toLevel: AccessLevel
): Promise<(ShapedEdge & { _links: { from: { href: string }; to: { href: string } } }) | null> {
  const linkTypes = await store.getLinkTypes();
  const linkTypeDescription = lookupLinkTypeDescription(linkTypes, edge.linkType);
  const shaped = policy.shapeEdge(edge, fromLevel, toLevel, linkTypeDescription);
  if (!shaped) return null;
  return {
    ...shaped,
    _links: {
      from: { href: nodeHref(shaped.from) },
      to: { href: nodeHref(shaped.to) },
    },
  };
}
