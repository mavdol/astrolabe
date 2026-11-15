export const STORED_SIGNIFICANT_DIGITS = 6;
const NOISE_FLOOR_RELATIVE_TO_SCALE = 1e-9;

function roundToStoredDigits(value: number): number {
  return value === 0 ? 0 : Number(value.toPrecision(STORED_SIGNIFICANT_DIGITS));
}

/**
 * The stored form of a number: six significant digits, and zero when it is
 * smaller than 1e-9 times its scale, so that floating-point noise around zero
 * (2.2e-16 where another implementation gets 0) never reaches the file.
 */
export function stored(value: number, scale: number): number {
  if (!Number.isFinite(value)) throw new Error(`cannot store a non-finite number (${value})`);

  if (Math.abs(value) < NOISE_FLOOR_RELATIVE_TO_SCALE * scale) return 0;

  const rounded = roundToStoredDigits(value);

  return rounded === 0 ? 0 : rounded;
}

/**
 * Equal after rounding both sides to six significant digits, allowing one
 * unit in the last digit: two implementations whose unrounded results fall on
 * either side of a rounding boundary still agree.
 */
export function sameNumber(first: number, second: number): boolean {
  const roundedFirst = roundToStoredDigits(first);
  const roundedSecond = roundToStoredDigits(second);

  if (roundedFirst === roundedSecond) return true;

  const larger = Math.max(Math.abs(roundedFirst), Math.abs(roundedSecond));
  const oneUnitInLastDigit = 10 ** (Math.floor(Math.log10(larger)) - (STORED_SIGNIFICANT_DIGITS - 1));
  const floatingPointSlack = 1.000001;

  return Math.abs(roundedFirst - roundedSecond) <= oneUnitInLastDigit * floatingPointSlack;
}
