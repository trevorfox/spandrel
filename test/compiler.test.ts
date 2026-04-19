import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { compile, recompileNode, MAX_FILE_SIZE_BYTES } from "../src/compiler/compiler.js";

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "spandrel-test-"));
}

function writeIndex(dir: string, frontmatter: Record<string, unknown>, content = "") {
  fs.mkdirSync(dir, { recursive: true });
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        return `${k}:\n${v.map((item) => {
          if (typeof item === "object") {
            const entries = Object.entries(item as Record<string, unknown>)
              .map(([ik, iv]) => `    ${ik}: ${JSON.stringify(iv)}`)
              .join("\n");
            return `  -\n${entries}`;
          }
          return `  - ${JSON.stringify(item)}`;
        }).join("\n")}`;
      }
      return `${k}: ${JSON.stringify(v)}`;
    })
    .join("\n");
  fs.writeFileSync(
    path.join(dir, "index.md"),
    `---\n${fm}\n---\n\n${content}\n`
  );
}

function rmrf(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe("Compiler — File Parsing", () => {
  let root: string;

  beforeEach(() => {
    root = createTempDir();
  });

  afterEach(() => {
    rmrf(root);
  });

  it("parses a standalone index.md as a leaf node", () => {
    writeIndex(root, { name: "Root", description: "The root" });
    const store = compile(root);
    const node = store.getNode("/");
    expect(node).toBeDefined();
    expect(node!.name).toBe("Root");
    expect(node!.description).toBe("The root");
    expect(node!.nodeType).toBe("leaf");
    expect(node!.path).toBe("/");
    expect(node!.depth).toBe(0);
  });

  it("parses a directory with subdirs as a composite node", () => {
    writeIndex(root, { name: "Root", description: "Root node" });
    writeIndex(path.join(root, "child"), { name: "Child", description: "A child" });
    const store = compile(root);
    const rootNode = store.getNode("/");
    expect(rootNode!.nodeType).toBe("composite");
    expect(rootNode!.children).toContain("/child");
  });

  it("extracts link edges from frontmatter links", () => {
    writeIndex(root, {
      name: "Root",
      description: "Root",
      links: [
        { to: "/other", type: "related", description: "A related thing" },
      ],
    });
    const store = compile(root);
    const linkEdges = store.getEdges().filter((e) => e.type === "link");
    expect(linkEdges).toHaveLength(1);
    expect(linkEdges[0].from).toBe("/");
    expect(linkEdges[0].to).toBe("/other");
    expect(linkEdges[0].linkType).toBe("related");
    expect(linkEdges[0].description).toBe("A related thing");
  });

  it("extracts authored_by edge from author field", () => {
    writeIndex(root, {
      name: "Root",
      description: "Root",
      author: "/people/jane",
    });
    const store = compile(root);
    const authorEdges = store.getEdges().filter((e) => e.type === "authored_by");
    expect(authorEdges).toHaveLength(1);
    expect(authorEdges[0].from).toBe("/");
    expect(authorEdges[0].to).toBe("/people/jane");
  });

  it("flags missing name in frontmatter as a warning", () => {
    writeIndex(root, { description: "No name here" });
    const store = compile(root);
    const nameWarnings = store.getWarnings().filter((w) => w.type === "missing_name");
    expect(nameWarnings.length).toBeGreaterThan(0);
  });

  it("flags missing description as a warning", () => {
    writeIndex(root, { name: "Root" });
    const store = compile(root);
    const descWarnings = store.getWarnings().filter(
      (w) => w.type === "missing_description"
    );
    expect(descWarnings.length).toBeGreaterThan(0);
  });

  it("creates a minimal node for directories without index.md", () => {
    writeIndex(root, { name: "Root", description: "Root" });
    const childDir = path.join(root, "orphan");
    fs.mkdirSync(childDir);
    const store = compile(root);
    const orphan = store.getNode("/orphan");
    expect(orphan).toBeDefined();
    expect(orphan!.name).toBe("orphan");
    const missingWarnings = store.getWarnings().filter(
      (w) => w.type === "missing_index" && w.path === "/orphan"
    );
    expect(missingWarnings).toHaveLength(1);
  });
});

describe("Compiler — Tree Walking", () => {
  let root: string;

  beforeEach(() => {
    root = createTempDir();
  });

  afterEach(() => {
    rmrf(root);
  });

  it("builds correct parent/child hierarchy edges", () => {
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "a"), { name: "A", description: "A" });
    writeIndex(path.join(root, "a", "b"), { name: "B", description: "B" });

    const store = compile(root);
    const hierarchyEdges = store.getEdges().filter((e) => e.type === "hierarchy");

    expect(hierarchyEdges).toContainEqual({
      from: "/",
      to: "/a",
      type: "hierarchy",
    });
    expect(hierarchyEdges).toContainEqual({
      from: "/a",
      to: "/a/b",
      type: "hierarchy",
    });
  });

  it("skips directories prefixed with _", () => {
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "_system"), {
      name: "System",
      description: "System stuff",
    });
    writeIndex(path.join(root, "content"), {
      name: "Content",
      description: "Content",
    });

    const store = compile(root);
    expect(store.hasNode("/_system")).toBe(false);
    expect(store.hasNode("/content")).toBe(true);
  });

  it("does not compile design.md files as nodes", () => {
    writeIndex(root, { name: "Root", description: "Root" });
    fs.writeFileSync(
      path.join(root, "design.md"),
      "---\nname: Design\ndescription: Design file\n---\n\nDesign content\n"
    );

    const store = compile(root);
    // design.md should not create a separate node
    expect(store.nodeCount).toBe(1); // only root
  });

  it("excluded .md files are not compiled as nodes", () => {
    writeIndex(root, { name: "Root", description: "Root" });
    fs.writeFileSync(path.join(root, "SKILL.md"), "---\nname: test\n---\n");
    fs.writeFileSync(path.join(root, "AGENT.md"), "---\nname: test\n---\n");
    fs.writeFileSync(path.join(root, "README.md"), "# Readme\n");

    const store = compile(root);
    expect(store.nodeCount).toBe(1); // only root
  });
});

describe("Compiler — Edge Extraction", () => {
  let root: string;

  beforeEach(() => {
    root = createTempDir();
  });

  afterEach(() => {
    rmrf(root);
  });

  it("extracts inline markdown links to internal paths", () => {
    writeIndex(root, { name: "Root", description: "Root" }, "See [Alpha](/projects/alpha) for details.");
    const store = compile(root);
    const inlineLinks = store.getEdges().filter(
      (e) => e.type === "link" && e.to === "/projects/alpha"
    );
    expect(inlineLinks).toHaveLength(1);
  });

  it("does not extract external URLs as validated links", () => {
    writeIndex(
      root,
      { name: "Root", description: "Root" },
      "See [Google](https://google.com) for info."
    );
    const store = compile(root);
    const externalLinks = store.getEdges().filter(
      (e) => e.type === "link" && e.to.startsWith("http")
    );
    // External URLs should not be extracted as link edges
    expect(externalLinks).toHaveLength(0);
  });
});

describe("Compiler — Validation", () => {
  let root: string;

  beforeEach(() => {
    root = createTempDir();
  });

  afterEach(() => {
    rmrf(root);
  });

  it("flags broken links", () => {
    writeIndex(root, {
      name: "Root",
      description: "Root",
      links: [{ to: "/nonexistent" }],
    });
    const store = compile(root);
    const broken = store.getWarnings().filter((w) => w.type === "broken_link");
    expect(broken).toHaveLength(1);
    expect(broken[0].message).toContain("/nonexistent");
  });

  it("flags unlisted children", () => {
    writeIndex(root, { name: "Root", description: "Root" }, "Only mentions Alpha.");
    writeIndex(path.join(root, "alpha"), { name: "Alpha", description: "Alpha" });
    writeIndex(path.join(root, "beta"), { name: "Beta", description: "Beta" });

    const store = compile(root);
    const unlisted = store.getWarnings().filter((w) => w.type === "unlisted_child");
    // Beta is not mentioned in root's content
    expect(unlisted.some((w) => w.message.includes("/beta"))).toBe(true);
  });
});

describe("Compiler — Graph Structure", () => {
  let root: string;

  beforeEach(() => {
    root = createTempDir();
  });

  afterEach(() => {
    rmrf(root);
  });

  it("root node has path / and depth 0", () => {
    writeIndex(root, { name: "Root", description: "Root" });
    const store = compile(root);
    const rootNode = store.getNode("/");
    expect(rootNode!.path).toBe("/");
    expect(rootNode!.depth).toBe(0);
  });

  it("every non-root node has exactly one parent", () => {
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "a"), { name: "A", description: "A" });
    writeIndex(path.join(root, "a", "b"), { name: "B", description: "B" });
    writeIndex(path.join(root, "c"), { name: "C", description: "C" });

    const store = compile(root);
    for (const node of store.getAllNodes()) {
      if (node.path === "/") {
        expect(node.parent).toBeNull();
      } else {
        expect(node.parent).toBeDefined();
        expect(node.parent).not.toBeNull();
      }
    }
  });

  it("composite nodes have children, leaf nodes do not", () => {
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "a"), { name: "A", description: "A" });

    const store = compile(root);
    const rootNode = store.getNode("/");
    const aNode = store.getNode("/a");
    expect(rootNode!.nodeType).toBe("composite");
    expect(rootNode!.children.length).toBeGreaterThan(0);
    expect(aNode!.nodeType).toBe("leaf");
    expect(aNode!.children).toHaveLength(0);
  });
});

describe("Compiler — Change Detection (recompileNode)", () => {
  let root: string;

  beforeEach(() => {
    root = createTempDir();
  });

  afterEach(() => {
    rmrf(root);
  });

  it("updates a node when its file changes", () => {
    writeIndex(root, { name: "Root", description: "Root" }, "Content");
    writeIndex(path.join(root, "a"), { name: "A", description: "Original" });

    const store = compile(root);
    expect(store.getNode("/a")!.description).toBe("Original");

    // Change the file
    writeIndex(path.join(root, "a"), { name: "A", description: "Updated" });
    recompileNode(store, root, path.join(root, "a", "index.md"));

    expect(store.getNode("/a")!.description).toBe("Updated");
  });

  it("removes a node when its file is deleted", () => {
    writeIndex(root, { name: "Root", description: "Root" }, "Content");
    writeIndex(path.join(root, "a"), { name: "A", description: "A" });

    const store = compile(root);
    expect(store.hasNode("/a")).toBe(true);

    // Delete the file
    fs.rmSync(path.join(root, "a", "index.md"));
    recompileNode(store, root, path.join(root, "a", "index.md"));

    expect(store.hasNode("/a")).toBe(false);
  });

  it("adds a new node when a file is created", () => {
    writeIndex(root, { name: "Root", description: "Root" }, "Content");
    const store = compile(root);
    expect(store.hasNode("/newchild")).toBe(false);

    // Create a new file
    writeIndex(path.join(root, "newchild"), { name: "New", description: "New child" });

    // Need to add hierarchy edge manually since recompileNode works on the specific node
    recompileNode(store, root, path.join(root, "newchild", "index.md"));

    expect(store.hasNode("/newchild")).toBe(true);
    expect(store.getNode("/newchild")!.name).toBe("New");
  });
});

describe("Compiler — Leaf .md Files", () => {
  let root: string;

  beforeEach(() => {
    root = createTempDir();
  });

  afterEach(() => {
    rmrf(root);
  });

  it("leaf .md files become nodes", () => {
    writeIndex(root, { name: "Root", description: "Root" });
    fs.writeFileSync(
      path.join(root, "acme.md"),
      "---\nname: Acme Corp\ndescription: A client\n---\n\nAcme details.\n"
    );

    const store = compile(root);
    const node = store.getNode("/acme");
    expect(node).toBeDefined();
    expect(node!.name).toBe("Acme Corp");
    expect(node!.description).toBe("A client");
    expect(node!.nodeType).toBe("leaf");
    expect(node!.parent).toBe("/");
    expect(node!.children).toHaveLength(0);
    expect(node!.content).toBe("Acme details.");
  });

  it("leaf nodes get hierarchy edges", () => {
    writeIndex(root, { name: "Root", description: "Root" });
    fs.writeFileSync(
      path.join(root, "acme.md"),
      "---\nname: Acme\ndescription: A client\n---\n"
    );

    const store = compile(root);
    const hierarchyEdges = store.getEdges().filter(
      (e) => e.type === "hierarchy" && e.to === "/acme"
    );
    expect(hierarchyEdges).toHaveLength(1);
    expect(hierarchyEdges[0].from).toBe("/");
  });

  it("parent becomes composite when it has leaf children", () => {
    writeIndex(root, { name: "Root", description: "Root" });
    fs.writeFileSync(
      path.join(root, "note.md"),
      "---\nname: Note\ndescription: A note\n---\n"
    );

    const store = compile(root);
    const rootNode = store.getNode("/");
    expect(rootNode!.nodeType).toBe("composite");
    expect(rootNode!.children).toContain("/note");
  });

  it("conflict: directory wins over leaf file", () => {
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "foo"), { name: "Foo Dir", description: "From directory" });
    fs.writeFileSync(
      path.join(root, "foo.md"),
      "---\nname: Foo File\ndescription: From leaf file\n---\n"
    );

    const store = compile(root);
    const fooNode = store.getNode("/foo");
    expect(fooNode).toBeDefined();
    expect(fooNode!.name).toBe("Foo Dir");
    // Only one /foo node, not two
    expect(store.hasNode("/foo")).toBe(true);
  });

  it("leaf nodes in nested directories", () => {
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "dept"), { name: "Dept", description: "Department" });
    fs.writeFileSync(
      path.join(root, "dept", "alice.md"),
      "---\nname: Alice\ndescription: A person\n---\n"
    );

    const store = compile(root);
    const alice = store.getNode("/dept/alice");
    expect(alice).toBeDefined();
    expect(alice!.parent).toBe("/dept");

    const dept = store.getNode("/dept");
    expect(dept!.children).toContain("/dept/alice");
    expect(dept!.nodeType).toBe("composite");
  });

  it("links in leaf .md files are extracted", () => {
    writeIndex(root, { name: "Root", description: "Root" });
    fs.writeFileSync(
      path.join(root, "acme.md"),
      "---\nname: Acme\ndescription: Client\nlinks:\n  -\n    to: \"/people/jane\"\n    type: \"account_lead\"\n---\n"
    );

    const store = compile(root);
    const linkEdges = store.getEdges().filter(
      (e) => e.type === "link" && e.from === "/acme"
    );
    expect(linkEdges).toHaveLength(1);
    expect(linkEdges[0].to).toBe("/people/jane");
    expect(linkEdges[0].linkType).toBe("account_lead");
  });

  it("leaf name defaults to file stem when frontmatter name is missing", () => {
    writeIndex(root, { name: "Root", description: "Root" });
    fs.writeFileSync(
      path.join(root, "my-project.md"),
      "---\ndescription: A project\n---\n"
    );

    const store = compile(root);
    const node = store.getNode("/my-project");
    expect(node).toBeDefined();
    expect(node!.name).toBe("my-project");
  });

  it("recompileNode handles leaf file changes", () => {
    writeIndex(root, { name: "Root", description: "Root" });
    fs.writeFileSync(
      path.join(root, "acme.md"),
      "---\nname: Acme\ndescription: Original\n---\n"
    );

    const store = compile(root);
    expect(store.getNode("/acme")!.description).toBe("Original");

    fs.writeFileSync(
      path.join(root, "acme.md"),
      "---\nname: Acme\ndescription: Updated\n---\n"
    );
    recompileNode(store, root, path.join(root, "acme.md"));

    expect(store.getNode("/acme")!.description).toBe("Updated");
  });

  it("recompileNode handles leaf file deletion", () => {
    writeIndex(root, { name: "Root", description: "Root" });
    fs.writeFileSync(
      path.join(root, "acme.md"),
      "---\nname: Acme\ndescription: Client\n---\n"
    );

    const store = compile(root);
    expect(store.hasNode("/acme")).toBe(true);

    fs.unlinkSync(path.join(root, "acme.md"));
    recompileNode(store, root, path.join(root, "acme.md"));

    expect(store.hasNode("/acme")).toBe(false);
  });
});

describe("Compiler — Safety Limits", () => {
  let root: string;

  beforeEach(() => {
    root = createTempDir();
  });

  afterEach(() => {
    rmrf(root);
  });

  it("skips leaf files exceeding MAX_FILE_SIZE_BYTES with a warning", () => {
    writeIndex(root, { name: "Root", description: "Root" });

    const leafPath = path.join(root, "large.md");
    fs.writeFileSync(leafPath, "---\nname: Large\ndescription: Big file\n---\n\nContent.\n");

    // Monkey-patch statSync to simulate an oversized file
    const origStatSync = fs.statSync.bind(fs);
    (fs as unknown as Record<string, unknown>).statSync = (
      p: fs.PathLike,
      opts?: Parameters<typeof fs.statSync>[1]
    ) => {
      const stat = origStatSync(p, opts);
      if (String(p) === leafPath) {
        return { ...stat, size: MAX_FILE_SIZE_BYTES + 1 };
      }
      return stat;
    };

    try {
      const store = compile(root);
      expect(store.hasNode("/large")).toBe(false);
      const warnings = store.getWarnings().filter((w) => w.type === "file_too_large");
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0].path).toBe("/large");
    } finally {
      (fs as unknown as Record<string, unknown>).statSync = origStatSync;
    }
  });

  it("skips index.md files exceeding MAX_FILE_SIZE_BYTES with a warning", () => {
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "child"), { name: "Child", description: "Child" });

    const indexPath = path.join(root, "child", "index.md");

    const origStatSync = fs.statSync.bind(fs);
    (fs as unknown as Record<string, unknown>).statSync = (
      p: fs.PathLike,
      opts?: Parameters<typeof fs.statSync>[1]
    ) => {
      const stat = origStatSync(p, opts);
      if (String(p) === indexPath) {
        return { ...stat, size: MAX_FILE_SIZE_BYTES + 1 };
      }
      return stat;
    };

    try {
      const store = compile(root);
      expect(store.hasNode("/child")).toBe(false);
      const warnings = store.getWarnings().filter((w) => w.type === "file_too_large");
      expect(warnings.length).toBeGreaterThan(0);
    } finally {
      (fs as unknown as Record<string, unknown>).statSync = origStatSync;
    }
  });
});
