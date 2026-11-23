/** A unit to show figures in, and what to multiply a value in the metric's own unit by to get there. */
export interface DisplayUnit {
  unit: string;
  factor: number;
}

const TIME_UNITS: [string, number][] = [
  ["µs", 1e-6],
  ["ms", 1e-3],
  ["s", 1],
];
const TIME_ALIASES: Record<string, string> = { us: "µs", μs: "µs", sec: "s", seconds: "s", second: "s" };
const BINARY_UNITS: [string, number][] = [
  ["B", 1],
  ["KiB", 1024],
  ["MiB", 1024 ** 2],
  ["GiB", 1024 ** 3],
  ["TiB", 1024 ** 4],
];
const DECIMAL_UNITS: [string, number][] = [
  ["B", 1],
  ["KB", 1e3],
  ["MB", 1e6],
  ["GB", 1e9],
  ["TB", 1e12],
];

/** The largest unit of a family in which the figure is still at least 1: 42 ms rather than 0.042 s, 820 KiB rather than 0.8 MiB. */
function within(family: [string, number][], unit: string, largest: number): DisplayUnit | undefined {
  const own = family.find(([name]) => name === unit);

  if (!own || largest <= 0) return undefined;

  const inBase = largest * own[1];
  const chosen = [...family].reverse().find(([, size]) => inBase / size >= 1) ?? family[0];

  return { unit: chosen[0], factor: own[1] / chosen[1] };
}

/**
 * The unit a row of figures reads best in, from the largest of them: time and bytes move between their units; any
 * other unit stays as the metric declares it.
 */
export function displayUnitOf(unit: string, largest: number): DisplayUnit {
  const time = TIME_ALIASES[unit] ?? unit;

  return (
    within(TIME_UNITS, time, largest) ?? within(BINARY_UNITS, unit, largest) ?? within(DECIMAL_UNITS, unit, largest) ?? { unit, factor: 1 }
  );
}

/** A round top for an axis from zero, just above the largest figure: 1, 2, 2.5 or 5 times a power of ten. */
export function roundTopAbove(largest: number): number {
  if (largest <= 0) return 1;

  const power = 10 ** Math.floor(Math.log10(largest));

  return [1, 2, 2.5, 5, 10].map((step) => step * power).find((top) => top >= largest) ?? 10 * power;
}
