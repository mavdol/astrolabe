import type { Decimals } from "../number-format.js";

export interface LinearScale {
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
 * A linear scale whose ends are round numbers that enclose the data, drawn from start to end pixels.
 * There is no other kind: no break, and the ticks are evenly spaced values.
 */
export function linearScale(dataExtent: [number, number], pixels: [number, number], targetCount = TARGET_TICK_COUNT): LinearScale {
  const [low, high] = dataExtent[0] === dataExtent[1] ? [dataExtent[0] - 1, dataExtent[1] + 1] : dataExtent;
  const step = niceStep(high - low, targetCount);
  const first = Math.floor(low / step + 1e-9) * step;
  const last = Math.ceil(high / step - 1e-9) * step;
  const tickCount = Math.round((last - first) / step) + 1;
  const ticks = Array.from({ length: tickCount }, (_, index) => Number((first + index * step).toPrecision(12)));
  const [startPixel, endPixel] = pixels;

  return {
    domain: [first, last],
    ticks,
    tickDecimals: decimalsOfStep(step),
    position: (value) => startPixel + ((value - first) / (last - first)) * (endPixel - startPixel),
  };
}

/** How many times the smallest difference that matters must fit in an axis that does not start at zero. */
const MEANINGFUL_DIFFERENCES_ACROSS_AN_AXIS = 5;

/**
 * The extent of an axis that does not start at zero: wide enough that a difference of the smallest
 * size that matters covers at most a fifth of it, so a smaller difference cannot look large.
 */
export function extentAroundData(dataExtent: [number, number], minimumMeaningful: number): [number, number] {
  const [low, high] = dataExtent;
  const span = Math.max(high - low, MEANINGFUL_DIFFERENCES_ACROSS_AN_AXIS * minimumMeaningful);
  const centre = (low + high) / 2;

  return [centre - span / 2, centre + span / 2];
}
