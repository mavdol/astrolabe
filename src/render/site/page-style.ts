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

const PAGE_RULES = `
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; background: var(--background); color: var(--ink); font: 400 16px/1.5 Inter, system-ui, sans-serif; -webkit-text-size-adjust: 100%; }
main { max-width: 784px; margin: 0 auto; padding: 48px 32px 64px; }
a { color: inherit; text-decoration-thickness: 1px; text-underline-offset: 2px; }
:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
h1 { font-size: 32px; line-height: 1.2; font-weight: 600; letter-spacing: -0.01em; margin: 4px 0 12px; }
h2 { font-size: 20px; line-height: 1.3; font-weight: 600; margin: 0 0 4px; }
h2 a { text-decoration: none; }
h3 { font-size: 16px; font-weight: 600; margin: 24px 0 8px; }
h4 { font-size: 14px; font-weight: 600; margin: 16px 0 4px; }
p { margin: 0 0 12px; }
ul { margin: 0 0 12px; padding-left: 20px; }
code { font-size: 13px; overflow-wrap: anywhere; }
.eyebrow, .subtitle, .how-to-read, .details, .pair, .measured, footer { color: var(--secondary); }
.eyebrow { font-size: 13px; font-weight: 500; margin: 0; }
.subtitle { font-size: 14px; font-weight: 500; margin: 0 0 12px; }
.how-to-read { font-size: 13px; margin: 8px 0 0; }
.page-header { margin: 0 0 40px; }
.row { display: grid; grid-template-columns: repeat(var(--columns, 1), minmax(0, 1fr)); gap: 32px; margin: 0 0 48px; }
@media (max-width: 720px) { main { padding: 32px 16px 48px; } .row { grid-template-columns: minmax(0, 1fr); } }
.block { min-width: 0; }
figure { margin: 0; }
svg { display: block; width: 100%; height: auto; overflow: visible; }
[data-width="narrow"] { display: none; }
@media (max-width: 600px) { [data-width="wide"] { display: none; } [data-width="narrow"] { display: block; } }
.headline .pair, .headline .measured { font-size: 14px; margin: 0 0 4px; }
.effect { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 8px 0; }
.figure { font-size: 40px; line-height: 1.1; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.verdict { display: inline-block; border: 1.5px solid var(--ink); border-radius: 999px; padding: 2px 10px; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
.verdict.firm { background: var(--ink); color: var(--background); }
.details { list-style: none; padding: 0; font-size: 14px; }
.details .warning { color: var(--ink); font-weight: 600; }
.table-scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 14px; font-variant-numeric: tabular-nums; margin: 0 0 16px; }
caption { text-align: left; font-weight: 600; padding: 0 0 8px; }
th, td { padding: 6px 8px; border-bottom: 1px solid var(--rule); vertical-align: top; text-align: right; }
thead th { border-bottom: 1px solid var(--ink); font-weight: 600; }
th[scope="row"], thead th:first-child, .text { text-align: left; }
th[scope="row"] { font-weight: 500; }
.cell-detail { display: block; color: var(--secondary); font-size: 12px; }
details.data { margin: 12px 0 0; font-size: 14px; }
details.data summary { cursor: pointer; color: var(--secondary); }
details.data p { margin: 8px 0; }
.filters { display: flex; flex-wrap: wrap; gap: 12px 32px; margin: 0 0 40px; padding: 16px 0; border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }
.filters[hidden] { display: none; }
.filters fieldset { border: 0; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.filters legend { float: left; margin-right: 4px; font-size: 14px; font-weight: 600; }
.filters label { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border: 1px solid var(--rule); border-radius: 999px; font-size: 14px; cursor: pointer; }
.filters label:has(input:checked) { border-color: var(--ink); font-weight: 600; }
.filters input { margin: 0; accent-color: var(--ink); }
.trust { border-top: 1px solid var(--rule); padding-top: 24px; font-size: 15px; }
footer { max-width: 784px; margin: 0 auto; padding: 16px 32px 48px; font-size: 13px; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
@media print { .filters { display: none; } }
`;
