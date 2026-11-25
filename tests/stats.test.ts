import { describe, expect, it } from "vitest";
import {
  regularizedIncompleteBeta,
  logGamma,
  minObservations,
  newcombe,
  newcombePaired,
  normalCdf,
  normalQuantile,
  orderStatRanks,
  quantileSelect,
  quantileSorted,
  tInterval,
  studentTQuantile,
  welch,
  wilson,
} from "../src/compute/stats.js";

// Reference values: scipy 1.16.2 / numpy 2.3.2.
const close = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));

describe("special functions against scipy", () => {
  it("logGamma, regularizedIncompleteBeta, normal cdf", () => {
    close(logGamma(0.3), 1.0957979948180756);
    close(logGamma(17.5), 32.08111489594735);
    close(regularizedIncompleteBeta(2.5, 4.0, 0.3), 0.3521975859067672);
    close(normalCdf(1.2345), 0.8914916766373298);
    close(normalCdf(-3.7), 0.00010779973347738824, 1e-12);
  });
  it("normal and t quantiles", () => {
    close(normalQuantile(0.975), 1.959963984540054);
    close(normalQuantile(0.99375), 2.497705474412374);
    close(normalQuantile(0.999975), 4.0556269811219074);
    close(studentTQuantile(0.975, 9), 2.262157162854099);
    close(studentTQuantile(0.975, 23), 2.0686576104190406);
    close(studentTQuantile(0.99375, 119), 2.53624058184232);
    close(studentTQuantile(0.975, 1), 12.706204736432095);
    close(studentTQuantile(0.975, 37.4), 2.0254612332283064);
    close(studentTQuantile(0.025, 9), -2.262157162854099);
  });
});

describe("quantiles (type 7, numpy default)", () => {
  const x = [4.2, 4.12, 4.31, 4.16, 4.18, 4.05, 4.296, 4.163, 4.14, 4.25];
  const sorted = [...x].sort((a, b) => a - b);

  it("sorted", () => {
    close(quantileSorted(sorted, 0.5), 4.1715);
    close(quantileSorted(sorted, 0.95), 4.3037);
    close(quantileSorted(sorted, 0.123), 4.12214);
  });
  it("select gives the same as sorting", () => {
    for (const p of [0, 0.123, 0.5, 0.95, 1]) close(quantileSelect(Float64Array.from(x), x.length, p), quantileSorted(sorted, p));

    const big = Float64Array.from({ length: 4001 }, (_, i) => (i * 7919) % 4001);
    const ref = Float64Array.from(big).sort();

    for (const p of [0.01, 0.5, 0.95, 0.99]) close(quantileSelect(Float64Array.from(big), big.length, p), quantileSorted(ref, p));
  });
});

describe("intervals", () => {
  it("order statistics: classic ranks and minimum sizes", () => {
    expect(orderStatRanks(10, 0.5, 0.95)).toEqual([2, 9]);
    expect(orderStatRanks(6, 0.5, 0.95)).toEqual([1, 6]);
    expect(orderStatRanks(5, 0.5, 0.95)).toBeNull();
    expect(orderStatRanks(71, 0.95, 0.95)).toBeNull();
    expect(orderStatRanks(72, 0.95, 0.95)).not.toBeNull();
    expect(minObservations(0.5, 0.95)).toBe(6);
    expect(minObservations(0.5, 0.9875)).toBe(8);
    expect(minObservations(0.95, 0.95)).toBe(72);

    for (const [p, level] of [
      [0.5, 0.95],
      [0.5, 0.9875],
      [0.95, 0.95],
      [0.99, 0.95],
      [0.5, 0.999],
    ] as const) {
      const n = minObservations(p, level);

      expect(orderStatRanks(n, p, level)).not.toBeNull();
      expect(orderStatRanks(n - 1, p, level)).toBeNull();
    }
  });
  it("wilson", () => {
    const [lo, hi] = wilson(19, 24, 0.95);

    close(lo, 0.5952954674681135);
    close(hi, 0.9075517464714815);
    const [lo2, hi2] = wilson(24, 24, 0.95);

    close(lo2, 0.8620237953250198);
    expect(hi2).toBe(1);
  });
  it("newcombe: 0/24 against 5/24", () => {
    const [lo, hi] = newcombe(0, 24, 5, 24, 0.95);

    close(lo, -0.404705, 1e-6);
    close(hi, -0.0281479, 1e-6);
  });
  it("newcombe on paired answers: wide as the Wilson interval when every answer is no, narrower than unpaired when the answers agree", () => {
    const noes = Array(8).fill(0);
    const [, wilsonUpper] = wilson(0, 8, 0.95);
    const [lo, hi] = newcombePaired(noes, noes, 0.95);

    close(lo, -wilsonUpper);
    close(hi, wilsonUpper);

    const first = [1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1];
    const second = [1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 0];
    const paired = newcombePaired(first, second, 0.95);
    const unpaired = newcombe(7, 12, 6, 12, 0.95);

    expect(paired[0]).toBeGreaterThan(unpaired[0]);
    expect(paired[1]).toBeLessThan(unpaired[1]);
    expect(paired[0]).toBeLessThan(1 / 12);
    expect(paired[1]).toBeGreaterThan(1 / 12);
  });
  it("t and welch", () => {
    const a = [1.0, 2.5, 3.1, 4.7, 5.2, 6.9];
    const b = [2.0, 2.2, 2.9, 3.3];
    const w = welch(a, b, 0.95);

    close(w.ci![0], -0.924449908131876);
    close(w.ci![1], 3.5244499081318765);
    const t = tInterval(a, 0.9875);

    close(t.ci![0], 0.6121918443085561);
    close(t.ci![1], 7.187808155691444);
  });
});
