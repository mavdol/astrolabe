import { normalQuantile } from "../compute/stats.js";

const MINUS_SIGN = "−";

/** How many decimals a number is shown with; negative means rounding to tens, hundreds and so on. */
export type Decimals = number;

/**
 * Round to the decimal of the first significant digit of the standard error,
 * so no more digits are shown than the uncertainty supports. Without a standard error, it is read from the interval as if the
 * interval were normal: a half-width of z standard errors.
 */
export function decimalsForUncertainty(
  standardError: number | undefined,
  interval?: readonly [number, number],
  level?: number,
): Decimals | null {
  const derivedFromInterval =
    interval !== undefined && level !== undefined ? (interval[1] - interval[0]) / (2 * normalQuantile(1 - (1 - level) / 2)) : undefined;
  const uncertainty = standardError ?? derivedFromInterval;

  if (uncertainty === undefined || !(uncertainty > 0)) return null;

  return 0 - Math.floor(Math.log10(uncertainty));
}

const SIGNIFICANT_DIGITS_WITHOUT_UNCERTAINTY = 3;

/**
 * A measured number with no interval and no standard error says nothing about its own precision:
 * three significant digits, and the whole part is never rounded away.
 */
export function decimalsWithoutUncertainty(value: number): Decimals {
  if (value === 0) return 0;

  return Math.max(0, SIGNIFICANT_DIGITS_WITHOUT_UNCERTAINTY - 1 - Math.floor(Math.log10(Math.abs(value))));
}

/** Percentages are whole numbers, with one decimal below 10%. */
export function decimalsForPercentage(value: number): Decimals {
  if (Number.isInteger(value)) return 0;

  return Math.abs(value) < 10 ? 1 : 0;
}

export function formatNumber(value: number, decimals: Decimals | null, options: { signed?: boolean } = {}): string {
  const rounded = decimals === null ? value : roundTo(value, decimals);
  const digits = decimals === null ? undefined : Math.max(0, decimals);
  const magnitude = digits === undefined ? trimmed(Math.abs(rounded)) : Math.abs(rounded).toFixed(digits);
  const isZero = Number(magnitude) === 0;
  const sign = rounded < 0 && !isZero ? MINUS_SIGN : options.signed && !isZero ? "+" : "";

  return `${sign}${magnitude}`;
}

function roundTo(value: number, decimals: Decimals): number {
  const factor = 10 ** Math.abs(decimals);

  return decimals >= 0 ? Math.round(value * factor) / factor : Math.round(value / factor) * factor;
}

/** A number as stored, without trailing zeros: 0.25, not 0.250000. */
function trimmed(value: number): string {
  return String(Number(value.toPrecision(6)));
}

/** How many more decimals an interval may take so that two different ends never print as the same number. */
const LARGEST_EXTRA_DECIMALS = 3;

/** The two ends with the given decimals, or as few more as it takes for different ends to read differently. */
export function formatInterval(interval: readonly [number, number], decimals: Decimals | null, options: { signed?: boolean } = {}): string {
  const [low, high] = interval;
  const endsOf = (shown: Decimals | null) => [formatNumber(low, shown, options), formatNumber(high, shown, options)];
  let shown = decimals;

  while (shown !== null && low !== high && shown < (decimals ?? 0) + LARGEST_EXTRA_DECIMALS && new Set(endsOf(shown)).size === 1)
    shown += 1;

  return endsOf(shown).join(" to ");
}

/** 95 for 0.95, 98.75 for 0.9875. */
export function formatLevel(level: number): string {
  return String(Number((level * 100).toFixed(2)));
}
