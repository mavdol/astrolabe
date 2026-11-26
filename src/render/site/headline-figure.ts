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
/** A band edge closer to zero than this share of the strip leaves its label out, so it never sits on the zero's. */
const LEAST_LABEL_GAP = 0.12;

const percentAlong = (x: number) => `${Math.round((x / STRIP_WIDTH) * 1000) / 10}%`;

/** The tone of a verdict, for its colour: always beside the verdict in words. */
export function toneOf(comparison: Comparison): "good" | "bad" | "neutral" {
  if (comparison.verdict === "better") return "good";

  return comparison.verdict === "worse" ? "bad" : "neutral";
}

/**
 * The effect on its own scale: zero, the band of differences too small to matter, the interval and the
 * estimate. The scale always holds zero, the whole band and the whole interval, so a large effect looks large.
 * The marks scale with the column; the labels under them are text of the page, at its size.
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
  ];
  const farEnoughFromZero = (value: number) => Math.abs(position(value) - zero) >= LEAST_LABEL_GAP * STRIP_WIDTH;
  const labels = [
    { at: zero, text: "0" },
    ...[-minimum, minimum].filter(farEnoughFromZero).map((value) => ({ at: position(value), text: bandEdge(value) })),
  ];

  return [
    `<div class="micro strip ${toneOf(comparison)}" aria-hidden="true">`,
    `<svg viewBox="0 0 ${STRIP_WIDTH} 40" aria-hidden="true">${marks.join("")}</svg>`,
    `<div class="strip-labels">${labels.map((label) => `<span style="left: ${percentAlong(label.at)}">${escapeHtml(label.text)}</span>`).join("")}</div>`,
    "</div>",
  ].join("");
}

/**
 * A relative change as the two values it compares, on one axis from zero: a ratio is seen, not read. Names and
 * values are text of the page, so they keep its size in a narrow column; a long name wraps instead of being cut.
 */
function valuesFromZero(metric: Metric, rows: { name: string; candidate: string; value: Value; role: "subject" | "baseline" }[]): string {
  const largest = Math.max(...rows.map((row) => row.value.value));
  const cells = rows.map((row) => {
    const share = largest > 0 ? (row.value.value / largest) * 100 : 0;
    const shown = withUnit(formatNumber(row.value.value, labelDecimals(metric, row.value)), metric.unit);

    return [
      `<span class="name">${escapeHtml(row.name)}</span>`,
      `<span class="track"><span class="bar ${row.role}" data-candidate="${escapeHtml(row.candidate)}" data-grow-from="0" style="width: ${round(Math.max(share, 0.5))}%"></span></span>`,
      `<span class="value">${escapeHtml(shown)}</span>`,
    ].join("");
  });

  return `<div class="micro values" aria-hidden="true">${cells.join("")}</div>`;
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
