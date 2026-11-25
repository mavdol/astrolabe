import type { Decimals } from "../number-format.js";

export interface AxisScale {
  domain: [number, number];
  ticks: number[];
  /** Decimals that tell two neighbouring ticks apart. */
  tickDecimals: Decimals;
  position(value: number): number;
}

const TARGET_TICK_COUNT = 5;
const NICE_STEPS = [1, 2, 2.5, 5, 10];

function niceStep(span: number, targetCount: number): number {
  const roughStep = span / targetCount;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));

  return magnitude * NICE_STEPS.find((step) => step * magnitude >= roughStep)!;
}

const decimalsOfStep = (step: number): Decimals => Math.max(0, -Math.floor(Math.log10(step) + 1e-9) + (isHalfStep(step) ? 1 : 0));

/** 2.5, 0.25 and 25 need one more digit than their magnitude to be told apart from their neighbours. */
function isHalfStep(step: number): boolean {
  const leading = step / 10 ** Math.floor(Math.log10(step) + 1e-9);

  return Math.abs(leading - 2.5) < 1e-9;
}

/**
 * A linear scale whose ends are round numbers that enclose the data, drawn from start to end pixels, and that stops at
 * the floor when one is given. There is no other kind: no break, and the ticks are evenly spaced values.
 */
export function linearScale(
  dataExtent: [number, number],
  pixels: [number, number],
  targetCount = TARGET_TICK_COUNT,
  floor = -Infinity,
): AxisScale {
  const [low, high] = dataExtent[0] === dataExtent[1] ? [dataExtent[0] - 1, dataExtent[1] + 1] : dataExtent;
  const step = niceStep(high - low, targetCount);
  const first = Math.max(Math.floor(low / step + 1e-9) * step, floor);
  const last = Math.ceil(high / step - 1e-9) * step;
  const firstTick = Math.ceil(first / step - 1e-9) * step;
  const tickCount = Math.round((last - firstTick) / step) + 1;
  const ticks = Array.from({ length: tickCount }, (_, index) => Number((firstTick + index * step).toPrecision(12)));
  const [startPixel, endPixel] = pixels;

  return {
    domain: [first, last],
    ticks,
    tickDecimals: decimalsOfStep(step),
    position: (value) => startPixel + ((value - first) / (last - first)) * (endPixel - startPixel),
  };
}

const DECADES_WITH_INTERMEDIATE_TICKS = 2;

/**
 * A log scale between the powers of ten that enclose the data. Its ticks are real values: powers of ten,
 * with 2 and 5 between them when the data covers few powers.
 */
export function logScale(dataExtent: [number, number], pixels: [number, number]): AxisScale {
  const firstPower = Math.floor(Math.log10(dataExtent[0]) + 1e-9);
  const lastPower = Math.max(firstPower + 1, Math.ceil(Math.log10(dataExtent[1]) - 1e-9));
  const leadingDigits = lastPower - firstPower <= DECADES_WITH_INTERMEDIATE_TICKS ? [1, 2, 5] : [1];
  const ticks: number[] = [];

  for (let power = firstPower; power < lastPower; power++)
    for (const digit of leadingDigits) ticks.push(Number((digit * 10 ** power).toPrecision(12)));

  ticks.push(10 ** lastPower);

  const [startPixel, endPixel] = pixels;

  return {
    domain: [10 ** firstPower, 10 ** lastPower],
    ticks,
    tickDecimals: Math.max(0, -firstPower),
    position: (value) => startPixel + ((Math.log10(value) - firstPower) / (lastPower - firstPower)) * (endPixel - startPixel),
  };
}

/** How many times the smallest difference that matters must fit in an axis fitted to its values. */
const MEANINGFUL_DIFFERENCES_ACROSS_AN_AXIS = 2;

/**
 * The extent of an axis fitted to its values: wide enough that a difference of the smallest size that
 * matters covers at most half of it, so a smaller difference cannot fill it; never below zero for
 * values that are not.
 */
export function extentAroundData(dataExtent: [number, number], minimumMeaningful: number): [number, number] {
  const [low, high] = dataExtent;
  const span = Math.max(high - low, MEANINGFUL_DIFFERENCES_ACROSS_AN_AXIS * minimumMeaningful);
  const centre = (low + high) / 2;

  return low >= 0 && centre - span / 2 < 0 ? [0, span] : [centre - span / 2, centre + span / 2];
}
