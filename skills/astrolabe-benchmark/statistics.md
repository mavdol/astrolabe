# Statistics: runs, intervals, verdicts

You plan the repetition and declare what is compared. `astrolabe compute` does all the arithmetic, with fixed methods, and gives the same digits on every machine. You never choose a test, compute an interval or decide who wins.

## Contents

- How many runs
- Levels of repetition (`runs.levels`)
- What compute writes, and how to read a verdict
- Primary and exploratory comparisons (`analysis.primary`)
- Outliers (`analysis.outliers`)
- Failures
- Variants tried
- Rules

## How many runs

| Setting | Default | Why |
| --- | --- | --- |
| Runs per candidate, when runs are the only repetition | At least 10, and never fewer than `validate` asks for | A median needs 6 observations for a 95% interval, 7 with two primary comparisons, 8 with four; a 95th percentile needs about 72. Below the minimum compute gives no interval and the verdict is inconclusive |
| Repeats per item, for candidates whose output varies (models, randomized algorithms) | 5 | One lucky answer must not decide; repeats are averaged per item first |
| Items | As many as the user's real set allows | Results measured on items have no hard minimum, but the interval narrows only with more items, not with more repeats |
| Pilot | A few runs, then `astrolabe compute` | Shows the noise. If the interval of the effect is wider than the smallest difference that matters, the full run needs more runs or items; if the budget does not allow it, tell the user the benchmark may not answer the question |
| Run order | Candidates interleaved, order alternated or shuffled between rounds | Running one candidate after the other measures the drift of the machine |
| Summary of a run time | The median | Timing data is skewed and has slow outliers; a mean with its interval suits only when the total is what matters |

Stop adding runs when the verdict is clear or the time budget ends, and report the precision reached: the interval says it.

## Levels of repetition (`runs.levels`)

Each level names what is repeated, the raw field that counts it (`run`, `item` or `repeat`) and how many are planned. Put the highest level first: the one where independent repetition happens.

```json
"runs": { "levels": [{ "level": "process", "field": "run", "planned": 12 }] }
```

```json
"runs": { "levels": [{ "level": "question", "field": "item", "planned": 200 }, { "level": "repeat", "field": "repeat", "planned": 5 }] }
```

Repeat where the variance is. Ten iterations inside one process are not ten runs: start-up, memory layout and caches vary between processes, so the process is the unit and `run` counts processes. Compute resamples at the highest level and writes how many it observed next to how many were planned.

## What compute writes, and how to read a verdict

For every metric, candidate and node: the value, its interval, n, and the failures with their denominator. A run time also gets its lowest and highest run, and so does any value with too few observations for an interval: the report then shows that range in place of the interval. For every candidate against the baseline: the effect with the baseline in the denominator, its interval, and a verdict. A metric declares how it is compared: `"compare_as": "relative"` (percent of the baseline, for times, memory, cost) or `"difference"` (in the metric's unit, for shares and scores, where it reads in points).

The verdict depends only on where the interval of the effect sits against the metric's `minimum_meaningful`, never on the point estimate:

| Verdict | The interval of the effect | Say it as |
| --- | --- | --- |
| better / worse | Lies entirely past the smallest difference that matters | "A is faster than B by 12% (9% to 15%)" |
| likely better / likely worse | Excludes zero, but part of it is smaller than what matters | "A is likely faster; the gain may be too small to matter" |
| equivalent | Lies entirely inside the smallest difference that matters, even if it excludes zero | "No difference that matters": a real difference can be too small to care about |
| inconclusive | Includes zero and reaches past what matters | "The data cannot tell them apart"; more runs might |

An "inconclusive" or "equivalent" result is a result. Report it as it is; do not rerun until it flips, and do not lower `minimum_meaningful` after seeing the data.

A usability comparison with fewer than 20 participants per candidate is marked indicative, and "better" or "worse" become "inconclusive".

## Primary and exploratory comparisons (`analysis.primary`)

With many candidates, metrics and sub-groups, some "better" verdicts appear by chance. So the plan names, before measuring, the few comparisons the decision rests on:

```json
"analysis": { "primary": [{ "metric": "accuracy", "node": "suite" }, { "metric": "cost_per_item", "node": "suite" }] }
```

- Without `analysis.primary`, every metric is primary, at the highest node where it has values. With a `structure`, each entry names its node. For run time, memory, CPU or energy over scripts of different sizes, name each script, not their parent (measurement/time.md).
- Each entry is compared for every candidate against the baseline, so 2 entries and 4 candidates make 6 primary comparisons. Their intervals are widened together so that they hold jointly (95% becomes 97.5% for two, 98.75% for four): each added one costs precision. Keep them few.
- Every other comparison is computed too and labelled exploratory. An exploratory result can be shown and can suggest what to test next; it never carries a headline, a recommendation or the word "winner".
- When the data already exists (logs someone hands you), choose the primary comparisons before looking at the breakdown, and say in `limitations` that they were chosen after the measurement.

## Outliers (`analysis.outliers`)

Prefer a statistic that outliers barely move (the median, a percentile) to removing anything. When removal is justified, it is a rule in the plan, written before measuring, that compute applies to every candidate alike:

```json
"analysis": { "outliers": { "rule": "tukey", "k": 1.5, "metrics": ["wall_time"] } }
```

Compute lists what the rule removed, per candidate, and the report shows it. The raw file keeps every row. The default is `{ "rule": "none" }`. Adding a rule after seeing the data is a change of method: say so in `limitations`, and bump `benchmark.version`.

## Failures

A failed observation is a row with `value: null` and a `status`. Each metric says how failures count:

- `"failures_count_as": "zero"` for shares and scores: a failed item scores zero and stays in the denominator.
- `"failures_count_as": "excluded"` for times and costs: the value covers successful attempts only, the report says so, and the failures are listed with their denominator.

With `excluded`, a candidate that gives up on hard inputs looks faster, because what remains is the easy part. Compute compares the failure shares and sets a warning on the comparison when they differ; the report then says, next to the time, that the candidates did not fail equally often. Always pair such a time with a success metric (a share with `"failures_count_as": "zero"`), and never quote the time without the failure rate beside it.

## Variants tried

If you tried several configurations, prompts or versions of a candidate, list them all in `candidates[].variants.tested`, name the one kept in `selected`, and measure it again on fresh runs or data (`remeasured_on_fresh_runs`): the best of several tries is partly luck. With nothing tried, `"variants": { "tested": [] }`.

## Rules

| Rule | Level | Instruction | Pitfall it prevents | Proved by |
| --- | --- | --- | --- | --- |
| S1 | Must | Report variability (SD or CI) and sample size next to every compared value, in text and charts. | Noise presented as signal | values[] (n, value, sd, ci, ci_level), metrics[].statistic |
| S2 | Should | Compare on paired data where possible (same items, same inputs) and report the difference, its standard error, its CI and the correlation between candidates. | Overstated or missed differences | comparisons[].paired |
| S3 | Must | Compute ratios and speedups with the baseline in the denominator, with their own CI (e.g. Fieller's interval). | Gains inflated by the reference point | baseline |
| S4 | Should | Repeat at every level where variance appears (build, process, iteration), most where most variance occurs; repetition at the highest variable level is mandatory. | False precision | runs.levels[] |
| S5 | Should | Round values to what their variability supports. | Pseudo-accuracy | enforced by the generator |
| S6 | Should | Prefer robust statistics (median, percentiles) to removing outliers. If removal is unavoidable, declare the rule in the plan before measuring (`analysis.outliers`, e.g. Tukey's 1.5 × IQR): compute applies it and reports how many values were removed. Never delete rows from a raw file. | Inconvenient results quietly removed | analysis.outliers, exclusions[] (computed) |
| S7 | Must | State conclusions as effect sizes with confidence intervals ("A is faster than B by 5.5% ± 2.5%"), compared with the user's minimum meaningful difference. Non-overlapping CIs do indicate a difference, but overlapping CIs prove nothing; prefer the CI of the difference over p-values or visual overlap. The effect, its interval and the verdict, with the qualifier "likely" when part of the interval falls short of the minimum, are computed by astrolabe compute. | "Statistically significant" but irrelevant, or misread tests | comparisons[] (effect, ci, ci_level, verdict), metrics[].minimum_meaningful |
| S8 | Should | Before the full run, estimate the minimum detectable effect from a pilot; if the benchmark cannot detect the difference the user cares about, enlarge it or say so. | Running a benchmark that cannot answer the question | runs.power |
| S9 | Must | When several variants or configurations were tried, report how many, and re-measure the selected one on fresh runs or data before presenting it. | Best-of-N selection inflating the result | candidates[].variants |
| S10 | Should | Do not assume normal distributions because the sample is large: performance data is usually skewed and multi-modal. Check (Q-Q plot, Shapiro-Wilk) before using mean-based CIs, or use the median with a nonparametric CI (needs more than 5 samples). | Tight-looking CIs around a mean that represents nothing | values[].method |
| S11 | Must | Declare the primary comparisons in the plan, before measuring, and keep them few. Their intervals are widened together (Bonferroni) and only they may carry a headline; every other comparison is labelled exploratory. State how many comparisons of each kind were made. | "Better" verdicts that appear by chance among many candidates, metrics and nodes | analysis.primary[], comparisons[].role, .adjusted |
