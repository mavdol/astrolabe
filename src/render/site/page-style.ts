import type { Style } from "../../schema/presentation.js";
import { THEME, type Colours } from "../../themes/astrolabe.js";

export const FONT_WEIGHTS = [400, 500, 600, 700] as const;
export const fontFileOf = (weight: number) => `inter-latin-${weight}-normal.woff`;

const coloursOf = (colours: Colours) =>
  [
    `--background: ${colours.background};`,
    `--ink: ${colours.ink};`,
    `--secondary: ${colours.secondary};`,
    `--rule: ${colours.rule};`,
    `--band: ${colours.band};`,
    `--surface: ${colours.surface};`,
  ].join(" ");

/** The page's stylesheet, from the same theme as the charts: one place for every colour. */
export function pageStyle(style: Style | undefined): string {
  const mode = style?.mode ?? "auto";
  const fontFaces = FONT_WEIGHTS.map(
    (weight) =>
      `@font-face { font-family: Inter; font-style: normal; font-weight: ${weight}; font-display: swap; src: url("fonts/${fontFileOf(weight)}") format("woff"); }`,
  );
  const palette =
    mode === "auto"
      ? [
          `:root { color-scheme: light dark; ${coloursOf(THEME.light)} }`,
          `@media (prefers-color-scheme: dark) { :root { ${coloursOf(THEME.dark)} } }`,
          '[data-mode="dark"] { display: none; }',
          '@media (prefers-color-scheme: dark) { [data-mode="light"] { display: none; } [data-mode="dark"] { display: block; } }',
        ]
      : [`:root { color-scheme: ${mode}; ${coloursOf(THEME[mode])} }`];

  return [...fontFaces, ...palette, PAGE_RULES].join("\n");
}

/** The width of the page; panels and charts are drawn to fit inside it. */
export const PAGE_WIDTH = 960;
export const PANEL_PADDING = 24;
export const COLUMN_GAP = 16;
/** Below this width the page is a single column, and charts switch to their narrow version. */
const SINGLE_COLUMN_BELOW = 880;
const NARROW_BELOW = 560;

const CARD_RADIUS = 12;
const CONTROL_RADIUS = 8;

/** Cards share the charts' background, so every contrast checked for a chart holds on the page. */
const PAGE_RULES = `
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--background); color: var(--ink); font: 400 15px/1.55 Inter, system-ui, sans-serif; font-feature-settings: "cv11", "ss01"; }
a { color: inherit; text-decoration-thickness: 1px; text-underline-offset: 3px; }
:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
p { margin: 0 0 12px; }
ul { margin: 0 0 12px; padding-left: 18px; }
code { font-size: 13px; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
h1, h2, h3, h4 { font-weight: 600; letter-spacing: -0.01em; }
p, li { text-wrap: pretty; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

.label { font-size: 11px; line-height: 16px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--secondary); }

main { max-width: ${PAGE_WIDTH + 48}px; margin: 0 auto; padding: 0 24px 48px; }
.hero { max-width: 820px; padding: 72px 0 48px; }
.hero h1 { font-size: 48px; line-height: 1.04; letter-spacing: -0.035em; margin: 16px 0 20px; text-wrap: balance; }
.hero .lede { font-size: 16px; color: var(--secondary); margin: 0 0 16px; max-width: 680px; }
.hero .answer { font-size: 18px; line-height: 1.5; font-weight: 500; letter-spacing: -0.01em; margin: 0; max-width: 680px; }

.row { display: grid; grid-template-columns: repeat(var(--columns, 1), minmax(0, 1fr)); align-items: start; gap: ${COLUMN_GAP}px; margin: 0 0 ${COLUMN_GAP}px; }
.row.stats { align-items: stretch; }
.block { min-width: 0; scroll-margin-top: 24px; }
.stat, .panel, .trust { background: var(--background); border: 1px solid var(--rule); border-radius: ${CARD_RADIUS}px; }

.stat { display: flex; flex-direction: column; padding: 20px ${PANEL_PADDING}px 24px; }
.stat-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 0 0 16px; }
.stat h2 { font-size: 15px; line-height: 1.4; font-weight: 500; margin: 0 0 12px; }
.stat h2 a { text-decoration: none; }
.figure { font-size: 52px; line-height: 1; font-weight: 600; letter-spacing: -0.04em; font-variant-numeric: tabular-nums; margin: 0 0 12px; }
.details { list-style: none; padding: 0; margin: 0; font-size: 13px; color: var(--secondary); }
.details .warning { color: var(--ink); font-weight: 600; }
.verdict { display: inline-block; white-space: nowrap; border: 1px solid var(--ink); border-radius: 999px; padding: 2px 10px; font-size: 11px; line-height: 16px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
.verdict.firm { background: var(--ink); color: var(--background); }

.panel { overflow: hidden; }
.panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 20px ${PANEL_PADDING}px 0; }
.panel-head h2 { font-size: 18px; line-height: 1.3; letter-spacing: -0.015em; margin: 4px 0 0; }
.panel-head h2 a { text-decoration: none; }
.icon-button { flex: none; display: inline-grid; place-items: center; width: 32px; height: 32px; border: 1px solid var(--rule); border-radius: ${CONTROL_RADIUS}px; color: var(--secondary); }
.icon-button:hover { color: var(--ink); background: var(--surface); }
.icon-button svg { width: 16px; height: 16px; }
.icon-button .done, .icon-button.is-done .ready { display: none; }
.icon-button.is-done .done { display: block; }
.panel-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 24px; padding: 16px ${PANEL_PADDING}px 0; }
.panel-body { padding: 16px ${PANEL_PADDING}px 0; }
.reading { font-size: 15px; margin: 0 0 16px; }
.chart-subtitle { margin: 0 0 16px; font-size: 13px; color: var(--secondary); }
.panel-foot { margin: 20px 0 0; font-size: 12px; line-height: 1.5; color: var(--secondary); }
.panel-data { margin: 4px -${PANEL_PADDING}px 0; }
.panel-data summary { cursor: pointer; padding: 8px ${PANEL_PADDING}px 18px; list-style-position: inside; }
.panel-data summary:hover { color: var(--ink); }
.panel-data .description { padding: 0 ${PANEL_PADDING}px; font-size: 13px; color: var(--secondary); }
.panel.table .panel-body .table-scroll { margin: 0 -${PANEL_PADDING}px; }
.panel-data .table-scroll { margin: 12px 0 0; }
figure { margin: 0; }
svg { display: block; max-width: 100%; height: auto; overflow: visible; }

.segmented { border: 0; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.segmented legend { float: left; padding: 0; }
.segmented .track { display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 3px; border-radius: 999px; background: var(--surface); }
.segmented label { position: relative; cursor: pointer; }
.segmented input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; }
.segmented span { display: inline-block; padding: 4px 14px; border-radius: 999px; font-size: 13px; line-height: 18px; font-weight: 500; color: var(--secondary); }
.segmented label:hover span { color: var(--ink); }
.segmented input:checked + span { background: var(--ink); color: var(--background); }
.segmented input:focus-visible + span { outline: 2px solid var(--ink); outline-offset: 2px; }
.segmented[hidden], [data-static-state][hidden] { display: none; }

.table-scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 13px; font-variant-numeric: tabular-nums; }
caption { text-align: left; padding: 0 ${PANEL_PADDING}px 12px; }
th, td { padding: 10px 12px; border-bottom: 1px solid var(--rule); vertical-align: top; text-align: right; }
tbody tr:last-child th, tbody tr:last-child td { border-bottom: 0; }
th:first-child, td:first-child { padding-left: ${PANEL_PADDING}px; }
th:last-child, td:last-child { padding-right: ${PANEL_PADDING}px; }
thead th { background: var(--surface); font-size: 11px; line-height: 16px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--secondary); white-space: nowrap; border-top: 1px solid var(--rule); }
th[scope="row"], thead th:first-child, .text { text-align: left; }
th[scope="row"] { font-weight: 500; }
td:not(.text) { white-space: nowrap; }
tbody tr:hover { background: var(--surface); }
.cell-detail { display: block; color: var(--secondary); font-size: 12px; white-space: nowrap; }

.row:not(:has(> .trust)) + .row:has(> .trust) { margin-top: 48px; }
.trust { padding: 24px ${PANEL_PADDING}px 12px; }
.trust h2 { font-size: 18px; letter-spacing: -0.015em; margin: 0 0 12px; }
.trust h2 a { text-decoration: none; }
.trust h3 { font-size: 15px; margin: 28px 0 8px; }
.trust h4 { font-size: 13px; margin: 16px 0 4px; }
.trust .table-scroll { margin: 0 -${PANEL_PADDING}px 16px; }
.trust .hash { margin: 0 0 12px; }
.prose { max-width: 760px; padding: 16px 0; }
.prose h2 { font-size: 22px; margin: 0 0 12px; }

footer a { text-decoration: none; }
footer a:hover { text-decoration: underline; }
.footer-inner { max-width: ${PAGE_WIDTH + 48}px; margin: 0 auto; padding: 8px 24px 48px; }

[data-width="narrow"] { display: none; }
[data-candidate] { transition: opacity 150ms ease; }
.is-dimmed { opacity: 0.2; }

@media (max-width: ${SINGLE_COLUMN_BELOW}px) {
  .row { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: ${NARROW_BELOW}px) {
  main { padding: 0 12px 40px; }
  .footer-inner { padding-left: 12px; padding-right: 12px; }
  .hero { padding: 40px 4px 32px; }
  .hero h1 { font-size: 32px; }
  .hero .answer { font-size: 16px; }
  .stat, .trust { padding-left: 16px; padding-right: 16px; }
  .panel-head, .panel-tools, .panel-body { padding-left: 16px; padding-right: 16px; }
  .panel-data summary, .panel-data .description { padding-left: 16px; padding-right: 16px; }
  .panel-data, .panel.table .panel-body .table-scroll, .trust .table-scroll { margin-left: -16px; margin-right: -16px; }
  th:first-child, td:first-child { padding-left: 16px; }
  th:last-child, td:last-child { padding-right: 16px; }
  [data-width="wide"] { display: none; }
  [data-width="narrow"] { display: block; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
@media print { .panel-tools, .icon-button { display: none; } }
`;
