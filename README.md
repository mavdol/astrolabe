<div align="center">
<h1> ҉Astrolabe</h1>

<b>An agent-native framework to run and showcase benchmarks.</b>

[![npm](https://img.shields.io/npm/v/astrolabe-bench)](https://www.npmjs.com/package/astrolabe-bench)
[![CI](https://github.com/mavdol/astrolabe/actions/workflows/ci.yml/badge.svg)](https://github.com/mavdol/astrolabe/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
</div>

<!-- screenshot -->

Astrolabe lets your agent run benchmarks you can trust. Ask which library is faster or which prompt works better, and your agent measures it fairly, then publishes the results as a page, a README card and charts.

A skill teaches the agent the method, and the `astrolabe` command computes every number from the raw data. Nothing is typed by hand, so every claim can be checked.

## ◌ Skill & Install

Your agent loads the skill when you ask it to compare or benchmark something, or to report on results you already have. If your project doesn't have the `astrolabe` command yet, the skill adds it, after asking you. It needs Node.js 22 or later.

**Claude Code plugin**

```bash
claude plugin install astrolabe --marketplace mavdol/astrolabe
```

Or add the marketplace with `/plugin marketplace add mavdol/astrolabe` and find the plugin under `/plugin`.

**Any agent that reads Agent Skills**

```bash
npx skills add mavdol/astrolabe
```

or

```bash
npm install --save-dev astrolabe-bench
npx --no-install astrolabe init   # copies the skill into .agents/skills/, or --dir <your agent's skills folder>
```

**Manually**

Copy [`skills/astrolabe-benchmark/`](skills/astrolabe-benchmark) into your agent's skills folder, such as `.agents/skills/` or `.claude/skills/`.

> [!TIP]
> Use Claude Sonnet or a stronger model. Smaller models such as Haiku load the skill less reliably and skip steps.

## Contributing

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm gen:schema         # after changing src/schema/
pnpm gen:example-data   # rewrite the synthetic raw files of examples/
```

The skill is tested on real model runs with `claude plugin eval`:

```bash
scripts/run-evals.sh --quick          # four short cases, with and without the skill
scripts/run-evals.sh --triggering     # requests that should, or should not, load the skill
scripts/review-skill-pr.sh <number>   # a pull request's skill against main's
```

> [!IMPORTANT]
> They are billed to your own Claude account, and the script asks before starting.

Change the evaluations and their graders in a pull request of their own, not with a change to the skill, so each is measured against the other.

## License

MIT, see [LICENSE](LICENSE).
