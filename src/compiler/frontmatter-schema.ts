/**
 * JSON Schema for Spandrel node frontmatter.
 *
 * Single source of truth for what a Spandrel-conforming node's frontmatter
 * looks like. Used:
 *   - by the compiler for validation
 *   - by consumers (CMS configs, content-collection schemas, validators) via
 *     `import { nodeFrontmatterSchema } from "spandrel"`
 *   - by JSON-only consumers via the published `schema.json` at the package root
 *
 * Adding fields is backwards-compatible. Removing or renaming requires a major
 * version bump per the public-API contract.
 *
 * The schema permits arbitrary additional properties because Spandrel
 * deliberately allows domain-specific frontmatter fields. Validators that want
 * a strict subset can clone-and-tighten.
 */

export const nodeFrontmatterSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://spandrel.org/schema/node-frontmatter.json",
  title: "Spandrel Node Frontmatter",
  description: "YAML frontmatter shape for a node in a Spandrel knowledge graph",
  type: "object",
  required: ["name", "description"],
  additionalProperties: true,
  properties: {
    name: {
      type: "string",
      description: "Human-readable name for the node",
      minLength: 1,
    },
    description: {
      type: "string",
      description:
        "One-line summary — enough for a reader (or agent) to decide whether to read the body",
      minLength: 1,
    },
    kind: {
      type: "string",
      enum: ["node", "document"],
      default: "node",
      description:
        "Curated graph content (node, default) or reference material (document). Documents are searchable and linkable but excluded from default child listings unless `includeNonNavigable` is requested.",
    },
    navigable: {
      type: "boolean",
      default: true,
      description:
        "When false, the node is excluded from default `getChildren` and collection-index listings. Still searchable, still linkable.",
    },
    links: {
      type: "array",
      description: "Typed edges to other nodes in the graph",
      items: {
        type: "object",
        required: ["to"],
        additionalProperties: false,
        properties: {
          to: {
            type: "string",
            description: "Path of the target node (e.g. `/clients/acme`)",
            pattern: "^/",
          },
          type: {
            type: "string",
            description:
              "Link type label. Free-form by default; declared types under `/linkTypes/` carry shared descriptions.",
          },
          description: {
            type: "string",
            description:
              "Per-edge description — the primary semantic carrier. Describes the relationship between this source and this target.",
          },
        },
      },
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "Free-form tags",
    },
    author: {
      type: "string",
      description: "Author of the node (string; resolved against people/ collection if present)",
    },
    schemaType: {
      type: "string",
      description:
        "Override for `@type` inference in static-publish JSON-LD output (e.g. `Organization`, `Person`)",
    },
    schemaOrg: {
      type: "string",
      description:
        "Mapping from this graph's link type to a schema.org predicate. Only meaningful on `/linkTypes/<type>.md` files.",
      enum: ["isPartOf", "hasPart", "about", "mentions", "sameAs", "relatedLink"],
    },
  },
} as const;

export type NodeFrontmatterSchema = typeof nodeFrontmatterSchema;
