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

export function createThing(
  rootDir: string,
  thingPath: string,
  data: ThingData
): void {
  if (!data.name || !data.description) {
    throw new Error("name and description are required");
  }

  const { normalized, dir, indexPath } = resolvePaths(rootDir, thingPath);

  if (fs.existsSync(indexPath)) {
    throw new Error(`Thing already exists at ${normalized}`);
  }

  const parentDir = path.dirname(dir);
  if (!fs.existsSync(parentDir)) {
    throw new Error(`Parent path does not exist: ${path.dirname(normalized)}`);
  }

  fs.mkdirSync(dir, { recursive: true });

  const frontmatter: Record<string, unknown> = {
    name: data.name,
    description: data.description,
  };
  if (data.links && data.links.length > 0) frontmatter.links = data.links;
  if (data.author) frontmatter.author = data.author;
  if (data.tags && data.tags.length > 0) frontmatter.tags = data.tags;

  const body = data.content ?? "";
  const normalizedBody = body.startsWith("\n") ? body : "\n" + body;
  fs.writeFileSync(indexPath, matter.stringify(normalizedBody, frontmatter));
}

export function updateThing(
  rootDir: string,
  thingPath: string,
  updates: ThingUpdate
): void {
  const { normalized, indexPath } = resolvePaths(rootDir, thingPath);

  if (!fs.existsSync(indexPath)) {
    throw new Error(`Thing does not exist at ${normalized}`);
  }

  const raw = fs.readFileSync(indexPath, "utf-8");
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
  fs.writeFileSync(indexPath, output);
}

export function deleteThing(rootDir: string, thingPath: string): void {
  const { normalized, dir } = resolvePaths(rootDir, thingPath);

  if (normalized === "/") {
    throw new Error("Cannot delete the root node");
  }

  if (!fs.existsSync(dir)) {
    throw new Error(`Thing does not exist at ${normalized}`);
  }

  fs.rmSync(dir, { recursive: true });
}
