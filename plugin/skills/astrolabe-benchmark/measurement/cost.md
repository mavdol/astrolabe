# Cost: money and effort

Kind `cost`. A quality or speed result without its cost can mislead, because spending more (a bigger machine, retries, a larger model) often buys the gain. When candidates do not cost the same, cost is a metric of the benchmark.

## Which form of cost (F19)

"Cheaper" has several forms. When the user names none, propose the one or two that fit the decision, from what changed between the candidates:

| Form | What it answers | Points to it |
| --- | --- | --- |
| Per unit (request, item, run) | What does one use cost? | Usage-based pricing |
| At the user's volume, per period | What will the bill be? | Tiers, minimums, free allowances; a change in the pricing model |
| Including fixed and setup costs | What does it cost to own? | Licences, machines, migration effort |
| Per successful result | What does a useful answer cost, retries included? | Candidates that fail or retry at different rates |

## How to declare prices

Each candidate carries its pricing, with where the price was read and when; `validate` asks for it as soon as a cost metric exists:

```json
"pricing": { "model": "per request; failed requests are billed", "source": "https://example.com/pricing, standard plan", "date": "2026-11-02",
  "variable": 0.5, "volume": "per 1,000 requests" }
```

Read the price page yourself, including what is billed (failed requests, minimums, rounding, free tiers) and which plan matches the user's volume. A price changes: the date and the source let a reader check it later. `fixed` holds a one-off or monthly fee, `period` the time span for a total cost of ownership.

## Two ways to get the cost metric

**Computed from measured usage, preferred.** The script records what each item or request really consumed (tokens, requests, seconds) and writes its cost, from the declared price, as a measure. The usage stays in the row, so anyone can recompute when prices change.

```json
{"candidate": "model_a", "measure": "cost_usd", "value": 0.004643, "item": "q-017", "repeat": 1, "input_tokens": 812, "output_tokens": 240}
```

```json
{ "id": "cost_per_item", "label": "Cost per question", "unit": "USD", "direction": "lower", "kind": "cost", "statistic": "mean",
  "definition": "API cost of one question, from the token counts of each call and the list price",
  "compare_as": "relative", "minimum_meaningful": 10, "failures_count_as": "excluded",
  "from": { "raw": "items", "measure": "cost_usd" } }
```

**Declared.** A list price or a quote that no script measured is a metric without `from`. You write its values yourself, in `values`, each with its evidence; the report marks them "declared" so that a reader knows they were not computed from raw data. This is the one place where you write a number, and it is a number you read, not one you worked out.

```json
"values": [
  { "candidate": "geo_a", "metric": "cost", "value": 0.5, "evidence": "Price page, standard plan, per 1,000 requests, read 2026-11-02", "source": "declared" },
  { "candidate": "geo_b", "metric": "cost", "value": 0.75, "evidence": "Price page, pay as you go, per 1,000 requests, read 2026-11-02", "source": "declared" }
]
```

Compute keeps these entries and adds the computed ones beside them.

## What to state with a cost

- The volume it assumes, taken from the user's real use ("40,000 requests a month"), since the cheaper option can change with the volume. A cost at the user's volume is worked out by a script from the declared prices, not by hand.
- Fixed costs apart from variable ones, and the period.
- The cost next to the quality or speed it buys, never a "price/performance" ratio alone: a ratio can hide that one side is unusable.
- When two metrics pull in opposite directions (cheaper but less accurate), say so and let the user's weights decide; do not crown a single winner.
- Include a simple cheap option as a candidate when one exists (`"role": "simple_baseline"`): a complex candidate should beat it on cost too.

## Rules

| Rule | Level | Instruction | Pitfall it prevents | Proved by |
| --- | --- | --- | --- | --- |
| C1 | Must | Report cost next to every quality or speed result, in real money rather than proxies (parameter count, instance size). | Gains bought with unreported spending | candidates[].pricing, values[] |
| C2 | Should | When two metrics trade off (cost vs accuracy, cost vs latency), show the Pareto frontier instead of a single winner. | Ranking that ignores the trade-off | chart choice |
| C3 | Should | Include simple, cheap baselines (e.g. retry or a smaller option) so complex candidates must beat them on cost too. | Complexity mistaken for progress | candidates[].role |
| C4 | Should | Split fixed costs (setup, one-off) from variable costs (per run, per request), state the usage volume assumed, and give a total cost of ownership over a stated period when hardware or licences are involved (TPC uses three years, maintenance included). | Conclusions that flip at real volumes or over time | candidates[].pricing (fixed, variable, volume, period) |
| C5 | Must | Record each price with its date and where it can be obtained (public price page, plan, sales channel). | Silent staleness and unverifiable prices | candidates[].pricing.source, .date |
| C6 | Should | Report price/performance (cost per unit of result) together with the raw performance and the raw cost, never alone. | A ratio hiding that one side is unusable | derived by the generator |
| C7 | Should | For metered services, report three things: the pricing model assumed, the resources actually used, and the amount actually charged (billing granularity can make them differ). | Costs computed from list prices that the bill does not match | candidates[].pricing.model, values[].usage, .charged |
| C8 | Should | Record the raw usage behind every cost (tokens, requests, compute hours, seats) so anyone can recompute it when prices change. | Cost comparisons that expire with the next price change | values[].usage |
