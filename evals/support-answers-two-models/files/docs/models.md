# Models available in the sandbox

| Model | Family | Use |
| --- | --- | --- |
| model-a | Corvid | Candidate. Temperature 0.7 |
| model-b | Heron | Candidate. Temperature 0.7 |
| judge-corvid | Corvid | Larger model, can grade answers against a reference |
| judge-wren | Wren | Larger model, can grade answers against a reference |

Prompt templates: `support-v1` (in production today) and `support-v2` (draft from last week).

Usage: `import { ask, judge } from "./vendor/models.js"`, then `await ask("model-a", "q01", { template: "support-v1" })` and `await judge("judge-wren", "q01", answer)`.
