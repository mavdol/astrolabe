/**
 * The statistics of astrolabe compute: a small fixed set, written here rather
 * than taken from a library so that every machine gives the same digits.
 * Each function is tested against reference values from scipy.
 */

const LANCZOS_COEFFICIENTS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];
const LANCZOS_G = 7;

export function logGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);

  const shifted = x - 1;
  let series = LANCZOS_COEFFICIENTS[0];

  for (let index = 1; index < LANCZOS_COEFFICIENTS.length; index++) series += LANCZOS_COEFFICIENTS[index] / (shifted + index);

  const base = shifted + LANCZOS_G + 0.5;

  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(base) - base + Math.log(series);
}

/** Continued fraction of the incomplete beta function, by the modified Lentz method. */
function incompleteBetaContinuedFraction(a: number, b: number, x: number): number {
  const SMALLEST = 1e-300;
  const MAX_ITERATIONS = 500;
  const CONVERGED = 1e-16;
  const awayFromZero = (value: number) => (Math.abs(value) < SMALLEST ? SMALLEST : value);
  let numerator = 1;
  let denominator = 1 / awayFromZero(1 - ((a + b) * x) / (a + 1));
  let fraction = denominator;

  for (let step = 1; step <= MAX_ITERATIONS; step++) {
    const evenTerm = (step * (b - step) * x) / ((a - 1 + 2 * step) * (a + 2 * step));

    denominator = 1 / awayFromZero(1 + evenTerm * denominator);
    numerator = awayFromZero(1 + evenTerm / numerator);
    fraction *= denominator * numerator;
    const oddTerm = (-(a + step) * (a + b + step) * x) / ((a + 2 * step) * (a + 1 + 2 * step));

    denominator = 1 / awayFromZero(1 + oddTerm * denominator);
    numerator = awayFromZero(1 + oddTerm / numerator);
    const change = denominator * numerator;

    fraction *= change;

    if (Math.abs(change - 1) < CONVERGED) break;
  }

  return fraction;
}

/** I_x(a, b), the regularized incomplete beta function. */
export function regularizedIncompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;

  if (x >= 1) return 1;

  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  const convergesFasterDirectly = x < (a + 1) / (a + b + 2);

  return convergesFasterDirectly
    ? (front * incompleteBetaContinuedFraction(a, b, x)) / a
    : 1 - (front * incompleteBetaContinuedFraction(b, a, 1 - x)) / b;
}

/** erf(z) for z >= 0, by the series whose terms are all positive, so nothing cancels. */
function errorFunctionOfPositive(z: number): number {
  const BEYOND_DOUBLE_PRECISION = 6;

  if (z > BEYOND_DOUBLE_PRECISION) return 1;

  let term = z;
  let sum = z;

  for (let index = 1; index < 400; index++) {
    term *= (2 * z * z) / (2 * index + 1);
    sum += term;

    if (term < sum * 1e-17) break;
  }

  return (2 / Math.sqrt(Math.PI)) * Math.exp(-z * z) * sum;
}

export function normalCdf(x: number): number {
  const erf = errorFunctionOfPositive(Math.abs(x) / Math.SQRT2);

  return x >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/** The root of an increasing function between two bounds, to the last representable digit. */
function rootByBisection(increasing: (x: number) => number, lower: number, upper: number): number {
  for (let iteration = 0; iteration < 200; iteration++) {
    const middle = 0.5 * (lower + upper);

    if (middle === lower || middle === upper) break;

    if (increasing(middle) < 0) lower = middle;
    else upper = middle;
  }

  return 0.5 * (lower + upper);
}

export function normalQuantile(probability: number): number {
  if (!(probability > 0 && probability < 1)) throw new Error(`normalQuantile: probability must be in (0, 1), got ${probability}`);

  if (probability < 0.5) return -normalQuantile(1 - probability);

  return rootByBisection((x) => normalCdf(x) - probability, 0, 40);
}

export function studentTCdf(t: number, degreesOfFreedom: number): number {
  const oneTail = 0.5 * regularizedIncompleteBeta(degreesOfFreedom / 2, 0.5, degreesOfFreedom / (degreesOfFreedom + t * t));

  return t >= 0 ? 1 - oneTail : oneTail;
}

export function studentTQuantile(probability: number, degreesOfFreedom: number): number {
  if (!(probability > 0 && probability < 1)) throw new Error(`studentTQuantile: probability must be in (0, 1), got ${probability}`);

  if (!(degreesOfFreedom > 0)) throw new Error(`studentTQuantile: degrees of freedom must be positive, got ${degreesOfFreedom}`);

  if (probability < 0.5) return -studentTQuantile(1 - probability, degreesOfFreedom);

  let upper = 2;

  while (studentTCdf(upper, degreesOfFreedom) < probability) upper *= 2;

  return rootByBisection((t) => studentTCdf(t, degreesOfFreedom) - probability, 0, upper);
}

export function mean(values: ArrayLike<number>): number {
  let sum = 0;

  for (let index = 0; index < values.length; index++) sum += values[index];

  return sum / values.length;
}

/** Sample variance, dividing by n − 1. */
export function variance(values: ArrayLike<number>): number {
  const average = mean(values);
  let sumOfSquares = 0;

  for (let index = 0; index < values.length; index++) sumOfSquares += (values[index] - average) ** 2;

  return sumOfSquares / (values.length - 1);
}

/** Quantile by linear interpolation between order statistics (Hyndman & Fan type 7, the default of numpy and R). */
export function quantileSorted(sorted: ArrayLike<number>, probability: number, count: number = sorted.length): number {
  const position = (count - 1) * probability;
  const below = Math.floor(position);
  const above = Math.min(below + 1, count - 1);

  return sorted[below] + (position - below) * (sorted[above] - sorted[below]);
}

/** The value of the given rank (0-based) among the first `count` values; reorders them (Hoare quickselect, median-of-three pivot). */
function selectRank(values: Float64Array, count: number, rank: number): number {
  let left = 0;
  let right = count - 1;

  while (left < right) {
    const first = values[left];
    const middle = values[(left + right) >>> 1];
    const last = values[right];
    const pivot =
      first < middle ? (middle < last ? middle : first < last ? last : first) : first < last ? first : middle < last ? last : middle;
    let fromLeft = left;
    let fromRight = right;

    while (fromLeft <= fromRight) {
      while (values[fromLeft] < pivot) fromLeft++;

      while (values[fromRight] > pivot) fromRight--;

      if (fromLeft <= fromRight) {
        const swapped = values[fromLeft];

        values[fromLeft] = values[fromRight];
        values[fromRight] = swapped;
        fromLeft++;
        fromRight--;
      }
    }

    if (rank <= fromRight) right = fromRight;
    else if (rank >= fromLeft) left = fromLeft;
    else break;
  }

  return values[rank];
}

/** Same result as quantileSorted without a full sort; reorders the first `count` values. */
export function quantileSelect(values: Float64Array, count: number, probability: number): number {
  const position = (count - 1) * probability;
  const below = Math.floor(position);
  const valueBelow = selectRank(values, count, below);

  if (position === below || below + 1 >= count) return valueBelow;

  let valueAbove = Infinity;

  for (let index = below + 1; index < count; index++) if (values[index] < valueAbove) valueAbove = values[index];

  return valueBelow + (position - below) * (valueAbove - valueBelow);
}

/** P(B <= k) for k = 0..n, where B counts successes in n trials. */
function binomialCdfUpToEach(trials: number, successProbability: number): Float64Array {
  const cumulative = new Float64Array(trials + 1);
  const logSuccess = Math.log(successProbability);
  const logFailure = Math.log(1 - successProbability);
  const logTrialsFactorial = logGamma(trials + 1);
  let total = 0;

  for (let successes = 0; successes <= trials; successes++) {
    const logProbability =
      logTrialsFactorial -
      logGamma(successes + 1) -
      logGamma(trials - successes + 1) +
      successes * logSuccess +
      (trials - successes) * logFailure;

    total += Math.exp(logProbability);
    cumulative[successes] = Math.min(total, 1);
  }

  return cumulative;
}

/**
 * Ranks (1-based) of the order statistics that bound a distribution-free
 * interval for a quantile: the largest lower rank l with P(B <= l − 1) <= α/2
 * and the smallest upper rank u with P(B <= u − 1) >= 1 − α/2, where B counts
 * the observations below the quantile. Null when there are too few observations.
 */
export function orderStatRanks(observationCount: number, probability: number, level: number): [number, number] | null {
  const tailProbability = (1 - level) / 2;
  const cumulative = binomialCdfUpToEach(observationCount, probability);
  let lowerRank = 0;

  while (lowerRank < observationCount && cumulative[lowerRank] <= tailProbability) lowerRank++;

  let upperRank = 1;

  while (upperRank <= observationCount && cumulative[upperRank - 1] < 1 - tailProbability) upperRank++;

  return lowerRank >= 1 && upperRank <= observationCount ? [lowerRank, upperRank] : null;
}

/** The smallest number of observations for which orderStatRanks gives an interval. */
export function minObservations(probability: number, level: number): number {
  const tailProbability = (1 - level) / 2;
  // An interval exists once all observations falling on one side of the quantile is rarer than α/2.
  const observationsUntilRarerThanTail = (sideProbability: number) =>
    sideProbability <= 0 ? 1 : Math.ceil(Math.log(tailProbability) / Math.log(sideProbability) - 1e-12);

  return Math.max(observationsUntilRarerThanTail(1 - probability), observationsUntilRarerThanTail(probability), 1);
}

/** Wilson score interval of a proportion, as proportions. */
export function wilson(successes: number, trials: number, level: number): [number, number] {
  const z = normalQuantile(1 - (1 - level) / 2);
  const proportion = successes / trials;
  const shrink = 1 + (z * z) / trials;
  const centre = (proportion + (z * z) / (2 * trials)) / shrink;
  const halfWidth = (z * Math.sqrt((proportion * (1 - proportion)) / trials + (z * z) / (4 * trials * trials))) / shrink;

  return [successes === 0 ? 0 : Math.max(0, centre - halfWidth), successes === trials ? 1 : Math.min(1, centre + halfWidth)];
}

/** Newcombe's hybrid score interval of the difference of two proportions, first − second. */
export function newcombe(
  firstSuccesses: number,
  firstTrials: number,
  secondSuccesses: number,
  secondTrials: number,
  level: number,
): [number, number] {
  const first = firstSuccesses / firstTrials;
  const second = secondSuccesses / secondTrials;
  const [firstLower, firstUpper] = wilson(firstSuccesses, firstTrials, level);
  const [secondLower, secondUpper] = wilson(secondSuccesses, secondTrials, level);
  const difference = first - second;

  return [
    difference - Math.sqrt((first - firstLower) ** 2 + (secondUpper - second) ** 2),
    difference + Math.sqrt((firstUpper - first) ** 2 + (second - secondLower) ** 2),
  ];
}

export interface IntervalEstimate {
  estimate: number;
  se: number;
  ci: [number, number] | null;
}

/** Student t interval of a mean; no interval below two observations. */
export function tInterval(values: ArrayLike<number>, level: number): IntervalEstimate {
  const estimate = mean(values);

  if (values.length < 2) return { estimate, se: 0, ci: null };

  const standardError = Math.sqrt(variance(values) / values.length);
  const halfWidth = standardError === 0 ? 0 : studentTQuantile(1 - (1 - level) / 2, values.length - 1) * standardError;

  return { estimate, se: standardError, ci: [estimate - halfWidth, estimate + halfWidth] };
}

/** Welch interval of the difference of two means, first − second, with Welch–Satterthwaite degrees of freedom. */
export function welch(first: ArrayLike<number>, second: ArrayLike<number>, level: number): IntervalEstimate {
  const estimate = mean(first) - mean(second);

  if (first.length < 2 || second.length < 2) return { estimate, se: 0, ci: null };

  const firstVarianceOfMean = variance(first) / first.length;
  const secondVarianceOfMean = variance(second) / second.length;
  const standardError = Math.sqrt(firstVarianceOfMean + secondVarianceOfMean);

  if (standardError === 0) return { estimate, se: 0, ci: [estimate, estimate] };

  const degreesOfFreedom =
    (firstVarianceOfMean + secondVarianceOfMean) ** 2 /
    (firstVarianceOfMean ** 2 / (first.length - 1) + secondVarianceOfMean ** 2 / (second.length - 1));
  const halfWidth = studentTQuantile(1 - (1 - level) / 2, degreesOfFreedom) * standardError;

  return { estimate, se: standardError, ci: [estimate - halfWidth, estimate + halfWidth] };
}
