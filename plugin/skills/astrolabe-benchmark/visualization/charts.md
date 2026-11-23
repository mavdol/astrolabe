# Charts: which one, and drawn honestly

Read at the presentation step, before writing a chart block. You choose the chart from the shape of the results; `validate` refuses a chart that does not fit its data, names the rule it breaks, and says what to use instead.

The examples continue example.benchmark.json: `quickmark` against the baseline `markly`, with `wall_time` and `identical_pages` as primary metrics. Where an example needs a level of `structure`, the pages are grouped by `size`.

## Contents

- Which chart for which question
- The fields of a chart block
- Scales
- Uncertainty
- Rules

## Which chart for which question

Start from the question the reader brings, not from the data you have: write it down, then take its row. A reader understands a drawing faster than a sentence, so whatever can be drawn is drawn, and the words only say what the drawing cannot.

| The reader asks | `chart` | Fields it needs | Not when |
| --- | --- | --- | --- |
| "So which one?": one comparison answers the goal | no chart: a headline block | `comparison` (see page.md) | |
| "So which one, across all these tasks?": the answer is a pattern over more than three primary comparisons on one level | a summary block: a stacked bar per candidate counting its results | `metric`; `candidates` to show fewer (see page.md) | three comparisons or fewer: headlines |
| "Is it better, and by how much?" | `effect` | `metric` | the comparisons are on different metrics: `comparison-rows` |
| "Where does the gap come from?" | `effect` with `breakdown` | `metric`, `breakdown` (a level: category, task, size) | the level has one node: the headline already says it; more than 8 rows (nodes times compared candidates): a table of effects (style.md) |
| "Did this release improve, metric by metric?" | `comparison-rows` | `comparisons`, up to 10; `effect_format: "times"` only when effects reach about 2× | more than 10 rows: a table |
| "Is the gain worth the cost?": two metrics in tension (accuracy and cost, speed and memory) | `scatter` | `x`, `y` (metric ids), `node` | the two metrics do not trade against each other: two headlines |
| "What will one run, one request look like?" (run times, latencies, flaky tasks) | `distribution` | `metric`; reads the raw file | the question is about the average: `effect` |
| "How does it change as the input grows?": an ordered level (input size, concurrency, version) | `line` | `metric`, `breakdown` (the level, at least two nodes) | the level has no order (categories): `effect` with `breakdown` |
| "How do they rank?": one metric, a few candidates | `dot-interval`; `bar` only for a quantity with a true zero (memory, cost, a count) | `metric`, `node` | the comparison is paired: `effect` |
| "How do they rank in each category?" | `grouped-bar` up to 4 candidates, `dot-interval` beyond | `metric`, `breakdown` | many candidates across many tasks: `shaded-table` |
| "Which candidate is good at what?": many candidates, many tasks | `shaded-table` | `metric`, `breakdown` | a few cells: `grouped-bar` |
| "Where does the total go?": parts of one total (cost by stage) | `stacked-bar` | `metric` (the total), `breakdown` (the level of the parts) | one part is compared across candidates: `grouped-bar` |

How to pick, in order:

1. **The answer first.** Each primary comparison the goal rests on gets a headline block, the one that answers the goal first; when they are more than three on one level (one per script or task), a summary block states the pattern instead; the chart that backs them is an `effect` chart, or a `comparison-rows` chart when the comparisons are on different metrics.
2. **The question the goal names.** A goal that weighs two things ("given accuracy and running cost", "faster without using more memory") gets the `scatter` of those two metrics; a goal about one run (latency, flaky tasks) gets the `distribution`, which shows every run up to 20 and a box beyond.
3. **A paired comparison is never left to two separate intervals.** When the same items or runs were measured for both candidates, show the effect itself (headline, `effect` or `comparison-rows`); two dots with their own intervals cannot show a paired result, and `validate` says so.
4. **Then the breakdowns**, which are exploratory unless declared primary: the reader sees where the difference comes from.
5. **No chart for one, two or three numbers**: a headline says it better.
6. **No paragraph where a chart fits.** A finding you are about to explain in a text block ("the gain comes from coding", "slower on small files") is a breakdown to draw; the method, the environment and the limitations are drawn by the generator from the file.

Pies, donuts, bubbles, radar charts, two y-axes and 3D are not in the chart set: angle, area and a second axis are judged far less accurately than positions on one scale.

## The fields of a chart block

```json
{
  "blocks": [
    {
      "id": "chart-time-effect",
      "type": "chart",
      "chart": "effect",
      "metric": "wall_time",
      "series": "candidate",
      "uncertainty": "ci",
      "title": "{candidate:quickmark} is faster than {candidate:markly}",
      "description": "Build time {effect:wall_time__quickmark}, beyond the smallest difference that matters.",
      "asserts": { "wall_time__quickmark": "better" }
    }
  ]
}
```

| Field | Content |
| --- | --- |
| `metric`, or `x` and `y` | Metric ids from `metrics[]` |
| `node` | The node shown; left out, the root of the structure, or the whole benchmark when there is no structure |
| `breakdown` | A level of `structure` (`category`, `task`, `size`): one group or one row per node of that level |
| `comparisons` | Comparison ids, for `comparison-rows`. An id reads `metric__candidate`, or `metric__node__candidate` when the plan has a structure; compute writes them in `results.comparisons` |
| `series` | `candidate`, the only value: one colour and one label per candidate |
| `uncertainty` | `ci`: the intervals compute wrote. Required whenever the values have one |
| `scale` | See below |
| `sort` | `value` (default: best first along the metric's direction) or `declared` (the order of `candidates[]`, kept on every chart) |
| `annotations` | Short notes next to a candidate or a node, written with templates |
| `effect_format` | `percent` (default) or `times`, on `comparison-rows` only |
| `filters` | Filter ids that change this chart (page.md) |
| `title`, `description`, `asserts` | The claim, the reading and the verdicts the claim relies on (style.md) |

The direction ("lower is better"), how to read the chart, the interval's level and the data table are written by the generator from the results: you do not type them.

## Scales

Every axis is a decision that changes how large a difference looks. The generator makes it from the data and the smallest difference that matters, and writes it on the chart; you only override it, and say why.

- **Bars start at zero**, always; a bar that cannot (a negative value) is a `dot-interval` instead.
- **Dots, lines and scatters fit their axes to the values** by default, so that close candidates can be told apart, and the chart says so. The range never shrinks below twice `minimum_meaningful`, so a difference too small to matter cannot fill the axis, and it never goes below zero for values that cannot. Set `"scale": { "zero": true }` when the reader needs the distance from zero (a count, a share out of 100%); `"zero": false` with a `reason` only adds that reason to the chart.
- **Linear by default.** `type: "log"` needs a `reason` (values spanning orders of magnitude, a long-tailed latency, a question about ratios); bars and effects refuse it.
- **Charts meant to be compared share a scale**: list their ids in `shared_with`. A filter keeps its chart's axis fixed across options by itself.
- **No axis breaks**, and never an axis turned upside down to make lower look bigger: the direction is written on the chart, and candidates are sorted best first.

## Uncertainty

- Every value that has an interval is drawn with it (`uncertainty: "ci"`), and the generator names it with its real level ("98.75% interval, adjusted for 4 primary comparisons").
- To show who wins, chart the difference (`effect`), with the band of differences too small to matter drawn from `minimum_meaningful`; the reader then sees better, equivalent or inconclusive directly.
- With about 10 runs or fewer per candidate, show every run (`distribution`) next to the summary: the same mean and interval can come from very different data.
- Reference points (a floor, a ceiling, a human level, a random baseline) are declared on the metric, in `metrics[].reference_points`, when they exist; they make a score readable.

## Rules

| Rule | Level | Instruction | Pitfall it prevents | Proved by |
| --- | --- | --- | --- | --- |
| D1 | Must | Bar charts start at zero; any exception must be disclosed in the chart itself. | Exaggerated differences | enforced by the generator |
| D2 | Should | Dot and line charts may use a non-zero baseline when zero is arbitrary or a meaningful change would be invisible, but only with the range set by V8. | Both flattening and inflating effects | blocks[].scale |
| D3 | Must | Do not rely on axis-break markers to fix a truncated axis; readers are still misled. | False sense of honesty | no axis breaks in the generator |
| D10 | Should | When distributions are skewed, multi-modal or have outliers, show them (box, violin or cumulative distribution plots) rather than only a mean with error bars. | Averages hiding the real behaviour | raw_data[] |
| D11 | Should | Show reference points that make scores readable where they exist: floor and ceiling, random or trivial baseline, human level, theoretical upper bound. | Scores with no sense of what is good or bad | metrics[].reference_points |
| V1 | Must | Choose the chart from the data shape in the table above, and encode the compared quantity as a position on a common scale before any other encoding. | A chart picked for looks that readers judge less accurately | blocks[].chart (checked against the shape) |
| V2 | Must | Do not use angle or area (pie, donut, bubble size) to compare candidates. | Judgments by angle and circular area are less accurate than by position | not in the chart set |
| V3 | Should | Do not chart one, two or three numbers: use a headline block or a sentence. | A chart that adds ink but no information | blocks[].type |
| V4 | Should | Beyond 8 candidates in one chart, highlight the subject and grey the rest, or split into small multiples; never add colours. | Colours that can no longer be told apart | style.highlight |
| V5 | Must | Never put two metrics on two y-axes of one chart; use two charts side by side, an indexed chart or a scatter. | An apparent relation that only comes from the choice of scales | not in the chart set |
| V6 | Must | Panels meant to be compared share the same scale; when they cannot, say so in each panel. | Small panels that look alike but differ by an order of magnitude | blocks[].scale |
| V7 | Must | Mark the direction on every chart ("lower is better"), taken from the metric, never typed by hand. Never invert an axis so that lower values look bigger; state the direction and sort best-first instead. | A reader who takes the longest bar for the winner | metrics[].direction |
| V8 | Should | When an axis does not start at zero, set its range from the minimum meaningful difference, so that a difference of that size is visible but a smaller one does not look large. | The designer choosing, without saying so, how important a difference looks | blocks[].scale, metrics[].minimum_meaningful |
| V9 | Must | Use a linear scale by default. A log scale needs a reason written in `scale.reason` (values spanning orders of magnitude, a long-tailed distribution such as latencies, a question about ratios). The generator then writes "log scale" in the axis title, labels ticks with real values (1, 10, 100) and refuses bars. | A scale most readers misread, chosen without saying why; bar lengths that mean nothing without a zero | blocks[].scale (type, reason) |
| V10 | Should | Sort candidates best-first according to the metric's direction, or keep one declared order on every chart of the page; never choose the order chart by chart to favour one candidate. | The subject always shown first or last by construction | blocks[].sort |
| V11 | Must | Draw the interval on every charted value that has one, and name it in the chart with its real level, read from `ci_level` ("95% confidence interval, 10 runs"; "98.75% interval, adjusted for 4 primary comparisons"). | Error bars read as something else: standard error, standard deviation and confidence interval look the same | blocks[].uncertainty |
| V12 | Should | When the point of the chart is a comparison, prefer a dot with its interval to a bar with an error bar. | Values inside the bar are judged likelier than values above it, and the interval is read as all-or-nothing | blocks[].chart |
| V13 | Should | To show who wins, chart the difference itself with its interval and the minimum meaningful difference as a band, rather than leaving the reader to compare two overlapping intervals. When the comparison is paired, two separate intervals cannot show the result at all: the page must then show it as an effect chart, a comparison-rows chart or a headline. | Winners read from overlapping or non-overlapping error bars | comparisons[].paired (checked by the generator) |
| V14 | Should | When the reader's question is what one run or one request will look like (latency, flaky tasks), show the spread of outcomes (distribution, percentiles), not only the interval of the mean. | A narrow confidence interval read as "every run is better": readers overestimate the effect and underestimate variability | raw_data[], values[] percentiles |
| V15 | Should | With few measurements per candidate (about 10 or fewer), plot every point next to the summary. | The same mean and error bar produced by very different data (an outlier, two clusters, three points) | raw_data[] |
| V52 | Should | Use stacked bars only to show the parts of one total. To compare one part across candidates, use grouped bars or one chart per part. Radar and 3D charts are not in the chart set. | A part compared across floating segments, which readers judge far less accurately than aligned bars | blocks[].chart |
| V54 | Must | Use comparison-rows when several metrics are each compared once with the baseline. Each row is one comparison: the baseline as a grey track and the candidate as a bar, both from zero on the row's own scale; the two values with their intervals; the effect with its interval. A row whose verdict is equivalent or inconclusive shows that word instead of an effect figure. The chart says that each row has its own scale. Beyond about 10 rows, use a table. | A stack of impressive figures with no uncertainty, a row that did not improve hidden among wins, or rows of different units read as one scale | blocks[].comparisons[] (checked by the generator) |
| V55 | Should | Show a relative effect as a factor (effect_format: times) only when the effects are large, about 2× or more; below that, a percentage reads better (+20% rather than 1.2×). The generator computes the factor and its interval from the comparison, larger value over smaller, and writes what it is a factor of: faster or slower for time, less or more for resources, cheaper or more expensive for cost, higher or lower otherwise. Never a bare × on a worse result. | 1.2× read as a large change; 0.35× read as a gain; a factor that disagrees with the values printed next to it | blocks[].effect_format (times only on relative comparisons, checked) |
