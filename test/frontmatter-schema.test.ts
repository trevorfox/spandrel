import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nodeFrontmatterSchema } from "../src/compiler/frontmatter-schema.js";

describe("nodeFrontmatterSchema", () => {
  it("declares name and description as required", () => {
    expect(nodeFrontmatterSchema.required).toContain("name");
    expect(nodeFrontmatterSchema.required).toContain("description");
  });

  it("permits arbitrary additional properties (domain-specific frontmatter)", () => {
    expect(nodeFrontmatterSchema.additionalProperties).toBe(true);
  });

  it("constrains kind to 'node' or 'document'", () => {
    expect(nodeFrontmatterSchema.properties.kind.enum).toEqual(["node", "document"]);
  });

  it("declares navigable as a boolean", () => {
    expect(nodeFrontmatterSchema.properties.navigable.type).toBe("boolean");
  });

  it("declares the links array shape", () => {
    const links = nodeFrontmatterSchema.properties.links;
    expect(links.type).toBe("array");
    expect(links.items.required).toContain("to");
  });

  it("matches the published schema.json file", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const schemaPath = path.resolve(here, "..", "schema.json");
    if (!fs.existsSync(schemaPath)) {
      // schema.json is a build artifact — skip if not present (e.g. fresh checkout).
      return;
    }
    const fileSchema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
    expect(fileSchema).toEqual(nodeFrontmatterSchema);
  });
});
