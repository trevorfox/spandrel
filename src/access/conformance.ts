import { describe, it, expect } from "vitest";
import type { SpandrelEdge, SpandrelNode } from "../compiler/types.js";
import type { AccessConfig, AccessLevel, Actor } from "./types.js";
import { AccessPolicy } from "./policy.js";

/**
 * Conformance kit for AccessPolicy implementations.
 *
 * Verifies the four invariants every conformant policy must preserve:
 *
 * 1. Layering — write authority requires read level `content` or higher.
 * 2. Monotonicity — fields visible at level X are visible at every level above X.
 * 3. Null shaping — shapeNode at level `none` returns null.
 * 4. Read–write orthogonality — write is a separate axis, not a level above traverse.
 *
 * Pass a factory so third-party implementations can run the same suite against
 * their own AccessPolicy class. The default factory uses the reference
 * implementation in this package.
 */

export type AccessPolicyFactory = (config: AccessConfig | null) => AccessPolicy;

const defaultFactory: AccessPolicyFactory = (config) => new AccessPolicy(config);

const ACCESS_LEVELS: AccessLevel[] = [
  "none",
  "exists",
  "description",
  "content",
  "traverse",
];

const FIXTURE_CONFIG: AccessConfig = {
  roles: {
    admin: { members: ["admin@example.test"] },
    writer: { members: ["writer@example.test"] },
    reader: { members: ["reader@example.test"] },
    lead: { members: ["lead@example.test"] },
    public: { default: true },
  },
  policies: {
    admin: {
      paths: ["/**"],
      access_level: "traverse",
      operations: ["read", "write", "admin"],
    },
    writer: {
      paths: ["/**"],
      access_level: "content",
      operations: ["read", "write"],
    },
    reader: {
      paths: ["/**"],
      access_level: "content",
      operations: ["read"],
    },
    lead: {
      paths: ["/**"],
      deny: { where: { tags: ["sensitive"] } },
      access_level: "traverse",
      operations: ["read"],
    },
    public: {
      paths: ["/public/**"],
      access_level: "description",
      operations: ["read"],
    },
  },
};

const SAMPLE_PATHS = ["/", "/public/page", "/private/note", "/clients/acme"];

const SAMPLE_ACTORS: Actor[] = [
  { tier: "anonymous" },
  { tier: "identified", id: "guest@example.test" },
  { tier: "authenticated", id: "admin@example.test" },
  { tier: "authenticated", id: "writer@example.test" },
  { tier: "authenticated", id: "reader@example.test" },
  { tier: "authenticated", id: "lead@example.test" },
];

function makeNode(path: string, overrides: Partial<SpandrelNode> = {}): SpandrelNode {
  return {
    path,
    name: `Node ${path}`,
    description: `Description for ${path}`,
    nodeType: "leaf",
    depth: path === "/" ? 0 : path.split("/").filter(Boolean).length,
    parent: path === "/" ? null : "/",
    children: [],
    content: `Body for ${path}`,
    frontmatter: {},
    created: null,
    updated: null,
    author: null,
    ...overrides,
  };
}

function makeEdge(from: string, to: string): SpandrelEdge {
  return { from, to, type: "link", linkType: "relates-to" };
}

export function runAccessPolicyConformance(
  factory: AccessPolicyFactory = defaultFactory
): void {
  describe("AccessPolicy conformance", () => {
    describe("smart defaults (no config loaded)", () => {
      const policy = factory(null);

      it("opens reads at level traverse for any actor and path", () => {
        for (const actor of SAMPLE_ACTORS) {
          for (const p of SAMPLE_PATHS) {
            expect(policy.resolveLevel(actor, p)).toBe("traverse");
          }
        }
      });

      it("denies writes for every actor by default", () => {
        for (const actor of SAMPLE_ACTORS) {
          for (const p of SAMPLE_PATHS) {
            expect(policy.canWrite(actor, p)).toBe(false);
          }
        }
      });
    });

    describe("invariant: layering (write implies read >= content)", () => {
      const policy = factory(FIXTURE_CONFIG);

      it("every (actor, path) with write authority resolves to read >= content", () => {
        for (const actor of SAMPLE_ACTORS) {
          for (const p of SAMPLE_PATHS) {
            if (policy.canWrite(actor, p)) {
              const level = policy.resolveLevel(actor, p);
              expect(["content", "traverse"]).toContain(level);
            }
          }
        }
      });
    });

    describe("invariant: monotonicity (higher levels never hide info)", () => {
      const policy = factory(FIXTURE_CONFIG);
      const node = makeNode("/clients/acme", { content: "Body", description: "Desc" });

      it("each level's keys are a subset of the next level's keys", () => {
        const shapedByLevel = new Map<AccessLevel, Set<string>>();
        for (const level of ACCESS_LEVELS) {
          const shaped = policy.shapeNode(node, level);
          shapedByLevel.set(level, shaped ? new Set(Object.keys(shaped)) : new Set());
        }
        // Walk from `exists` upward — keys at level i must include keys at level i-1.
        for (let i = 1; i < ACCESS_LEVELS.length; i++) {
          const lower = shapedByLevel.get(ACCESS_LEVELS[i - 1])!;
          const higher = shapedByLevel.get(ACCESS_LEVELS[i])!;
          for (const key of lower) {
            expect(higher.has(key)).toBe(true);
          }
        }
      });

      it("field values present at a lower level match values at the higher level", () => {
        const description = policy.shapeNode(node, "description")!;
        const content = policy.shapeNode(node, "content")!;
        for (const key of Object.keys(description) as Array<keyof typeof description>) {
          expect((content as Record<string, unknown>)[key]).toEqual(
            (description as Record<string, unknown>)[key]
          );
        }
      });
    });

    describe("invariant: null shaping at level `none`", () => {
      const policy = factory(FIXTURE_CONFIG);

      it("shapeNode returns null for any node when level is `none`", () => {
        const node = makeNode("/private/note");
        expect(policy.shapeNode(node, "none")).toBeNull();
      });

      it("shapeEdge returns null when either endpoint is invisible", () => {
        const edge = makeEdge("/a", "/b");
        expect(policy.shapeEdge(edge, "none", "content")).toBeNull();
        expect(policy.shapeEdge(edge, "content", "none")).toBeNull();
      });
    });

    describe("invariant: read–write orthogonality", () => {
      const policy = factory(FIXTURE_CONFIG);

      it("two actors can share a read level but differ on write authority", () => {
        // reader and writer both resolve to `content` level for /clients/acme,
        // but only writer has write authority — proving write is a separate axis.
        const reader: Actor = { tier: "authenticated", id: "reader@example.test" };
        const writer: Actor = { tier: "authenticated", id: "writer@example.test" };
        expect(policy.resolveLevel(reader, "/clients/acme")).toBe("content");
        expect(policy.resolveLevel(writer, "/clients/acme")).toBe("content");
        expect(policy.canWrite(reader, "/clients/acme")).toBe(false);
        expect(policy.canWrite(writer, "/clients/acme")).toBe(true);
      });

      it("an actor at level `traverse` may still lack write authority", () => {
        const lead: Actor = { tier: "authenticated", id: "lead@example.test" };
        expect(policy.resolveLevel(lead, "/clients/acme")).toBe("traverse");
        expect(policy.canWrite(lead, "/clients/acme")).toBe(false);
      });
    });

    describe("identity tiers", () => {
      const policy = factory(FIXTURE_CONFIG);

      it("anonymous actor falls back to the default role", () => {
        const actor: Actor = { tier: "anonymous" };
        expect(policy.resolveLevel(actor, "/public/page")).toBe("description");
        expect(policy.resolveLevel(actor, "/private/note")).toBe("none");
      });

      it("identified actor with no membership uses default role", () => {
        const actor: Actor = { tier: "identified", id: "stranger@example.test" };
        expect(policy.resolveLevel(actor, "/public/page")).toBe("description");
      });

      it("authenticated actor with membership resolves to their role's policy", () => {
        const actor: Actor = { tier: "authenticated", id: "admin@example.test" };
        expect(policy.resolveLevel(actor, "/private/note")).toBe("traverse");
        expect(policy.canWrite(actor, "/private/note")).toBe(true);
      });

      it("explicit roles array overrides identity-based lookup", () => {
        const actor: Actor = {
          tier: "authenticated",
          id: "admin@example.test",
          roles: ["public"],
        };
        expect(policy.resolveLevel(actor, "/private/note")).toBe("none");
      });
    });

    describe("deny rules", () => {
      const policy = factory(FIXTURE_CONFIG);

      it("deny rules drop access to `none` when metadata matches", () => {
        const lead: Actor = { tier: "authenticated", id: "lead@example.test" };
        expect(
          policy.resolveLevel(lead, "/clients/acme", { tags: ["sensitive"] })
        ).toBe("none");
      });

      it("deny rules do not affect non-matching metadata", () => {
        const lead: Actor = { tier: "authenticated", id: "lead@example.test" };
        expect(
          policy.resolveLevel(lead, "/clients/acme", { tags: ["public"] })
        ).toBe("traverse");
      });
    });

    describe("path scoping", () => {
      const policy = factory(FIXTURE_CONFIG);

      it("returns `none` when no policy covers the path", () => {
        const actor: Actor = { tier: "anonymous" };
        expect(policy.resolveLevel(actor, "/private/note")).toBe("none");
      });
    });
  });
}
