# The page: what it holds, filters and exports

Read at the presentation step, before proposing the page to the user. `astrolabe build` turns the presentation sections of `benchmark.json` (`style`, `filters`, `layout`, `blocks`, `exports`) into the site, the README card and the images; it adds on its own what every page must have, so you only write what this benchmark needs.

The examples continue example.benchmark.json: `quickmark` against the baseline `markly`, with `wall_time` and `identical_pages` as primary metrics. Where an example needs a level of `structure`, the pages are grouped by `size`.

## Contents

- What the generator does without being asked
- Propose the page before writing it
- Blocks and their order
- Filters
- Exports: the README card and images
- Check the page
- Rules

## What the generator does without being asked

On every page and image, whatever the file says: the direction and how to read each chart, the interval's level, a data table and a long text alternative for each chart, a light and a dark version, a narrow version for phones, filters that work with the keyboard, no value reachable only by hovering, no motion for readers who asked for less, no text below 12 px, and a provenance line on every export. The trust blocks close the page even when `layout` leaves them out: the method drawn as its steps, the environment and the limitations as short facts, and the provenance as the page's last line, with the benchmark file and the raw data to download.

A file with no blocks still gets a page: its primary comparisons as headlines, or a summary per metric when they are more than three, then the trust blocks. Without `exports`, `build` writes a README card from the same answer.

## Propose the page before writing it

The framing step already asked what the benchmark decides. Ask at most two more questions, only if the request and the repository do not answer them:

1. Is the page about one candidate in particular (the user's own project), or a neutral comparison?
2. Is there a colour or theme to follow, and where will it be shared first: a README, a site, a social post?

Then propose the page as a short outline, before writing any block: one line per block, each chart with the reader's question it answers (charts.md), and no text block unless no chart can carry it:

```
Headlines   build time first (the answer), then identical pages; quickmark against markly, both primary
Chart       "Is it faster, and by how much?": the effect on build time, with the band too small to matter
Chart       "What will one run look like?": every run, build time (12 runs per candidate)
Table       both metrics by file size, with n, intervals and failures (exploratory)
Exports     the README card (light and dark), a wide image of the effect chart
```

The user amends it; then write the sections, run `astrolabe validate`, and build. Running unattended, choose with the defaults below and list the choices in the final reply.

## Blocks and their order

`blocks` lists every block once; `layout` places them, one array per row, at most two per row (three when the row holds only headlines and summaries). Order the rows from the answer to the evidence:

1. **Headlines**: one per primary comparison the goal rests on, three at most, the one that answers the goal first: the top of the page names its pair ("Node 24 compared with Node 22"). A headline names its `comparison` and a `title` (templates, style.md); the figure, interval, verdict, failures and a small drawing of the comparison are added by the generator.
   When the answer is a pattern across more than three primary comparisons on one level (a script, a task or a file each), a **summary** states it instead: `{ "id": "summary-time", "type": "summary", "metric": "wall_time" }`. It draws a stacked bar per candidate under one legend: the candidate's primary comparisons on that metric split into better, about the same and worse (in the metric's own words: faster, lower, cheaper), the count in each part, the part only likely lighter; then the range of the changes. It shows every candidate compared with the baseline; `candidates` names fewer. One summary per metric the reader asks about; every word is generated, so it has no title. `validate` warns when the page states neither a headline nor a summary.
2. **The chart that backs them**: usually an `effect` or `comparison-rows` chart (charts.md).
3. **Breakdowns**: where the difference comes from, labelled exploratory unless declared primary. Beyond 8 rows (nodes times compared candidates), a breakdown is a table of effects rather than an `effect` chart (style.md): one row per node reads faster than many chart rows that look alike.
4. **The full table**, with n, intervals and failures.
5. **Trust blocks**: `methodology`, `environment`, `limitations`, `provenance`, each a block with only an `id` and its `type`.

```json
{
  "layout": [
    ["headline-time", "headline-pages"],
    ["chart-time-effect"],
    ["chart-runs"],
    ["table-sizes"],
    ["methodology"],
    ["environment"],
    ["limitations"],
    ["provenance"]
  ]
}
```

Give each chart one message. A chart that shows everything says nothing: split it, use a filter, or move the detail to the table. Do not restate in a text block what a chart, a headline or a trust block already shows: the page is read through its drawings, and every added paragraph pushes the evidence further down.

## Filters

A filter lets the reader pick a node of a level (a category, a file size) for the blocks that list it in their `filters`. Most readers never click, so a filter only hides detail: the default state carries the message, and every title's `asserts` holds in it.

```json
{
  "filters": [
    { "id": "size", "label": "File size", "level": "size", "options": "from_structure", "allow_all": true, "default": "all" }
  ]
}
```

| Field | Content |
| --- | --- |
| `level` | The level of `structure` whose nodes are the options |
| `options` | `from_structure` (every node of the level), or a list of node ids |
| `allow_all` | Adds the option `all` |
| `default` | The state the page opens on, every export shows and a link without a state shows: the one that carries the message, `all` when no state does |

Use a filter only when one view cannot hold the content: a breakdown that fits is shown, not filtered. Every combination of filters is drawn in advance, so a page holds 24 states at most. The state goes into the page's address, so a shared link shows what its sender saw.

## Exports: the README card and images

```json
{
  "exports": [
    { "id": "readme-card", "blocks": ["headline-time", "headline-pages"], "format": "svg", "size": "banner", "mode": "both" },
    { "id": "social", "blocks": ["chart-time-effect"], "format": "png", "size": "wide" }
  ]
}
```

| `size` | What it is | `blocks` |
| --- | --- | --- |
| `banner` | The README card: SVG in light and dark, with a PNG beside it | Headline blocks, or summary blocks |
| `wide` | 1200 × 630 px: link previews and social posts; the first one written as PNG is the site's preview image | One chart block |
| `square` | 1080 × 1080 px: social posts | One chart block |

- `mode`: `light`, `dark` or `both`. A card defaults to both, so it matches the reader's README; images default to light.
- `filter_state` freezes a filter for one export, written as filter id to option. Left out, the export shows the default state. Never pick by hand the slice that flatters a candidate: an export travels without the page around it.
- Every export carries its title, the candidate names, the unit, the direction, the interval and a provenance line (where the full results are, a short hash, the date). Nothing to add. The card's title is the goal, so a short goal keeps it to two lines; when its numbers were measured on your own machine (time, memory, CPU, energy), the card also names the machine from `environment.hardware`, `os` and `host`.

## Check the page

```bash
astrolabe preview     # builds the site, serves it on this computer, rebuilds when a file changes
```

Open it and read it as the user's reader would: does the first screen answer the question, does each chart back what its title says, does the narrow version keep every interval? Fix what does not in the file, never in `dist/`.

## Rules

| Rule | Level | Instruction | Pitfall it prevents | Proved by |
| --- | --- | --- | --- | --- |
| V33 | Must | Make the default state of every filter the one that carries the message, and never put a result that matters behind a click or a hover. Every `asserts` must hold in the default state. | The main finding seen by a small minority of readers | filters[].default |
| V34 | Must | Use tooltips only to repeat or detail values that are also in the chart labels or in the data table. | Values out of reach on touch screens, by keyboard or in an image | enforced by the generator |
| V35 | Should | When a filter changes the data shown, keep the axis fixed across its options; if the range must change, show that it did. | Two filter states compared by eye on two different scales | blocks[].scale |
| V36 | Should | Keep the filter state in the page address, so a link reproduces exactly what its sender saw. | A shared link showing something else than what was discussed | generator |
| V37 | Should | Use a filter only when one view cannot hold the content; a breakdown that fits on the page is shown, not filtered. | Controls added for their own sake | filters[] |
| V38 | Should | Order the page from the answer to the evidence: headline or summary blocks, the chart that backs them, the breakdowns, the full table, then the trust blocks. | A reader who has to scroll past method to find the result, or who never reaches the evidence | layout |
| V39 | Should | Put at most two blocks in a row, three when they are all headline or summary blocks, and at most three headline and summary blocks on a page; rows stack into one column on narrow screens. | Charts too small to read; a headline row where nothing stands out | layout |
| V40 | Should | Give each chart one message. When too many elements compete in one chart, split it, aggregate, filter, or show it as a table: an effect chart of more than 8 rows becomes a table of effects. | A chart that shows everything and says nothing | blocks[] |
| V41 | Must | Make every export readable alone: title, candidate names, unit, direction, and the interval note are inside the image. | A chart shared on a social site with no way to know what it measures | enforced by the generator |
| V42 | Must | Print a provenance line in every export: where the full page is, the short hash of `results`, the date. | A number that cannot be traced back to its data | exports[] (generated) |
| V43 | Must | An export shows the default state of the filters, or a state named in its preset; never a state picked by hand at export time. | The most flattering slice exported without saying it is a slice | exports[].filter_state |
| V44 | Must | In the Markdown report, give every value its interval, its number of runs and its failures in the table: the report draws no chart, so its tables carry the uncertainty. | A Markdown export that silently drops the uncertainty | enforced by the generator |
| V45 | Should | Ask for both modes of a README card unless the user wants one; give every exported image a generated alt text (V46). | A dark card on a light page; an image with no description | exports[].mode |
| V46 | Must | Every chart has a text alternative in two parts: a short one naming the chart, and a longer one, visible to everyone, giving scales, values and the trend. The generator writes the factual part from `results` (what is plotted, extremes, comparisons); the agent's `description` adds the reading. | A chart that says nothing to a screen reader, or an alt text that only says "bar chart" | blocks[].description (plus generated text) |
| V47 | Must | Every chart can show its data as a table. | Values that exist only as shapes | enforced by the generator |
| V48 | Must | Filters and any other control work with the keyboard and show focus; nothing needs a mouse. | Controls out of reach without a pointer | enforced by the generator |
| V49 | Must | No text below 12 px at the size the chart is shown, exports included. | Axis labels unreadable once a chart is shrunk into a card | enforced by the generator |
| V50 | Should | Animation is optional decoration: it is switched off when the reader asks for reduced motion, and nothing flashes. | Motion that harms or distracts, and content that only appears after an animation | enforced by the generator |
| V51 | Should | Leave the "Built with" mention on by default, inside the provenance line: small muted text, no logo, never over the data. Remove it only when the user asks, by setting `style.attribution` to false; the hash, date and source link stay. Never word it as a verification. | A mention that reads as an advert or a certification, or that comes back on the next build because it was removed by a command-line flag | style.attribution |
| V53 | Should | On narrow screens, redraw each chart rather than shrink it: horizontal bars, fewer ticks, shorter labels, annotations shortened or moved below. Never drop the interval, the direction or a candidate. | Text too small to read on a phone, or a phone version that silently loses the uncertainty | the generator renders a narrow version of every chart |
