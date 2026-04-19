import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type {
  SpandrelNode,
  SpandrelEdge,
  ValidationWarning,
  HistoryEntry,
} from "./types.js";
import type { GraphStore } from "../storage/graph-store.js";
import { InMemoryGraphStore } from "../storage/in-memory-graph-store.js";

const INLINE_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;

/** Max file size in bytes — files larger than this are skipped with a warning */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/** Max compile time per node in ms — nodes that take longer are skipped with a warning */
export const COMPILE_TIMEOUT_MS = 30_000; // 30 seconds

/** Markdown files that should never become leaf nodes */
export const EXCLUDED_LEAF_MD_FILES = new Set([
  "design.md",
  "SKILL.md",
  "AGENT.md",
  "README.md",
]);

export async function compile(rootDir: string): Promise<GraphStore> {
  const nodes = new Map<string, SpandrelNode>();
  const edges: SpandrelEdge[] = [];
  const warnings: ValidationWarning[] = [];

  walkTree(rootDir, rootDir, nodes, edges, warnings);
  validate(nodes, edges, warnings);

  const store = new InMemoryGraphStore();
  for (const node of nodes.values()) await store.setNode(node);
  await store.replaceEdges(edges);
  await store.replaceWarnings(warnings);
  return store;
}

export async function recompileNode(
  store: GraphStore,
  rootDir: string,
  filePath: string
): Promise<void> {
  const nodePath = filePathToNodePath(rootDir, filePath);

  // Remove old node and its edges
  await store.deleteNode(nodePath);
  const edges = (await store.getEdges()).filter(
    (e) => e.from !== nodePath && e.to !== nodePath
  );

  // Re-parse if file still exists
  const compileWarnings: ValidationWarning[] = [];
  if (fs.existsSync(filePath)) {
    const basename = path.basename(filePath);
    let node: SpandrelNode | null = null;

    if (basename === "index.md") {
      const dir = path.dirname(filePath);
      node = parseNode(rootDir, dir, filePath, compileWarnings);
    } else if (basename.endsWith(".md") && !EXCLUDED_LEAF_MD_FILES.has(basename)) {
      node = parseLeafNode(rootDir, filePath, compileWarnings);
    }

    if (node) {
      await store.setNode(node);
      extractEdges(node, edges);

      if (node.parent) {
        edges.push({
          from: node.parent,
          to: node.path,
          type: "hierarchy",
        });
      }
    }
  }

  await store.replaceEdges(edges);

  // Rebuild children lists
  await rebuildChildren(store);

  // Re-validate (merge compile warnings with validation warnings)
  const warnings: ValidationWarning[] = [...compileWarnings];
  const allNodes = new Map<string, SpandrelNode>();
  for (const node of await store.getAllNodes()) allNodes.set(node.path, node);
  validate(allNodes, await store.getEdges(), warnings);
  await store.replaceWarnings(warnings);
}

function filePathToNodePath(rootDir: string, filePath: string): string {
  let rel = path.relative(rootDir, filePath);
  // Strip index.md from end (directory-based node)
  if (rel.endsWith(path.sep + "index.md") || rel === "index.md") {
    rel = rel.replace(/[/\\]?index\.md$/, "");
  } else if (rel.endsWith(".md")) {
    // Leaf .md file — strip extension
    rel = rel.replace(/\.md$/, "");
  }
  const nodePath = "/" + rel.split(path.sep).filter(Boolean).join("/");
  return nodePath === "/" ? "/" : nodePath;
}

function walkTree(
  rootDir: string,
  currentDir: string,
  nodes: Map<string, SpandrelNode>,
  edges: SpandrelEdge[],
  warnings: ValidationWarning[]
): void {
  const indexPath = findIndexMd(currentDir);
  const nodePath = dirToNodePath(rootDir, currentDir);

  if (indexPath) {
    const node = parseNode(rootDir, currentDir, indexPath, warnings);
    if (node) {
      nodes.set(node.path, node);
      extractEdges(node, edges);
    }
  } else if (nodePath !== "/") {
    // Directory without index.md — create a minimal node
    const children = getContentSubdirs(currentDir);
    const generatedDesc = children.length > 0
      ? `Contains: ${children.map((c) => path.basename(c)).join(", ")}`
      : "Empty directory";

    const node: SpandrelNode = {
      path: nodePath,
      name: path.basename(currentDir),
      description: generatedDesc,
      nodeType: children.length > 0 ? "composite" : "leaf",
      depth: nodePath.split("/").filter(Boolean).length,
      parent: parentPath(nodePath),
      children: [],
      content: "",
      frontmatter: {},
      created: null,
      updated: null,
      author: null,
    };
    nodes.set(node.path, node);

    warnings.push({
      path: nodePath,
      type: "missing_index",
      message: `Directory ${nodePath} has no index.md`,
    });
  }

  // Build hierarchy edge
  if (nodePath !== "/") {
    const parent = parentPath(nodePath);
    if (parent !== null) {
      edges.push({ from: parent, to: nodePath, type: "hierarchy" });
    }
  }

  // Recurse into subdirectories
  const subdirs = getContentSubdirs(currentDir);
  for (const subdir of subdirs) {
    walkTree(rootDir, subdir, nodes, edges, warnings);
  }

  // Process leaf .md files in this directory
  const leafFiles = getLeafMdFiles(currentDir);
  for (const leafFile of leafFiles) {
    const leafNode = parseLeafNode(rootDir, leafFile, warnings);
    if (!leafNode) continue;
    nodes.set(leafNode.path, leafNode);
    extractEdges(leafNode, edges);

    if (leafNode.parent !== null) {
      edges.push({ from: leafNode.parent, to: leafNode.path, type: "hierarchy" });
    }
  }

  // After recursion, set children on this node
  const node = nodes.get(nodePath);
  if (node) {
    const subdirChildren = subdirs.map((d) => dirToNodePath(rootDir, d));
    const leafChildren = leafFiles.map((f) => leafFileToNodePath(rootDir, f));
    node.children = [...subdirChildren, ...leafChildren];
    if (node.children.length > 0) {
      node.nodeType = "composite";
    }
  }
}

function findIndexMd(dir: string): string | null {
  const indexPath = path.join(dir, "index.md");
  if (fs.existsSync(indexPath)) return indexPath;
  // Check if dir itself is an index.md (for root)
  if (dir.endsWith("index.md") && fs.existsSync(dir)) return dir;
  return null;
}

function getContentSubdirs(dir: string): string[] {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        !d.name.startsWith("_") &&
        !d.name.startsWith(".") &&
        d.name !== "node_modules" &&
        d.name !== "dist" &&
        d.name !== "src"
    )
    .map((d) => path.join(dir, d.name))
    .sort();
}

function getLeafMdFiles(dir: string): string[] {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  const subdirNames = new Set(
    fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  );
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(
      (d) =>
        d.isFile() &&
        d.name.endsWith(".md") &&
        d.name !== "index.md" &&
        !d.name.startsWith("_") &&
        !d.name.startsWith(".") &&
        !EXCLUDED_LEAF_MD_FILES.has(d.name) &&
        !subdirNames.has(d.name.replace(/\.md$/, ""))
    )
    .map((d) => path.join(dir, d.name))
    .sort();
}

function leafFileToNodePath(rootDir: string, filePath: string): string {
  const rel = path.relative(rootDir, filePath);
  const withoutExt = rel.replace(/\.md$/, "");
  return "/" + withoutExt.split(path.sep).join("/");
}

function parseLeafNode(
  rootDir: string,
  filePath: string,
  warnings?: ValidationWarning[]
): SpandrelNode | null {
  const nodePath = leafFileToNodePath(rootDir, filePath);

  const stat = fs.statSync(filePath);
  if (stat.size > MAX_FILE_SIZE_BYTES) {
    const msg = `Skipping ${filePath}: file size ${stat.size} bytes exceeds ${MAX_FILE_SIZE_BYTES} byte limit`;
    if (warnings) {
      warnings.push({ path: nodePath, type: "file_too_large", message: msg });
    } else {
      console.warn(`[spandrel] ${msg}`);
    }
    return null;
  }

  const startTime = Date.now();
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);
  const elapsed = Date.now() - startTime;

  if (elapsed > COMPILE_TIMEOUT_MS) {
    const msg = `Skipping ${filePath}: compile took ${elapsed}ms, exceeded ${COMPILE_TIMEOUT_MS}ms limit`;
    if (warnings) {
      warnings.push({ path: nodePath, type: "compile_timeout", message: msg });
    } else {
      console.warn(`[spandrel] ${msg}`);
    }
    return null;
  }

  const stem = path.basename(filePath, ".md");
  return {
    path: nodePath,
    name: (data.name as string) || stem,
    description: (data.description as string) || "",
    nodeType: "leaf",
    depth: nodePath.split("/").filter(Boolean).length,
    parent: parentPath(nodePath),
    children: [],
    content: content.trim(),
    frontmatter: data,
    created: null,
    updated: null,
    author: (data.author as string) || null,
  };
}

function dirToNodePath(rootDir: string, dir: string): string {
  const rel = path.relative(rootDir, dir);
  if (rel === "" || rel === ".") return "/";
  return "/" + rel.split(path.sep).join("/");
}

function parentPath(nodePath: string): string | null {
  if (nodePath === "/") return null;
  const parts = nodePath.split("/").filter(Boolean);
  if (parts.length <= 1) return "/";
  return "/" + parts.slice(0, -1).join("/");
}

function parseNode(
  rootDir: string,
  dir: string,
  indexPath: string,
  warnings?: ValidationWarning[]
): SpandrelNode | null {
  const nodePath = dirToNodePath(rootDir, dir);

  const stat = fs.statSync(indexPath);
  if (stat.size > MAX_FILE_SIZE_BYTES) {
    const msg = `Skipping ${indexPath}: file size ${stat.size} bytes exceeds ${MAX_FILE_SIZE_BYTES} byte limit`;
    if (warnings) {
      warnings.push({ path: nodePath, type: "file_too_large", message: msg });
    } else {
      console.warn(`[spandrel] ${msg}`);
    }
    return null;
  }

  const startTime = Date.now();
  const raw = fs.readFileSync(indexPath, "utf-8");
  const { data, content } = matter(raw);
  const elapsed = Date.now() - startTime;

  if (elapsed > COMPILE_TIMEOUT_MS) {
    const msg = `Skipping ${indexPath}: compile took ${elapsed}ms, exceeded ${COMPILE_TIMEOUT_MS}ms limit`;
    if (warnings) {
      warnings.push({ path: nodePath, type: "compile_timeout", message: msg });
    } else {
      console.warn(`[spandrel] ${msg}`);
    }
    return null;
  }

  const subdirs = getContentSubdirs(dir);
  return {
    path: nodePath,
    name: (data.name as string) || path.basename(dir),
    description: (data.description as string) || "",
    nodeType: subdirs.length > 0 ? "composite" : "leaf",
    depth: nodePath === "/" ? 0 : nodePath.split("/").filter(Boolean).length,
    parent: parentPath(nodePath),
    children: [], // filled in after recursion
    content: content.trim(),
    frontmatter: data,
    created: null, // filled in by git integration
    updated: null,
    author: (data.author as string) || null,
  };
}

function extractEdges(node: SpandrelNode, edges: SpandrelEdge[]): void {
  // Link edges from frontmatter
  const links = node.frontmatter.links;
  if (Array.isArray(links)) {
    for (const link of links) {
      if (link && typeof link === "object" && "to" in link) {
        edges.push({
          from: node.path,
          to: link.to as string,
          type: "link",
          linkType: (link.type as string) || undefined,
          description: (link.description as string) || undefined,
        });
      }
    }
  }

  // Authored_by edge from author field
  if (node.author) {
    edges.push({
      from: node.path,
      to: node.author,
      type: "authored_by",
    });
  }

  // Inline markdown links to internal paths — typed as "mentions" to distinguish
  // from declared frontmatter links. Mentions are implicit prose references.
  const matches = node.content.matchAll(INLINE_LINK_RE);
  for (const match of matches) {
    const href = match[2];
    if (href.startsWith("/")) {
      edges.push({
        from: node.path,
        to: href,
        type: "link",
        linkType: "mentions",
        description: match[1] || undefined,
      });
    }
  }
}

async function rebuildChildren(store: GraphStore): Promise<void> {
  for (const node of await store.getAllNodes()) {
    node.children = [];
  }

  for (const edge of await store.getEdges({ type: "hierarchy" })) {
    const parent = await store.getNode(edge.from);
    if (parent && !parent.children.includes(edge.to)) {
      parent.children.push(edge.to);
    }
  }

  for (const node of await store.getAllNodes()) {
    node.nodeType = node.children.length > 0 ? "composite" : "leaf";
  }
}

function validate(
  nodes: Map<string, SpandrelNode>,
  edges: SpandrelEdge[],
  warnings: ValidationWarning[]
): void {
  for (const node of nodes.values()) {
    if (!node.frontmatter.name) {
      warnings.push({
        path: node.path,
        type: "missing_name",
        message: `Node ${node.path} is missing 'name' in frontmatter`,
      });
    }
    if (!node.description) {
      warnings.push({
        path: node.path,
        type: "missing_description",
        message: `Node ${node.path} is missing 'description' in frontmatter`,
      });
    }
  }

  // Check for broken links
  for (const edge of edges) {
    if (edge.type === "link" && !nodes.has(edge.to)) {
      // Only flag internal paths, not external URLs
      if (!edge.to.startsWith("http")) {
        warnings.push({
          path: edge.from,
          type: "broken_link",
          message: `Node ${edge.from} links to ${edge.to} which does not exist`,
        });
      }
    }
  }

  // Check for unlisted children
  for (const node of nodes.values()) {
    if (node.nodeType === "composite" && node.content) {
      for (const childPath of node.children) {
        const childNode = nodes.get(childPath);
        if (childNode) {
          const childName = childNode.name;
          const childBasename = path.basename(childPath);
          // Check if the child is mentioned in the parent's content
          if (
            !node.content.includes(childPath) &&
            !node.content.includes(childName) &&
            !node.content.includes(childBasename)
          ) {
            warnings.push({
              path: node.path,
              type: "unlisted_child",
              message: `Node ${node.path} has child ${childPath} not mentioned in its content`,
            });
          }
        }
      }
    }
  }
}

/** Resolve a node path to its relative source file (index.md or leaf .md) */
export function resolveNodeSourceFile(rootDir: string, nodePath: string): string {
  if (nodePath === "/") return "index.md";
  const rel = nodePath.slice(1);
  const dirPath = rel + "/index.md";
  if (fs.existsSync(path.join(rootDir, dirPath))) return dirPath;
  return rel + ".md";
}

export async function addGitMetadata(
  store: GraphStore,
  rootDir: string
): Promise<void> {
  const { simpleGit } = await import("simple-git");
  const git = simpleGit(rootDir);

  const isRepo = await git.checkIsRepo().catch(() => false);
  if (!isRepo) return;

  for (const node of await store.getAllNodes()) {
    const filePath = resolveNodeSourceFile(rootDir, node.path);

    try {
      const log = await git.log({ file: filePath });
      if (log.all.length > 0) {
        node.created = log.all[log.all.length - 1].date;
        node.updated = log.all[0].date;
      }
    } catch {
      // File might not be tracked yet
    }
  }
}

export async function getHistory(
  rootDir: string,
  nodePath: string
): Promise<HistoryEntry[]> {
  const { simpleGit } = await import("simple-git");
  const git = simpleGit(rootDir);

  const isRepo = await git.checkIsRepo().catch(() => false);
  if (!isRepo) return [];

  const filePath = resolveNodeSourceFile(rootDir, nodePath);

  try {
    const log = await git.log({ file: filePath });
    return log.all.map((entry) => ({
      hash: entry.hash,
      date: entry.date,
      author: entry.author_name,
      message: entry.message,
    }));
  } catch {
    return [];
  }
}
