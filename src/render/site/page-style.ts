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

.label { font-size: 11px; line-height: 16px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--secondary); }

.top-bar { border-bottom: 1px solid var(--rule); }
.top-bar-inner { max-width: ${PAGE_WIDTH + 48}px; margin: 0 auto; padding: 12px 24px; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.top-bar a { text-decoration: none; }
.top-bar a:hover { text-decoration: underline; }

main { max-width: ${PAGE_WIDTH + 48}px; margin: 0 auto; padding: 0 24px 64px; }
.hero { max-width: 760px; padding: 56px 0 40px; }
.hero h1 { font-size: 40px; line-height: 1.12; letter-spacing: -0.02em; margin: 12px 0 12px; }
.hero .lede { font-size: 17px; color: var(--ink); margin: 16px 0 8px; }
.hero .answer { font-size: 15px; color: var(--secondary); margin: 0; }

.row { display: grid; grid-template-columns: repeat(var(--columns, 1), minmax(0, 1fr)); align-items: start; gap: ${COLUMN_GAP}px; margin: 0 0 ${COLUMN_GAP}px; }
.row.stats { gap: 0; align-items: stretch; margin-bottom: 32px; }
.row.stats > .stat + .stat { border-left: 0; }
.block { min-width: 0; scroll-margin-top: 24px; }

.stat { border: 1px solid var(--rule); display: flex; flex-direction: column; }
.stat-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 20px; border-bottom: 1px solid var(--rule); background: var(--surface); }
.stat-body { padding: 20px; }
.stat h2 { font-size: 15px; line-height: 1.4; margin: 0 0 8px; }
.stat h2 a { text-decoration: none; }
.figure { font-size: 44px; line-height: 1.05; font-weight: 600; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; margin: 4px 0 12px; }
.details { list-style: none; padding: 0; margin: 0; font-size: 13px; color: var(--secondary); }
.details .warning { color: var(--ink); font-weight: 600; }
.verdict { display: inline-block; white-space: nowrap; border: 1px solid var(--ink); padding: 1px 8px; font-size: 11px; line-height: 16px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
.verdict.firm { background: var(--ink); color: var(--background); }

.panel { border: 1px solid var(--rule); background: var(--background); }
.panel-head { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 14px ${PANEL_PADDING}px 12px; border-bottom: 1px solid var(--rule); }
.panel-head h2 { font-size: 16px; line-height: 1.35; margin: 0; }
.panel-head h2 a { text-decoration: none; }
.panel-link { flex: none; text-decoration: none; }
.panel-link:hover { color: var(--ink); }
.panel-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 24px; padding: 8px ${PANEL_PADDING}px; border-bottom: 1px solid var(--rule); background: var(--surface); }
.panel-body { padding: 20px ${PANEL_PADDING}px 0; }
.reading { font-size: 15px; margin: 0 0 16px; }
.chart-subtitle { margin: 0 0 12px; font-size: 13px; font-weight: 500; color: var(--secondary); }
.panel-foot { margin: 20px -${PANEL_PADDING}px 0; padding: 12px ${PANEL_PADDING}px; border-top: 1px solid var(--rule); background: var(--surface); font-size: 12px; line-height: 1.5; color: var(--secondary); }
.panel-data { margin: 0 -${PANEL_PADDING}px; border-top: 1px solid var(--rule); }
.panel-data summary { cursor: pointer; padding: 10px ${PANEL_PADDING}px; list-style-position: inside; }
.panel-data summary:hover { color: var(--ink); }
.panel-data[open] summary { border-bottom: 1px solid var(--rule); }
.panel-data .description { padding: 12px ${PANEL_PADDING}px 0; font-size: 13px; color: var(--secondary); }
.panel.table .panel-body .table-scroll { margin: 0 -${PANEL_PADDING}px; }
.panel-data .table-scroll { margin: 12px 0 0; }
figure { margin: 0; }
svg { display: block; max-width: 100%; height: auto; overflow: visible; }

.segmented { border: 0; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.segmented legend { float: left; margin-right: 8px; padding: 0; }
.segmented label { position: relative; cursor: pointer; }
.segmented input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; }
.segmented span { display: inline-block; padding: 3px 10px; border: 1px solid var(--rule); background: var(--background); font-size: 13px; line-height: 18px; }
.segmented label:hover span { border-color: var(--secondary); }
.segmented input:checked + span { background: var(--ink); border-color: var(--ink); color: var(--background); }
.segmented input:focus-visible + span { outline: 2px solid var(--ink); outline-offset: 2px; }
.segmented[hidden], [data-static-state][hidden] { display: none; }

.table-scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 13px; font-variant-numeric: tabular-nums; }
caption { text-align: left; padding: 0 ${PANEL_PADDING}px 10px; }
th, td { padding: 9px 12px; border-bottom: 1px solid var(--rule); vertical-align: top; text-align: right; }
th:first-child, td:first-child { padding-left: ${PANEL_PADDING}px; }
th:last-child, td:last-child { padding-right: ${PANEL_PADDING}px; }
thead th { background: var(--surface); font-size: 11px; line-height: 16px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--secondary); white-space: nowrap; }
th[scope="row"], thead th:first-child, .text { text-align: left; }
th[scope="row"] { font-weight: 500; }
td:not(.text) { white-space: nowrap; }
tbody tr:hover { background: var(--surface); }
.cell-detail { display: block; color: var(--secondary); font-size: 12px; white-space: nowrap; }

.trust { max-width: 760px; padding: 32px 0 0; }
.row:has(> .trust) { margin-top: 24px; border-top: 1px solid var(--rule); }
.trust h2 { font-size: 22px; margin: 0 0 12px; }
.trust h2 a { text-decoration: none; }
.trust h3 { font-size: 15px; margin: 24px 0 8px; }
.trust h4 { font-size: 13px; margin: 16px 0 4px; }
.trust table { margin: 0 0 16px; }
.trust th:first-child, .trust td:first-child { padding-left: 0; }
.trust th:last-child, .trust td:last-child { padding-right: 0; }
.trust thead th { background: transparent; }
.prose { max-width: 760px; padding: 16px 0; }
.prose h2 { font-size: 22px; margin: 0 0 12px; }

footer { border-top: 1px solid var(--rule); }
footer a { text-decoration: none; }
footer a:hover { text-decoration: underline; }
.footer-inner { max-width: ${PAGE_WIDTH + 48}px; margin: 0 auto; padding: 16px 24px 40px; }

[data-width="narrow"] { display: none; }
[data-candidate] { transition: opacity 150ms ease; }
.is-dimmed { opacity: 0.2; }

@media (max-width: ${SINGLE_COLUMN_BELOW}px) {
  .row { grid-template-columns: minmax(0, 1fr); }
  .row.stats > .stat + .stat { border-left: 1px solid var(--rule); border-top: 0; }
}
@media (max-width: ${NARROW_BELOW}px) {
  main { padding: 0 16px 48px; }
  .top-bar-inner, .footer-inner { padding-left: 16px; padding-right: 16px; }
  .hero { padding: 32px 0 24px; }
  .hero h1 { font-size: 30px; }
  .panel-head, .panel-tools, .stat-head { padding-left: 12px; padding-right: 12px; }
  .panel-body, .stat-body { padding-left: 12px; padding-right: 12px; }
  .panel-foot, .panel-data summary, .panel-data .description { padding-left: 12px; padding-right: 12px; }
  .panel-foot, .panel-data, .panel.table .panel-body .table-scroll { margin-left: -12px; margin-right: -12px; }
  th:first-child, td:first-child { padding-left: 12px; }
  th:last-child, td:last-child { padding-right: 12px; }
  [data-width="wide"] { display: none; }
  [data-width="narrow"] { display: block; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
@media print { .panel-tools, .panel-link { display: none; } }
`;
