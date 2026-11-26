---
name: astrolabe-benchmark
description: Design, run and report an honest benchmark or comparison with the astrolabe command. Scripts write raw data and `astrolabe compute` produces every number and verdict. Use this skill whenever the user wants to compare or benchmark anything (libraries, tools, APIs, services, models, prompts, apps, configurations, recipes, designs), or asks which option is better, faster, cheaper, lighter, more accurate or easier to use, even with nobody to test. Use it too when the data is already gathered (scores, ratings, survey answers, a tool's pasted output, figures already measured) and the user wants the answer, a results section or a report, asks for a winner, or asks to change a finished benchmark (drop failed runs, remove outliers, add runs, make a difference stand out, favour one candidate). Also for a benchmark's page, chart or README card, and to put it online (GitHub Pages, Netlify, a docs site). Use it even when they never say "benchmark". Not for profiling one program or explaining someone else's chart.
compatibility: Needs Node.js 22 or later and the astrolabe-bench npm package, version 0.2.5 or later, which provides the astrolabe command.
---

# Astrolabe benchmark

A benchmark people can verify. The idea that holds everything together: **you write declarations and code, never numbers.** A script writes one line of raw data per observation, `astrolabe compute` turns the raw data into every value, interval, comparison and verdict, and `astrolabe validate` computes them again, so a number typed or changed by hand is caught. A reader can then follow each claim back to a published script and a raw file.

It follows that you never type a measured number into a file, never compute a statistic yourself (not even a mean), never edit a raw file, and never name a winner the tool did not.

## The steps

Copy this checklist into your working notes and tick each step. Before acting on a step, read the files it names, again if the conversation was long. `benchmark.json` shows which sections are already written.

```
- [ ] 1. Frame: the decision, the candidates and the baseline, the metrics and the smallest difference that matters, the constraints
- [ ] 2. Research the domain and read each candidate's licence or terms
- [ ] 3. Write the plan in benchmarks/<id>/benchmark.json   (read: statistics.md, example.benchmark.json, the measurement file of each metric)
        gate: astrolabe validate   -> "The plan is valid"
- [ ] 4. Write the measuring scripts, run a short pilot, then the full run; the scripts write the raw files
- [ ] 5. astrolabe compute, then astrolabe validate   -> "Valid: every computed field matches the raw files"
- [ ] 6. Present: propose the page, write its sections, astrolabe validate, astrolabe build   (read: visualization/page.md, visualization/charts.md, visualization/style.md, presentation.md)
- [ ] 7. The write-up   (read: presentation.md)
- [ ] 8. Tell the user what was found, what you assumed for them, and what they must know before publishing
```

`validate` is the gate between steps: fix every error before going on. An error names its rule, the field to fix and the file of this skill that explains it; `astrolabe explain <rule>` prints the rule.

Putting the site online is not a step: do it only when the user asks, after reading deploy.md.

If the request is about a benchmark that already exists (drop runs, clean outliers, zoom, restyle, add a candidate, put it online), go to "Requests that push against the rules" below first.

## Which file to read when

| File | Read it |
| --- | --- |
| [statistics.md](statistics.md) | Step 3, always: runs, intervals, verdicts, primary comparisons, outliers |
| [example.benchmark.json](example.benchmark.json) | Step 3, always: a complete plan, with a note on each section |
| [measurement/time.md](measurement/time.md) | A metric is a run time, a latency or a throughput |
| [measurement/resources.md](measurement/resources.md) | A metric is memory, CPU or energy |
| [measurement/quality.md](measurement/quality.md) | Outputs are scored as right or wrong, or graded by a rubric or a judge; any suite of tasks; any model or other non-deterministic candidate |
| [measurement/cost.md](measurement/cost.md) | Candidates do not cost the same, or the user asks which is cheaper |
| [measurement/preference.md](measurement/preference.md) | People, or models standing in for people, say which output they prefer or score the candidates, including scores given before any plan |
| [measurement/usability.md](measurement/usability.md) | People use the candidates: task success, time on task, satisfaction, features |
| [visualization/page.md](visualization/page.md) | Step 6, always: what the page holds, the outline to propose, filters, exports |
| [visualization/charts.md](visualization/charts.md) | Step 6, before writing a chart block: which chart, scales, intervals |
| [visualization/style.md](visualization/style.md) | Step 6, before writing `style`, a title, a description or a table |
| [presentation.md](presentation.md) | Steps 6 and 7, before writing a title or any sentence about the results |
| [deploy.md](deploy.md) | Only when the user asks to put the site online |
| [benchmark.schema.json](benchmark.schema.json) | Only to look up a field's exact type; `validate` is quicker |
| [sources.md](sources.md) | Only when the user asks where a rule or a default comes from, or questions one |

Most benchmarks need two or three measurement files: a speed comparison of two libraries reads time, resources and quality (is the output right?).

## The twelve things that are never skipped

1. A neutral goal tied to a decision (F1, F2).
2. Metrics, units, direction and weights the user confirmed (F3, D9).
3. The domain researched and a workload that represents the user's real use (F4, F5, U1).
4. Every candidate compared in its own right: every pair compared, each one's results drawn beside the others' before any change against one; the version in use today named as the baseline (F7, S3, V57).
5. The same effort and a documented configuration for every candidate (F8).
6. The environment recorded, including where it ran (bare metal, a virtual machine, a container, a CI runner), with timestamps for services you do not control; scripts and raw data published (F11, F15, F16).
7. Repeated runs; variability and sample size beside every value; winners named from effects and their intervals (S1, S7).
8. Failures checked, counted and kept apart from successes (T8, Q5).
9. Every variant tried is reported, not only the best (P4, S9).
10. Honest pictures and stated limitations (D1, D8).
11. Publication rights checked for every candidate before anything is published (F14).
12. Raw data written by the program that measures; every number computed by `astrolabe compute` (F18, S11).

## The command

Check that it is there before anything else:

```bash
npx --no-install astrolabe --version
```

This skill is written for astrolabe 0.2.5 or later. If the check fails, the project does not have it: add the package `astrolabe-bench` to the project's development dependencies (ask first if installing is not yours to decide), then run the check again. If it prints an older version, that copy may refuse what this skill writes: update `astrolabe-bench` the same way, asking first likewise. Do not run a bare `npx astrolabe`: on npm that name belongs to an unrelated package. In the rest of this skill `astrolabe` stands for `npx --no-install astrolabe`. Write it in full in anything a reader will run (a README, a write-up, `artifacts.command`): `npx --no-install astrolabe build`, never `npx astrolabe build`. A CI workflow pins the version instead (deploy.md).

| Command | Use |
| --- | --- |
| `astrolabe validate [file]` | The gate. On a plan: checks it before anything runs. After compute: computes everything again from the raw files and compares |
| `astrolabe compute [file]` | Reads the plan and the raw files, writes the results into the file |
| `astrolabe build [file]` | Validates, then writes the site in `dist/site/`, `dist/benchmark.md`, and the README card and images under `dist/exports/`. `--format` picks among `site`, `md` and `svg`; `--url` is the site's public address, which the card snippet then links to |
| `astrolabe preview [file]` | Builds the site, serves it on this computer and rebuilds it when a file changes |
| `astrolabe import hyperfine <export.json...> --raw <id>` | Converts hyperfine exports into a raw file |
| `astrolabe import inspect <log...> --raw <id>` | Converts Inspect logs (`.eval` or `.json`) into a raw file |
| `astrolabe explain <rule>` | Prints one rule |
| `astrolabe --help` | The reference for every option |

Without a file argument the command takes `benchmark.json` in the current folder, then the one under `benchmarks/`. One benchmark lives in one folder, all of it committed except what the last line says:

```
benchmarks/<id>/
├── benchmark.json     the plan you write, then the results compute writes into it
├── scripts/           what artifacts.command runs
├── data/              the raw files listed in raw_data
└── dist/              written by build: benchmark.md and exports/ (the README card), and site/
```

`dist/site/` is the exception: it is rebuilt by the host or CI when published (deploy.md), so it goes in `.gitignore`.

## Step 1: frame

Ask at most these four questions, and only those the request and the repository do not already answer:

1. Which decision should this benchmark inform?
2. Which candidates are compared, is one of them what is in use today (the baseline), and which comparison decides: each against that one, the newcomers against each other, or every pair?
3. Which metrics matter most, how do they weigh against each other, and what is the smallest difference that would change the decision? A criterion named without its form ("memory", "speed") has several: peak memory or memory returned after a load, a cold start or a warm run. Propose the one or two forms that fit the decision, with the reason, from the table in its measurement file (F19); a form the user named is taken as given.
4. What are the constraints: time budget, environment, cold or warm performance?

Decide everything else yourself from the defaults in statistics.md and the measurement files, and announce it as a short plan the user can amend before anything runs. When nobody can answer (you run unattended, or the user said to go ahead), choose reasonable answers, write them in the plan, and list them in your final reply as choices made for the user.

Three answers shape the whole result, so they are worth a question:

- **The goal** is the user's decision, phrased neutrally as one short question: "which parser should the nightly import use?", never "show that X is faster". The page and the README card show it as their title, so keep it to 80 characters; `validate` warns past that. When the user owns or sells a candidate, or asks for one to win, the goal stays neutral and the protocol stays the same for everyone; see the table below.
- **The comparison that decides** comes from the decision, not from how a request is worded. "Should we leave A for B or for C?" is decided by B against C; "which of these tools?" by every pair. Every pair is compared by default, and whatever the pairs, the page shows every candidate's results side by side, as equals, before any change in percent against one of them (V57, visualization/charts.md). Name pairs in `analysis.pairs` only to compare fewer (statistics.md).
- **The smallest difference that matters** (`minimum_meaningful`, per metric) is what separates "better" from "a real difference too small to care about". It is set before measuring. If the user has none, propose one (10% is a common choice for a run time) and say so.

## Step 2: research, and read the terms

Before designing, note what the domain already knows: reference suites, standard metrics and units, known pitfalls, and what changed between the candidates (release notes, changelogs), which says where they should differ and so which forms of each criterion to measure (F19). Start from your own knowledge, then search when you can. This goes in `domain_research`, also when nothing was found ("none found for …" is an answer; an empty list is not). Prefer a reference suite to a home-made workload; if you take a subset, justify each omission and give no overall score.

For every candidate, read its licence or terms of service for a clause that restricts publishing benchmark or comparison results. Record what you read in `publication_terms`: the terms, the address or path read, the date, and the restriction or "none found". When there is a clause: quote it, say where it is, and tell the user before anything is published, with their options (ask the vendor for written permission, keep that candidate's results private, or decide knowingly). Say that whether such clauses can be enforced varies by country and that this is not legal advice. Never write "none found" for terms you did not read.

## Step 3: the plan

Read statistics.md, example.benchmark.json and the measurement file of each metric, then write `benchmarks/<id>/benchmark.json` with every section of the example: the plan holds no measured number. Run `astrolabe validate` and fix what it reports until it prints "The plan is valid". Take warnings seriously: a warning about planned runs means the plan cannot produce an interval, so no verdict.

What the plan must get right, because no tool can check it for you:

- **Workload**: the user's real inputs and the way the system is really called. A synthetic input needs a reason.
- **Fairness**: every candidate gets the same inputs, the same number of runs, the same tuning effort and a production-like configuration; `config` has the same keys for all.
- **Correctness beside speed**: add a metric that checks each output is right. A fast wrong answer is a failure, not a result.
- **Primary comparisons**: the few comparisons the decision rests on, declared now (`analysis.primary`). Everything else will be labelled exploratory.
- **Limitations**: what was not tested, and anything a reader needs to weigh the result: one machine, one input size, a sandbox, and any interest you or the user have in a candidate.

## Step 4: measure

Write the script that measures (in `scripts/`), and have it write the raw file itself, one JSON line per observation, failures included:

```json
{"candidate": "fastjson", "measure": "wall_time", "value": 2.08, "run": 3}
{"candidate": "fastjson", "measure": "wall_time", "value": null, "run": 4, "status": "timeout"}
{"candidate": "model_a", "measure": "correct", "value": 1, "item": "bugfix-017", "repeat": 2, "node": "bugfix"}
```

| Field | Content |
| --- | --- |
| `candidate`, `measure`, `value` | Always. `measure` is the name a metric reads in `from.measure`; `value` is a number, or `null` when the observation failed |
| `status` | Left out when the observation succeeded; otherwise the reason it failed (`timeout`, `exit_1`, `wrong_output`, `gave_up`) |
| `run` | Index of the run or process, when runs are repeated |
| `item` | Id of the input (a file, a question, a task, a participant). The same ids for every candidate make the comparison paired, which is more precise |
| `repeat` | Index of the repeat, when an item is tried several times |
| `node` | The lowest-level node of `structure` the item belongs to, when the plan has a structure |
| `cluster` | Id of the group, when items come in related groups |
| `ts` | Timestamp of the observation (ISO 8601), required for services you do not control |

Other fields are kept as they are (token counts, sizes). A measure scored right or wrong is written 1 or 0.

- When the observations already exist (a spreadsheet of scores, a survey export, a log the user kept), the user's file is the measurement. Write the plan first: add `gathered_before_plan` to `benchmark.conditions`, describe in `workload` how the data was gathered (who, blind or not, in what order, how many times), and say in `limitations` that the plan was written after the data existed. Then leave the file as it is, write a script that converts it into the raw file, and go on to step 5. Declare what happened, never what should have: scores people gave follow measurement/preference.md, "Scores people already gave".
- Prefer an established tool to your own timing loop, and convert its export: hyperfine for commands, Inspect for model evaluations (measurement/time.md and measurement/quality.md give the commands).
- Alternate or shuffle the candidates between runs. Running all of A and then all of B measures the drift of the machine.
- Run a short pilot first (a few runs), then `astrolabe compute`: it shows whether the script works, how noisy the measure is and whether failures occur. Then do the full run; the script overwrites the raw file, so pilot rows never mix with the real ones.
- Watch the runs. If a number looks too good, find out why before reporting it: did the candidate really do the work, did it hit an error or a limit, is the cache hiding the cost?
- A failed observation stays in the file with its status. Never delete or edit a line of a raw file, yours or the user's: to measure again, run the script again.

## Step 5: compute and check

```bash
astrolabe compute     # writes values, intervals, failures, comparisons and verdicts into benchmark.json
astrolabe validate    # recomputes everything and compares
```

Compute prints each primary verdict. Read them as they are (statistics.md explains the words). If a verdict is "inconclusive" and time remains, add runs or items by raising the planned number and running the script again; otherwise report it as inconclusive. Never touch a field compute wrote: validate will refuse the file.

## Step 6: present

The presentation sections of `benchmark.json` (`style`, `answer`, `filters`, `layout`, `blocks`, `exports`) say what the page, the README card and the images show; `build` draws them. They never touch `results`, so changing them never changes a number or the hash. Read visualization/page.md and presentation.md, then propose the page as a short outline (headlines, charts, table, exports) and let the user amend it before writing anything. Seven things hold on every page:

1. Each chart answers a question the reader brings: the one visualization/charts.md recommends for the shape of the results, or an alternative it names, with your reason; what can be drawn is drawn, not written.
2. Honest scales: bars from zero, no axis breaks, compared charts on one scale, the direction marked.
3. Every value that has an interval is drawn with it, and the interval is named.
4. Titles are short claims and readings one sentence: numbers by template, the verdicts they rely on listed in `asserts`, the headline or summary that answers the goal first.
5. One colour per candidate, never colour alone, contrast checked by the generator.
6. The default view tells the whole story, and exports show that view.
7. Every chart and export reads alone: how to read it, a text alternative, a data table, provenance.

Then:

```bash
astrolabe validate    # refuses a chart that does not fit its data, a typed number, a title its verdicts no longer support
astrolabe build       # the site in dist/site/, dist/benchmark.md, the README card; prints the snippet that shows the card
astrolabe preview     # the site on this computer, to read it as a reader would
```

Each `validate` error names the block, the rule and what to use instead: fix the file, never `dist/`. Warnings are fixed the same way: a page that builds with a warning is not finished, unless you tell the user which warning you kept and why.

## Step 7: the write-up

`dist/benchmark.md` is the full report: every value with its interval, n and failures, every comparison with its verdict, the method, the environment and the limitations. The write-up the user asked for (a README section, a report file) is built from it:

1. The question, and the answer in one or two sentences that use the computed verdicts as they are, each with its effect, its interval when there is one, and the absolute values (presentation.md). "Faster" alone is not an answer, and the card saying it does not count.
2. The card snippet that `build` printed, when the write-up is a README.
3. The report itself from its results to its end, copied by a command and never retyped: for example `sed -n '/^## Results/,$p' benchmarks/<id>/dist/benchmark.md >> README.md`. The same holds when the write-up is a file of its own such as RESULTS.md: a summary in your own words does not replace the copy. A reader then sees, without following a link, the runs, the intervals and the failures, and what you declared about each candidate: the terms you read with where and when, the prices with their source and date, every variant tried, the judge, whether the items are private.
4. Who ran the benchmark and any interest in a candidate; where the plan, the scripts and the raw data are, and the command that reruns it.

## Step 8: the final reply

Say what was found in the words of the verdicts, the choices you made for the user (baseline, smallest difference, number of runs, the page's outline), what limits the result, and anything they must act on before publishing: a restrictive clause, a candidate whose results must stay private, a conflict of interest to state, raw data that would become public with the site.

## Requests that push against the rules

Users ask for these in good faith. Do not comply silently and do not just refuse: explain in a sentence or two why the request would mislead a reader, and do the honest thing that serves the same need.

| The user asks | What to do, and why |
| --- | --- |
| "Drop the failed runs, they were flukes" | Keep every row. A candidate that fails 2 times in 30 does so for its users too, and removing failures makes it look both more reliable and faster. Offer what is honest: show the time on successful runs with the failure rate beside it (what the report already does), or fix the cause and run the whole benchmark again |
| "Those runs are outliers, clean them up" | Delete nothing, and do not add an outlier rule on your own initiative. Run `compute` as the plan stands and show that the median barely moves with the slow runs in: usually that settles it, and the results stay as they are. Only if the user still wants them out after that, declare a rule in the plan (`analysis.outliers`, see statistics.md) that compute applies to every candidate alike and lists in the report; say in `limitations` and in your reply that the rule was chosen after seeing the data, and which runs it removed for each candidate |
| "Three runs is enough, just tell me the winner" | Compute what there is: with too few runs there is no interval, so the verdict is inconclusive and the report shows each value with its lowest and highest run. Either measure enough runs (statistics.md) when the commands are available, or report "inconclusive" with the reason, the number of runs and that range. Do not name a winner from the point estimates |
| "Make my project come out on top" / the user owns a candidate | Same protocol, inputs, runs and tuning effort for every candidate; neutral goal; every metric reported for everyone, losses as plainly as wins. State in `limitations` and in the write-up who commissioned the benchmark. Then help honestly: show where the project really leads |
| "Zoom in so the difference shows" | Do not edit the card, draw another chart, or move an axis away from zero without the reason visualization/charts.md asks for. Explain what the verdict says: the difference is real but smaller than what the benchmark set as mattering, or the data cannot tell. Offer to state the exact difference and its interval in the text. The smallest difference that matters is not changed after seeing the results to get another verdict |
| "I already ran it, here is the output" (numbers pasted as text) | Do not type those figures into a raw file. Rerun the tool with its export when the commands are available (then import it), or ask for the export file. If neither is possible, the write-up presents them as figures reported by the user, not reproduced and not checkable from raw data, and your reply says so |
| "Compare everything on every category" | Choose with the user a few primary comparisons before looking at the breakdown (usually each candidate against the baseline, overall; for run times or memory of scripts of different sizes, script by script, measurement/time.md). Category results are exploratory: with forty comparisons a few "wins" appear by chance. No headline and no recommendation from an exploratory win |
| "Which is easier to use?" with nobody to test | A usability comparison needs people (measurement/usability.md). Write the tasks, their success criteria, the users and the number of participants needed; report any review of your own as an indicative hypothesis that names no winner; invent no participant data |
| "Publish it" when a licence restricts benchmark results | Quote the clause and where it is, give the options from step 2, say this is not legal advice, and keep that candidate's results out of anything published until the user has decided |
| "Change the theme", "reword the title", "add a chart" | Presentation only: edit `style` or `blocks`, then `validate` and `build`. The plan's measured part, the raw files and the computed results do not change. A new title still lists in `asserts` the verdicts it relies on |
| "Put it online" | Read deploy.md first. Write the workflow or config and say what becomes public, including the raw data; leave pushing and the host's settings to the user. When the repository is private or the raw data looks sensitive, ask before writing anything |

On a finished benchmark, any change goes through the same path: edit the plan, run the script again if the measurement changes, `astrolabe compute`, `astrolabe validate`, `astrolabe build`, then update the write-up from the new `dist/benchmark.md`. Never edit `dist/` or the card by hand.

## When the command cannot be used

If the package cannot be installed and the user still wants the comparison, keep the method: a script writes the raw data, a script (not you) computes medians and intervals, failures are counted, and the write-up gives runs, spread, environment and limitations. Say that the results were not computed or checked by astrolabe.

## Framing rules

The rules behind steps 1 to 4. Must rules apply to every benchmark; Should rules when relevant. `astrolabe explain <rule>` prints any rule, including those of the other files.

| Rule | Level | Instruction | Pitfall it prevents | Proved by |
| --- | --- | --- | --- | --- |
| F1 | Must | Ask the user which decision the benchmark must inform before designing anything. | Measuring first and choosing the conclusion after | benchmark.goal |
| F2 | Must | Phrase the goal neutrally ("which option fits this case"), never "show that X wins", as one short question of 80 characters at most: the page and the README card show it as their title. | Biased goals steer workload and metric choices | benchmark.goal |
| F3 | Must | Derive candidate metrics from what the system delivers; the user picks and weights them, the agent proposes and challenges. | Irrelevant or convenient metrics | metrics[] (label, kind, unit, direction, statistic, weight) |
| F4 | Must | Before designing, research the domain: existing reference benchmarks or suites, standard metrics and units, and known pitfalls, from your own knowledge first, then a web search when available. Prefer reusing a reference suite; if it is subset, justify each omission and never report an overall score for the subset. Record what was found, or that nothing was found. | Ignoring what the domain already knows; cherry-picked subsets | domain_research (reference suites, metrics, pitfalls, sources; may be empty) |
| F5 | Must | Use a workload representative of the user's real use: the input ranges that matter and the way the system is actually called (one request or many, batch or sequential), since the usage pattern can change cost and speed by an order of magnitude (Kapoor et al.). | Input ranges chosen to make one option look good | workload |
| F6 | Should | Show where each option improves and where it degrades (progressive and conservative criteria). | Hiding the trade-off | — |
| F7 | Must | Compare against the right baseline: the current state of the art or an unperturbed system, not an old version or yourself. | Inflated gains from outdated baselines | baseline |
| F8 | Must | Give every competitor the same tuning effort, document every configuration, disable debug defaults, and enable the features a production user would turn on. | Unfairly configured competitors | candidates[].config |
| F9 | Should | Keep tuning or calibration data disjoint from evaluation data, and hold out items at the level of generality you claim: new tasks for a general claim, not just new examples (Kapoor et al.). | Results that only show fit to known data | — |
| F10 | Should | Benchmark actively: observe the system during runs and answer the sanity checklist (why not double, was it tuned, did it break limits, did it error, does it reproduce, does it matter, did it even happen). | Measuring the wrong bottleneck or a run that never happened | — |
| F11 | Must | Record hardware, software versions, configuration and where the measurements ran (bare metal, a virtual machine, a container, a CI runner), and write down assumptions and limitations. | Results nobody can interpret or reproduce | environment, limitations[] |
| F12 | Should | State what the benchmark tests and how its scores should be interpreted. | Scores read as broader claims than they support | benchmark.scope |
| F13 | Should | Run a sensitivity check: vary the parameters most likely to matter (input size, concurrency, settings) and say whether the conclusion holds. | Conclusions that only hold at one setting | limitations[] |
| F14 | Must | Before publishing, look for clauses restricting benchmark publication ("DeWitt clauses") in each candidate's licence or terms of service, quote and link any clause found, and tell the user before anything is published. Offer the options (ask the vendor for permission, keep that candidate private, or decide knowingly), say that enforceability varies by jurisdiction (a New York court struck down one such clause), and state plainly that this is not legal advice. Record the address of the terms read and the date, also when nothing was found. | Publishing results a licence forbids, or silently dropping inconvenient candidates | candidates[].publication_terms |
| F15 | Must | For services you do not control (SaaS, APIs, cloud), timestamp every measurement, record region, plan and version, spread runs across times of day and days, and aim for claims that would hold on a rerun rather than identical numbers. | Results tied to one moment, one region or one silent update | raw ts, candidates[].service |
| F16 | Must | Publish the scripts, configuration and raw data needed to rerun the benchmark, with the exact commands, and link them from every output. | Results nobody can check or rerun | artifacts |
| F17 | Should | Version the benchmark itself: any change to workload, metrics or scoring creates a new version, and results from different versions are never compared directly. | Numbers from different benchmarks compared under one name | benchmark.version |
| F18 | Must | Have the program that measures write the raw data, one line per observation, failures included: your own script, or a tool's export converted by astrolabe import. Never type or copy a measured number yourself, and never compute a statistic: run astrolabe compute. | Numbers miscopied, rounded or invented by the agent; intervals computed wrongly by hand | raw_data[], metrics[].from, results.computed (recomputed by validate) |
| F19 | Should | When a criterion is named without its form (memory, speed, quality, cost), turn it into its precise forms (each measurement file lists them) and propose the one or two that fit the decision, ranked by what changed between the candidates in their release notes or changelogs. The user decides; running unattended, add them as exploratory. A form the user named is taken as given. | A metric chosen because the tool reports it, while the candidates differ somewhere else | metrics[].definition, domain_research |
