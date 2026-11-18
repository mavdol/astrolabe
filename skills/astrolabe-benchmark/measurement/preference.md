# Preference: which output people like better

Kind `preference`: writing, design, generated images, tone of an answer, anything judged by taste and not against a reference. The judges are people, or models standing in for people.

## How to set it up

- **Pairwise and blind.** Show two outputs for the same input, without saying which candidate made which, in an order drawn at random, and ask which is better, with a tie allowed. Subtle differences show better this way than with marks out of ten, which drift from one rater to the next.
- **Even exposure.** Every candidate is shown as often as the others and against each of the others.
- **One row per judgment**, written by the rating script or exported from the rating tool, never typed from memory: the item, the rater in a field of its own, and for the candidate a value of 1 (preferred), 0.5 (tie) or 0.

```json
{"candidate": "draft_b", "measure": "preferred", "value": 1, "item": "email-014", "rater": "r3"}
```

```json
{ "id": "preferred", "label": "Preferred over the baseline", "unit": "%", "direction": "higher", "kind": "preference", "statistic": "share",
  "definition": "Share of blind pairwise judgments won against the baseline's output for the same input; a tie counts half",
  "compare_as": "difference", "minimum_meaningful": 10, "failures_count_as": "zero",
  "from": { "raw": "judgments", "measure": "preferred" } }
```

A preference metric needs a `judge` section; `validate` asks for it.

```json
"judge": { "type": "human", "raters": 3, "method": "blind pairwise choice, tie allowed", "blinded": true,
  "order_policy": "left and right drawn at random for each pair",
  "agreement": { "double_rated_items": 100, "krippendorff_alpha": 0.74 } }
```

- **Several raters**: have a subset rated by two of them (100 items is a sound default) and report Krippendorff's alpha, computed by a script. At or above 0.8 the ratings are reliable; between 0.667 and 0.8 they support tentative conclusions only; below, they should not be used. These thresholds are conventions.
- **A model as judge** is held to the rules of any model that grades: it is not a candidate nor from a candidate's family (give every candidate its `family`), it judges both orders and a win counts only when both agree, and it is checked against people's ratings first. Accept it only if it agrees with people about as well as people agree with each other.
- **Variants**: every version shown to raters is reported, with how many were tried, not only the one that won.

## Scores people already gave

A tasting, a survey, a vote taken before anyone wrote a plan. The scores are the measurement; what you add is a plan that says how they were gathered.

- **Declare it**: add `gathered_before_plan` to `benchmark.conditions`. The report prints the condition for every reader.
- **People scoring for their own taste are participants.** When each person scores every candidate (a mark out of seven per poster, per menu), their differences are the result, not noise between raters: the judge is of type `participants`, each person is an `item`, and the pairing by person makes the comparison precise. A mark on a scale is read with `"statistic": "mean"` and compared as a difference.
- **Write what happened.** `blinded` and `order_policy` describe the day as it was. If people knew which candidate was which, `blinded` is `false`: `validate` accepts it for data gathered before the plan and every verdict that rests on those scores says the judges knew, in the report, on the page and on the card. Never set a field to what should have been done.
- **Several raters on the same items** without a double-rated subset: `validate` warns that their reliability is unknown; say so in `limitations`.

```json
"judge": { "type": "participants", "method": "each visitor scored each poster from 1 to 7", "blinded": false,
  "order_policy": "fixed: the current poster always shown first" }
```

The limitations name each flaw of the day (who knew what, a fixed order, a single day or batch), and the write-up proposes a study that removes every one of them.

## Rules

| Rule | Level | Instruction | Pitfall it prevents | Proved by |
| --- | --- | --- | --- | --- |
| P1 | Should | Prefer blind pairwise comparisons (which of A and B is better, tie allowed) for subtle differences; absolute ratings scale better but drift more when the judge changes. | Drifting, poorly calibrated scales | judge.method |
| P2 | Must | Hide candidate identities and randomize presentation order. For scores gathered before the plan without either, declare what was done (`blinded: false`, the order used): every verdict that rests on them then says the judges knew. | Brand and position bias | judge.blinded, judge.order_policy |
| P3 | Should | Sample all candidates evenly and keep the comparison graph connected. | Unequal exposure distorting rankings | values[].n |
| P4 | Must | Publish every variant tested, not only the best one, with the total number tried; no retracting scores (see S9). | Selection bias from best-of-many testing | candidates[].variants |
| P6 | Must | When judges are models, apply the quality.md judge rules (Q6–Q8, Q11). | Judge biases | judge |
| P7 | Must | With several raters judging the same items, have a subset rated twice and report Krippendorff's alpha: at or above 0.8 is reliable, 0.667–0.8 supports only tentative conclusions, below 0.667 the ratings should not be used. These cut-offs are conventions, not laws. People scoring the candidates for their own taste are participants, not raters, and need no agreement figure; ratings gathered before the plan without a double-rated subset are of unknown reliability, and validate warns. | Conclusions drawn from inconsistent ratings | judge.agreement |
| P8 | Should | Accept an automated judge only if it agrees with humans about as well as humans agree with each other on the same items. | A proxy that is worse than the people it replaces | judge.validation |
