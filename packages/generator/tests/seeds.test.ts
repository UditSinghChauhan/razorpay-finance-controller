import { describe, expect, it } from "vitest";

import { SEEDS_PER_CONFIGURATION } from "../src/frozen.js";
import {
  BurnRegister, DECLARED_SEEDS, SEED_BLOCKS, blockOf, familiesFor, isDeclaredSeed,
} from "../src/seeds.js";

describe("§6.1 the split table", () => {
  it("declares four blocks of five seeds each", () => {
    expect(SEED_BLOCKS).toHaveLength(4);
    for (const block of SEED_BLOCKS) expect(block.seeds).toHaveLength(SEEDS_PER_CONFIGURATION);
    expect(DECLARED_SEEDS).toStrictEqual([
      1000, 1001, 1002, 1003, 1004, 2000, 2001, 2002, 2003, 2004,
      9000, 9001, 9002, 9003, 9004, 9100, 9101, 9102, 9103, 9104,
    ]);
  });

  it("assigns F01-F06 to train/dev/test and F07-F10 to the held-out test block alone", () => {
    expect(familiesFor(1000)).toStrictEqual(["F01", "F02", "F03", "F04", "F05", "F06"]);
    expect(familiesFor(2004)).toStrictEqual(["F01", "F02", "F03", "F04", "F05", "F06"]);
    expect(familiesFor(9000)).toStrictEqual(["F01", "F02", "F03", "F04", "F05", "F06"]);
    expect(familiesFor(9104)).toStrictEqual(["F07", "F08", "F09", "F10"]);
    for (const held of ["F07", "F08", "F09", "F10"]) {
      for (const seed of [1000, 2000, 9000]) expect(familiesFor(seed)).not.toContain(held);
    }
  });

  it("keeps the blocks 100 apart, which is what makes AL7's successors collision-free", () => {
    const maxima = SEED_BLOCKS.map((b) => b.max).sort((a, b) => a - b);
    for (const [i, max] of maxima.entries()) {
      if (i === 0) continue;
      expect(max - (maxima[i - 1] ?? 0)).toBeGreaterThanOrEqual(96);
    }
  });

  it("recognises a declared seed and refuses an undeclared one", () => {
    expect(isDeclaredSeed(9000)).toBe(true);
    expect(isDeclaredSeed(7001)).toBe(false);
    expect(blockOf(7001)).toBeNull();
    expect(() => familiesFor(7001)).toThrow(/appears in no row/);
  });
});

/** `§6.2` `AL7`'s replacement rule, added at spec 1.4.1. */
describe("AL7 — the burned-seed successor rule", () => {
  it("takes the lowest integer strictly greater than the burned seed's block maximum", () => {
    const register = new BurnRegister();
    expect(register.successorFor(9000)).toBe(9005);
    expect(register.successorFor(9004)).toBe(9005);
    expect(register.successorFor(9100)).toBe(9105);
    expect(register.successorFor(2000)).toBe(2005);
    expect(register.successorFor(1000)).toBe(1005);
  });

  it("applies iteratively across repeated burns, exactly as §6.2 enumerates", () => {
    const register = new BurnRegister();
    expect(register.burn(9000, "TEST_RECORD_INSPECTED")).toBe(9005);
    expect(register.burn(9001, "TEST_RECORD_INSPECTED")).toBe(9006);
    expect(register.burn(9002, "TEST_RECORD_INSPECTED")).toBe(9007);
    expect(register.burn(9100, "HELD_OUT_FORBIDDEN_LIST_BREACH")).toBe(9105);
    expect(register.burn(9101, "HELD_OUT_FORBIDDEN_LIST_BREACH")).toBe(9106);
  });

  it("skips a successor that is burned or already in force", () => {
    const register = new BurnRegister();
    register.burn(9000, "TEST_RECORD_INSPECTED"); // -> 9005
    expect(register.isAllocated(9005)).toBe(true);
    register.burn(9005, "TEST_RECORD_INSPECTED"); // a burned successor resolves to its origin block
    expect(register.burns.at(-1)?.successor).toBe(9006);
    expect(register.successorFor(9001)).toBe(9007);
  });

  it("records every burn with its successor and reason, as AL7 requires of the manifest", () => {
    const register = new BurnRegister();
    register.burn(9103, "HELD_OUT_FORBIDDEN_LIST_BREACH");
    expect(register.burns).toStrictEqual([
      { burned: 9103, successor: 9105, reason: "HELD_OUT_FORBIDDEN_LIST_BREACH" },
    ]);
  });

  it("resolves a block's seeds in force, still five of them", () => {
    const register = new BurnRegister();
    const block = SEED_BLOCKS[3];
    if (block === undefined) throw new Error("missing block");
    register.burn(9102, "HELD_OUT_FORBIDDEN_LIST_BREACH");
    expect(register.effectiveSeeds(block)).toStrictEqual([9100, 9101, 9105, 9103, 9104]);
    expect(register.effectiveSeeds(block)).toHaveLength(SEEDS_PER_CONFIGURATION);
  });

  it("follows a successor chain to its end", () => {
    const register = new BurnRegister();
    register.burn(9000, "TEST_RECORD_INSPECTED"); // 9000 -> 9005
    register.burn(9005, "TEST_RECORD_INSPECTED"); // 9005 -> 9006
    const block = SEED_BLOCKS[2];
    if (block === undefined) throw new Error("missing block");
    expect(register.effectiveSeeds(block)[0]).toBe(9006);
  });

  it("refuses to burn a seed twice", () => {
    const register = new BurnRegister();
    register.burn(9000, "TEST_RECORD_INSPECTED");
    expect(() => register.burn(9000, "TEST_RECORD_INSPECTED")).toThrow(/already burned/);
  });

  it("refuses a seed that is neither declared nor a recorded successor", () => {
    expect(() => new BurnRegister().successorFor(7001)).toThrow(/no block maximum/);
  });

  it("never lets a successor reach another block's declared range", () => {
    const register = new BurnRegister();
    // Burning every declared seed of a block, then every successor in turn, is
    // the worst case the rule can reach: ten burns, successors 9005..9014.
    for (const seed of [9000, 9001, 9002, 9003, 9004]) register.burn(seed, "TEST_RECORD_INSPECTED");
    for (const seed of [9005, 9006, 9007, 9008, 9009]) register.burn(seed, "TEST_RECORD_INSPECTED");
    const successors = register.burns.map((b) => b.successor);
    expect(successors).toStrictEqual([9005, 9006, 9007, 9008, 9009, 9010, 9011, 9012, 9013, 9014]);
    for (const successor of successors) {
      expect(DECLARED_SEEDS).not.toContain(successor);
      expect(successor).toBeLessThan(9100);
    }
  });

  it("reads no result, no outcome and no date — the rule is a pure function", () => {
    const a = new BurnRegister();
    const b = new BurnRegister();
    for (const seed of [9000, 9001, 9100]) {
      a.burn(seed, "TEST_RECORD_INSPECTED");
      b.burn(seed, "HELD_OUT_FORBIDDEN_LIST_BREACH");
    }
    expect(a.burns.map((x) => x.successor)).toStrictEqual(b.burns.map((x) => x.successor));
  });
});
