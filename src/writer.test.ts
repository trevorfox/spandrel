import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { createThing, updateThing, deleteThing } from "./writer.js";
import { compile } from "./compiler.js";
import { createTempDir, writeIndex } from "./test-helpers.js";

describe("createThing", () => {
  let root: string;

  beforeEach(() => {
    root = createTempDir();
    writeIndex(root, { name: "Root", description: "Test root" }, "Root content");
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true });
  });

  it("creates a new Thing with index.md", () => {
    createThing(root, "/projects", {
      name: "Projects",
      description: "All projects",
    });

    const indexPath = path.join(root, "projects", "index.md");
    expect(fs.existsSync(indexPath)).toBe(true);

    const { data } = matter(fs.readFileSync(indexPath, "utf-8"));
    expect(data.name).toBe("Projects");
    expect(data.description).toBe("All projects");
  });

  it("creates a Thing with content and links", () => {
    createThing(root, "/projects", {
      name: "Projects",
      description: "All projects",
      content: "Here are the projects.",
      links: [{ to: "/clients", type: "related", description: "Client projects" }],
    });

    const indexPath = path.join(root, "projects", "index.md");
    const { data, content } = matter(fs.readFileSync(indexPath, "utf-8"));
    expect(data.links).toHaveLength(1);
    expect(data.links[0].to).toBe("/clients");
    expect(content.trim()).toBe("Here are the projects.");
  });

  it("creates a Thing with tags", () => {
    createThing(root, "/projects", {
      name: "Projects",
      description: "All projects",
      tags: ["active", "priority"],
    });

    const { data } = matter(
      fs.readFileSync(path.join(root, "projects", "index.md"), "utf-8")
    );
    expect(data.tags).toEqual(["active", "priority"]);
  });

  it("throws if Thing already exists", () => {
    createThing(root, "/projects", {
      name: "Projects",
      description: "All projects",
    });
    expect(() =>
      createThing(root, "/projects", {
        name: "Projects",
        description: "All projects",
      })
    ).toThrow("already exists");
  });

  it("throws if parent does not exist", () => {
    expect(() =>
      createThing(root, "/nonexistent/child", {
        name: "Child",
        description: "Orphan",
      })
    ).toThrow("Parent path does not exist");
  });

  it("throws if name or description missing", () => {
    expect(() =>
      createThing(root, "/bad", { name: "", description: "desc" })
    ).toThrow("name and description are required");
  });

  it("created Thing compiles correctly", () => {
    createThing(root, "/projects", {
      name: "Projects",
      description: "All projects",
      links: [{ to: "/", type: "parent" }],
    });

    const graph = compile(root);
    const node = graph.nodes.get("/projects");
    expect(node).toBeDefined();
    expect(node!.name).toBe("Projects");
    expect(node!.description).toBe("All projects");

    const linkEdges = graph.edges.filter(
      (e) => e.from === "/projects" && e.type === "link"
    );
    expect(linkEdges).toHaveLength(1);
    expect(linkEdges[0].to).toBe("/");
  });
});

describe("updateThing", () => {
  let root: string;

  beforeEach(() => {
    root = createTempDir();
    writeIndex(root, { name: "Root", description: "Test root" }, "Root content");
    writeIndex(path.join(root, "projects"), {
      name: "Projects",
      description: "All projects",
    }, "Original content");
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true });
  });

  it("updates frontmatter fields", () => {
    updateThing(root, "/projects", { name: "My Projects" });

    const { data } = matter(
      fs.readFileSync(path.join(root, "projects", "index.md"), "utf-8")
    );
    expect(data.name).toBe("My Projects");
    expect(data.description).toBe("All projects"); // unchanged
  });

  it("updates content", () => {
    updateThing(root, "/projects", { content: "Updated content" });

    const { content } = matter(
      fs.readFileSync(path.join(root, "projects", "index.md"), "utf-8")
    );
    expect(content.trim()).toBe("Updated content");
  });

  it("preserves unmodified fields", () => {
    writeIndex(
      path.join(root, "tagged"),
      { name: "Tagged", description: "Has tags", tags: ["a", "b"] },
      "Content"
    );

    updateThing(root, "/tagged", { name: "Updated Tagged" });

    const { data, content } = matter(
      fs.readFileSync(path.join(root, "tagged", "index.md"), "utf-8")
    );
    expect(data.name).toBe("Updated Tagged");
    expect(data.tags).toEqual(["a", "b"]); // preserved
    expect(content.trim()).toBe("Content"); // preserved
  });

  it("throws if Thing does not exist", () => {
    expect(() =>
      updateThing(root, "/nonexistent", { name: "Nope" })
    ).toThrow("does not exist");
  });

  it("can update the root node", () => {
    updateThing(root, "/", { description: "Updated root" });

    const { data } = matter(fs.readFileSync(path.join(root, "index.md"), "utf-8"));
    expect(data.description).toBe("Updated root");
  });
});

describe("deleteThing", () => {
  let root: string;

  beforeEach(() => {
    root = createTempDir();
    writeIndex(root, { name: "Root", description: "Test root" });
    writeIndex(path.join(root, "projects"), {
      name: "Projects",
      description: "All projects",
    });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true });
  });

  it("removes the directory", () => {
    deleteThing(root, "/projects");
    expect(fs.existsSync(path.join(root, "projects"))).toBe(false);
  });

  it("throws when deleting root", () => {
    expect(() => deleteThing(root, "/")).toThrow("Cannot delete the root");
  });

  it("throws when path does not exist", () => {
    expect(() => deleteThing(root, "/nonexistent")).toThrow("does not exist");
  });

  it("deleted Thing is gone from compiled graph", () => {
    const graphBefore = compile(root);
    expect(graphBefore.nodes.has("/projects")).toBe(true);

    deleteThing(root, "/projects");

    const graphAfter = compile(root);
    expect(graphAfter.nodes.has("/projects")).toBe(false);
  });
});
