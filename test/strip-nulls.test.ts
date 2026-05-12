/**
 * Unit tests for `stripNulls` — the MCP wire-boundary utility that drops
 * fields whose value is null/undefined/empty-string from tool responses.
 *
 * See `specs/2026-05-11-context-pack-hygiene.md` for the design.
 */
import { describe, expect, it } from "vitest";
import { stripNulls } from "../src/server/strip-nulls.js";

describe("stripNulls", () => {
  it("drops null keys from objects", () => {
    expect(stripNulls({ a: 1, b: null, c: "x" })).toEqual({ a: 1, c: "x" });
  });

  it("drops undefined keys from objects", () => {
    expect(stripNulls({ a: 1, b: undefined, c: "x" })).toEqual({ a: 1, c: "x" });
  });

  it("drops empty-string keys from objects", () => {
    expect(stripNulls({ a: 1, b: "", c: "x" })).toEqual({ a: 1, c: "x" });
  });

  it("recurses into nested objects", () => {
    expect(
      stripNulls({ outer: { a: 1, b: null }, sibling: "y" })
    ).toEqual({ outer: { a: 1 }, sibling: "y" });
  });

  it("recurses into arrays of objects, preserving array shape", () => {
    expect(
      stripNulls({ items: [{ a: 1, b: null }, { c: 2 }] })
    ).toEqual({ items: [{ a: 1 }, { c: 2 }] });
  });

  it("preserves arrays of primitives unchanged", () => {
    expect(stripNulls({ tags: ["a", "b", "c"] })).toEqual({
      tags: ["a", "b", "c"],
    });
  });

  it("preserves false, 0, empty arrays, and empty objects", () => {
    expect(
      stripNulls({ flag: false, count: 0, list: [], obj: {} })
    ).toEqual({ flag: false, count: 0, list: [], obj: {} });
  });

  it("does not mutate input", () => {
    const input = { a: 1, b: null, nested: { c: null, d: 2 } };
    const snapshot = JSON.stringify(input);
    stripNulls(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("handles top-level arrays and primitives", () => {
    expect(stripNulls([{ a: null, b: 1 }, "x"])).toEqual([{ b: 1 }, "x"]);
    expect(stripNulls("plain")).toBe("plain");
    expect(stripNulls(42)).toBe(42);
    expect(stripNulls(null)).toBe(null);
  });
});
