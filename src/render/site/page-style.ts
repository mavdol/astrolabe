import type { Style } from "../../schema/presentation.js";
import { THEME, type Colours } from "../../themes/astrolabe.js";

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
 * The page's stylesheet, from the same theme as the charts: one place for every colour. In auto mode
 * the page follows the reader's system until the reader picks a theme with the switch.
 */
export function pageStyle(style: Style | undefined): string {
  const mode = style?.mode ?? "auto";
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
          `:root { color-scheme: light; ${coloursOf(THEME.light)} }`,
          `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme: dark; ${coloursOf(THEME.dark)} } }`,
          `:root[data-theme="dark"] { color-scheme: dark; ${coloursOf(THEME.dark)} }`,
          '[data-mode="dark"], .when-dark { display: none; }',
          '@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) :is([data-mode="light"], .when-light) { display: none; } :root:not([data-theme="light"]) :is([data-mode="dark"], .when-dark) { display: block; } }',
          ':root[data-theme="dark"] :is([data-mode="light"], .when-light) { display: none; } :root[data-theme="dark"] :is([data-mode="dark"], .when-dark) { display: block; }',
        ]
      : [`:root { color-scheme: ${mode}; ${coloursOf(THEME[mode])} }`];

  return [...fontFaces, ...palette, PAGE_RULES].join("\n");
}

/** The width of the page's frame; charts are drawn to fit inside it. */
export const PAGE_WIDTH = 1180;
export const CHAPTER_HEAD_WIDTH = 360;
export const GUTTER = 40;
/** Below this width the page is a single column, and charts switch to their narrow version. */
const SINGLE_COLUMN_BELOW = 980;
const NARROW_BELOW = 560;

const MONO = '"Geist Mono", ui-monospace, monospace';
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

const PAGE_RULES = `
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; scroll-padding-top: 72px; }
body { margin: 0; overflow-x: clip; background: var(--background); color: var(--ink); font: 400 15px/1.55 Inter, system-ui, sans-serif; font-feature-settings: "cv11", "ss01", "ss03"; -webkit-font-smoothing: antialiased; transition: background-color 300ms, color 300ms; }
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

.frame { position: relative; max-width: ${PAGE_WIDTH}px; margin: 0 auto; border-left: 1px solid var(--rule); border-right: 1px solid var(--rule); }
main > section + section { border-top: 1px solid var(--rule); }

.nav { position: sticky; top: 0; z-index: 10; background: color-mix(in srgb, var(--background) 80%, transparent); backdrop-filter: blur(14px) saturate(1.4); -webkit-backdrop-filter: blur(14px) saturate(1.4); border-bottom: 1px solid transparent; transition: border-color 300ms; }
.nav.is-scrolled { border-bottom-color: var(--rule); }
.nav-inner { display: flex; align-items: center; gap: 24px; height: 64px; padding: 0 ${GUTTER}px; border-color: transparent; }
.brand { display: flex; align-items: baseline; gap: 12px; font-family: ${MONO}; font-size: 13px; text-decoration: none; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.nav-links { display: flex; gap: 28px; margin-left: auto; font-size: 14px; color: var(--secondary); }
.nav-links a { text-decoration: none; }
.nav-links a:hover { color: var(--ink); }
.theme-switch { display: inline-grid; place-items: center; width: 36px; height: 36px; padding: 0; border: 1px solid var(--rule-strong); border-radius: 8px; background: transparent; color: var(--secondary); cursor: pointer; }
.nav-links + .theme-switch { margin-left: 0; }
.brand + .theme-switch, .brand + .button { margin-left: auto; }
.theme-switch:hover { color: var(--ink); }
.theme-switch svg { width: 16px; height: 16px; }
.button { flex: none; display: inline-flex; align-items: center; height: 36px; padding: 0 16px; border-radius: 8px; background: var(--ink); color: var(--background); font-size: 14px; font-weight: 500; text-decoration: none; transition: transform 200ms ${EASE_OUT}; }
.button:hover { transform: translateY(-1px); }

.hero { padding: 96px ${GUTTER}px 72px; }
.hero h1 { max-width: 900px; margin: 28px 0 0; font-size: clamp(34px, 4.6vw, 56px); line-height: 1.05; letter-spacing: -0.035em; text-wrap: balance; }
.hero .scope { color: var(--quiet); }
.hero .answer { max-width: 760px; margin: 28px 0 0; font-size: 19px; line-height: 1.5; letter-spacing: -0.01em; color: var(--secondary); }

.stats { display: grid; grid-template-columns: repeat(var(--columns, 1), minmax(0, 1fr)); }
.stat { min-width: 0; padding: 32px ${GUTTER}px 36px; }
.stat + .stat { border-left: 1px solid var(--rule); }
.figure-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 16px; margin: 28px 0 18px; }
.figure { margin: 0; font-size: clamp(56px, 7vw, 88px); line-height: 0.9; font-weight: 500; letter-spacing: -0.055em; font-variant-numeric: tabular-nums; white-space: nowrap; }
.figure small { margin-left: 10px; font-size: 22px; letter-spacing: -0.01em; font-weight: 400; color: var(--secondary); }
.stat h2 { margin: 18px 0 8px; font-size: 15px; line-height: 1.4; }
.stat h2 a, .chapter-head h2 a { text-decoration: none; }
.details { font-family: ${MONO}; font-size: 12px; line-height: 18px; color: var(--secondary); }
.details .warning { color: var(--ink); }
.chip { display: inline-flex; align-items: center; gap: 8px; height: 26px; padding: 0 10px; border: 1px solid var(--rule-strong); border-radius: 6px; font-family: ${MONO}; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; color: var(--secondary); }
.chip::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.chip.good { color: var(--good); border-color: color-mix(in srgb, var(--good) 40%, transparent); }
.chip.bad { color: var(--bad); border-color: color-mix(in srgb, var(--bad) 40%, transparent); }

.micro { display: block; width: 100%; height: auto; overflow: visible; color: var(--secondary); }
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
.micro .bar { fill: var(--ink); }
.micro .bar.baseline { fill: var(--quiet); }

.chapter, .trust-section { display: grid; grid-template-columns: ${CHAPTER_HEAD_WIDTH}px minmax(0, 1fr); }
.chapter-head { padding: 48px ${GUTTER}px; border-right: 1px solid var(--rule); }
.chapter-label { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.chapter-head h2 { margin: 28px 0 0; font-size: 26px; line-height: 1.18; letter-spacing: -0.025em; text-wrap: balance; }
.chapter-head .reading { color: var(--secondary); }
.chapter-tools { display: flex; flex-wrap: wrap; gap: 8px 16px; margin: 28px 0 0; }
.chapter-body { min-width: 0; padding: 56px ${GUTTER}px 40px; }
.chapter-body figure { margin: 0; }
.chapter-body svg { display: block; max-width: 100%; height: auto; overflow: visible; }
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
.value-table .cell-value { font-family: ${MONO}; font-weight: 500; font-size: 14px; }
.cell-bar { position: relative; display: block; width: 100%; min-width: 120px; height: 10px; margin: 6px 0 4px; background: linear-gradient(var(--rule-strong), var(--rule-strong)) center / 100% 1px no-repeat; color: var(--ink); }
.cell-bar.baseline { color: var(--quiet); }
.cell-bar::before { content: ""; position: absolute; top: 3px; left: var(--from); width: calc(var(--to) - var(--from)); height: 4px; border-radius: 2px; background: currentColor; opacity: 0.45; }
.cell-bar::after { content: ""; position: absolute; top: 1px; left: var(--at); width: 8px; height: 8px; margin-left: -4px; border-radius: 50%; background: currentColor; }

.trust-body { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 0; }
.trust-body > .block { min-width: 0; padding: 32px ${GUTTER}px; border-bottom: 1px solid var(--rule); }
.trust-body > .methodology, .trust-body > .provenance, .trust-body > .block:last-child:nth-child(odd) { grid-column: 1 / -1; }
.trust-body > .environment + .limitations { border-left: 1px solid var(--rule); }
.trust-body > .block:last-child { border-bottom: 0; }
.trust-body > .methodology { padding: 0; }
.pipeline { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); margin: 0; padding: 48px ${GUTTER}px 40px; list-style: none; counter-reset: step; }
.pipeline li { position: relative; padding: 0 28px 0 0; }
.pipeline li:not(:last-child)::after { content: ""; position: absolute; top: 17px; right: 8px; width: 14px; height: 1px; background: var(--rule-strong); }
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
.provenance p { max-width: 760px; font-size: 14px; }
.hash { margin: 16px 0; }

.footer { padding: 28px ${GUTTER}px 72px; border-top: 1px solid var(--rule); }
.footer .mono-label { display: flex; flex-wrap: wrap; gap: 8px 28px; }
.footer a { text-decoration: none; }
.footer a:hover { color: var(--ink); }

[data-width="narrow"] { display: none; }
[data-candidate] { transition: opacity 150ms ease; }
.is-dimmed { opacity: 0.2; }

.motion :is(.hero > *, .stat, .chapter-head > *, .chapter-body, .trust-body > .block):not(.is-in) { opacity: 0; transform: translateY(16px); filter: blur(6px); animation: appear 0s 4s forwards; }
.motion :is(.hero > *, .stat, .chapter-head > *, .chapter-body, .trust-body > .block) { transition: opacity 900ms ${EASE_OUT}, transform 900ms ${EASE_OUT}, filter 900ms ${EASE_OUT}; transition-delay: var(--delay, 0ms); }
@keyframes appear { to { opacity: 1; transform: none; filter: none; } }

@media (max-width: ${SINGLE_COLUMN_BELOW}px) {
  .chapter, .trust-section, .stats { grid-template-columns: minmax(0, 1fr); }
  .chapter-head { border-right: 0; border-bottom: 1px solid var(--rule); padding-bottom: 32px; }
  .stat + .stat { border-left: 0; border-top: 1px solid var(--rule); }
  .nav-links { display: none; }
  .brand + .theme-switch, .brand + .button { margin-left: auto; }
  .theme-switch { margin-left: auto; }
  .theme-switch + .button { margin-left: 0; }
}
@media (max-width: ${NARROW_BELOW}px) {
  .hero, .stat, .chapter-head, .chapter-body, .trust-body > .block, .pipeline, .verdicts, .fact, .footer, .nav-inner { padding-left: 20px; padding-right: 20px; }
  .hero { padding-top: 56px; padding-bottom: 48px; }
  .hero .answer { font-size: 17px; }
  .button { padding: 0 12px; }
  .trust-body, .facts { grid-template-columns: minmax(0, 1fr); }
  .trust-body > .environment + .limitations { border-left: 0; }
  .fact:nth-child(odd) { border-right: 0; }
  .verdict-list li { grid-template-columns: minmax(0, 1fr) auto; }
  .verdict-list .interval { grid-column: 1 / -1; grid-row: 2; }
  .pipeline { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px 0; }
  .pipeline li::after { display: none; }
  [data-width="wide"] { display: none; }
  [data-width="narrow"] { display: block; }
}
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } *, *::before, *::after { animation: none !important; transition: none !important; } }
@media print { .nav, .chapter-tools, .icon-button { display: none; } .motion * { opacity: 1 !important; transform: none !important; filter: none !important; } }
`;
