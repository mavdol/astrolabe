# Usability: tasks, ease of use, features

Kinds `usability` and `feature`: anything people use, such as apps, tools, services and products. Usability is how well specified users reach specified goals in a specified context, so all three must be written down before anyone is tested.

## It takes people

Ease of use is measured on participants. Reading documentation, a product tour or the interface yourself is an expert review: it finds likely problems and gives hypotheses to test, and it cannot say which product is easier. When nobody can be tested:

- do not name a winner, not even a cautious one;
- write no success rate, time or score that no participant produced, however it is labelled (estimated, simulated, expected);
- deliver what is useful now: the study plan below, ready to run, and your review clearly marked as indicative.

## The plan of a study

```json
"workload": {
  "description": "Three tasks from a new hire's first week",
  "usage_pattern": "Moderated sessions of 30 minutes, one app per participant",
  "tasks": [
    "Create a note with a title, a list and an image. Success: the note is saved with all three within 5 minutes, without help",
    "Share a note with a named colleague, with edit rights. Success: the colleague can edit it",
    "Find a note written last week from two keywords. Success: the right note is open within 2 minutes"
  ],
  "users": "New support hires who have used neither app"
}
```

- **Tasks** are representative of real use and each has an explicit success criterion, written before testing. **Users** says who they are (novice or expert) and in which context.
- **Three measures, reported separately**: effectiveness (task success, a share), efficiency (time on task, a median) and satisfaction (a questionnaire such as SUS, a mean). They correlate weakly; do not fold them into one score.
- **Participants**: at least 20 per candidate to compare numbers, around 40 for tight intervals. Five users find problems; they cannot rank products. Below 20, compute marks the comparison indicative and names no winner, and `validate` warns on the plan. The participant is the first level of `runs.levels`:

```json
"runs": { "levels": [{ "level": "participant", "field": "item", "planned": 24 }], "order": "apps assigned at random; task order rotated" }
```

- **Rows** come from the session records (a form export, a log), one per participant, task and measure, with the participant as `item` and the task as `node`. When each participant tries a single product, give participants different ids across products (`a01`, `b01`), so they are not taken for the same person.
- **Time on task** counts successful attempts only (`"failures_count_as": "excluded"`), is labelled so, and always sits next to the success rate: a product whose users give up early looks fast. A participant who gives up is a row with `value: null` and `"status": "gave_up"`. When the tasks differ a lot in length, compare time on task task by task in `analysis.primary`: pooled over the tasks, its median belongs to none of them, and averaged, the longest tasks decide the change (T13 in measurement/time.md).

## Features

A feature is verified by using it, not by reading the marketing page: record present, partial or absent with what you did and saw, the product version and the date. Feature values are declared (kind `feature`, no `from`), each with its `evidence`. In a weighted matrix the user sets the weights, each scale is defined, the per-criterion scores are always shown beside the total, and you check whether the ranking survives a reasonable change of weights.

## Rules

| Rule | Level | Instruction | Pitfall it prevents | Proved by |
| --- | --- | --- | --- | --- |
| U1 | Must | Define representative tasks with explicit success criteria before testing, and state who the users are (novice or expert) and the context. | Tasks chosen to flatter one tool | workload.tasks, workload.users |
| U2 | Must | Measure effectiveness (task success, errors), efficiency (time on task) and satisfaction (e.g. SUS) separately, and report all three. | Collapsing weakly related measures into one score | metrics[] |
| U3 | Should | Count time on failed tasks separately from successful ones. A time measured on successful attempts only is labelled so, and compared next to the failure rate: a candidate that gives up on hard tasks looks faster (compute warns when the failure shares differ). | Fast abandonment counted as efficiency | failures[] |
| U4 | Should | Verify each claimed feature by actually using it; record present, partial or absent with evidence and the product version and date. | Marketing pages taken as facts | values[].evidence |
| U5 | Should | In weighted feature matrices, let the user set the weights (F3), define each scoring scale, always show the per-criterion scores beside the total, and run a weight sensitivity check; note that adding or removing an option can reverse the ranking. | Totals driven by arbitrary weights or scales | metrics[].weight, values[] per node |
| U6 | Must | To compare usability numbers, test at least 20 participants per condition (around 40 for tight intervals). Five users find problems; they cannot rank products. With fewer participants, label results as indicative and declare no winner. | Rankings built on qualitative-size samples | values[].n |
