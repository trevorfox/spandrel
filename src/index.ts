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

// Access control
export {
  loadAccessConfig,
  resolveRole,
  canAccess,
  canWrite,
  accessLevelAtLeast,
  filterNodeFields,
} from "./schema/access.js";
export type { AccessLevel, Actor, Policy, AccessConfig } from "./schema/types.js";

// GraphQL schema
export { createSchema } from "./schema/schema.js";
export type { SchemaContext } from "./schema/schema.js";

// MCP server
export {
  createMcpServer,
  startMcpServer,
  registerReadOnlyTools,
  registerWriteTools,
  buildInstructions,
  runKeywordSearch,
} from "./server/mcp.js";
export type { McpServerOptions, RegisterReadOnlyToolsOptions } from "./server/mcp.js";
