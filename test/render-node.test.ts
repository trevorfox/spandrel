import { describe, it, expect } from "vitest";
import matter from "gray-matter";
import { renderNodeAsMarkdown } from "../src/web/render-node.js";
import type { SpandrelNode } from "../src/compiler/types.js";

function node(partial: Partial<SpandrelNode> & { path: string; name: string }): SpandrelNode {
  return {
    description: "",
    nodeType: "leaf",
    depth: partial.path.split("/").filter(Boolean).length,
    parent: null,
    children: [],
    content: "",
    frontmatter: {},
    created: null,
    updated: null,
    author: null,
    ...partial,
  };
}

describe("renderNodeAsMarkdown", () => {
  it("emits YAML frontmatter followed by the body", () => {
    const md = renderNodeAsMarkdown(
      node({
        path: "/clients/acme",
        name: "Acme Corp",
        description: "A client.",
        content: "Body content here.\n",
        frontmatter: { name: "Acme Corp", description: "A client." },
      })
    );

    expect(md.startsWith("---\n")).toBe(true);
    expect(md).toContain("name: Acme Corp");
    expect(md).toContain("description: A client.");
    expect(md.trim().endsWith("Body content here.")).toBe(true);
  });

  it("round-trips through gray-matter", () => {
    const original = node({
      path: "/things/one",
      name: "One",
      description: "The only item.",
      content: "Leaf body.\n\nSecond paragraph.\n",
      frontmatter: {
        name: "One",
        description: "The only item.",
        links: [{ to: "/two", type: "depends-on" }],
        tags: ["alpha", "beta"],
      },
    });

    const serialized = renderNodeAsMarkdown(original);
    const parsed = matter(serialized);

    expect(parsed.data.name).toBe("One");
    expect(parsed.data.description).toBe("The only item.");
    expect(parsed.data.tags).toEqual(["alpha", "beta"]);
    expect(parsed.data.links).toEqual([{ to: "/two", type: "depends-on" }]);
    expect(parsed.content.trim()).toBe("Leaf body.\n\nSecond paragraph.");
  });

  it("produces only a frontmatter block when content is empty", () => {
    const md = renderNodeAsMarkdown(
      node({
        path: "/empty",
        name: "Empty",
        description: "No body.",
        content: "",
      })
    );

    // No body, but frontmatter should still close cleanly.
    const parsed = matter(md);
    expect(parsed.data.name).toBe("Empty");
    expect(parsed.content.trim()).toBe("");
  });

  it("escapes colons and special characters inside the name/description", () => {
    const md = renderNodeAsMarkdown(
      node({
        path: "/weird",
        name: "Weird: with a colon",
        description: 'Has "quotes" and # hashes.',
        content: "Body.",
      })
    );

    const parsed = matter(md);
    expect(parsed.data.name).toBe("Weird: with a colon");
    expect(parsed.data.description).toBe('Has "quotes" and # hashes.');
  });

  it("keeps name/description at the top even when frontmatter lists them later", () => {
    const md = renderNodeAsMarkdown(
      node({
        path: "/order",
        name: "Ordered",
        description: "Name/desc are hoisted.",
        content: "body",
        frontmatter: {
          custom: "first",
          name: "Ordered",
          description: "Name/desc are hoisted.",
        },
      })
    );

    const firstKeyMatch = md.match(/---\n([^:\n]+):/);
    expect(firstKeyMatch?.[1]).toBe("name");
    // The overridden field still appears in the output.
    expect(md).toContain("custom: first");
  });

  it("preserves the links array shape", () => {
    const md = renderNodeAsMarkdown(
      node({
        path: "/src",
        name: "Source",
        description: "Has links.",
        content: "",
        frontmatter: {
          name: "Source",
          description: "Has links.",
          links: [
            { to: "/target-a", type: "owns" },
            { to: "/target-b", type: "depends-on", description: "notes" },
          ],
        },
      })
    );

    const parsed = matter(md);
    expect(Array.isArray(parsed.data.links)).toBe(true);
    expect(parsed.data.links).toHaveLength(2);
    expect(parsed.data.links[0]).toEqual({ to: "/target-a", type: "owns" });
  });
});
