---
description: The full path of a three-library comparison, with the context compacted before the page is made
tags: [measurement, presentation, full-path, compaction]
max_turns: 120
timeout_seconds: 3000
allowed_tools: [Read, Glob, Grep, Skill, TodoWrite]
---

Our nightly job imports data/orders.csv with csv-simple (see src/import-orders.js). I'm thinking of switching to csv-machine or csv-regex, all three are in vendor/. Compare them on our use case and make me a page with the results that the team can open, with a short summary in the README. Keep the benchmark in benchmarks/csv-parsers/. The job runs on a build server, files are the size of data/orders.csv, and what matters to us is wall time, memory, and parsing our files correctly. You have about half an hour.

Input files: package.json, README.md, src/import-orders.js, scripts/make-orders.mjs, vendor/, data/orders.csv
