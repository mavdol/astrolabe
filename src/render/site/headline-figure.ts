import type { Comparison, Metric, Value } from "../../schema/benchmark.js";
import { valuesDrawnFromZero } from "../card.js";
import { withUnit } from "../chart/chart-content.js";
import { labelDecimals, type Lookup } from "../describe.js";
import { formatNumber } from "../number-format.js";
import { escapeHtml } from "./html.js";

const round = (value: number) => String(Math.round(value * 10) / 10);

const STRIP_WIDTH = 460;
const STRIP_PADDING = 0.08;
const TRACK_Y = 20;
const LABEL_Y = 50;

/** The tone of a verdict, for its colour: always beside the verdict in words. */
export function toneOf(comparison: Comparison): "good" | "bad" | "neutral" {
  if (comparison.verdict === "better") return "good";

  return comparison.verdict === "worse" ? "bad" : "neutral";
}

/**
 * The effect on its own scale: zero, the band of differences too small to matter, the interval and the
 * estimate. The scale always holds zero, the whole band and the whole interval, so a large effect looks large.
 */
function effectStrip(metric: Metric, comparison: Comparison): string {
  const minimum = metric.minimum_meaningful;
  const measured = comparison.source !== "declared" && comparison.ci ? comparison.ci : undefined;
  const [low, high] = measured ? [Math.min(...measured), Math.max(...measured)] : [comparison.effect, comparison.effect];
  const lowest = Math.min(-minimum, low, 0);
  const highest = Math.max(minimum, high, 0);
  const padding = (highest - lowest) * STRIP_PADDING;
  const position = (effect: number) => ((effect - lowest + padding) / (highest - lowest + 2 * padding)) * STRIP_WIDTH;
  const unit = metric.compare_as === "relative" ? "%" : "";
  const bandEdge = (value: number) => `${formatNumber(value, null, { signed: true })}${unit}`;
  const zero = position(0);
  const marks = [
    `<rect class="band" x="${round(position(-minimum))}" y="6" width="${round(position(minimum) - position(-minimum))}" height="28"/>`,
    `<path class="track" d="M0 ${TRACK_Y}H${STRIP_WIDTH}"/>`,
    `<path class="zero" d="M${round(zero)} 2V38"/>`,
    `<g data-grow-from="${round(zero)}">`,
    `<path class="stem" d="M${round(zero)} ${TRACK_Y}H${round(position(comparison.effect))}"/>`,
    measured
      ? `<path class="interval" d="M${round(position(low))} ${TRACK_Y}H${round(position(high))}M${round(position(low))} ${TRACK_Y - 6}V${TRACK_Y + 6}M${round(position(high))} ${TRACK_Y - 6}V${TRACK_Y + 6}"/>`
      : "",
    "</g>",
    `<g data-pop=""><circle class="halo" cx="${round(position(comparison.effect))}" cy="${TRACK_Y}" r="10"/><circle class="dot" cx="${round(position(comparison.effect))}" cy="${TRACK_Y}" r="5"/></g>`,
    `<text x="${round(zero)}" y="${LABEL_Y}" text-anchor="middle">0</text>`,
    `<text x="${round(position(-minimum))}" y="${LABEL_Y}" text-anchor="middle">${escapeHtml(bandEdge(-minimum))}</text>`,
    `<text x="${round(position(minimum))}" y="${LABEL_Y}" text-anchor="middle">${escapeHtml(bandEdge(minimum))}</text>`,
  ];

  return `<svg class="micro strip ${toneOf(comparison)}" viewBox="0 0 ${STRIP_WIDTH} 56" aria-hidden="true">${marks.join("")}</svg>`;
}

const BAR_ROW = 26;
const BAR_HEIGHT = 12;
const NAME_WIDTH = 96;
const VALUE_WIDTH = 96;

/** A relative change as the two values it compares, on one axis from zero: a ratio is seen, not read. */
function valuesFromZero(metric: Metric, rows: { name: string; candidate: string; value: Value; role: "subject" | "baseline" }[]): string {
  const largest = Math.max(...rows.map((row) => row.value.value));
  const barRoom = STRIP_WIDTH - NAME_WIDTH - VALUE_WIDTH;
  const marks = rows.map((row, index) => {
    const top = 4 + index * BAR_ROW;
    const width = largest > 0 ? (row.value.value / largest) * barRoom : 0;
    const shown = withUnit(formatNumber(row.value.value, labelDecimals(metric, row.value)), metric.unit);

    return [
      `<text class="name" x="0" y="${top + 11}">${escapeHtml(row.name)}</text>`,
      `<g data-grow-from="${NAME_WIDTH}"><rect class="bar ${row.role}" data-candidate="${escapeHtml(row.candidate)}" x="${NAME_WIDTH}" y="${top + 1}" width="${round(Math.max(width, 1))}" height="${BAR_HEIGHT}" rx="2"/></g>`,
      `<text x="${round(NAME_WIDTH + width + 8)}" y="${top + 11}">${escapeHtml(shown)}</text>`,
    ].join("");
  });

  return `<svg class="micro values" viewBox="0 0 ${STRIP_WIDTH} ${8 + rows.length * BAR_ROW}" aria-hidden="true">${marks.join("")}<path class="zero" d="M${NAME_WIDTH} 2V${2 + rows.length * BAR_ROW}"/></svg>`;
}

/**
 * The drawing under a headline figure: for a change in percent, the two values it compares from zero;
 * for a difference, the effect on its strip. The figure and the words above say the same in text.
 */
export function headlineFigure(lookup: Lookup, comparison: Comparison): string {
  const metric = lookup.metricById.get(comparison.metric)!;
  const fromZero = valuesDrawnFromZero(lookup, comparison);

  if (fromZero)
    return valuesFromZero(
      metric,
      fromZero.map(({ candidate, value }, index) => ({
        name: lookup.candidateName.get(candidate)!,
        candidate,
        value,
        role: index === 0 ? "subject" : "baseline",
      })),
    );

  return effectStrip(metric, comparison);
}
