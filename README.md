<div align="center">
<h1> ҉Astrolabe</h1>

<b>An agent-native framework to run and showcase benchmarks.</b>

[![npm](https://img.shields.io/npm/v/astrolabe-bench)](https://www.npmjs.com/package/astrolabe-bench)
[![CI](https://github.com/mavdol/astrolabe/actions/workflows/ci.yml/badge.svg)](https://github.com/mavdol/astrolabe/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
</div>

<!-- screenshot -->

Astrolabe lets your agent run benchmarks that people can trust. Ask it which library is faster, which prompt answers better or which tool your team should pick, and it designs a fair comparison, measures it, and publishes the results as a page, a README card and charts.

It comes as a skill, which teaches the agent the method, and a command line, `astrolabe`, which computes every number from the raw data the agent's scripts collected. The agent never writes a result itself, so anyone can trace each claim back to the script and the measurement behind it.

## ◌ Skill & Install

`skills/astrolabe-benchmark/` is a folder of Markdown files in the [Agent Skills](https://agentskills.io) format. Your agent loads it when you ask to compare or benchmark something, or for a report on results you already have. It adds `astrolabe-bench` to your project's development dependencies when it is missing, after asking you.

Install it in one of these ways, then ask your agent for a benchmark or a comparison.

**Claude Code plugin**

```bash
claude plugin install astrolabe --marketplace mavdol/astrolabe
```

Or add the marketplace with `/plugin marketplace add mavdol/astrolabe` and find the plugin under `/plugin`. Update it with `claude plugin update astrolabe@astrolabe`.

**npx skills**, for any agent that reads Agent Skills

```bash
npx skills add mavdol/astrolabe
```

**Manually**

```bash
npm install --save-dev astrolabe-bench
npx --no-install astrolabe init                         # copies the skill into .agents/skills/
npx --no-install astrolabe init --dir <skills folder>   # or into your agent's own folder, such as .claude/skills
```

Run `init` again after upgrading the package. Needs Node.js 22 or later.

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

The skill is tested on real model runs with `claude plugin eval` :

```bash
scripts/run-evals.sh --quick          # four short cases, with and without the skill
scripts/run-evals.sh --triggering     # requests that should, or should not, load the skill
scripts/review-skill-pr.sh <number>   # a pull request's skill against main's
```

> [!IMPORTANT]
> They are billed to your own Claude account, and the script asks before

Change the evaluations and their graders in a pull request of their own, not with a change to the skill, so each is measured against the other.

## Limitations

- Tested on Claude Sonnet, which loaded the skill on all 20 requests of the triggering test. Claude Haiku loaded it in 55 of 66 evaluation runs, misses everyday wordings such as "which should we pick?", and skips steps more often: use Sonnet or a stronger model. Opus and agents other than Claude Code are not measured yet.
- The evaluations run on simulated projects, with stub libraries and invented logs that a model can sometimes recognise.
- claude.ai and Cowork load skills, but the skill needs a shell with Node.js to run `astrolabe`. That is not checked yet.
- Version 0.x: the format of `benchmark.json` may still change between minor versions.

## License

MIT, see [LICENSE](LICENSE).
