# Presentation: honest claims

Read before writing any sentence about the results: the answer in a README, a report, a title, your final reply. The tables and the card come from `astrolabe build`; what you add is words, and the words must claim no more than the numbers.

## Where each thing comes from

| In the write-up | Source |
| --- | --- |
| Values, intervals, n, failures, effects, verdicts | Copied from `dist/benchmark.md` by a command, or quoted exactly as printed there. Never retyped from memory, rounded again or recomputed |
| The card | The snippet `astrolabe build` prints. Never edit the SVG or PNG, and never draw your own chart beside it |
| The answer in words | Yours, held to the rules below |
| Method, environment, limitations | Written in the plan, so they appear in `dist/benchmark.md`; the write-up keeps them or links to them |

## Wording a result

- **Use the verdict's own strength.** "Better" is a claim; "likely better" says the direction is clear and the size uncertain; "equivalent" means no difference that matters; "inconclusive" means the data cannot tell. Do not turn the last three into a win: no "slightly faster", "edges out" or "wins" on an equivalent or inconclusive comparison.
- **An effect comes with its interval and its base.** "csv-b is 12% faster than csv-a (9% to 15%): 1.85 s against 2.10 s, median of 12 runs." A ratio alone hides whether the absolute numbers matter at all.
- **Units are exact**: ms or s, MiB or MB, requests per second, percentage points for a difference between two shares.
- **Only primary comparisons carry the conclusion.** An exploratory result is introduced as exploratory and never used for a headline or a recommendation.
- **A suite is summarized by its overall result together with its best and worst groups**, never by "up to 3× faster" on one of them.
- **A time measured on successful attempts only** says so in the same sentence or table row, with the failure rate.
- **A recommendation weighs what the user said matters.** When the metrics disagree (faster but heavier, cheaper but less accurate), show the trade-off and say which way the user's priorities point; when nothing separates the candidates, say that staying with the baseline costs nothing.
- **Limitations are part of the answer**: what was not tested, on which machine or at which time, who commissioned the benchmark and whether they have an interest in a candidate, and any choice made after seeing the data.
- **Declared figures** (list prices, features checked by hand, numbers reported by someone else) are named as declared, with their source and date.

## When the user wants more emphasis

A difference that the benchmark calls equivalent or inconclusive cannot be made to stand out without misleading: no cut axis, no zoom, no chart of your own, no change of the smallest difference that matters after the fact. What you can honestly do: state the exact difference and its interval in the text; show the absolute values; if the user now thinks a smaller difference matters, say that this is a new question, set it before a new measurement with enough runs to answer it, and bump `benchmark.version`.

## Rules

| Rule | Level | Instruction | Pitfall it prevents | Proved by |
| --- | --- | --- | --- | --- |
| D4 | Must | Always show absolute values, not only ratios or relative numbers; for a speedup, state the base case and its absolute value. | Hiding results that are bad or irrelevant in absolute terms | values[].value (absolute values required) |
| D5 | Must | Summarize with the right mean: arithmetic for costs (time, energy, money), harmonic for rates (ops/s); never average ratios, summarize the underlying costs or rates instead; only if those are unavailable, use the geometric mean of normalized scores. | Meaningless or flattering averages | enforced by the generator |
| D8 | Must | Include a limitations section listing what was not tested. | Over-generalized conclusions | limitations[] |
| D9 | Must | Give every quantity a unit, and make it unambiguous: count vs rate (flop vs flop/s), binary vs decimal prefixes (MiB vs MB), process RSS vs heap. | Numbers that look comparable but are not | metrics[].unit |
| D12 | Must | Never headline a best case alone ("up to 10× faster"): state the aggregate together with the best and worst results. | A single favourable sub-result sold as the conclusion | structure.nodes[], values[] per node |
