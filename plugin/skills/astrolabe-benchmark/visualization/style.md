# Style: colour, titles and tables

Read at the presentation step, when writing `style`, a title, a description or a table block. Colours are written as intent and the generator derives the rest; titles are claims checked against the verdicts; tables keep what a reader needs to weigh a number.

The examples continue example.benchmark.json: `quickmark` against the baseline `markly`, with `wall_time` and `identical_pages` as primary metrics. Where an example needs a level of `structure`, the pages are grouped by `size`.

## Contents

- Colour
- Titles and descriptions
- Tables
- Rules

## Colour

The default needs nothing: the `astrolabe` theme, a dark page, the first candidate in cyan and the others in greys, told apart by their labels and marker shapes. Leave `style` out entirely unless the user asks for something, `mode` included: set it only when the user wants the page light, or following the reader's system.

```json
{
  "style": {
    "mode": "light",
    "accent": "#2f6fed",
    "series": { "quickmark": "#2f6fed" },
    "highlight": "quickmark",
    "attribution": true
  }
}
```

| Field | Use |
| --- | --- |
| `theme` | `astrolabe`, the only theme; can be left out |
| `mode` | `dark` (default), `light`, or `auto` to follow the reader's system. README cards and images keep their own modes, set in `exports[]` |
| `accent` | One colour for the highlighted candidate, written `#rrggbb` |
| `series` | A colour per candidate id, kept on every chart and export. Unlisted candidates take the theme's greys in the order of `candidates[]` |
| `highlight` | The candidate the page is about, when it is the user's own project: it takes the accent, the others grey. Its values are drawn exactly like the others |
| `attribution` | `false` removes the "Built with Astrolabe" mention; the hash, the date and the source stay |

- **Colours go in `style` only**, never in a block. The generator checks every colour against the background in both modes, adjusts its lightness when the contrast is too low, and refuses what it cannot fix.
- **Four candidates fit in the theme's colours.** Beyond that, set `highlight`, ask the user for colours, or split the chart.
- **Better and worse have their own colours, always beside their word**: green and orange on the verdicts, the headline figures and the README card. A candidate's own colour never changes with a verdict, so no candidate looks bad because of its colour.
- **Colour is never the only cue**: labels sit on the chart and markers differ in shape, so the page reads in greyscale and for colour-blind readers.

## Titles and descriptions

A reader remembers the title more than the chart, so a title states the finding, and only a finding the results support. Then the chart speaks: the page writes the title in ink and your reading right after it in grey, as one short paragraph beside the chart, and the images do the same above it. Keep both short enough to read at a glance:

- **The title is the claim, in a few words**: about 60 characters at most as the reader sees it (a template counts as the text it becomes), no second clause. "The gap comes from coding", not "Model A is more accurate than Model B overall, and most of the difference comes from the coding tasks".
- **The reading is one sentence**, about 20 words at most, saying what the title does not: where the difference comes from, what to watch, the caveat. Leave out what the chart already labels (the values, the candidates, the unit) and everything the generator writes under it (the direction, how to read the marks, the interval's level, the number of runs).
- **A headline's title says what the figure is about**, in a few words: the scope ("all pages", "large files"), and the pair only when the headlines compare different pairs; when they all compare the same two candidates, the page and the card name them once. The figure, its unit and its verdict are drawn beside it, and the page and the README card leave out a title that only restates them.
- **The first headline is the answer**: the top of the page states its comparison alone, so place first in `layout` the one the goal asks about. Three headlines at most: a fourth result goes in the `comparison-rows` chart with the others, where it is still seen.
- **"Likely" stays in the words**: in a sentence, write the word yourself and assert the full verdict ("a likely slower tail", with `"likely worse"` in `asserts`); `{verdict:id}` prints the verdict on its own ("likely better"), so use it only where it stands alone, after a colon or in brackets ("Identical pages: {verdict:identical_pages__quickmark}"). `validate` warns when a title asserts the bare verdict without either.

- **Numbers and names by template, never typed**: `{effect:id}` (the effect of a comparison, with its unit), `{verdict:id}`, `{candidate:id}`, `{metric:id}`, `{node:id}`. A digit typed in a title is refused: after a rerun it would be stale.
- **List in `asserts` the verdicts the title relies on**, comparison id to verdict word (`better`, `worse`, `equivalent`, `inconclusive`, `likely better`, `likely worse`). `validate` fails as soon as a rerun changes one of them, so the title cannot outlive its evidence.
- **Only primary comparisons in a title or a headline.** An exploratory comparison is shown in charts and tables, labelled exploratory, and never claimed.
- **Words follow the verdict**, as presentation.md says: its wording rules hold for titles as for sentences.
- **A title without a verdict describes** ("Every run, wall time"); it needs no `asserts`.
- **`description` is that one-sentence reading**, with templates. The generator adds the factual part (what is plotted, the values, the comparisons) to it for the long text alternative; together they are what a screen reader hears.
- **Text blocks** (`"type": "text"`) are the last resort: context no chart and no trust block can carry (why the benchmark was run, a decision taken from it), three sentences at most, under the same template rules. A finding is never a text block: draw it (charts.md).

| Instead of | Write |
| --- | --- |
| "quickmark is 35% faster" | `"{candidate:quickmark} is faster: {effect:wall_time__quickmark}"` with `asserts: { "wall_time__quickmark": "better" }` |
| "quickmark renders pages more faithfully" (verdict equivalent) | `"Same share of identical pages"` with `asserts: { "identical_pages__quickmark": "equivalent" }` |
| "Huge gains on large files" (an exploratory node) | `"Wall time by file size"`, and the reading in `description`, labelled exploratory |
| A reading that repeats the chart: "This chart shows the wall time of quickmark and markly for each file size, with 95% confidence intervals; lower is better." | A reading that adds to it: `"Exploratory: the gap widens with file size."` |
| A text block explaining that the gain comes from large files | A chart with `"breakdown": "size"`, titled `"Wall time by file size"` |

## Tables

```json
{
  "blocks": [
    {
      "id": "table-sizes",
      "type": "table",
      "metrics": ["wall_time", "identical_pages"],
      "rows": "size",
      "columns": "candidate",
      "show": ["n", "ci", "failures", "evidence"]
    }
  ]
}
```

| Field | Content |
| --- | --- |
| `metrics` | One or more metric ids |
| `rows` | A level of `structure`: one row per node of that level. Left out, one row for `node` (or the whole benchmark) |
| `columns` | `candidate` |
| `show` | What sits under each value: `n`, `ci`, `failures`, and `evidence` (a link to the raw file). `n` always, `ci` when values have intervals, `failures` when any attempt failed: `validate` refuses a table without them |

The generator aligns figures on the right with the same decimals down a column, rounds each value to what its interval supports, marks declared values as declared and writes "successful attempts only" where failures are left out. Past about 20 rows or 8 columns, prefer a `shaded-table` chart or a sort, and keep the full table in `dist/benchmark.md`.

## Rules

| Rule | Level | Instruction | Pitfall it prevents | Proved by |
| --- | --- | --- | --- | --- |
| V16 | Must | Write colours only in `style`, never in a block: a theme, an accent, optional colours per candidate. Leave every derived colour to the generator. | Hand-picked colours that break in dark mode, in an export or after a theme change | style |
| V17 | Must | Give each candidate one colour and keep it on every chart, table marker and export of the page; unlisted candidates take the theme's colours in the order of `candidates[]`. | A reader relearning the legend on each chart, or the same colour meaning two things | style.series |
| V18 | Must | Never let colour be the only way to tell candidates apart: label them directly on the chart, and vary line style or marker shape. | Charts unreadable for the roughly 8% of men with a colour-vision deficiency, or in greyscale | enforced by the generator |
| V19 | Must | Marks needed to read the chart have a contrast of at least 3:1 against what is next to them, text at least 4.5:1. The generator checks the user's colours in both modes and adjusts their lightness, or refuses. | Brand colours that vanish on the background | style (validated) |
| V20 | Should | Use at most 8 distinct colours in one chart. | Colours too close to be matched to their label | undefined |
| V21 | Should | When the page is about one candidate (the user's own project), name it in `highlight`: it takes the accent and the others take greys. Its rank, value and interval are drawn exactly like the others. | Every candidate shouting equally, or emphasis obtained by distorting the data | style.highlight |
| V22 | Should | Keep one reserved pair of colours for better and worse, always with a sign or a word, and never give those colours to a candidate. Do not use red against green. | A candidate that looks "bad" because of its colour; a verdict invisible to colour-blind readers | reserved by the theme |
| V23 | Must | For ordered values (shaded tables, heat maps) use one hue going from light to dark; use two hues only around a meaningful midpoint such as zero difference; never a rainbow scale. | Equal steps that look unequal, and a bright band that draws the eye to arbitrary values | theme ramps |
| V24 | Should | Let the generator produce the light and dark variants from the same `style`; `mode` is `auto`, `light` or `dark`. | A page that is only legible in the mode its author used | style.mode |
| V25 | Must | Write titles that state the finding, and list in `asserts` the verdicts the title relies on. Use "better" words only for a better verdict, "same" only for equivalent, and say inconclusive when it is. Rely only on primary comparisons (S11); an exploratory one never makes a headline or a claim in a title. | A slanted title that readers remember instead of the data, and that survives a rerun that no longer supports it | blocks[].asserts |
| V26 | Must | Never type a result into a title or description: insert it with a template (`{effect:id}`, `{verdict:id}`, `{candidate:id}`). | Figures left over from a previous run | blocks[].title, blocks[].description |
| V27 | Must | Under every chart, say how to read it: what is measured, the unit, the direction, the number of items and runs, and what the interval is. The generator writes this line from `results`. | A chart that cannot be read without the page around it | generated |
| V28 | Should | Label candidates on the chart itself instead of a separate legend. Put the overall message in the title, and statistics or context next to the data point they describe. | Eyes going back and forth to a legend; a message stated far from its evidence | blocks[].annotations |
| V29 | Should | Lay tables out for comparison: numbers right-aligned with the same number of decimals down a column, text left-aligned, the unit once in the header, headers set apart, light dividers, the row or cell that matters highlighted. | Numbers that cannot be compared by eye down a column | enforced by the generator |
| V30 | Should | Show no more digits than the uncertainty supports: round a value to the decimal of the first significant digit of its standard error, and show the interval with the same decimals. Percentages: whole numbers, one decimal below 10%. | 82.4137% displayed for a result known to within 5 points | enforced by the generator |
| V31 | Must | In any table of results, keep the columns that let the reader judge the number: items, runs, interval, failures. | A bare score with nothing to weigh it by | blocks[].show |
| V32 | Should | When a table grows past about 20 rows or 8 columns, shade the cells (V23), sort it, or replace it with a chart; keep the full table one click away. | A wall of numbers nobody reads | blocks[].type |
| V56 | Must | Never present a declared figure like a computed one. The generator marks every declared value "declared" wherever it appears (label, table cell, headline, export), writes "likely" and "exploratory" with the verdicts they qualify, writes "successful attempts only" next to every result that leaves failures out and a visible warning when the candidates' failure shares differ, and lists in the methodology block what was computed from raw data and what was only declared, with the number of comparisons of each kind. | A typed-in figure or an unchecked declaration read with the same trust as a computed result | values[].source, comparisons[].qualifier and .role (generated) |
