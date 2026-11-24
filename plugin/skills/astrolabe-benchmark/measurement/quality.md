# Quality: correct answers and graded outputs

Kind `quality`: outputs checked against a reference (right or wrong, a pass rate, an accuracy) or graded by a rubric or a judge. Read this file for any speed benchmark too: an output must be checked before its time counts.

## Contents

- Checking that outputs are right
- Items, repeats and groups
- Suites: `structure`
- Model evaluations with Inspect
- Judges
- Contamination
- Rules

## Checking that outputs are right

A run that completed is not a run that worked. The script compares each output with a reference (the expected file, the known answer, the result of the trusted implementation) and writes the verdict as a measure, 1 or 0:

```json
{"candidate": "csv_b", "measure": "correct", "value": 1, "item": "orders.csv", "run": 3}
```

```json
{ "id": "correct", "label": "Correct output", "unit": "%", "direction": "higher", "kind": "quality", "statistic": "share",
  "definition": "Share of runs whose parsed rows equal the reference rows, field by field",
  "compare_as": "difference", "minimum_meaningful": 1, "failures_count_as": "zero",
  "from": { "raw": "runs", "measure": "correct" } }
```

Look at real outputs yourself at least once, on the user's real inputs: edge cases (quoted fields, empty values, non-ASCII text, the largest file) are where candidates differ. When candidates disagree, find out which one is wrong and report it in words as well: a correctness defect usually weighs more in the decision than any speed difference. A crash, a timeout or an empty answer is a failure row (`value: null` with a `status`), kept apart from a wrong answer (value 0).

## Items, repeats and groups

- **Items** are the unit: one question, one file, one task. Give every candidate the same items with the same ids, which makes the comparison paired.
- **Repeats.** When the same input can give different outputs (a model with sampling, a randomized algorithm), declare the condition `non_deterministic` in `benchmark.conditions`, try each item several times (default 5) and add a `repeat` level to `runs.levels`. Compute averages the repeats of an item first and takes the uncertainty from the items: 5 repeats of 100 questions are 100 observations, not 500. Do not lower the temperature just to reduce the noise, unless the user runs it that way.
- **Related items** (several questions about one document, several files of one project) are less independent than they look: write the group in the `cluster` field of each row and their number in `workload.clusters`.

```json
"runs": { "levels": [{ "level": "question", "field": "item", "planned": 120 }, { "level": "repeat", "field": "repeat", "planned": 5 }] }
```

## Suites: `structure`

When items fall into tasks or categories, declare them, so that no average hides a regression. Each row names its lowest-level node; compute fills the parents.

```json
"structure": {
  "levels": ["suite", "category"],
  "nodes": [
    { "id": "suite", "level": "suite", "label": "Support questions" },
    { "id": "billing", "level": "category", "label": "Billing", "parent": "suite", "description": "Refunds, invoices and failed payments." },
    { "id": "shipping", "level": "category", "label": "Shipping", "parent": "suite", "description": "Delivery dates, lost parcels and returns." }
  ]
}
```

Give each part a `description` when its label does not tell a reader what it does or contains, in one or two plain sentences: what the script runs, what the questions ask. The page lists the parts in its method, each opening to its description, and links every part's name to it, on its tables and its charts; a reader who does not know the suite learns what a row measured without leaving the page.

A metric says how groups combine in `aggregation.groups`: `macro` gives each child the same weight, `micro` weighs by number of items. The report shows the overall value with the best and the worst group. Declare the primary comparisons at the top node (`{ "metric": "accuracy", "node": "suite" }`); the per-group comparisons are then exploratory, which is what they should be when there are many. Never report a headline from the best group alone.

## Model evaluations with Inspect

Inspect logs keep one record per sample and per epoch, which maps directly onto items and repeats:

```bash
astrolabe import inspect logs/*.eval --raw items
```

The sample id becomes `item`, the epoch `repeat`, the task `node`, and each scorer a measure, with token counts and times as further measures. A log is matched to a candidate by its model name (give the candidate that id or name), or by `inspect eval --metadata candidate=<id>` when one model is two candidates (two prompts). A task is matched to a lowest-level node by its name, or by `--metadata node=<id>`. Samples that errored or hit a limit become failures; the import prints them per candidate.

## Judges

When a model or a person grades the outputs, describe it in `judge`; `validate` checks the description.

```json
"judge": { "type": "model", "model": "judge-model-c", "family": "provider-z", "used_for": ["policy_qa"],
  "method": "rubric with a reference answer", "blinded": true, "order_policy": "one answer graded at a time; no pairwise order" }
```

- Where an answer can be checked by a program or against a reference, do that instead of asking a judge, or give the judge the reference.
- A judge is never a candidate, nor a model of a candidate's family: models favour text that resembles their own. Give every candidate its `family`; `validate` refuses a judge of the same family. If several judges are available, this is the criterion that chooses, and the write-up says why.
- The judge does not see which candidate wrote what (`blinded`). When it compares two outputs, it judges both orders and a win counts only when both agree, otherwise a tie.
- Before trusting a judge, check it on a sample a person has graded, and check that a padded copy of an answer does not score higher. Record the agreement in `judge.validation`, or say in `limitations` that the judge was not validated.
- `used_for` lists the nodes the judge scores, when the plan has a structure.

## Contamination

A candidate that was trained or tuned may have seen the test items: public test sets end up in training data, and prompts get tuned on the very questions used to score them. Declare the condition `trained_or_tuned` and say what the items are:

```json
"workload": { "description": "...", "usage_pattern": "...",
  "contamination": { "items": "private", "published": false, "risk": "low: written in-house from real tickets, never published" } }
```

Prefer private, fresh or regenerated items, and say in the write-up which were used. If you tune a prompt or a setting, tune it on items that are not used for scoring, and list every variant tried in `candidates[].variants`, not only the one that scored best.

## Rules

| Rule | Level | Instruction | Pitfall it prevents | Proved by |
| --- | --- | --- | --- | --- |
| Q3 | Should | When items come in related groups, use clustered standard errors and report the number of clusters (naive errors can be several times too small). | Error bars that are too narrow | workload.clusters |
| Q4 | Must | For non-deterministic candidates, run each item several times, average per item, and compute the error from per-item means (never pool all answers as independent). | One lucky or unlucky run decides the ranking | runs.levels[] with a repeat level |
| Q5 | Must | Verify outputs are actually correct (read back what was written, check each answer), not just that the run completed. | Counting wrong or empty outputs as successes | failures[] |
| Q6 | Must | When a model judges two outputs, judge both orders and count a win only when both agree (otherwise a tie); random order assignment is an alternative at large scale. | Position bias | judge.order_policy |
| Q7 | Must | Never let a candidate, or a model from the same family, judge its own outputs; test the judge for verbosity bias (a padded copy of an answer must not win). | Self-preference and verbosity bias | judge.family, candidates[].family |
| Q8 | Should | Validate an automated judge against a sample of human ratings before trusting it. | An unvalidated proxy treated as ground truth | judge.validation |
| Q9 | Must | Never report one aggregate alone: show sub-scores per task family. | Averages hiding regressions | structure.nodes[], values[] per node |
| Q10 | Must | Check whether candidates may already have seen the test items (public test sets in training data, or tuning on the same public set); prefer fresh, private or regenerated items and state which were used. | Memorization scored as capability | workload.contamination |
| Q11 | Should | For items with a verifiable answer, check automatically or give the judge a reference answer instead of letting it grade freely. | Judges misled by wrong candidate answers | judge.method |
| Q12 | Should | Do not change a candidate's sampling settings (e.g. temperature) just to reduce variance; repeat items instead, unless the user's real use runs with those settings. | Measuring a different system, or adding bias | candidates[].config |
