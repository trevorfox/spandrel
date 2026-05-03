/**
 * Direct unit test of the Web-standard REST router signature. The legacy
 * `(req, res) => Promise<boolean>` shape is exercised separately via
 * createNodeAdapter in rest.test.ts; this file confirms the new
 * `(req: Request) => Promise<Response | null>` surface contract.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { compile } from "../src/compiler/compiler.js";
import { AccessPolicy } from "../src/access/policy.js";
import { createRestRouter } from "../src/rest/router.js";
import { createTempDir, writeIndex } from "./test-helpers.js";

const adminPolicy = new AccessPolicy({
  roles: { admin: { default: true } },
  policies: {
    admin: {
      paths: ["/**"],
      access_level: "traverse",
      operations: ["read", "write", "admin"],
    },
  },
});

describe("REST router — Web-standard signature", () => {
  let root: string;
  let router: (req: Request) => Promise<Response | null>;

  beforeAll(async () => {
    root = createTempDir();
    writeIndex(root, { name: "Root", description: "Root" });
    writeIndex(path.join(root, "clients"), {
      name: "Clients",
      description: "Clients",
    });
    writeIndex(path.join(root, "clients", "acme"), {
      name: "Acme",
      description: "Test client",
    });

    const store = await compile(root);
    router = createRestRouter({ store, policy: adminPolicy });
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns a Response for matched routes", async () => {
    const res = await router(new Request("http://localhost/node"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.headers.get("content-type")).toContain("application/json");
    const body = await res!.json();
    expect(body.path).toBe("/");
  });

  it("returns null for unmatched routes (host fall-through signal)", async () => {
    const res = await router(new Request("http://localhost/no-such-route"));
    expect(res).toBeNull();
  });

  it("returns text/markdown for /content", async () => {
    const res = await router(new Request("http://localhost/content/clients/acme"));
    expect(res!.status).toBe(200);
    expect(res!.headers.get("content-type")).toContain("text/markdown");
  });

  it("returns 404 with JSON body for missing nodes", async () => {
    const res = await router(new Request("http://localhost/node/no-such-node"));
    expect(res!.status).toBe(404);
    const body = await res!.json();
    expect(body.error).toBe("not found");
  });

  it("propagates includeNonNavigable through /graph", async () => {
    // The fixture has no companion files, so this just confirms the param
    // is accepted and doesn't error out.
    const res = await router(
      new Request("http://localhost/graph?includeNonNavigable=true"),
    );
    expect(res!.status).toBe(200);
  });
});
