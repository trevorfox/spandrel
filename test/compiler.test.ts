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

  it("parses a standalone index.md as a leaf node", async () => {
    writeIndex(root, { name: "Root", description: "The root" });
    const store = await compile(root);
    const node = await store.getNode("/");
    expect(node).toBeDefined();
    expect(node!.name).toBe("Root");
    expect(node!.description).toBe("The root");
    expect(node!.nodeType).toBe("leaf");
    expect(node!.path).toBe("/");
    expect(node!.depth).toBe(0);
  });

  it("parses a directory with subdirs as a composite node", async () => {
    writeIndex(root, { name: "Root", description: "Root node" });
    writeIndex(path.join(root, "child"), { name: "Child", description: "A child" });
    const store = await compile(root);
    const rootNode = await store.getNode("/");
    expect(rootNode!.nodeType).toBe("composite");
    expect(rootNode!.children).toContain("/child");
  });

  it("extracts link edges from frontmatter links", async () => {
    writeIndex(root, {
      name: "Root",
      description: "Root",
      links: [
        { to: "/other", type: "related", description: "A related thing" },
      ],
    });
    const store = await compile(root);
    const linkEdges = (await store.getEdges()).filter((e) => e.type === "link");
    expect(linkEdges).toHaveLength(1);
    expect(linkEdges[0].from).toBe("/");
    expect(linkEdges[0].to).toBe("/other");
    expect(linkEdges[0].linkType).toBe("related");
    expect(linkEdges[0].description).toBe("A related thing");
  });

  it("extracts authored_by edge from author field", async () => {
    writeIndex(root, {
      name: "Root",
      description: "Root",
      author: "/people/jane",
    });
    const store = await compile(root);
    const authorEdges = (await store.getEdges()).filter((e) => e.type === "authored_by");
    expect(authorEdges).toHaveLength(1);
    expect(authorEdges[0].from).toBe("/");
    expect(authorEdges[0].to).toBe("/people/jane");
  });

  it("flags missing name in frontmatter as a warning", async () => {
    writeIndex(root, { description: "No name here" });
    const store = await compile(root);
    const nameWarnings = (await store.getWarnings()).filter((w) => w.type === "missing_name");
    expect(nameWarnings.length).toBeGreaterThan(0);
  });

  it("flags missing description as a warning", async () => {
    writeIndex(root, { name: "Root" });
    const store = await compile(root);
    const descWarnings = (await store.getWarnings()).filter(
      (w) => w.type === "missing_description"
    );
    expect(descWarnings.length).toBeGreaterThan(0);
  });

  it("creates a minimal node for directories without index.md", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    const childDir = path.join(root, "orphan");
    fs.mkdirSync(childDir);
    const store = await compile(root);
    const orphan = await store.getNode("/orphan");
    expect(orphan).toBeDefined();
    expect(orphan!.name).toBe("orphan");
    const missingWarnings = (await store.getWarnings()).filter(
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

  it("builds correct parent/child hierarchy edges", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "a"), { name: "A", description: "A" });
    writeIndex(path.join(root, "a", "b"), { name: "B", description: "B" });

    const store = await compile(root);
    const hierarchyEdges = (await store.getEdges()).filter((e) => e.type === "hierarchy");

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

  it("skips directories prefixed with _", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "_system"), {
      name: "System",
      description: "System stuff",
    });
    writeIndex(path.join(root, "content"), {
      name: "Content",
      description: "Content",
    });

    const store = await compile(root);
    expect(await store.hasNode("/_system")).toBe(false);
    expect(await store.hasNode("/content")).toBe(true);
  });

  it("compiles lowercase design.md as a document node and warns about the case", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    fs.writeFileSync(
      path.join(root, "design.md"),
      "---\nname: Design\ndescription: Design file\n---\n\nDesign content\n"
    );

    const store = await compile(root);
    // Root + /DESIGN companion document
    expect(store.nodeCount).toBe(2);
    const designNode = await store.getNode("/DESIGN");
    expect(designNode).toBeTruthy();
    expect(designNode?.kind).toBe("document");
    expect(designNode?.navigable).toBe(false);
    expect(designNode?.parent).toBe("/");

    const warnings = await store.getWarnings();
    expect(warnings.some((w) => w.type === "companion_file_lowercase")).toBe(true);
  });

  it("compiles companion files as document nodes (kind=document, navigable=false)", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    fs.writeFileSync(path.join(root, "SKILL.md"), "---\ndescription: A skill\n---\n");
    fs.writeFileSync(path.join(root, "AGENT.md"), "---\ndescription: Agent notes\n---\n");
    fs.writeFileSync(path.join(root, "README.md"), "# Readme\n");
    fs.writeFileSync(path.join(root, "CLAUDE.md"), "# Claude instructions\n");
    fs.writeFileSync(path.join(root, "AGENTS.md"), "# Agents instructions\n");

    const store = await compile(root);
    // Root + 5 companion documents at uppercase canonical paths
    expect(store.nodeCount).toBe(6);
    for (const stem of ["SKILL", "AGENT", "README", "CLAUDE", "AGENTS"]) {
      const node = await store.getNode(`/${stem}`);
      expect(node, `expected node /${stem} to exist`).toBeTruthy();
      expect(node?.kind).toBe("document");
      expect(node?.navigable).toBe(false);
    }

    // No companion_file_lowercase warnings — all uppercase canonical
    const warnings = await store.getWarnings();
    expect(warnings.some((w) => w.type === "companion_file_lowercase")).toBe(false);
  });

  it("companion files alongside a node attach to that node, not the root", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    const acmeDir = path.join(root, "clients", "acme");
    fs.mkdirSync(acmeDir, { recursive: true });
    writeIndex(path.join(root, "clients"), { name: "Clients", description: "Clients" });
    writeIndex(acmeDir, { name: "Acme", description: "Test client" });
    fs.writeFileSync(path.join(acmeDir, "SKILL.md"), "---\ndescription: Acme skill\n---\n");

    const store = await compile(root);
    const skillNode = await store.getNode("/clients/acme/SKILL");
    expect(skillNode?.parent).toBe("/clients/acme");
    expect(skillNode?.kind).toBe("document");
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

  it("extracts inline markdown links to internal paths", async () => {
    writeIndex(root, { name: "Root", description: "Root" }, "See [Alpha](/projects/alpha) for details.");
    const store = await compile(root);
    const inlineLinks = (await store.getEdges()).filter(
      (e) => e.type === "link" && e.to === "/projects/alpha"
    );
    expect(inlineLinks).toHaveLength(1);
  });

  it("does not extract external URLs as validated links", async () => {
    writeIndex(
      root,
      { name: "Root", description: "Root" },
      "See [Google](https://google.com) for info."
    );
    const store = await compile(root);
    const externalLinks = (await store.getEdges()).filter(
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

  it("flags broken links", async () => {
    writeIndex(root, {
      name: "Root",
      description: "Root",
      links: [{ to: "/nonexistent" }],
    });
    const store = await compile(root);
    const broken = (await store.getWarnings()).filter((w) => w.type === "broken_link");
    expect(broken).toHaveLength(1);
    expect(broken[0].message).toContain("/nonexistent");
  });

  it("flags unlisted children", async () => {
    writeIndex(root, { name: "Root", description: "Root" }, "Only mentions Alpha.");
    writeIndex(path.join(root, "alpha"), { name: "Alpha", description: "Alpha" });
    writeIndex(path.join(root, "beta"), { name: "Beta", description: "Beta" });

    const store = await compile(root);
    const unlisted = (await store.getWarnings()).filter((w) => w.type === "unlisted_child");
    // Beta is not mentioned in root's content
    expect(unlisted.some((w) => w.message.includes("/beta"))).toBe(true);
  });
});

describe("Compiler — undeclared_link_type warnings", () => {
  let root: string;

  beforeEach(() => {
    root = createTempDir();
  });

  afterEach(() => {
    rmrf(root);
  });

  function writeLinkType(stem: string, name: string, description: string) {
    fs.mkdirSync(path.join(root, "linkTypes"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "linkTypes", `${stem}.md`),
      `---\nname: ${name}\ndescription: ${description}\n---\n`
    );
  }

  it("warns under enforce: strict when a frontmatter link uses an undeclared type", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "linkTypes"), {
      name: "Link Types",
      description: "Vocab",
      enforce: "strict",
    });
    writeLinkType("owns", "owns", "Operational control.");
    writeLinkType("depends-on", "depends-on", "Runtime dependency.");
    writeIndex(path.join(root, "a"), {
      name: "A",
      description: "A",
      links: [{ to: "/b", type: "foo" }],
    });
    writeIndex(path.join(root, "b"), { name: "B", description: "B" });

    const store = await compile(root);
    const undeclared = (await store.getWarnings()).filter(
      (w) => w.type === "undeclared_link_type"
    );
    expect(undeclared).toHaveLength(1);
    expect(undeclared[0].path).toBe("/a");
    expect(undeclared[0].message).toContain('"foo"');
    expect(undeclared[0].message).toContain("/linkTypes/foo.md");
  });

  it("emits zero undeclared_link_type warnings when the graph has no /linkTypes/ collection", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "a"), {
      name: "A",
      description: "A",
      links: [{ to: "/b", type: "foo" }, { to: "/b", type: "bar" }],
    });
    writeIndex(path.join(root, "b"), { name: "B", description: "B" }, "See [B-prime](/b-prime).");
    writeIndex(path.join(root, "b-prime"), { name: "B-prime", description: "B-prime" });

    const store = await compile(root);
    const undeclared = (await store.getWarnings()).filter(
      (w) => w.type === "undeclared_link_type"
    );
    expect(undeclared).toHaveLength(0);
  });

  it("emits zero warnings when /linkTypes/ exists but `enforce` is absent (default off)", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    // No `enforce` field — declaration alone does not trigger warnings.
    writeIndex(path.join(root, "linkTypes"), { name: "Link Types", description: "Vocab" });
    writeLinkType("owns", "owns", "Operational control.");
    writeIndex(path.join(root, "a"), {
      name: "A",
      description: "A",
      links: [{ to: "/b", type: "foo" }],
    });
    writeIndex(path.join(root, "b"), { name: "B", description: "B" });

    const store = await compile(root);
    const undeclared = (await store.getWarnings()).filter(
      (w) => w.type === "undeclared_link_type"
    );
    expect(undeclared).toHaveLength(0);
  });

  it("does not warn on inline [label](/path) mentions when /linkTypes/mentions.md is declared (under strict)", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "linkTypes"), {
      name: "Link Types",
      description: "Vocab",
      enforce: "strict",
    });
    writeLinkType("mentions", "mentions", "Incidental prose reference.");
    writeIndex(
      path.join(root, "a"),
      { name: "A", description: "A" },
      "See [B](/b) for details."
    );
    writeIndex(path.join(root, "b"), { name: "B", description: "B" });

    const store = await compile(root);
    const undeclared = (await store.getWarnings()).filter(
      (w) => w.type === "undeclared_link_type"
    );
    expect(undeclared).toHaveLength(0);
  });

  it("warns on implicit 'mentions' edges under strict when mentions is not declared", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "linkTypes"), {
      name: "Link Types",
      description: "Vocab",
      enforce: "strict",
    });
    writeLinkType("owns", "owns", "Operational control.");
    writeIndex(
      path.join(root, "a"),
      { name: "A", description: "A" },
      "See [B](/b) for details."
    );
    writeIndex(path.join(root, "b"), { name: "B", description: "B" });

    const store = await compile(root);
    const undeclared = (await store.getWarnings()).filter(
      (w) => w.type === "undeclared_link_type"
    );
    expect(undeclared).toHaveLength(1);
    expect(undeclared[0].path).toBe("/a");
    expect(undeclared[0].message).toContain('"mentions"');
  });

  it("dedupes multiple edges from the same source using the same undeclared type (strict)", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "linkTypes"), {
      name: "Link Types",
      description: "Vocab",
      enforce: "strict",
    });
    writeLinkType("owns", "owns", "Operational control.");
    writeIndex(path.join(root, "a"), {
      name: "A",
      description: "A",
      links: [
        { to: "/b", type: "foo" },
        { to: "/c", type: "foo" },
      ],
    });
    writeIndex(path.join(root, "b"), { name: "B", description: "B" });
    writeIndex(path.join(root, "c"), { name: "C", description: "C" });

    const store = await compile(root);
    const undeclared = (await store.getWarnings()).filter(
      (w) => w.type === "undeclared_link_type" && w.path === "/a"
    );
    expect(undeclared).toHaveLength(1);
  });

  it("under enforce: [list], warns only when a listed type is used without a declaration", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "linkTypes"), {
      name: "Link Types",
      description: "Vocab",
      // Only `affects` is governed; `extends`, `informs` etc. can fly free.
      enforce: ["affects", "realized-by"],
    });
    writeIndex(path.join(root, "a"), {
      name: "A",
      description: "A",
      links: [
        { to: "/b", type: "extends" },     // not in enforce list → silent
        { to: "/b", type: "affects" },     // in list, undeclared → warn
        { to: "/b", type: "informs" },     // not in list → silent
      ],
    });
    writeIndex(path.join(root, "b"), { name: "B", description: "B" });

    const store = await compile(root);
    const undeclared = (await store.getWarnings()).filter(
      (w) => w.type === "undeclared_link_type"
    );
    expect(undeclared).toHaveLength(1);
    expect(undeclared[0].message).toContain('"affects"');
  });

  it("under enforce: [list], a listed type with a /linkTypes/{stem}.md does not warn", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "linkTypes"), {
      name: "Link Types",
      description: "Vocab",
      enforce: ["affects"],
    });
    writeLinkType("affects", "affects", "Source changes the behavior of target.");
    writeIndex(path.join(root, "a"), {
      name: "A",
      description: "A",
      links: [{ to: "/b", type: "affects" }],
    });
    writeIndex(path.join(root, "b"), { name: "B", description: "B" });

    const store = await compile(root);
    const undeclared = (await store.getWarnings()).filter(
      (w) => w.type === "undeclared_link_type"
    );
    expect(undeclared).toHaveLength(0);
  });

  it("treats enforce: [] (empty list) as off", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "linkTypes"), {
      name: "Link Types",
      description: "Vocab",
      enforce: [],
    });
    writeIndex(path.join(root, "a"), {
      name: "A",
      description: "A",
      links: [{ to: "/b", type: "foo" }],
    });
    writeIndex(path.join(root, "b"), { name: "B", description: "B" });

    const store = await compile(root);
    const undeclared = (await store.getWarnings()).filter(
      (w) => w.type === "undeclared_link_type"
    );
    expect(undeclared).toHaveLength(0);
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

  it("root node has path / and depth 0", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    const store = await compile(root);
    const rootNode = await store.getNode("/");
    expect(rootNode!.path).toBe("/");
    expect(rootNode!.depth).toBe(0);
  });

  it("every non-root node has exactly one parent", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "a"), { name: "A", description: "A" });
    writeIndex(path.join(root, "a", "b"), { name: "B", description: "B" });
    writeIndex(path.join(root, "c"), { name: "C", description: "C" });

    const store = await compile(root);
    for (const node of await store.getAllNodes()) {
      if (node.path === "/") {
        expect(node.parent).toBeNull();
      } else {
        expect(node.parent).toBeDefined();
        expect(node.parent).not.toBeNull();
      }
    }
  });

  it("composite nodes have children, leaf nodes do not", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "a"), { name: "A", description: "A" });

    const store = await compile(root);
    const rootNode = await store.getNode("/");
    const aNode = await store.getNode("/a");
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

  it("updates a node when its file changes", async () => {
    writeIndex(root, { name: "Root", description: "Root" }, "Content");
    writeIndex(path.join(root, "a"), { name: "A", description: "Original" });

    const store = await compile(root);
    expect((await store.getNode("/a"))!.description).toBe("Original");

    // Change the file
    writeIndex(path.join(root, "a"), { name: "A", description: "Updated" });
    await recompileNode(store, root, path.join(root, "a", "index.md"));

    expect((await store.getNode("/a"))!.description).toBe("Updated");
  });

  it("removes a node when its file is deleted", async () => {
    writeIndex(root, { name: "Root", description: "Root" }, "Content");
    writeIndex(path.join(root, "a"), { name: "A", description: "A" });

    const store = await compile(root);
    expect(await store.hasNode("/a")).toBe(true);

    // Delete the file
    fs.rmSync(path.join(root, "a", "index.md"));
    await recompileNode(store, root, path.join(root, "a", "index.md"));

    expect(await store.hasNode("/a")).toBe(false);
  });

  it("adds a new node when a file is created", async () => {
    writeIndex(root, { name: "Root", description: "Root" }, "Content");
    const store = await compile(root);
    expect(await store.hasNode("/newchild")).toBe(false);

    // Create a new file
    writeIndex(path.join(root, "newchild"), { name: "New", description: "New child" });

    // Need to add hierarchy edge manually since recompileNode works on the specific node
    await recompileNode(store, root, path.join(root, "newchild", "index.md"));

    expect(await store.hasNode("/newchild")).toBe(true);
    expect((await store.getNode("/newchild"))!.name).toBe("New");
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

  it("leaf .md files become nodes", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    fs.writeFileSync(
      path.join(root, "acme.md"),
      "---\nname: Acme Corp\ndescription: A client\n---\n\nAcme details.\n"
    );

    const store = await compile(root);
    const node = await store.getNode("/acme");
    expect(node).toBeDefined();
    expect(node!.name).toBe("Acme Corp");
    expect(node!.description).toBe("A client");
    expect(node!.nodeType).toBe("leaf");
    expect(node!.parent).toBe("/");
    expect(node!.children).toHaveLength(0);
    expect(node!.content).toBe("Acme details.");
  });

  it("leaf nodes get hierarchy edges", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    fs.writeFileSync(
      path.join(root, "acme.md"),
      "---\nname: Acme\ndescription: A client\n---\n"
    );

    const store = await compile(root);
    const hierarchyEdges = (await store.getEdges()).filter(
      (e) => e.type === "hierarchy" && e.to === "/acme"
    );
    expect(hierarchyEdges).toHaveLength(1);
    expect(hierarchyEdges[0].from).toBe("/");
  });

  it("parent becomes composite when it has leaf children", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    fs.writeFileSync(
      path.join(root, "note.md"),
      "---\nname: Note\ndescription: A note\n---\n"
    );

    const store = await compile(root);
    const rootNode = await store.getNode("/");
    expect(rootNode!.nodeType).toBe("composite");
    expect(rootNode!.children).toContain("/note");
  });

  it("conflict: directory wins over leaf file", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "foo"), { name: "Foo Dir", description: "From directory" });
    fs.writeFileSync(
      path.join(root, "foo.md"),
      "---\nname: Foo File\ndescription: From leaf file\n---\n"
    );

    const store = await compile(root);
    const fooNode = await store.getNode("/foo");
    expect(fooNode).toBeDefined();
    expect(fooNode!.name).toBe("Foo Dir");
    // Only one /foo node, not two
    expect(await store.hasNode("/foo")).toBe(true);
  });

  it("leaf nodes in nested directories", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "dept"), { name: "Dept", description: "Department" });
    fs.writeFileSync(
      path.join(root, "dept", "alice.md"),
      "---\nname: Alice\ndescription: A person\n---\n"
    );

    const store = await compile(root);
    const alice = await store.getNode("/dept/alice");
    expect(alice).toBeDefined();
    expect(alice!.parent).toBe("/dept");

    const dept = await store.getNode("/dept");
    expect(dept!.children).toContain("/dept/alice");
    expect(dept!.nodeType).toBe("composite");
  });

  it("links in leaf .md files are extracted", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    fs.writeFileSync(
      path.join(root, "acme.md"),
      "---\nname: Acme\ndescription: Client\nlinks:\n  -\n    to: \"/people/jane\"\n    type: \"account_lead\"\n---\n"
    );

    const store = await compile(root);
    const linkEdges = (await store.getEdges()).filter(
      (e) => e.type === "link" && e.from === "/acme"
    );
    expect(linkEdges).toHaveLength(1);
    expect(linkEdges[0].to).toBe("/people/jane");
    expect(linkEdges[0].linkType).toBe("account_lead");
  });

  it("leaf name defaults to file stem when frontmatter name is missing", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    fs.writeFileSync(
      path.join(root, "my-project.md"),
      "---\ndescription: A project\n---\n"
    );

    const store = await compile(root);
    const node = await store.getNode("/my-project");
    expect(node).toBeDefined();
    expect(node!.name).toBe("my-project");
  });

  it("recompileNode handles leaf file changes", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    fs.writeFileSync(
      path.join(root, "acme.md"),
      "---\nname: Acme\ndescription: Original\n---\n"
    );

    const store = await compile(root);
    expect((await store.getNode("/acme"))!.description).toBe("Original");

    fs.writeFileSync(
      path.join(root, "acme.md"),
      "---\nname: Acme\ndescription: Updated\n---\n"
    );
    await recompileNode(store, root, path.join(root, "acme.md"));

    expect((await store.getNode("/acme"))!.description).toBe("Updated");
  });

  it("recompileNode handles leaf file deletion", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    fs.writeFileSync(
      path.join(root, "acme.md"),
      "---\nname: Acme\ndescription: Client\n---\n"
    );

    const store = await compile(root);
    expect(await store.hasNode("/acme")).toBe(true);

    fs.unlinkSync(path.join(root, "acme.md"));
    await recompileNode(store, root, path.join(root, "acme.md"));

    expect(await store.hasNode("/acme")).toBe(false);
  });
});

describe("Compiler — /linkTypes/ collection", () => {
  let root: string;

  beforeEach(() => {
    root = createTempDir();
  });

  afterEach(() => {
    rmrf(root);
  });

  it("indexes /linkTypes/*.md leaf files by filename stem", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "linkTypes"), {
      name: "Link Types",
      description: "Declared relationship vocabulary",
    });
    fs.writeFileSync(
      path.join(root, "linkTypes", "owns.md"),
      "---\nname: owns\ndescription: The source entity has operational control of the target.\n---\n"
    );
    fs.writeFileSync(
      path.join(root, "linkTypes", "depends-on.md"),
      "---\nname: depends-on\ndescription: The source cannot function without the target.\n---\n"
    );

    const store = await compile(root);
    const linkTypes = await store.getLinkTypes();

    expect(linkTypes.size).toBe(2);
    expect(linkTypes.get("owns")).toEqual({
      name: "owns",
      description: "The source entity has operational control of the target.",
      path: "/linkTypes/owns",
    });
    expect(linkTypes.get("depends-on")).toEqual({
      name: "depends-on",
      description: "The source cannot function without the target.",
      path: "/linkTypes/depends-on",
    });
  });

  it("does not include /linkTypes/index.md itself as a linkType", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "linkTypes"), {
      name: "Link Types",
      description: "Declared vocabulary",
    });
    fs.writeFileSync(
      path.join(root, "linkTypes", "owns.md"),
      "---\nname: owns\ndescription: Ownership relation.\n---\n"
    );

    const store = await compile(root);
    const linkTypes = await store.getLinkTypes();

    // /linkTypes landing page should not be treated as a linkType itself
    expect(linkTypes.has("")).toBe(false);
    expect(Array.from(linkTypes.keys())).toEqual(["owns"]);
  });

  it("returns an empty map when the graph has no /linkTypes/ collection", async () => {
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "clients"), { name: "Clients", description: "Clients" });

    const store = await compile(root);
    const linkTypes = await store.getLinkTypes();

    expect(linkTypes.size).toBe(0);
  });

  it("uses filename stem as canonical key even when frontmatter name differs", async () => {
    // The spec is explicit: filename stem is the canonical key so link
    // references stay stable even if the display name changes.
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "linkTypes"), { name: "Link Types", description: "Vocab" });
    fs.writeFileSync(
      path.join(root, "linkTypes", "owns.md"),
      "---\nname: \"Ownership (legal/operational)\"\ndescription: Controls the target.\n---\n"
    );

    const store = await compile(root);
    const linkTypes = await store.getLinkTypes();

    // Keyed on the stem, not the display name
    expect(linkTypes.has("owns")).toBe(true);
    expect(linkTypes.has("Ownership (legal/operational)")).toBe(false);
    expect(linkTypes.get("owns")!.name).toBe("Ownership (legal/operational)");
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

  it("skips leaf files exceeding MAX_FILE_SIZE_BYTES with a warning", async () => {
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
      const store = await compile(root);
      expect(await store.hasNode("/large")).toBe(false);
      const warnings = (await store.getWarnings()).filter((w) => w.type === "file_too_large");
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0].path).toBe("/large");
    } finally {
      (fs as unknown as Record<string, unknown>).statSync = origStatSync;
    }
  });

  it("skips index.md files exceeding MAX_FILE_SIZE_BYTES with a warning", async () => {
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
      const store = await compile(root);
      expect(await store.hasNode("/child")).toBe(false);
      const warnings = (await store.getWarnings()).filter((w) => w.type === "file_too_large");
      expect(warnings.length).toBeGreaterThan(0);
    } finally {
      (fs as unknown as Record<string, unknown>).statSync = origStatSync;
    }
  });
});
