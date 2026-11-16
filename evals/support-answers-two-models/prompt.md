---
description: Two models compared on the user's own questions, with judges available
tags: [quality, judge]
max_turns: 80
timeout_seconds: 2400
allowed_tools: [Read, Glob, Grep, Skill, TodoWrite]
---

Compare model-a and model-b on our support questions (data/questions.jsonl) and tell me which one we should ship. Everything you can call is described in docs/models.md. Write the results to RESULTS.md.

Input files: README.md, docs/models.md, data/questions.jsonl, vendor/models.js
