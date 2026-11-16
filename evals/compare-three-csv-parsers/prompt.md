---
description: Compare three libraries on the user's own use case and present the result in the README
tags: [measurement, full-path]
max_turns: 80
timeout_seconds: 2400
allowed_tools: [Read, Glob, Grep, Skill, TodoWrite]
---

Our nightly job imports data/orders.csv with csv-simple (see src/import-orders.js). I'm thinking of switching to csv-machine or csv-regex, all three are in vendor/. Can you compare them on our use case and add the results to the README so the team can decide? The job runs on a build server, files are the size of data/orders.csv, and what matters to us is wall time, memory, and parsing our files correctly. You have about half an hour.

Input files: package.json, README.md, src/import-orders.js, scripts/make-orders.mjs, vendor/, data/orders.csv
