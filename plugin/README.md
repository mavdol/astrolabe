# Astrolabe

An open benchmark format. Agents measure, the tool computes, anyone can verify.

This plugin gives Claude the `astrolabe-benchmark` skill. Ask which of your options is faster, cheaper or more accurate for your use case, and Claude designs a fair comparison, writes scripts that record the raw data, and publishes the results as a page, a README card and charts.

Every number comes from the `astrolabe` command, in the [`astrolabe-bench`](https://www.npmjs.com/package/astrolabe-bench) package, which computes it from the raw data. Claude writes the code and the plan, never the numbers, so every claim can be checked.

## Install in Claude Code

```bash
claude plugin install astrolabe --marketplace mavdol/astrolabe
```

## Requirements

- Node.js 22 or later.
- The `astrolabe-bench` package in the project's development dependencies. When a project doesn't have it, Claude asks before adding it.

## More

Documentation, examples and the format's schema: [github.com/mavdol/astrolabe](https://github.com/mavdol/astrolabe).
