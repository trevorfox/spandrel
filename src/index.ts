// Public API entry point for the Spandrel npm package

// Compiler
export { compile, recompileNode, addGitMetadata, getHistory } from "./compiler/compiler.js";

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

// Conformance kit — for third-party GraphStore implementations to validate
// themselves against the interface contract.
export { runConformanceTests } from "./storage/conformance.js";

// Access policy
export { AccessPolicy, accessLevelAtLeast } from "./access/policy.js";
export { loadAccessConfig } from "./access/config.js";
export { runAccessPolicyConformance } from "./access/conformance.js";
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

// REST wire surface
export { createRestRouter } from "./rest/router.js";
export { actorFromRequest } from "./rest/actor.js";
export { shapeNodeAsJson } from "./rest/shape.js";
export type { NodeJson, NodeReference, NodeJsonLinks } from "./rest/shape.js";

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
