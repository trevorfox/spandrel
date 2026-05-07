import { describe, expect, it } from "vitest";
import type { MoveResult, EditList } from "../src/server/mutations.js";

describe("mutations module exports", () => {
  it("exports MoveResult type", () => {
    const r: MoveResult = {
      written: [],
      deleted: [],
      referrersRewritten: [],
      danglingMentions: [],
    };
    expect(r.written).toEqual([]);
  });

  it("exports EditList type", () => {
    const e: EditList = {
      moves: [],
      deletes: [],
      rewrites: [],
      danglingMentions: [],
    };
    expect(e.moves).toEqual([]);
  });
});
