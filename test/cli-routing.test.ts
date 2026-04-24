import { describe, it, expect } from "vitest";
import { extensionToNodePath } from "../src/cli-routing.js";

describe("extensionToNodePath", () => {
  describe("root node", () => {
    it("routes /.md to root", () => {
      expect(extensionToNodePath("/.md", ".md")).toBe("/");
    });

    it("routes /.json to root", () => {
      expect(extensionToNodePath("/.json", ".json")).toBe("/");
    });

    it("routes /index.md to root", () => {
      expect(extensionToNodePath("/index.md", ".md")).toBe("/");
    });

    it("routes /index.json to root", () => {
      expect(extensionToNodePath("/index.json", ".json")).toBe("/");
    });
  });

  describe("sibling form (spandrel publish emits these)", () => {
    it("strips .md from a leaf path", () => {
      expect(extensionToNodePath("/clients/acme.md", ".md")).toBe("/clients/acme");
    });

    it("strips .json from a leaf path", () => {
      expect(extensionToNodePath("/clients/acme.json", ".json")).toBe("/clients/acme");
    });
  });

  describe("directory form (SPA node-loader fetches these)", () => {
    // Regression: without /index stripping, deep-link content fetches in
    // dev mode fell through to the SPA fallback and served index.html with
    // a text/markdown MIME. Result: the viewer rendered HTML as a node
    // body, showing only the metadata header.
    it("strips /index.md suffix", () => {
      expect(extensionToNodePath("/onboarding/templates/index.md", ".md")).toBe(
        "/onboarding/templates",
      );
    });

    it("strips /index.json suffix", () => {
      expect(extensionToNodePath("/onboarding/templates/index.json", ".json")).toBe(
        "/onboarding/templates",
      );
    });

    it("handles nested directory form", () => {
      expect(extensionToNodePath("/a/b/c/index.md", ".md")).toBe("/a/b/c");
    });
  });

  describe("rejects non-node requests", () => {
    it("returns null when the extension does not match", () => {
      expect(extensionToNodePath("/foo.md", ".json")).toBeNull();
      expect(extensionToNodePath("/foo.json", ".md")).toBeNull();
    });

    it("returns null for paths not starting with /", () => {
      expect(extensionToNodePath("foo.md", ".md")).toBeNull();
    });
  });
});
