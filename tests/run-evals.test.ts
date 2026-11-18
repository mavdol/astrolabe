import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Stands in for claude plugin eval: finds the cases as it does, runs each scaffold, and records what it saw. */
const STAND_IN = `#!/usr/bin/env bash
plugin="$3"; out=""
while [ $# -gt 0 ]; do [ "$1" = --output-dir ] && out="$2"; shift; done
mkdir -p "$out"
cases=()
for folder in "$plugin"/evals/*/; do
  [ -f "$folder/prompt.md" ] || [ -f "$folder/case.yaml" ] || continue
  name=$(basename "$folder")
  scratch=$(mktemp -d)
  if (cd "$scratch" && bash "$folder/place-files.sh" >/dev/null 2>&1); then scaffold=ok; else scaffold=failed; fi
  rm -rf "$scratch"
  cases+=("{\\"name\\":\\"$name\\",\\"scaffold\\":\\"$scaffold\\",\\"compactAt\\":\\"\${CLAUDE_AUTOCOMPACT_PCT_OVERRIDE:-}\\"}")
done
(IFS=,; printf '{"costUsd":1,"durationSeconds":1,"partial":false,"cases":[%s]}' "\${cases[*]}") > "$out/aggregate-result.json"
`;

function runEvals(casePattern: string) {
  const folder = mkdtempSync(join(tmpdir(), "run-evals-"));
  const standIn = join(folder, "claude");
  const output = join(folder, "results");

  writeFileSync(standIn, STAND_IN);
  chmodSync(standIn, 0o755);

  const run = spawnSync("scripts/run-evals.sh", ["--case", casePattern, "--runs", "1", "--yes", "--output", output], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${folder}:${process.env.PATH}` },
  });

  expect(run.status, run.stderr).toBe(0);

  return JSON.parse(readFileSync(join(output, "aggregate-result.json"), "utf8")).cases as {
    name: string;
    scaffold: string;
    compactAt: string;
  }[];
}

describe("scripts/run-evals.sh", () => {
  it("gives every case the files its scaffold borrows from other cases", () => {
    const cases = runEvals("make-my-library-win");

    expect(cases).toEqual([{ name: "make-my-library-win", scaffold: "ok", compactAt: "" }]);
  }, 120_000);

  it("runs a case with operator variables on its own, with them set, and merges its results", () => {
    const cases = runEvals("*-a-*");

    expect(cases.map(({ name }) => name)).toEqual(["make-me-a-page", "three-parsers-and-a-page", "page-after-a-compaction"]);
    expect(cases.every(({ scaffold }) => scaffold === "ok")).toBe(true);
    const compactAt = /^CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=(\S+)$/m.exec(
      readFileSync("evals/page-after-a-compaction/operator.env", "utf8"),
    )?.[1];

    expect(compactAt).toBeDefined();
    expect(cases.map((entry) => entry.compactAt)).toEqual(["", "", compactAt]);
  }, 120_000);
});
