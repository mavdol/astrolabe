---
description: A library that reads long logs faster but starts slower, on scripts of very different lengths
tags: [measurement, statistics]
max_turns: 60
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Skill, TodoWrite]
---

Should our scripts switch from logline to logline-fast? Both are in vendor/, and `LOGLINE=fast` makes lib/parse.mjs load logline-fast, so you can try it on our scripts. Keep the benchmark in benchmarks/logline/ and put the answer in the README.

Input files: README.md, scripts/, lib/parse.mjs, vendor/, logs/
