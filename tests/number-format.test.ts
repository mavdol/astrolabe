import { describe, expect, it } from "vitest";
import {
  decimalsForPercentage,
  decimalsForUncertainty,
  decimalsWithoutUncertainty,
  formatInterval,
  formatLevel,
  formatNumber,
} from "../src/render/number-format.js";

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

  it("keeps three significant digits when nothing says how precise a number is, and never rounds the whole part", () => {
    expect(formatNumber(0.268959, decimalsWithoutUncertainty(0.268959))).toBe("0.269");
    expect(formatNumber(9.55184, decimalsWithoutUncertainty(9.55184))).toBe("9.55");
    expect(formatNumber(212.803, decimalsWithoutUncertainty(212.803))).toBe("213");
    expect(formatNumber(48213.7, decimalsWithoutUncertainty(48213.7))).toBe("48214");
    expect(decimalsWithoutUncertainty(0)).toBe(0);
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
    expect(formatLevel(1 - 0.05 / 6)).toBe("99.17");
    expect(formatLevel(1 - 0.05 / 3)).toBe("98.33");
  });

  it("never prints two different ends of an interval as the same number", () => {
    expect(formatInterval([32.129, 32.3346], 0, { signed: true })).toBe("+32.1 to +32.3");
    expect(formatInterval([32.129, 32.3346], -1)).toBe("32.1 to 32.3");
    expect(formatInterval([5, 5], 0)).toBe("5 to 5");
  });
});
