import type { RawFile } from "../../compute/raw-data.js";
import type { Benchmark, Comparison, Metric } from "../../schema/benchmark.js";
import type { ChartBlock } from "../../schema/presentation.js";
import { seriesStylesOf, type Mode, type SeriesStyle } from "../../themes/astrolabe.js";
import { intervalMethodsOf, restsOnUnblindedJudges, STATISTIC_WORD, type Lookup } from "../describe.js";
import { formatLevel } from "../number-format.js";
import { ChartError, type FilterState } from "./chart-data.js";
import type { Plot } from "./plot.js";
import { extentAroundData } from "./scale.js";

export interface DataTable {
  header: string[];
  rows: string[][];
}

export interface ChartContent {
  plot: Plot;
  subtitle: string;
  /** How to read the chart: what is measured, its direction, the observations and the intervals. */
  howToRead: string;
  /** The same, sentence by sentence, each sentence about a mark tagged with it, so a page can draw a key. */
  howToReadParts?: ReadingPart[];
  table: DataTable;
  /** What is plotted, in words, for the text alternative. */
  kind: string;
  /** The values the main axis covers, so that every filter state and every block sharing the scale can use one axis. */
  axisExtent?: [number, number];
}

export interface ChartInputs {
  block: ChartBlock;
  benchmark: Benchmark;
  lookup: Lookup;
  filterState: FilterState;
  mode: Mode;
  /** A chart of a set size leaves out the definitions of its metrics. */
  compact: boolean;
  rawFiles: Record<string, RawFile>;
  /** The values the main axis must cover besides this chart's own. */
  sharedExtent?: [number, number];
}

export const directionWords = (metric: Metric) => (metric.direction === "lower" ? "lower is better" : "higher is better");
export const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);
export const statisticWord = (metric: Metric) => STATISTIC_WORD[metric.statistic].toLowerCase();
export const withUnit = (number: string, unit: string) => (unit === "%" ? `${number}%` : `${number} ${unit}`);

export function rangeOf(numbers: number[]): string {
  const [lowest, highest] = [Math.min(...numbers), Math.max(...numbers)];

  return lowest === highest ? String(lowest) : `${lowest} to ${highest}`;
}

export function levelsOf(entries: { ci?: [number, number]; ci_level?: number }[]): string | null {
  const levels = [...new Set(entries.filter((entry) => entry.ci && entry.ci_level).map((entry) => formatLevel(entry.ci_level!)))];

  return levels.length > 0 ? `${levels.join("% and ")}%` : null;
}

/** A mark a reader meets on a chart, which a page can draw in the chart's key. */
export type KeyMark = "dot" | "bar" | "interval" | "band" | "frontier";

/** One sentence of how to read a chart. A sentence about a mark starts with the mark's name, which a key replaces with the mark itself. */
export interface ReadingPart {
  text: string;
  mark?: KeyMark;
  markName?: string;
}

/** How a key mark is painted: a page names classes for its stylesheet, a file that travels alone writes the colours. */
export type KeyPaint = (role: "fill" | "stroke" | "dashed" | "band") => string;

/** A key mark, drawn as it appears on the chart, in an 18 by 12 box. */
export function keyMarkOf(mark: KeyMark, paint: KeyPaint): string {
  switch (mark) {
    case "dot":
      return `<circle cx="9" cy="6" r="4" ${paint("fill")}/>`;
    case "bar":
      return `<rect x="1" y="2" width="16" height="8" rx="1.5" ${paint("fill")}/>`;
    case "interval":
      return `<path d="M2 6H16M2 2.5V9.5M16 2.5V9.5" ${paint("stroke")}/>`;
    case "band":
      return `<rect x="1" y="0" width="16" height="12" ${paint("band")}/>`;
    case "frontier":
      return `<path d="M1 6H17" ${paint("dashed")}/>`;
  }
}

export const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** A claim and the reading after it, read as two sentences. */
export const asSentence = (text: string) => (/[.!?:…]$/.test(text.trim()) ? text : `${text}.`);

export const howToReadOf = (parts: ReadingPart[]) =>
  parts
    .filter((part) => part.text)
    .map((part) => (part.markName ? `${part.markName}: ${part.text}` : part.text))
    .join(" ");

type WithInterval = { ci?: [number, number]; ci_level?: number; method?: string };

export function intervalPart(values: WithInterval[], name = "Lines"): ReadingPart {
  const levels = levelsOf(values);
  const methods = intervalMethodsOf(values);

  return levels
    ? { mark: "interval", markName: name, text: `${levels} confidence intervals${methods.length > 0 ? ` (${methods.join("; ")})` : ""}.` }
    : { text: "No interval: too few observations, or declared values." };
}

export const intervalSentence = (values: WithInterval[], name = "Lines") => howToReadOf([intervalPart(values, name)]);

/** What a reader must weigh beside the chart: failures left out or unequal, judges who were not blind. */
export function caveatSentences(lookup: Lookup, metric: Metric, comparisons: Comparison[]): string {
  const leftOut = metric.failures_count_as === "excluded" ? "Failed attempts are left out: successful attempts only." : "";
  const failureWarning = comparisons.some((comparison) => comparison.failure_warning)
    ? "Warning: the candidates did not fail equally often."
    : "";
  const unblinded = comparisons.some((comparison) => restsOnUnblindedJudges(lookup, comparison)) ? UNBLINDED_JUDGES_WARNING : "";

  return [leftOut, failureWarning, unblinded].filter(Boolean).join(" ");
}

export const UNBLINDED_JUDGES_WARNING = "Warning: the judges knew which candidate was which.";

export function comparisonsOn(metric: Metric, lookup: Lookup): Comparison[] {
  return (lookup.results.comparisons ?? []).filter((comparison) => comparison.metric === metric.id);
}

export function seriesOf(inputs: ChartInputs): Map<string, SeriesStyle> {
  return seriesStylesOf(
    inputs.lookup.results.candidates.map((candidate) => candidate.id),
    inputs.benchmark.style,
    inputs.mode,
  );
}

export const candidateNameOf = (lookup: Lookup, candidate: string) => lookup.candidateName.get(candidate) ?? candidate;

export function unionOf(first: [number, number], second?: [number, number]): [number, number] {
  return second ? [Math.min(first[0], second[0]), Math.max(first[1], second[1])] : first;
}

export interface ValueAxis {
  extent: [number, number];
  logScale: boolean;
  startsAtZero: boolean;
  /** That the axis is fitted to the values, or on a log scale, and why, for the how-to-read line. */
  note: string;
}

/**
 * The axis of a metric's values: from zero, unless the block asks for an axis fitted to the values (with its reason),
 * then wide enough that a difference too small to matter cannot fill it; or the powers of ten of a log scale.
 */
export function valueAxisOf(inputs: ChartInputs, metric: Metric, plotted: number[], drawsBars: boolean): ValueAxis {
  const { block } = inputs;
  const isLog = block.scale?.type === "log";

  if (isLog && drawsBars) throw new ChartError("V9", `block "${block.id}": a log scale has no zero, so it cannot carry bars`);

  if (isLog && plotted.some((value) => value <= 0))
    throw new ChartError("V9", `block "${block.id}": a log scale only shows values above zero`);

  if (drawsBars && block.scale?.zero === false)
    throw new ChartError("D1", `block "${block.id}": bars start at zero; remove scale.zero, or use dot-interval`);

  const dataExtent: [number, number] = [Math.min(...plotted), Math.max(...plotted)];
  const largest = Math.max(...plotted.map(Math.abs));
  const meaningfulInUnits = metric.compare_as === "relative" ? (metric.minimum_meaningful / 100) * largest : metric.minimum_meaningful;
  // Results are read against zero; an axis fitted to the values is the exception, and says why (D2, V8).
  const startsAtZero = !isLog && (drawsBars || block.scale?.zero !== false);
  const ownExtent: [number, number] = isLog
    ? dataExtent
    : startsAtZero
      ? [Math.min(0, dataExtent[0]), Math.max(0, dataExtent[1])]
      : extentAroundData(dataExtent, meaningfulInUnits);
  const reason = block.scale?.reason ? sentence(block.scale.reason) : "";
  const fittedNote = reason
    ? `The axis is fitted to the values rather than drawn from zero: ${reason}`
    : "The axis is fitted to the values rather than drawn from zero, so that the candidates can be told apart.";

  return {
    extent: unionOf(ownExtent, inputs.sharedExtent),
    logScale: isLog,
    startsAtZero,
    note: isLog ? `The axis is on a log scale: ${reason}` : startsAtZero ? "" : fittedNote,
  };
}
