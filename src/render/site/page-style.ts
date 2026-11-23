import type { Style } from "../../schema/presentation.js";
import { seriesStylesOf, THEME, type Colours, type Mode } from "../../themes/astrolabe.js";

const INTER_WEIGHTS = [400, 500, 600, 700] as const;
const MONO_WEIGHTS = [400, 500] as const;
const interFileOf = (weight: number) => `inter-latin-${weight}-normal.woff`;
const monoFileOf = (weight: number) => `geist-mono-latin-${weight}-normal.woff2`;

/** Every file the site copies into its fonts folder: the faces, then their licences. */
export const FONT_FILES = [...INTER_WEIGHTS.map(interFileOf), ...MONO_WEIGHTS.map(monoFileOf), "OFL.txt", "OFL-Geist.txt"];

const coloursOf = (colours: Colours) =>
  [
    `--background: ${colours.background};`,
    `--ink: ${colours.ink};`,
    `--secondary: ${colours.secondary};`,
    `--quiet: ${colours.quiet};`,
    `--rule: ${colours.rule};`,
    `--rule-strong: ${colours.ruleStrong};`,
    `--band: ${colours.band};`,
    `--surface: ${colours.surface};`,
    `--good: ${colours.good};`,
    `--bad: ${colours.bad};`,
  ].join(" ");

/**
 * The page's stylesheet, from the same theme as the charts: one place for every colour. The file sets
 * the mode: dark by default, light, or auto to follow the reader's system.
 */
export function pageStyle(style: Style | undefined, candidateIds: string[] = []): string {
  const mode = style?.mode ?? "dark";
  /** Each candidate's colour, the same as on its charts, for the marks the page draws itself: table bars, keys. */
  const seriesOf = (colourMode: Mode) =>
    [...seriesStylesOf(candidateIds, style, colourMode).entries()]
      .map(([candidate, series]) => `[data-candidate="${candidate}"] { --series: ${series.colour}; }`)
      .join(" ");
  const fontFaces = [
    ...INTER_WEIGHTS.map(
      (weight) =>
        `@font-face { font-family: Inter; font-style: normal; font-weight: ${weight}; font-display: swap; src: url("fonts/${interFileOf(weight)}") format("woff"); }`,
    ),
    ...MONO_WEIGHTS.map(
      (weight) =>
        `@font-face { font-family: "Geist Mono"; font-style: normal; font-weight: ${weight}; font-display: swap; src: url("fonts/${monoFileOf(weight)}") format("woff2"); }`,
    ),
  ];
  const palette =
    mode === "auto"
      ? [
          `:root { color-scheme: light dark; ${coloursOf(THEME.light)} }`,
          seriesOf("light"),
          `@media (prefers-color-scheme: dark) { :root { ${coloursOf(THEME.dark)} } ${seriesOf("dark")} }`,
          '[data-mode="dark"] { display: none; }',
          '@media (prefers-color-scheme: dark) { [data-mode="light"] { display: none; } [data-mode="dark"] { display: block; } }',
        ]
      : [`:root { color-scheme: ${mode}; ${coloursOf(THEME[mode])} }`, seriesOf(mode)];

  return [...fontFaces, ...palette.filter(Boolean), PAGE_RULES].join("\n");
}

/** The width of the page's frame; charts are drawn to fit inside it. */
export const PAGE_WIDTH = 1180;
export const CHAPTER_HEAD_WIDTH = 360;
export const GUTTER = 40;
/** The column of the ruler, left of the frame, on screens wide enough to hold it and the frame side by side. */
const RAIL_WIDTH = 240;
const RAIL_FROM = 1400;
/** Below this width the page is a single column, and charts switch to their narrow version. */
const SINGLE_COLUMN_BELOW = 980;
const NARROW_BELOW = 560;

const MONO = '"Geist Mono", ui-monospace, monospace';
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const ARRIVING = ".hero > :not(h1), .stat, .chapter-head > *, .chapter-body, .trust-body > .block";

const PAGE_RULES = `
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; scroll-padding-top: 24px; }
body { margin: 0; overflow-x: clip; background: var(--background); color: var(--ink); font: 400 15px/1.55 Inter, system-ui, sans-serif; font-feature-settings: "cv11", "ss01", "ss03"; -webkit-font-smoothing: antialiased; }
a { color: inherit; text-decoration-thickness: 1px; text-underline-offset: 3px; }
:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
p { margin: 0 0 12px; }
ul { margin: 0; padding: 0; list-style: none; }
code { font-family: ${MONO}; font-size: 12px; overflow-wrap: anywhere; }
h1, h2, h3 { font-weight: 500; margin: 0; }
p, li { text-wrap: pretty; }
.dim { color: var(--secondary); }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.good { color: var(--good); }
.bad { color: var(--bad); }

.label, .mono-label { font-family: ${MONO}; font-size: 12px; line-height: 16px; font-weight: 400; letter-spacing: 0.04em; text-transform: uppercase; color: var(--secondary); }
.mono-label { margin: 0; }
.mono-label .dim { color: var(--quiet); }
.tick-mark { position: relative; display: inline-block; vertical-align: middle; width: 18px; height: 1px; margin: 0 10px 2px 0; background: var(--quiet); }
.tick-mark::after { content: ""; position: absolute; right: -2px; top: -2px; width: 5px; height: 5px; border-radius: 50%; background: var(--secondary); }

.layout { max-width: ${PAGE_WIDTH}px; margin: 0 auto; }
.sheet { min-width: 0; border-left: 1px solid var(--rule); border-right: 1px solid var(--rule); }
main > section + section { border-top: 1px solid var(--rule); }

.rail { display: none; }
.rail-inner { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; justify-content: center; gap: 7px; padding-left: 20px; }
.rail-ticks i { display: block; width: 14px; height: 1px; background: var(--rule-strong); transition: width 300ms ${EASE_OUT}, background-color 300ms; }
.rail-group { position: relative; display: block; width: 24px; color: var(--secondary); text-decoration: none; }
.rail-group::before { content: ""; position: absolute; inset: -4px -8px; }
.rail-group:focus-visible { outline-offset: 5px; }
.rail-ticks { display: grid; gap: 7px; }
.rail-label { position: absolute; top: 50%; left: 36px; width: max-content; max-width: ${RAIL_WIDTH - 20 - 36 - 16}px; font-family: ${MONO}; font-size: 10px; line-height: 14px; letter-spacing: 0.02em; text-transform: uppercase; text-wrap: balance; opacity: 0; transform: translate(-4px, -50%); transition: opacity 300ms, transform 400ms ${EASE_OUT}; pointer-events: none; }
.rail-label .dim { color: var(--quiet); }
.rail-group:is(:hover, :focus-visible) .rail-ticks i, .rail-group.is-here .rail-ticks i { width: 18px; background: var(--secondary); }
.rail-group.is-here .rail-ticks i:nth-child(2) { width: 24px; background: var(--ink); }
.rail-group:is(:hover, :focus-visible, .is-here) .rail-label { opacity: 1; transform: translate(0, -50%); }
@media (min-width: ${RAIL_FROM}px) {
  .layout { display: grid; grid-template-columns: ${RAIL_WIDTH}px minmax(0, ${PAGE_WIDTH}px); max-width: ${PAGE_WIDTH + RAIL_WIDTH + 48}px; padding: 0 24px; }
  .rail { display: block; }
}

.hero { padding: 72px ${GUTTER}px 80px; }
/* Groups separated by a dot drawn in the gap; a group that starts a line leaves its dot outside, clipped. */
.hero-label { display: flex; flex-wrap: wrap; gap: 4px 22px; overflow: hidden; }
.hero-label > span { position: relative; white-space: nowrap; }
.hero-label > span + span::before { content: ""; position: absolute; top: 50%; left: -12px; width: 2px; height: 2px; margin-top: -1px; border-radius: 50%; background: var(--quiet); }
.hero .benchmark-name, .hero .benchmark-version { letter-spacing: 0; text-transform: none; }
.hero .benchmark-name { color: var(--ink); }
.hero .benchmark-version { color: var(--quiet); }
.hero h1 { max-width: 18.5em; margin: 28px 0 0; font-size: clamp(34px, 4.4vw, 54px); line-height: 1.06; letter-spacing: -0.038em; text-wrap: balance; }
.hero .question { color: var(--quiet); }
.hero .answer { color: var(--ink); }
.hero .lede { max-width: 680px; margin: 28px 0 0; font-size: 16px; line-height: 1.55; color: var(--secondary); }

.stats { display: grid; grid-template-columns: repeat(var(--columns, 1), minmax(0, 1fr)); }
.stat { min-width: 0; padding: 32px ${GUTTER}px 36px; }
.stat + .stat { border-left: 1px solid var(--rule); }
.figure-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 16px; margin: 28px 0 18px; }
.figure { margin: 0; font-size: clamp(56px, 7vw, 88px); line-height: 0.9; font-weight: 500; letter-spacing: -0.055em; font-variant-numeric: tabular-nums; white-space: nowrap; }
.figure small { margin-left: 10px; font-size: 22px; letter-spacing: -0.01em; font-weight: 400; color: var(--secondary); }
.figure small.percent { margin-left: 3px; }
.stat h2 { margin: 18px 0 8px; font-size: 15px; line-height: 1.4; }
.stat h2 a, .chapter-head h2 a { text-decoration: none; }
.details { font-family: ${MONO}; font-size: 12px; line-height: 18px; color: var(--secondary); }
.micro + .details { margin-top: 22px; }
.details .warning { color: var(--ink); }
.chip { display: inline-flex; align-items: center; gap: 8px; height: 26px; padding: 0 10px; border: 1px solid var(--rule-strong); border-radius: 6px; font-family: ${MONO}; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; color: var(--secondary); }
.verdict-squares { display: grid; grid-template-columns: repeat(var(--squares, 12), minmax(0, 22px)); gap: 5px; margin: 30px 0 16px; color: var(--secondary); }
.verdict-squares span { aspect-ratio: 1; border: 1.5px solid currentColor; border-radius: 4px; }
.verdict-squares .firm { background: currentColor; }
.verdict-squares .neutral.firm { opacity: 0.55; }
.verdict-counts { margin: 0; font-family: ${MONO}; font-size: 13px; line-height: 20px; color: var(--secondary); }
.verdict-counts > span { white-space: nowrap; }
.chip::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.chip.good { color: var(--good); border-color: color-mix(in srgb, var(--good) 40%, transparent); }
.chip.bad { color: var(--bad); border-color: color-mix(in srgb, var(--bad) 40%, transparent); }

.micro { display: block; width: 100%; max-width: 520px; height: auto; overflow: visible; color: var(--secondary); }
.micro .band { fill: var(--band); }
.micro .track { stroke: var(--rule-strong); }
.micro .zero { stroke: var(--secondary); }
.micro .stem { stroke: currentColor; stroke-opacity: 0.4; }
.micro .interval { stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; fill: none; }
.micro .dot { fill: currentColor; stroke: var(--background); stroke-width: 1.5; }
.micro .halo { fill: currentColor; fill-opacity: 0.16; }
.micro.good { color: var(--good); }
.micro.bad { color: var(--bad); }
.micro text { font-family: ${MONO}; font-size: 11px; fill: var(--secondary); }
.micro .name { fill: var(--ink); font-family: Inter, system-ui, sans-serif; font-size: 13px; font-weight: 500; }
.micro .bar { fill: var(--series, var(--ink)); }

.chapter, .trust-section { display: grid; grid-template-columns: ${CHAPTER_HEAD_WIDTH}px minmax(0, 1fr); }
.chapter-head { padding: 48px ${GUTTER}px; border-right: 1px solid var(--rule); }
.chapter-label { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.chapter-head h2 { margin: 28px 0 0; font-size: 28px; line-height: 1.18; letter-spacing: -0.025em; text-wrap: balance; }
.chapter-head .reading { color: var(--secondary); }
.chapter-tools { display: flex; flex-wrap: wrap; gap: 8px 16px; margin: 28px 0 0; }
.chapter-body { min-width: 0; padding: 56px ${GUTTER}px 40px; }
.chapter-body figure { margin: 0; }
.chapter-body svg { display: block; max-width: 100%; height: auto; overflow: visible; }
.chapter-body figure svg[role="img"] { width: 100%; }
.how-to-read { margin: 24px 0 0; padding: 14px 0 0; border-top: 1px dashed var(--rule-strong); font-family: ${MONO}; font-size: 12px; line-height: 18px; color: var(--secondary); }
.how-to-read p { margin: 10px 0 0; }
.chart-key { display: flex; flex-wrap: wrap; gap: 8px 28px; }
.chart-key li { display: flex; align-items: center; gap: 10px; max-width: 100%; }
.key-mark { flex: none; width: 18px; height: 12px; overflow: visible; }
.key-fill { fill: var(--ink); }
.key-stroke { fill: none; stroke: var(--ink); stroke-width: 1.5; }
.key-dashed { stroke: var(--secondary); stroke-dasharray: 3 3; }
.key-band { fill: var(--rule-strong); }
.chart-data { margin: 12px 0 0; }
.chart-data summary, .aside summary { cursor: pointer; width: fit-content; font-family: ${MONO}; font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--secondary); }
.chart-data summary:hover, .aside summary:hover { color: var(--ink); }
.chart-data .description { margin: 12px 0; font-size: 13px; color: var(--secondary); }
.icon-button { flex: none; display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 6px; color: var(--quiet); opacity: 0; transition: opacity 200ms; }
.chapter:hover .icon-button, .icon-button:focus-visible, .icon-button.is-done { opacity: 1; }
@media (hover: none) { .icon-button { opacity: 1; } }
.icon-button:hover { color: var(--ink); background: var(--surface); }
.icon-button svg { width: 14px; height: 14px; }
.icon-button .done, .icon-button.is-done .ready { display: none; }
.icon-button.is-done .done { display: block; }
.prose { max-width: 720px; font-size: 16px; }

.segmented { border: 0; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.segmented legend { float: left; padding: 0; }
.segmented .track { display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 3px; border: 1px solid var(--rule-strong); border-radius: 9px; }
.segmented label { position: relative; cursor: pointer; }
.segmented input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; }
.segmented span { display: inline-block; padding: 4px 12px; border-radius: 6px; font-size: 13px; line-height: 18px; color: var(--secondary); transition: background-color 200ms, color 200ms; }
.segmented label:hover span { color: var(--ink); }
.segmented input:checked + span { background: var(--surface); color: var(--ink); box-shadow: inset 0 0 0 1px var(--rule-strong); }
.segmented input:focus-visible + span { outline: 2px solid var(--ink); outline-offset: 2px; }
.segmented[hidden], [data-static-state][hidden] { display: none; }

.table-scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 13px; font-variant-numeric: tabular-nums; }
th, td { padding: 12px; border-bottom: 1px solid var(--rule); vertical-align: middle; text-align: right; }
th:first-child, td:first-child { padding-left: 0; }
th:last-child, td:last-child { padding-right: 0; }
thead th { font-family: ${MONO}; font-size: 11px; line-height: 16px; font-weight: 400; letter-spacing: 0.05em; text-transform: uppercase; color: var(--secondary); white-space: nowrap; }
th[scope="row"], thead th:first-child, .text { text-align: left; }
th[scope="row"] { font-weight: 500; }
td:not(.text) { white-space: nowrap; }
.cell-detail { display: block; color: var(--secondary); font-family: ${MONO}; font-size: 11px; white-space: nowrap; }
.value-table td, .value-table th { text-align: left; }
.value-table .cell-detail { margin-top: 4px; white-space: normal; min-width: 160px; }
.value-table thead th[data-candidate]::before { content: ""; display: inline-block; width: 8px; height: 8px; margin-right: 8px; border-radius: 50%; background: var(--series, var(--ink)); }
.cell-line { display: flex; align-items: center; gap: 10px; }
.effects-table thead td { border: 0; }
.effects-table thead th[scope="colgroup"] { font-family: ${MONO}; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; font-weight: 400; color: var(--secondary); }
.effects-table .effect-cell { color: var(--secondary); }
.effects-table .effect-cell.good { color: var(--good); }
.effects-table .effect-cell.bad { color: var(--bad); }
.effects-table .effect-cell .cell-value { min-width: 52px; color: inherit; }
.effects-table .cell-detail { min-width: 0; white-space: nowrap; }
.effects-table .cell-detail.dim { margin-top: 2px; color: var(--quiet); }
.effect-bar { position: relative; flex: 0 0 56px; height: 10px; background: linear-gradient(var(--rule-strong), var(--rule-strong)) 50% 0 / 1px 100% no-repeat; }
.effect-bar i { position: absolute; top: 2px; height: 6px; border-radius: 1px; background: currentColor; opacity: 0.85; }
.effect-cell:not(.firm) .effect-bar i { opacity: 0.45; }
.effect-verdict { font-family: ${MONO}; font-size: 12px; white-space: nowrap; }
.table-note { margin: 14px 0 0; font-family: ${MONO}; font-size: 12px; line-height: 18px; color: var(--secondary); }
.value-table .cell-value { min-width: 44px; font-family: ${MONO}; font-weight: 500; font-size: 14px; }
.cell-ci { font-family: ${MONO}; font-size: 12px; color: var(--quiet); white-space: nowrap; }
.cell-bar { position: relative; flex: 1 1 110px; min-width: 90px; max-width: 160px; height: 10px; background: linear-gradient(var(--rule-strong), var(--rule-strong)) center / 100% 1px no-repeat; color: var(--series, var(--ink)); }
.cell-bar::before { content: ""; position: absolute; top: 3px; left: var(--from); width: calc(var(--to) - var(--from)); height: 4px; border-radius: 2px; background: currentColor; opacity: 0.45; }
.cell-bar::after { content: ""; position: absolute; top: 1px; left: var(--at); width: 8px; height: 8px; margin-left: -4px; border-radius: 50%; background: currentColor; }

.trust-body { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 0; }
.trust-body > .block { min-width: 0; padding: 32px ${GUTTER}px; border-bottom: 1px solid var(--rule); }
.trust-body > .methodology, .trust-body > .text { grid-column: 1 / -1; }
.trust-body > .environment + .limitations { border-left: 1px solid var(--rule); }
.trust-body > .block:is(.environment, .limitations) { border-bottom: 0; }
.trust-body > .methodology { padding: 0; }
.pipeline { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); margin: 0; padding: 48px ${GUTTER}px 40px; list-style: none; }
.pipeline li { position: relative; padding: 0 28px 0 0; }
.step-link { position: absolute; top: 17px; right: 6px; width: 20px; height: 1px; overflow: hidden; background: var(--rule-strong); }
.step-link::after { content: ""; position: absolute; top: -1px; left: -6px; width: 6px; height: 3px; border-radius: 2px; background: var(--ink); animation: flow 2.4s ${EASE_OUT} infinite; animation-delay: calc(var(--step) * 0.4s); }
@keyframes flow { to { left: 100%; } }
.step-figure { margin: 0; font-size: 34px; line-height: 1; letter-spacing: -0.04em; font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap; }
.step-figure small { display: block; margin-top: 10px; font-family: ${MONO}; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--secondary); white-space: normal; }
.step-note { margin: 10px 0 0; font-size: 13px; line-height: 1.45; color: var(--secondary); }
.verdicts { padding: 32px ${GUTTER}px; border-top: 1px solid var(--rule); }
.verdicts .mono-label { margin: 0 0 8px; }
.verdict-list + .aside, .verdict-list + .aside-note { margin: 14px 0 28px; }
.verdict-list li { display: grid; grid-template-columns: minmax(0, 1fr) 120px 210px 140px; align-items: center; gap: 4px 12px; padding: 12px 0; border-bottom: 1px solid var(--rule); font-size: 14px; }
.verdict-list .effect, .verdict-list .interval { font-family: ${MONO}; font-size: 13px; font-variant-numeric: tabular-nums; }
.verdict-list .interval { color: var(--secondary); }
.verdict-list .chip { justify-self: start; }
.verdict-list .notes { grid-column: 1 / -1; font-size: 12px; color: var(--secondary); }
.aside p { margin: 10px 0 0; font-size: 13px; color: var(--secondary); max-width: 720px; }
.aside-note { font-size: 13px; color: var(--secondary); max-width: 720px; }
.facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-top: 1px solid var(--rule); }
.fact { min-width: 0; margin: 0; padding: 24px ${GUTTER}px; border-bottom: 1px solid var(--rule); }
.fact:nth-child(odd) { border-right: 1px solid var(--rule); }
.fact:last-child:nth-child(odd) { grid-column: 1 / -1; border-right: 0; }
.fact dt, .fact-title { margin: 0 0 10px; font-family: ${MONO}; font-size: 11px; font-weight: 400; letter-spacing: 0.06em; text-transform: uppercase; color: var(--secondary); }
.fact dd { margin: 0 0 4px; font-size: 14px; overflow-wrap: anywhere; }
.fact dd.dim { font-size: 13px; }
.fact-lines li { margin: 0 0 6px; font-size: 14px; overflow-wrap: anywhere; }

.footer { padding: 28px ${GUTTER}px 72px; border-top: 1px solid var(--rule); }
.footer-line { display: flex; flex-wrap: wrap; gap: 8px 24px; margin: 0; font-family: ${MONO}; font-size: 12px; line-height: 16px; color: var(--secondary); }
.footer-line .credit { margin-left: auto; }
.footer a { text-decoration: none; }
.footer a:hover { color: var(--ink); }

[data-width="narrow"] { display: none; }
[data-candidate] { transition: opacity 150ms ease; }
.is-dimmed { opacity: 0.2; }

.motion :is(${ARRIVING}):not(.is-in) { opacity: 0; transform: translateY(16px); filter: blur(6px); animation: appear 0s 4s forwards; }
.motion :is(${ARRIVING}) { transition: opacity 900ms ${EASE_OUT}, transform 900ms ${EASE_OUT}, filter 900ms ${EASE_OUT}; transition-delay: var(--delay, 0ms); }
.motion .hero h1:not(.is-split) { opacity: 0; animation: appear 0s 4s forwards; }
.motion .hero h1 .word { display: inline-block; transition: opacity 900ms ${EASE_OUT}, transform 900ms ${EASE_OUT}, filter 900ms ${EASE_OUT}; transition-delay: calc(var(--word) * 38ms + 150ms); }
.motion .hero h1:not(.is-in) .word { opacity: 0; transform: translateY(0.35em); filter: blur(10px); animation: appear 0s 4s forwards; }
@keyframes appear { to { opacity: 1; transform: none; filter: none; } }

@media (max-width: ${SINGLE_COLUMN_BELOW}px) {
  .chapter, .trust-section, .stats { grid-template-columns: minmax(0, 1fr); }
  .chapter-head { border-right: 0; border-bottom: 1px solid var(--rule); padding-bottom: 32px; }
  .stat + .stat { border-left: 0; border-top: 1px solid var(--rule); }
}
@media (max-width: ${NARROW_BELOW}px) {
  .hero, .stat, .chapter-head, .chapter-body, .trust-body > .block, .pipeline, .verdicts, .fact, .footer { padding-left: 20px; padding-right: 20px; }
  .hero { padding-top: 56px; padding-bottom: 48px; }
  .trust-body, .facts { grid-template-columns: minmax(0, 1fr); }
  .trust-body > .environment + .limitations { border-left: 0; }
  .fact:nth-child(odd) { border-right: 0; }
  .verdict-list li { grid-template-columns: minmax(0, 1fr) auto; }
  .verdict-list .interval { grid-column: 1 / -1; grid-row: 2; }
  .pipeline { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px 0; }
  .step-link { display: none; }
  [data-width="wide"] { display: none; }
  [data-width="narrow"] { display: block; }
}
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } *, *::before, *::after { animation: none !important; transition: none !important; } }
@media print { .rail, .chapter-tools, .icon-button { display: none; } .motion * { opacity: 1 !important; transform: none !important; filter: none !important; } }
`;
