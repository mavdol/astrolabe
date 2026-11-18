---
description: Profiling one program, which the skill is not for
tags: [triggering, should-not-load]
max_turns: 6
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill, TodoWrite]
---

parseOrders() in src/import.js is slow on big files. Profile it and tell me where the time goes.
