import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export interface ThingData {
  name: string;
  description: string;
  content?: string;
  links?: Array<{ to: string; type?: string; description?: string }>;
  author?: string;
  tags?: string[];
}

export interface ThingUpdate {
  name?: string;
  description?: string;
  content?: string;
  links?: Array<{ to: string; type?: string; description?: string }>;
  author?: string;
  tags?: string[];
}

export function resolvePaths(rootDir: string, thingPath: string) {
  const normalized = thingPath.startsWith("/") ? thingPath : "/" + thingPath;
  const dir = normalized === "/"
    ? rootDir
    : path.join(rootDir, ...normalized.split("/").filter(Boolean));
  return { normalized, dir, indexPath: path.join(dir, "index.md") };
}

export function resolveSourcePath(rootDir: string, thingPath: string): {
  normalized: string;
  sourcePath: string;
  isLeaf: boolean;
} {
  const normalized = thingPath.startsWith("/") ? thingPath : "/" + thingPath;

  if (normalized === "/") {
    return { normalized, sourcePath: path.join(rootDir, "index.md"), isLeaf: false };
  }

  const segments = normalized.split("/").filter(Boolean);
  const dir = path.join(rootDir, ...segments);
  const indexPath = path.join(dir, "index.md");

  if (fs.existsSync(indexPath)) {
    return { normalized, sourcePath: indexPath, isLeaf: false };
  }

  const parentDir = segments.length > 1
    ? path.join(rootDir, ...segments.slice(0, -1))
    : rootDir;
  const leafPath = path.join(parentDir, segments[segments.length - 1] + ".md");

  if (fs.existsSync(leafPath)) {
    return { normalized, sourcePath: leafPath, isLeaf: true };
  }

  // Neither exists — default to leaf for new nodes
  return { normalized, sourcePath: leafPath, isLeaf: true };
}

/** Promote a leaf .md file to a directory with index.md (when it gains children) */
function promoteLeafToDirectory(dirPath: string, leafPath: string): void {
  const content = fs.readFileSync(leafPath, "utf-8");
  fs.unlinkSync(leafPath);
  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(path.join(dirPath, "index.md"), content);
}

function buildFrontmatter(data: ThingData): Record<string, unknown> {
  const frontmatter: Record<string, unknown> = {
    name: data.name,
    description: data.description,
  };
  if (data.links && data.links.length > 0) frontmatter.links = data.links;
  if (data.author) frontmatter.author = data.author;
  if (data.tags && data.tags.length > 0) frontmatter.tags = data.tags;
  return frontmatter;
}

export function createThing(
  rootDir: string,
  thingPath: string,
  data: ThingData
): void {
  if (!data.name || !data.description) {
    throw new Error("name and description are required");
  }

  const { normalized, sourcePath } = resolveSourcePath(rootDir, thingPath);

  // Check for existing node in either form
  const { indexPath } = resolvePaths(rootDir, thingPath);
  if (fs.existsSync(indexPath) || fs.existsSync(sourcePath)) {
    throw new Error(`Thing already exists at ${normalized}`);
  }

  const body = data.content ?? "";
  const normalizedBody = body.startsWith("\n") ? body : "\n" + body;
  const frontmatter = buildFrontmatter(data);

  if (normalized === "/") {
    // Root node: always directory + index.md
    fs.mkdirSync(rootDir, { recursive: true });
    fs.writeFileSync(path.join(rootDir, "index.md"), matter.stringify(normalizedBody, frontmatter));
    return;
  }

  // Non-root: create a leaf .md file
  const parentDir = path.dirname(sourcePath);
  if (!fs.existsSync(parentDir)) {
    // Check if parent exists as a leaf .md file — if so, promote it to a directory
    const parentNormalized = path.dirname(normalized);
    if (parentNormalized !== "/") {
      const parentLeafPath = parentDir + ".md";
      if (fs.existsSync(parentLeafPath)) {
        promoteLeafToDirectory(parentDir, parentLeafPath);
      } else {
        throw new Error(`Parent path does not exist: ${parentNormalized}`);
      }
    } else {
      throw new Error(`Parent path does not exist: ${path.dirname(normalized)}`);
    }
  }

  fs.writeFileSync(sourcePath, matter.stringify(normalizedBody, frontmatter));
}

export function updateThing(
  rootDir: string,
  thingPath: string,
  updates: ThingUpdate
): void {
  const { normalized, sourcePath } = resolveSourcePath(rootDir, thingPath);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Thing does not exist at ${normalized}`);
  }

  const raw = fs.readFileSync(sourcePath, "utf-8");
  const { data, content } = matter(raw);

  // Merge frontmatter updates (null means "not provided" from GraphQL)
  if (updates.name != null) data.name = updates.name;
  if (updates.description != null) data.description = updates.description;
  if (updates.links != null) data.links = updates.links;
  if (updates.author != null) data.author = updates.author;
  if (updates.tags != null) data.tags = updates.tags;

  const body = (updates.content != null) ? updates.content : content;
  const normalizedBody = body.startsWith("\n") ? body : "\n" + body;
  const output = matter.stringify(normalizedBody, data);
  fs.writeFileSync(sourcePath, output);
}

export function deleteThing(rootDir: string, thingPath: string): void {
  const { normalized, sourcePath, isLeaf } = resolveSourcePath(rootDir, thingPath);

  if (normalized === "/") {
    throw new Error("Cannot delete the root node");
  }

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Thing does not exist at ${normalized}`);
  }

  if (isLeaf) {
    fs.unlinkSync(sourcePath);
  } else {
    // sourcePath is <dir>/index.md — delete the whole directory
    const dir = path.dirname(sourcePath);
    fs.rmSync(dir, { recursive: true });
  }
}
