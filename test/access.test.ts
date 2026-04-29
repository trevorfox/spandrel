import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { AccessPolicy, accessLevelAtLeast } from "../src/access/policy.js";
import { loadAccessConfig } from "../src/access/config.js";
import { runAccessPolicyConformance } from "../src/access/conformance.js";
import type { AccessConfig, Actor } from "../src/access/types.js";
import type { SpandrelNode, SpandrelEdge } from "../src/compiler/types.js";

// --- Conformance suite — verifies the four invariants ---

runAccessPolicyConformance();

// --- Reference fixtures --------------------------------------------------

const testConfig: AccessConfig = {
  roles: {
    admin: { members: ["jane@company.com", "ops-bot"] },
    builder: { members: ["dev@company.com"] },
    "partner-a": { members: ["alice@partner.com"] },
    public: { default: true },
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

// --- AccessPolicy.resolveLevel ------------------------------------------

describe("AccessPolicy.resolveLevel", () => {
  const policy = new AccessPolicy(testConfig);

  it("returns traverse when config is null (open access)", () => {
    const open = new AccessPolicy(null);
    const actor: Actor = { tier: "anonymous" };
    expect(open.resolveLevel(actor, "/anything")).toBe("traverse");
  });

  it("admin sees everything at traverse level", () => {
    const actor: Actor = { tier: "authenticated", id: "jane@company.com" };
    expect(policy.resolveLevel(actor, "/")).toBe("traverse");
    expect(policy.resolveLevel(actor, "/clients/acme")).toBe("traverse");
    expect(policy.resolveLevel(actor, "/internal/secret")).toBe("traverse");
  });

  it("partner sees scoped paths at content level", () => {
    const actor: Actor = { tier: "authenticated", id: "alice@partner.com" };
    expect(policy.resolveLevel(actor, "/clients/acme")).toBe("content");
    expect(policy.resolveLevel(actor, "/clients/acme/project-x")).toBe("content");
    expect(policy.resolveLevel(actor, "/guide")).toBe("content");
    expect(policy.resolveLevel(actor, "/guide/getting-started")).toBe("content");
  });

  it("partner cannot see outside scoped paths", () => {
    const actor: Actor = { tier: "authenticated", id: "alice@partner.com" };
    expect(policy.resolveLevel(actor, "/")).toBe("none");
    expect(policy.resolveLevel(actor, "/clients/other-client")).toBe("none");
    expect(policy.resolveLevel(actor, "/internal")).toBe("none");
  });

  it("deny rules filter by tag metadata", () => {
    const actor: Actor = { tier: "authenticated", id: "alice@partner.com" };
    expect(
      policy.resolveLevel(actor, "/clients/acme/secret", { tags: ["confidential"] })
    ).toBe("none");
    expect(
      policy.resolveLevel(actor, "/clients/acme/normal", { tags: ["public"] })
    ).toBe("content");
  });

  it("public role sees only public paths at description level", () => {
    const actor: Actor = { tier: "anonymous" };
    expect(policy.resolveLevel(actor, "/guide")).toBe("description");
    expect(policy.resolveLevel(actor, "/guide/intro")).toBe("description");
    expect(policy.resolveLevel(actor, "/public")).toBe("description");
    expect(policy.resolveLevel(actor, "/clients/acme")).toBe("none");
  });

  it("respects explicit roles array on actor", () => {
    const actor: Actor = {
      tier: "authenticated",
      id: "jane@company.com",
      roles: ["public"],
    };
    expect(policy.resolveLevel(actor, "/internal")).toBe("none");
  });

  it("returns none when role has no policy", () => {
    const actor: Actor = {
      tier: "authenticated",
      id: "unknown",
      roles: ["nonexistent"],
    };
    expect(policy.resolveLevel(actor, "/guide")).toBe("none");
  });
});

// --- AccessPolicy.canWrite ----------------------------------------------

describe("AccessPolicy.canWrite", () => {
  const policy = new AccessPolicy(testConfig);

  it("returns false when config is null (closed by default)", () => {
    const open = new AccessPolicy(null);
    expect(open.canWrite({ tier: "anonymous" }, "/")).toBe(false);
    expect(open.canWrite({ tier: "authenticated", id: "anyone" }, "/")).toBe(false);
  });

  it("admin can write anywhere", () => {
    expect(
      policy.canWrite({ tier: "authenticated", id: "jane@company.com" }, "/clients/new")
    ).toBe(true);
  });

  it("builder can write anywhere", () => {
    expect(
      policy.canWrite({ tier: "authenticated", id: "dev@company.com" }, "/projects/new")
    ).toBe(true);
  });

  it("partner cannot write (read-only)", () => {
    expect(
      policy.canWrite({ tier: "authenticated", id: "alice@partner.com" }, "/clients/acme/note")
    ).toBe(false);
  });

  it("public cannot write", () => {
    expect(policy.canWrite({ tier: "anonymous" }, "/guide/new")).toBe(false);
  });
});

// --- AccessPolicy.shapeNode ---------------------------------------------

describe("AccessPolicy.shapeNode", () => {
  const policy = new AccessPolicy(testConfig);
  const node = makeNode({
    path: "/test/thing",
    name: "Test Thing",
    description: "A thing for testing",
    content: "Full content body",
  });

  it("returns null for none", () => {
    expect(policy.shapeNode(node, "none")).toBeNull();
  });

  it("returns only path and name for exists", () => {
    const result = policy.shapeNode(node, "exists");
    expect(result).toEqual({ path: "/test/thing", name: "Test Thing" });
  });

  it("returns structural fields for description level", () => {
    const result = policy.shapeNode(node, "description")!;
    expect(result.path).toBe("/test/thing");
    expect(result.name).toBe("Test Thing");
    expect(result.description).toBe("A thing for testing");
    expect(result.nodeType).toBe("leaf");
    expect(result.content).toBeUndefined();
  });

  it("returns everything for content level", () => {
    const result = policy.shapeNode(node, "content")!;
    expect(result.content).toBe("Full content body");
    expect(result.name).toBe("Test Thing");
  });

  it("returns everything for traverse level", () => {
    const result = policy.shapeNode(node, "traverse")!;
    expect(result.content).toBe("Full content body");
  });
});

// --- AccessPolicy.shapeEdge ---------------------------------------------

describe("AccessPolicy.shapeEdge", () => {
  const policy = new AccessPolicy(testConfig);
  const edge: SpandrelEdge = {
    from: "/a",
    to: "/b",
    type: "link",
    linkType: "owns",
    description: "edge desc",
  };

  it("returns null when from level is none", () => {
    expect(policy.shapeEdge(edge, "none", "content")).toBeNull();
  });

  it("returns null when to level is none", () => {
    expect(policy.shapeEdge(edge, "content", "none")).toBeNull();
  });

  it("returns the edge with linkTypeDescription when both endpoints are visible", () => {
    const result = policy.shapeEdge(edge, "content", "content", "owns: source controls target");
    expect(result).not.toBeNull();
    expect(result!.linkTypeDescription).toBe("owns: source controls target");
    expect(result!.from).toBe("/a");
    expect(result!.to).toBe("/b");
  });

  it("preserves linkType and description", () => {
    const result = policy.shapeEdge(edge, "exists", "exists");
    expect(result!.linkType).toBe("owns");
    expect(result!.description).toBe("edge desc");
  });
});

// --- accessLevelAtLeast --------------------------------------------------

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

// --- loadAccessConfig from filesystem ------------------------------------

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

// --- Three-tier identity behavior ---------------------------------------

describe("three-tier Actor", () => {
  const policy = new AccessPolicy(testConfig);

  it("anonymous tier never matches role members", () => {
    // jane@company.com is a member of admin, but anonymous actors must not
    // be granted admin access just because the email shape happens to match.
    const anon: Actor = { tier: "anonymous" };
    expect(policy.resolveLevel(anon, "/internal")).toBe("none");
  });

  it("identified tier with no membership uses default role", () => {
    const actor: Actor = { tier: "identified", id: "stranger@example.com" };
    expect(policy.resolveLevel(actor, "/guide")).toBe("description");
    expect(policy.resolveLevel(actor, "/internal")).toBe("none");
  });

  it("identified tier matches role members when id matches", () => {
    // The framework does not distinguish 'verified' vs 'unverified' email at
    // the policy level — implementations are responsible for what counts as
    // sufficient verification before promoting from identified to authenticated.
    const actor: Actor = { tier: "identified", id: "alice@partner.com" };
    expect(policy.resolveLevel(actor, "/clients/acme")).toBe("content");
  });

  it("authenticated tier resolves through membership", () => {
    const actor: Actor = { tier: "authenticated", id: "jane@company.com" };
    expect(policy.resolveLevel(actor, "/internal")).toBe("traverse");
    expect(policy.canWrite(actor, "/internal")).toBe(true);
  });
});
