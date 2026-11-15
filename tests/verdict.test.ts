import { describe, expect, it } from "vitest";
import { Xoshiro128 } from "../src/compute/rng.js";
import { sameNumber, stored } from "../src/compute/numbers.js";
import { failureWarningOf, verdictOf, verdictRank } from "../src/compute/verdict.js";

const label = (interval: [number, number], direction: "higher" | "lower" = "higher", minimumMeaningful = 10) => {
  const result = verdictOf(interval, direction, minimumMeaningful);

  return result.qualifier ? `${result.qualifier} ${result.verdict}` : result.verdict;
};

describe("verdicts read from the interval alone", () => {
  it("the four verdicts and the likely qualifier", () => {
    expect(label([12, 30])).toBe("better");
    expect(label([1, 21])).toBe("likely better");
    expect(label([-9, 9])).toBe("equivalent");
    expect(label([1, 9])).toBe("equivalent");
    expect(label([-3, 14])).toBe("inconclusive");
    expect(label([-21, -1])).toBe("likely worse");
    expect(label([-30, -12])).toBe("worse");
  });

  it("the examples of the two reviews", () => {
    expect(label([-32.9053, -2.42907], "lower", 20)).toBe("likely better");
    expect(label([-37.2308, -2.77714], "lower", 20)).toBe("likely better");
    expect(label([-10.5, 0.5])).toBe("inconclusive");
    expect(label([-9.5, 1.5])).toBe("equivalent");
    expect(label([-7.5, 10.5])).toBe("inconclusive");
  });

  it("boundaries: inside is strict, past includes the boundary, excludes zero is strict", () => {
    expect(label([10, 20])).toBe("better");
    expect(label([9.99999, 20])).toBe("likely better");
    expect(label([-9, 10])).toBe("inconclusive");
    expect(label([1, 10])).toBe("likely better");
    expect(label([0, 20])).toBe("inconclusive");
    expect(label([-20, -10])).toBe("worse");
    expect(label([-10, 9])).toBe("inconclusive");
    expect(label([0, 0])).toBe("equivalent");
  });

  it("lower is better flips the sign", () => {
    expect(label([-51, -48], "lower")).toBe("better");
    expect(label([182, 195], "lower")).toBe("worse");
    expect(label([50, 50], "lower")).toBe("worse");
  });

  it("a minimum meaningful difference of zero is refused", () => {
    expect(() => verdictOf([1, 2], "higher", 0)).toThrow();
  });

  it("moving an interval in the favourable direction never gives a less favourable verdict", () => {
    const generator = new Xoshiro128([1, 2, 3, 4]);
    const uniform = (low: number, high: number) => low + ((high - low) * generator.next()) / 4294967296;

    for (let trial = 0; trial < 200000; trial++) {
      const minimumMeaningful = uniform(0.1, 20);
      const low = uniform(-40, 40);
      const high = low + uniform(0, 40);
      const shift = uniform(0, 30);
      const before = verdictRank(verdictOf([low, high], "higher", minimumMeaningful));
      const after = verdictRank(verdictOf([low + shift, high + shift], "higher", minimumMeaningful));

      expect(after).toBeGreaterThanOrEqual(before);
    }
  });
});

describe("failure warning read from stored shares", () => {
  it("needs an interval that excludes zero and a gap of at least 5 points", () => {
    expect(failureWarningOf({ candidate: 0, baseline: 20.8333, difference_ci: [-40.4705, -2.81479] })).toBe(true);
    expect(failureWarningOf({ candidate: 25, baseline: 20.8333, difference_ci: [-19.384, 27.1945] })).toBe(false);
    expect(failureWarningOf({ candidate: 0, baseline: 1.66667, difference_ci: [-3.04052, -0.676398] })).toBe(false);
  });
});

describe("stored numbers", () => {
  it("six significant digits, and zero below the floor", () => {
    expect(stored(1.23456789, 10)).toBe(1.23457);
    expect(stored(-0.9524961, 100)).toBe(-0.952496);
    expect(stored(310, 900)).toBe(310);
    expect(stored(2.2e-16, 100)).toBe(0);
    expect(Object.is(stored(-2.2e-16, 100), 0)).toBe(true);
    expect(stored(0.00432181, 0.0044)).toBe(0.00432181);
  });

  it("validate allows one unit in the sixth digit, whatever the size of the number", () => {
    expect(sameNumber(1.23457, 1.23456)).toBe(true);
    expect(sameNumber(1.23457, 1.23455)).toBe(false);
    expect(sameNumber(9.40171, 9.40172)).toBe(true);
    expect(sameNumber(9.40171, 9.40173)).toBe(false);
    expect(sameNumber(0.00432181, 0.00432182)).toBe(true);
    expect(sameNumber(264.534, 264.535)).toBe(true);
    expect(sameNumber(264.534, 264.54)).toBe(false);
    expect(sameNumber(0, 0)).toBe(true);
    expect(sameNumber(-5, 5)).toBe(false);
  });
});

describe("random generator", () => {
  it("xoshiro128** reference stream from the state 1, 2, 3, 4", () => {
    const generator = new Xoshiro128([1, 2, 3, 4]);

    expect([generator.next(), generator.next(), generator.next()]).toEqual([11520, 0, 5927040]);
  });

  it("below(n) stays in range and covers it evenly", () => {
    const generator = new Xoshiro128([9, 8, 7, 6]);
    const counts = new Array(7).fill(0);

    for (let draw = 0; draw < 70000; draw++) counts[generator.below(7)]++;

    for (const count of counts) expect(Math.abs(count - 10000)).toBeLessThan(400);
  });
});
