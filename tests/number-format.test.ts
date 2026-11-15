import { describe, expect, it } from "vitest";
import { decimalsForPercentage, decimalsForUncertainty, formatInterval, formatLevel, formatNumber } from "../src/render/number-format.js";

describe("digits supported by the uncertainty", () => {
  it("rounds to the decimal of the first significant digit of the standard error", () => {
    expect(decimalsForUncertainty(0.0012)).toBe(3);
    expect(decimalsForUncertainty(0.28)).toBe(1);
    expect(decimalsForUncertainty(2.8)).toBe(0);
    expect(decimalsForUncertainty(28)).toBe(-1);
  });

  it("reads the standard error from the interval when none is stored", () => {
    expect(decimalsForUncertainty(undefined, [80.1, 83.6], 0.95)).toBe(1);
    expect(decimalsForUncertainty(undefined, [0.266466, 0.272919], 0.95)).toBe(3);
  });

  it("has no rule without an uncertainty", () => {
    expect(decimalsForUncertainty(undefined)).toBeNull();
    expect(decimalsForUncertainty(0)).toBeNull();
  });

  it("shows percentages as whole numbers, with one decimal below 10%", () => {
    expect(decimalsForPercentage(81.3)).toBe(0);
    expect(decimalsForPercentage(-4.6)).toBe(1);
    expect(decimalsForPercentage(0)).toBe(0);
    expect(decimalsForPercentage(100)).toBe(0);
  });
});

describe("number text", () => {
  it("rounds, signs and uses a true minus sign", () => {
    expect(formatNumber(0.268959, 3)).toBe("0.269");
    expect(formatNumber(-10.4466, 0, { signed: true })).toBe("−10");
    expect(formatNumber(1.07527, 1, { signed: true })).toBe("+1.1");
    expect(formatNumber(1234, -1)).toBe("1230");
    expect(formatNumber(-0.04, 1, { signed: true })).toBe("0.0");
    expect(formatNumber(0.25, null)).toBe("0.25");
  });

  it("writes intervals and levels", () => {
    expect(formatInterval([-12.03, -9.15], 0, { signed: true })).toBe("−12 to −9");
    expect(formatLevel(0.9875)).toBe("98.75");
    expect(formatLevel(0.95)).toBe("95");
  });
});
