// Public API entry point for the Spandrel npm package

// Compiler
export { compile, recompileNode, addGitMetadata, getHistory } from "./compiler/compiler.js";
export { buildManifest } from "./compiler/manifest.js";
export type { BuildManifest, BuildManifestOptions } from "./compiler/manifest.js";
export { nodeFrontmatterSchema } from "./compiler/frontmatter-schema.js";
export type { NodeFrontmatterSchema } from "./compiler/frontmatter-schema.js";

// Core types
export type {
  SpandrelNode,
  SpandrelEdge,
  SpandrelGraph,
  ValidationWarning,
  HistoryEntry,
  LinkTypeInfo,
} from "./compiler/types.js";

// Storage
export type { GraphStore, EdgeFilter } from "./storage/graph-store.js";
export { InMemoryGraphStore } from "./storage/in-memory-graph-store.js";

// Access policy
export { AccessPolicy, accessLevelAtLeast } from "./access/policy.js";
export { loadAccessConfig } from "./access/config.js";
export type {
  Actor,
  AccessLevel,
  AccessConfig,
  Policy,
  RoleConfig,
  DenyRule,
  ShapedNode,
  ShapedEdge,
} from "./access/types.js";

// Markdown serialization — round-trip a SpandrelNode back to its source form
export { renderNodeAsMarkdown } from "./web/render-node.js";

// REST wire surface
export {
  createRestRouter,
  jsonResponse,
  textResponse,
  errorResponse,
  readJsonBody,
} from "./rest/router.js";
export { actorFromRequest } from "./rest/actor.js";
export { shapeNodeAsJson } from "./rest/shape.js";
export { createNodeAdapter } from "./rest/node-adapter.js";
export type { WebRouter, NodeRouter } from "./rest/node-adapter.js";
export type { NodeJson, NodeReference, NodeJsonLinks } from "./rest/shape.js";
export type { RestContext, RestHandler, ParsedUrl } from "./rest/types.js";

// MCP wire surface
export {
  createMcpServer,
  startMcpServer,
  registerReadOnlyTools,
  registerWriteTools,
  buildInstructions,
  runKeywordSearch,
} from "./server/mcp.js";
export type { McpServerOptions, RegisterReadOnlyToolsOptions } from "./server/mcp.js";
