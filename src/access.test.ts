import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  loadAccessConfig,
  resolveRole,
  canAccess,
  canWrite,
  filterNodeFields,
  accessLevelAtLeast,
} from "./access.js";
import type { AccessConfig, Actor, SpandrelNode } from "./types.js";

// --- In-memory config for most tests ---

const testConfig: AccessConfig = {
  roles: {
    admin: {
      members: ["jane@company.com", "ops-bot"],
    },
    builder: {
      members: ["dev@company.com"],
    },
    "partner-a": {
      members: ["alice@partner.com"],
    },
    public: {
      default: true,
    },
  },
  policies: {
    admin: {
      paths: ["/**"],
      access_level: "traverse",
      operations: ["read", "write", "admin"],
    },
    builder: {
      paths: ["/**"],
      access_level: "traverse",
      operations: ["read", "write"],
    },
    "partner-a": {
      paths: ["/clients/acme/**", "/guide/**"],
      deny: { where: { tags: ["confidential", "internal-only"] } },
      access_level: "content",
      operations: ["read"],
    },
    public: {
      paths: ["/guide/**", "/public/**"],
      access_level: "description",
      operations: ["read"],
    },
  },
};

function makeNode(overrides: Partial<SpandrelNode> = {}): SpandrelNode {
  return {
    path: "/test",
    name: "Test",
    description: "A test node",
    nodeType: "leaf",
    depth: 1,
    parent: "/",
    children: [],
    content: "Some content here",
    frontmatter: {},
    created: null,
    updated: null,
    author: null,
    ...overrides,
  };
}

// --- Role Resolution ---

describe("resolveRole", () => {
  it("resolves known member to their role", () => {
    expect(resolveRole(testConfig, "jane@company.com")).toBe("admin");
    expect(resolveRole(testConfig, "dev@company.com")).toBe("builder");
    expect(resolveRole(testConfig, "alice@partner.com")).toBe("partner-a");
  });

  it("falls back to default role for unknown identity", () => {
    expect(resolveRole(testConfig, "stranger@example.com")).toBe("public");
  });

  it("returns 'public' when no default role exists", () => {
    const noDefault: AccessConfig = {
      roles: { admin: { members: ["jane@co.com"] } },
      policies: {},
    };
    expect(resolveRole(noDefault, "unknown@co.com")).toBe("public");
  });
});

// --- canAccess ---

describe("canAccess", () => {
  it("returns traverse when config is null (open access)", () => {
    const actor: Actor = { identity: "anyone" };
    expect(canAccess(null, actor, "/anything")).toBe("traverse");
  });

  it("admin sees everything at traverse level", () => {
    const actor: Actor = { identity: "jane@company.com" };
    expect(canAccess(testConfig, actor, "/")).toBe("traverse");
    expect(canAccess(testConfig, actor, "/clients/acme")).toBe("traverse");
    expect(canAccess(testConfig, actor, "/internal/secret")).toBe("traverse");
  });

  it("partner sees scoped paths at content level", () => {
    const actor: Actor = { identity: "alice@partner.com" };
    expect(canAccess(testConfig, actor, "/clients/acme")).toBe("content");
    expect(canAccess(testConfig, actor, "/clients/acme/project-x")).toBe("content");
    expect(canAccess(testConfig, actor, "/guide")).toBe("content");
    expect(canAccess(testConfig, actor, "/guide/getting-started")).toBe("content");
  });

  it("partner cannot see outside scoped paths", () => {
    const actor: Actor = { identity: "alice@partner.com" };
    expect(canAccess(testConfig, actor, "/")).toBe("none");
    expect(canAccess(testConfig, actor, "/clients/other-client")).toBe("none");
    expect(canAccess(testConfig, actor, "/internal")).toBe("none");
  });

  it("deny rules filter by tag", () => {
    const actor: Actor = { identity: "alice@partner.com" };
    expect(
      canAccess(testConfig, actor, "/clients/acme/secret", { tags: ["confidential"] })
    ).toBe("none");
    expect(
      canAccess(testConfig, actor, "/clients/acme/normal", { tags: ["public"] })
    ).toBe("content");
  });

  it("public role sees only public paths at description level", () => {
    const actor: Actor = { identity: "anonymous" };
    expect(canAccess(testConfig, actor, "/guide")).toBe("description");
    expect(canAccess(testConfig, actor, "/guide/intro")).toBe("description");
    expect(canAccess(testConfig, actor, "/public")).toBe("description");
    expect(canAccess(testConfig, actor, "/clients/acme")).toBe("none");
  });

  it("respects explicit role override on actor", () => {
    const actor: Actor = { identity: "jane@company.com", role: "public" };
    expect(canAccess(testConfig, actor, "/internal")).toBe("none");
  });

  it("returns none when role has no policy", () => {
    const actor: Actor = { identity: "unknown", role: "nonexistent" };
    expect(canAccess(testConfig, actor, "/guide")).toBe("none");
  });
});

// --- canWrite ---

describe("canWrite", () => {
  it("returns true when config is null (open access)", () => {
    expect(canWrite(null, { identity: "anyone" }, "/")).toBe(true);
  });

  it("admin can write anywhere", () => {
    expect(canWrite(testConfig, { identity: "jane@company.com" }, "/clients/new")).toBe(true);
  });

  it("builder can write anywhere", () => {
    expect(canWrite(testConfig, { identity: "dev@company.com" }, "/projects/new")).toBe(true);
  });

  it("partner cannot write (read-only)", () => {
    expect(canWrite(testConfig, { identity: "alice@partner.com" }, "/clients/acme/note")).toBe(false);
  });

  it("public cannot write", () => {
    expect(canWrite(testConfig, { identity: "anonymous" }, "/guide/new")).toBe(false);
  });
});

// --- filterNodeFields ---

describe("filterNodeFields", () => {
  const node = makeNode({
    path: "/test/thing",
    name: "Test Thing",
    description: "A thing for testing",
    content: "Full content body",
  });

  it("returns null for none", () => {
    expect(filterNodeFields(node, "none")).toBeNull();
  });

  it("returns only path and name for exists", () => {
    const result = filterNodeFields(node, "exists");
    expect(result).toEqual({ path: "/test/thing", name: "Test Thing" });
  });

  it("returns structural fields for description level", () => {
    const result = filterNodeFields(node, "description")!;
    expect(result.path).toBe("/test/thing");
    expect(result.name).toBe("Test Thing");
    expect(result.description).toBe("A thing for testing");
    expect(result.nodeType).toBe("leaf");
    expect(result.content).toBeUndefined();
  });

  it("returns everything for content level", () => {
    const result = filterNodeFields(node, "content")!;
    expect(result.content).toBe("Full content body");
    expect(result.name).toBe("Test Thing");
  });

  it("returns everything for traverse level", () => {
    const result = filterNodeFields(node, "traverse")!;
    expect(result.content).toBe("Full content body");
  });
});

// --- accessLevelAtLeast ---

describe("accessLevelAtLeast", () => {
  it("traverse is at least content", () => {
    expect(accessLevelAtLeast("traverse", "content")).toBe(true);
  });
  it("description is not at least content", () => {
    expect(accessLevelAtLeast("description", "content")).toBe(false);
  });
  it("none is not at least exists", () => {
    expect(accessLevelAtLeast("none", "exists")).toBe(false);
  });
});

// --- loadAccessConfig from filesystem ---

describe("loadAccessConfig", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "spandrel-access-test-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true });
  });

  it("returns null when no config file exists", () => {
    expect(loadAccessConfig(root)).toBeNull();
  });

  it("loads valid config from _access/config.yaml", () => {
    const accessDir = path.join(root, "_access");
    fs.mkdirSync(accessDir, { recursive: true });
    fs.writeFileSync(
      path.join(accessDir, "config.yaml"),
      `roles:
  admin:
    members:
      - admin@test.com
  public:
    default: true
policies:
  admin:
    paths:
      - "/**"
    access_level: traverse
    operations:
      - read
      - write
      - admin
  public:
    paths:
      - "/guide/**"
    access_level: description
    operations:
      - read
`
    );

    const config = loadAccessConfig(root);
    expect(config).not.toBeNull();
    expect(config!.roles.admin.members).toEqual(["admin@test.com"]);
    expect(config!.policies.public.access_level).toBe("description");
  });

  it("returns null for malformed config", () => {
    const accessDir = path.join(root, "_access");
    fs.mkdirSync(accessDir, { recursive: true });
    fs.writeFileSync(path.join(accessDir, "config.yaml"), "just a string\n");

    expect(loadAccessConfig(root)).toBeNull();
  });
});
