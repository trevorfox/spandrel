// src/links/types.ts

/**
 * One entry in the link-type registry. Keyed in `LinkRegistry.types` by the
 * canonical stem (e.g. `"realized-by"`). The stem itself is the type's name —
 * there is no separate display-name field. Description is optional; types are
 * expected to have self-explanatory names.
 */
export interface LinkTypeEntry {
  description?: string;
}

/**
 * The link-type registry — a graph-local vocabulary loaded from
 * `_links/config.yaml`. The registry is an authoring artifact: it governs
 * how content is shaped (via `enforce` and `min_uses` warnings), and it is
 * exposed for tooling/web-viewer introspection via REST `GET /linkTypes`.
 * It is NOT pushed into agent context — agents see edge-level `type` and
 * `description` only.
 */
export interface LinkRegistry {
  enforce: boolean;
  minUses: number;
  types: Map<string, LinkTypeEntry>;
}

export const EMPTY_LINK_REGISTRY: LinkRegistry = {
  enforce: false,
  minUses: 0,
  types: new Map(),
};
