import { quantileSorted } from "../../compute/stats.js";
import type { Comparison, Value } from "../../schema/benchmark.js";
import { THEME } from "../../themes/astrolabe.js";
import {
  effectAndInterval,
  effectUnit,
  finestDecimals,
  lowerFirstLetterOfWord,
  STATISTIC_WORD,
  valueDecimals,
  verdictLabel,
} from "../describe.js";
import { formatInterval, formatLevel, formatNumber, type Decimals } from "../number-format.js";
import {
  candidateNameOf,
  comparisonsOn,
  directionWords,
  failureSentences,
  intervalSentence,
  levelsOf,
  rangeOf,
  sentence,
  seriesOf,
  statisticWord,
  unionOf,
  valueAxisOf,
  type ChartContent,
  type ChartInputs,
} from "./chart-content.js";
import {
  candidateOrder,
  ChartError,
  comparisonGroupsOf,
  metricOf,
  nodesOf,
  observationsOf,
  valueGroupsOf,
  type ValueGroup,
} from "./chart-data.js";
import { rowsPlot, type Box, type PlotGroup, type PlotRow } from "./rows-plot.js";

/** Bars side by side stop being told apart beyond the ink and three greys. */
const LARGEST_GROUPED_BAR_CANDIDATES = THEME.light.series.length;
/** Up to this many observations a row shows every one; beyond, a box and the observations outside it. */
const EVERY_OBSERVATION_UP_TO = 20;
const BOX_REACH = 1.5;
const PARTS_THAT_ADD_UP_TOLERANCE = 1e-4;

const hasHeadings = (groups: { heading?: string }[]) => groups.some((group) => group.heading);

function valueTable(inputs: ChartInputs, groups: ValueGroup[], decimals: Decimals | null) {
  const metric = metricOf(inputs.block, inputs.lookup);
  const withGroup = hasHeadings(groups);

  return {
    header: [...(withGroup ? ["Group"] : []), "Candidate", `${STATISTIC_WORD[metric.statistic]} (${metric.unit})`, "Interval", "n"],
    rows: groups.flatMap((group) =>
      group.values.map((value: Value) => [
        ...(withGroup ? [group.heading ?? ""] : []),
        candidateNameOf(inputs.lookup, value.candidate),
        `${formatNumber(value.value, decimals)}${value.source === "declared" ? " (declared)" : ""}`,
        value.ci ? `${formatInterval(value.ci, decimals)} (${formatLevel(value.ci_level!)}%)` : "—",
        String(value.n ?? "—"),
      ]),
    ),
  };
}

/** Bars, bars in groups, or dots with their intervals: one value per candidate and node. */
export function valuesContent(inputs: ChartInputs): ChartContent {
  const { block, lookup } = inputs;
  const metric = metricOf(block, lookup);

  if (block.chart === "bar" && block.breakdown)
    throw new ChartError("V1", `block "${block.id}": a bar chart shows one node; for a breakdown use grouped-bar or dot-interval`);

  if (block.chart === "grouped-bar" && !block.breakdown)
    throw new ChartError("V1", `block "${block.id}": a grouped-bar chart compares candidates across a level: set breakdown, or use bar`);

  const groups = valueGroupsOf(block, inputs.benchmark, lookup, inputs.filterState);
  const values = groups.flatMap((group) => group.values);
  const drawsBars = block.chart === "bar" || block.chart === "grouped-bar";
  const candidatesShown = new Set(values.map((value) => value.candidate)).size;

  if (block.chart === "grouped-bar" && candidatesShown > LARGEST_GROUPED_BAR_CANDIDATES)
    throw new ChartError(
      "V1",
      `block "${block.id}": beyond ${LARGEST_GROUPED_BAR_CANDIDATES} candidates, bars in groups can no longer be told apart; use dot-interval`,
    );

  if (drawsBars && values.some((value) => value.value < 0))
    throw new ChartError("D1", `block "${block.id}": a bar starts at zero, so it cannot show a negative value; use dot-interval`);

  const series = seriesOf(inputs);
  const decimals = finestDecimals(values.map((value) => valueDecimals(metric, value)));
  const axis = valueAxisOf(
    inputs,
    metric,
    values.flatMap((value) => [value.value, ...(value.ci ?? [])]),
    drawsBars,
  );
  const plotGroups: PlotGroup[] = groups.map((group) => ({
    heading: group.heading,
    rows: group.values.map((value) => ({
      label: candidateNameOf(lookup, value.candidate),
      key: `${group.node ?? ""}|${value.candidate}`,
      candidate: value.candidate,
      series: series.get(value.candidate)!,
      value: value.value,
      interval: value.ci,
      valueText: formatNumber(value.value, decimals),
      note: value.source === "declared" ? "declared" : undefined,
    })),
  }));
  const observations = values.filter((value) => value.n !== undefined).map((value) => value.n!);
  const howToRead = [
    inputs.compact ? "" : sentence(metric.definition),
    `Each ${drawsBars ? "bar" : "dot"}: the ${statisticWord(metric)}${observations.length > 0 ? ` of ${rangeOf(observations)} observations` : ""}, in ${metric.unit}; ${directionWords(metric)}.`,
    intervalSentence(values),
    axis.note,
    failureSentences(metric, comparisonsOn(metric, lookup)),
  ]
    .filter(Boolean)
    .join(" ");

  return {
    plot: rowsPlot({
      groups: plotGroups,
      mark: drawsBars ? "bar" : "dot",
      extent: axis.extent,
      logScale: axis.logScale,
      tickText: (value, tickDecimals) => formatNumber(value, tickDecimals),
      betterSide: metric.direction === "lower" ? "left" : "right",
    }),
    subtitle: `${metric.label}, ${statisticWord(metric)} in ${metric.unit} · ${directionWords(metric)}${axis.logScale ? " · log scale" : ""}`,
    howToRead,
    kind: `${drawsBars ? "Bar chart" : "Dot chart with intervals"} of ${lowerFirstLetterOfWord(metric.label)}`,
    table: valueTable(inputs, groups, decimals),
    axisExtent: axis.extent,
  };
}

/** The change of each candidate against the baseline, with its interval and the band of changes too small to matter. */
export function effectsContent(inputs: ChartInputs): ChartContent {
  const { block, lookup } = inputs;
  const metric = metricOf(block, lookup);

  if (block.scale?.type === "log")
    throw new ChartError("V9", `block "${block.id}": an effect can be negative, so it cannot be drawn on a log scale`);

  const groups = comparisonGroupsOf(block, inputs.benchmark, lookup, inputs.filterState);
  const comparisons = groups.flatMap((group) => group.comparisons);
  const series = seriesOf(inputs);
  const unit = effectUnit(metric);
  const minimum = metric.minimum_meaningful;
  const comparedCandidates = [...new Set(comparisons.map((comparison) => comparison.candidate))];
  const onlyCandidate = comparedCandidates.length === 1 && groups.length > 1 ? candidateNameOf(lookup, comparedCandidates[0]) : undefined;
  const plotted = comparisons.flatMap((comparison) => [comparison.effect, ...(comparison.ci ?? [])]);
  const baselineName = candidateNameOf(lookup, lookup.results.baseline);
  const noteOf = (comparison: Comparison) =>
    [verdictLabel(comparison), comparison.role === "exploratory" ? "exploratory" : "", comparison.source === "declared" ? "declared" : ""]
      .filter(Boolean)
      .join(", ");
  const rowOf = (comparison: Comparison, label: string): PlotRow => ({
    label,
    key: `${comparison.node ?? ""}|${comparison.candidate}`,
    candidate: comparison.candidate,
    series: series.get(comparison.candidate)!,
    value: comparison.effect,
    interval: comparison.ci,
    valueText: effectAndInterval(metric, comparison).effect,
    note: noteOf(comparison),
  });
  const plotGroups: PlotGroup[] = onlyCandidate
    ? [{ rows: groups.map((group) => rowOf(group.comparisons[0], group.heading!)) }]
    : groups.map((group) => ({
        heading: group.heading,
        rows: group.comparisons.map((comparison) => rowOf(comparison, candidateNameOf(lookup, comparison.candidate))),
      }));
  const levels = levelsOf(comparisons);
  const everyComparisonAdjusted = comparisons.every((comparison) => comparison.adjusted);
  const primaryComparisons = lookup.results.computed!.primary_comparisons;
  const adjustment = everyComparisonAdjusted && primaryComparisons > 1 ? `, adjusted for ${primaryComparisons} primary comparisons` : "";
  const hasExploratory = comparisons.some((comparison) => comparison.role === "exploratory");
  const howToRead = [
    inputs.compact ? "" : sentence(metric.definition),
    `Each dot: the change ${onlyCandidate ? `of ${onlyCandidate} ` : ""}against ${baselineName}, ${metric.compare_as === "relative" ? "in percent of its value" : `in ${unit.trim()}`}; ${directionWords(metric)}.`,
    levels ? `Lines: ${levels} confidence intervals${adjustment}.` : "No interval: too few observations, or declared values.",
    `Shaded band: changes under ${formatNumber(minimum, null)}${unit}, too small to matter.`,
    hasExploratory ? "Exploratory comparisons were not declared before measuring: none is a claim of the benchmark." : "",
    failureSentences(metric, comparisons),
  ]
    .filter(Boolean)
    .join(" ");
  const extent = unionOf([Math.min(-minimum, ...plotted), Math.max(minimum, ...plotted)], inputs.sharedExtent);
  const withGroup = hasHeadings(groups);

  return {
    plot: rowsPlot({
      groups: plotGroups,
      mark: "dot",
      extent,
      tickText: (value, tickDecimals: Decimals) => `${formatNumber(value, tickDecimals, { signed: true })}${unit === "%" ? "%" : ""}`,
      band: [-minimum, minimum],
      zeroLine: true,
      betterSide: metric.direction === "lower" ? "left" : "right",
    }),
    subtitle: `${metric.label}: change ${onlyCandidate ? `of ${onlyCandidate} ` : ""}against ${baselineName}${unit === "%" ? ", in %" : `, in${unit}`} · ${directionWords(metric)}`,
    howToRead,
    kind: `Effects on ${lowerFirstLetterOfWord(metric.label)} against ${baselineName}, with their intervals`,
    table: {
      header: [...(withGroup ? ["Group"] : []), "Candidate", "Effect", "Interval", "Verdict"],
      rows: groups.flatMap((group) =>
        group.comparisons.map((comparison) => {
          const { effect, interval, level } = effectAndInterval(metric, comparison);

          return [
            ...(withGroup ? [group.heading ?? ""] : []),
            candidateNameOf(lookup, comparison.candidate),
            effect,
            interval ? `${interval} (${level})` : "—",
            noteOf(comparison),
          ];
        }),
      ),
    },
    axisExtent: extent,
  };
}

function boxOf(sorted: number[]): { box: Box; outside: number[] } {
  const [firstQuartile, thirdQuartile] = [quantileSorted(sorted, 0.25), quantileSorted(sorted, 0.75)];
  const reach = BOX_REACH * (thirdQuartile - firstQuartile);
  const isInside = (value: number) => value >= firstQuartile - reach && value <= thirdQuartile + reach;
  const inside = sorted.filter(isInside);

  return {
    box: { quartiles: [firstQuartile, thirdQuartile], whiskers: [inside[0], inside[inside.length - 1]] },
    outside: sorted.filter((value) => !isInside(value)),
  };
}

/** Every observation of each candidate, or a box with the observations outside it, and the summary the benchmark computed. */
export function distributionContent(inputs: ChartInputs): ChartContent {
  const { block, lookup } = inputs;
  const metric = metricOf(block, lookup);
  const groups = valueGroupsOf(block, inputs.benchmark, lookup, inputs.filterState);
  const series = seriesOf(inputs);
  const values = groups.flatMap((group) => group.values);
  const decimals = finestDecimals(values.map((value) => valueDecimals(metric, value)));
  const observed = groups.map((group) => observationsOf(block, metric, group.node, lookup, inputs.rawFiles));
  const sortedOf = (groupIndex: number, candidate: string) =>
    [...(observed[groupIndex].get(candidate)?.values ?? [])].sort((first, second) => first - second);
  const plotted: number[] = values.flatMap((value) => [value.value, ...(value.ci ?? [])]);
  const tableRows: string[][] = [];
  let showsEveryObservation = false;
  let showsBoxes = false;

  const plotGroups: PlotGroup[] = groups.map((group, groupIndex) => ({
    heading: group.heading,
    rows: group.values.map((value) => {
      const sorted = sortedOf(groupIndex, value.candidate);

      if (sorted.length === 0)
        throw new ChartError("V1", `block "${block.id}": the raw file has no observation of "${value.candidate}" for "${metric.id}"`);

      plotted.push(sorted[0], sorted[sorted.length - 1]);

      const isFew = sorted.length <= EVERY_OBSERVATION_UP_TO;
      const { box, outside } = isFew ? { box: undefined, outside: sorted } : boxOf(sorted);

      showsEveryObservation ||= isFew;
      showsBoxes ||= !isFew;
      tableRows.push([
        ...(hasHeadings(groups) ? [group.heading ?? ""] : []),
        candidateNameOf(lookup, value.candidate),
        formatNumber(value.value, decimals),
        value.ci ? `${formatInterval(value.ci, decimals)} (${formatLevel(value.ci_level!)}%)` : "—",
        box ? formatInterval(box.quartiles, decimals) : "—",
        formatInterval([sorted[0], sorted[sorted.length - 1]], decimals),
        String(sorted.length),
      ]);

      return {
        label: candidateNameOf(lookup, value.candidate),
        key: `${group.node ?? ""}|${value.candidate}`,
        candidate: value.candidate,
        series: series.get(value.candidate)!,
        value: value.value,
        interval: value.ci,
        points: outside,
        box,
        valueText: formatNumber(value.value, decimals),
      };
    }),
  }));
  const axis = valueAxisOf(inputs, metric, plotted, false);
  const counts = plotGroups.flatMap((group, groupIndex) =>
    group.rows.map((_row, rowIndex) => sortedOf(groupIndex, groups[groupIndex].values[rowIndex].candidate).length),
  );
  const failedAttempts = observed.reduce(
    (total, byCandidate) => total + [...byCandidate.values()].reduce((sum, entry) => sum + entry.failedAttempts, 0),
    0,
  );
  const howToRead = [
    inputs.compact ? "" : sentence(metric.definition),
    `Each row: the ${rangeOf(counts)} observations of a candidate, in ${metric.unit}; ${directionWords(metric)}.`,
    showsEveryObservation ? "Dots: every observation." : "",
    showsBoxes
      ? `Box: the middle half of the observations; its line reaches the furthest observation within ${BOX_REACH} box widths, and dots beyond it are single observations.`
      : "",
    `Thick tick: the ${statisticWord(metric)}.`,
    intervalSentence(values, "Black line"),
    axis.note,
    failedAttempts > 0 ? `${failedAttempts} failed attempts are not drawn.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    plot: rowsPlot({
      groups: plotGroups,
      mark: "distribution",
      extent: axis.extent,
      logScale: axis.logScale,
      tickText: (value, tickDecimals) => formatNumber(value, tickDecimals),
      betterSide: metric.direction === "lower" ? "left" : "right",
    }),
    subtitle: `${metric.label}, every observation in ${metric.unit} · ${directionWords(metric)}${axis.logScale ? " · log scale" : ""}`,
    howToRead,
    kind: `Distribution of ${lowerFirstLetterOfWord(metric.label)} for each candidate`,
    table: {
      header: [
        ...(hasHeadings(groups) ? ["Group"] : []),
        "Candidate",
        `${STATISTIC_WORD[metric.statistic]} (${metric.unit})`,
        "Interval",
        "Middle half",
        "Range",
        "Observations",
      ],
      rows: tableRows,
    },
    axisExtent: axis.extent,
  };
}

/** One bar per candidate, split into the parts of its total. */
export function stackedContent(inputs: ChartInputs): ChartContent {
  const { block, lookup } = inputs;
  const metric = metricOf(block, lookup);
  const colours = THEME[inputs.mode];

  if (metric.statistic !== "total")
    throw new ChartError("V52", `block "${block.id}": a stacked bar shows the parts of one total, and "${metric.id}" is not a total`);

  if (!block.breakdown)
    throw new ChartError("V52", `block "${block.id}": a stacked bar needs a breakdown, the level whose nodes are the parts of the total`);

  const parts = nodesOf(block, inputs.benchmark, lookup, inputs.filterState);

  if (parts.length > colours.series.length)
    throw new ChartError(
      "V52",
      `block "${block.id}": ${parts.length} parts cannot be told apart in one bar; group them into ${colours.series.length} at most`,
    );

  const wholeNode = block.node ?? lookup.results.structure!.nodes.find((node) => node.parent === undefined)!.id;
  const valueOf = (candidate: string, node: string | undefined) =>
    (lookup.results.values ?? []).find((value) => value.metric === metric.id && value.node === node && value.candidate === candidate);
  const candidates = lookup.results.candidates.map((candidate) => candidate.id).filter((candidate) => valueOf(candidate, wholeNode));

  if (candidates.length === 0) throw new ChartError("V1", `block "${block.id}" has no total of "${metric.id}" to show`);

  const totals = candidates.map((candidate) => valueOf(candidate, wholeNode)!);
  const shown = candidateOrder(block, metric, lookup, totals).filter((candidate) => candidates.includes(candidate));
  const partColours = new Map(parts.map((part, index) => [part, colours.series[index]]));
  const decimals = finestDecimals(totals.map((value) => valueDecimals(metric, value)));
  const series = seriesOf(inputs);
  const rows: PlotRow[] = shown.map((candidate) => {
    const total = valueOf(candidate, wholeNode)!;
    const partValues = parts.map((part) => {
      const value = valueOf(candidate, part);

      if (!value) throw new ChartError("V52", `block "${block.id}": "${candidate}" has no value on the part "${part}"`);

      if (value.value < 0) throw new ChartError("D1", `block "${block.id}": a part of a stacked bar cannot be negative`);

      return value.value;
    });
    const sum = partValues.reduce((first, second) => first + second, 0);
    const showsEveryPart = (block.filters ?? []).length === 0;

    if (showsEveryPart && Math.abs(sum - total.value) > PARTS_THAT_ADD_UP_TOLERANCE * Math.max(1, Math.abs(total.value)))
      throw new ChartError("V52", `block "${block.id}": the parts of "${candidate}" add up to ${sum}, not to its total ${total.value}`);

    return {
      label: candidateNameOf(lookup, candidate),
      key: candidate,
      candidate,
      series: series.get(candidate)!,
      value: total.value,
      interval: total.ci,
      segments: partValues.map((value, index) => ({ value, colour: partColours.get(parts[index])! })),
      valueText: formatNumber(total.value, decimals),
    };
  });
  const axis = valueAxisOf(
    inputs,
    metric,
    rows.flatMap((row) => [row.value, ...(row.interval ?? [])]),
    true,
  );
  const partLabel = (part: string | undefined) => lookup.nodeLabel.get(part!) ?? part!;
  const howToRead = [
    inputs.compact ? "" : sentence(metric.definition),
    `Each bar: the total of a candidate in ${metric.unit}, split into its parts in the order of the legend; ${directionWords(metric)}.`,
    intervalSentence(totals, "Lines").replace("confidence intervals", "confidence intervals of the total"),
    failureSentences(metric, comparisonsOn(metric, lookup)),
  ]
    .filter(Boolean)
    .join(" ");

  return {
    plot: rowsPlot({
      groups: [{ rows }],
      mark: "stack",
      extent: axis.extent,
      tickText: (value, tickDecimals) => formatNumber(value, tickDecimals),
      betterSide: metric.direction === "lower" ? "left" : "right",
      legend: parts.map((part) => ({ label: partLabel(part), colour: partColours.get(part)! })),
    }),
    subtitle: `${metric.label}, total in ${metric.unit} by ${lowerFirstLetterOfWord(block.breakdown)} · ${directionWords(metric)}`,
    howToRead,
    kind: `Stacked bars of ${lowerFirstLetterOfWord(metric.label)}, split by ${lowerFirstLetterOfWord(block.breakdown)}`,
    table: {
      header: ["Candidate", ...parts.map(partLabel), `Total (${metric.unit})`, "Interval"],
      rows: rows.map((row, index) => {
        const total = valueOf(shown[index], wholeNode)!;

        return [
          row.label,
          ...row.segments!.map((segment) => formatNumber(segment.value, decimals)),
          row.valueText,
          total.ci ? `${formatInterval(total.ci, decimals)} (${formatLevel(total.ci_level!)}%)` : "—",
        ];
      }),
    },
    axisExtent: axis.extent,
  };
}
