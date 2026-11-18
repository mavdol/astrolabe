import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Stands in for claude plugin eval: finds the cases as it does, runs each scaffold, and records what it saw. */
const STAND_IN = `#!/usr/bin/env bash
plugin="$3"; out=""
ablation=""
while [ $# -gt 0 ]; do [ "$1" = --output-dir ] && out="$2"; [ "$1" = --ablation ] && ablation="$2"; shift; done
mkdir -p "$out"
if [ -d "$plugin/skills" ]; then skills=yes; else skills=no; fi
printf '{"ablation":"%s","skills":"%s"}' "$ablation" "$skills" > "$out/call.json"
cases=()
for folder in "$plugin"/evals/*/; do
  [ -f "$folder/prompt.md" ] || [ -f "$folder/case.yaml" ] || continue
  name=$(basename "$folder")
  scratch=$(mktemp -d)
  if [ ! -f "$folder/place-files.sh" ]; then scaffold=none
  elif (cd "$scratch" && bash "$folder/place-files.sh" >/dev/null 2>&1); then scaffold=ok; else scaffold=failed; fi
  rm -rf "$scratch"
  cases+=("{\\"name\\":\\"$name\\",\\"scaffold\\":\\"$scaffold\\",\\"compactAt\\":\\"\${CLAUDE_AUTOCOMPACT_PCT_OVERRIDE:-}\\"}")
done
(IFS=,; printf '{"costUsd":1,"durationSeconds":1,"partial":false,"cases":[%s]}' "\${cases[*]}") > "$out/aggregate-result.json"
`;

function runEvals(...options: string[]) {
  const folder = mkdtempSync(join(tmpdir(), "run-evals-"));
  const standIn = join(folder, "claude");
  const output = join(folder, "results");

  writeFileSync(standIn, STAND_IN);
  chmodSync(standIn, 0o755);

  const run = spawnSync("scripts/run-evals.sh", [...options, "--runs", "1", "--yes", "--output", output], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${folder}:${process.env.PATH}` },
  });

  expect(run.status, run.stderr).toBe(0);

  const cases = JSON.parse(readFileSync(join(output, "aggregate-result.json"), "utf8")).cases as {
    name: string;
    scaffold: string;
    compactAt: string;
  }[];

  const call = JSON.parse(readFileSync(join(output, "call.json"), "utf8")) as { ablation: string; skills: string };

  return { cases, call };
}

describe("scripts/run-evals.sh", () => {
  it("gives every case the files its scaffold borrows from other cases", () => {
    const { cases } = runEvals("--case", "make-my-library-win");

    expect(cases).toEqual([{ name: "make-my-library-win", scaffold: "ok", compactAt: "" }]);
  }, 120_000);

  it("runs a case with operator variables on its own, with them set, and merges its results", () => {
    const { cases } = runEvals("--case", "*-a-*");

    expect(cases.map(({ name }) => name)).toEqual(["make-me-a-page", "three-parsers-and-a-page", "page-after-a-compaction"]);
    expect(cases.every(({ scaffold }) => scaffold === "ok")).toBe(true);
    const compactAt = /^CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=(\S+)$/m.exec(
      readFileSync("evals/page-after-a-compaction/operator.env", "utf8"),
    )?.[1];

    expect(compactAt).toBeDefined();
    expect(cases.map((entry) => entry.compactAt)).toEqual(["", "", compactAt]);
  }, 120_000);

  it("runs the triggering test instead of the evaluations, with the skill only", () => {
    const { cases, call } = runEvals("--triggering");
    const triggeringCases = readdirSync("triggering").filter((name) => existsSync(join("triggering", name, "prompt.md")));

    expect(cases.map(({ name }) => name).sort()).toEqual(triggeringCases.sort());
    expect(call).toEqual({ ablation: "none", skills: "yes" });
  }, 120_000);

  it("refuses the triggering test without the skill, since there is nothing to load", () => {
    const run = spawnSync("scripts/run-evals.sh", ["--triggering", "--without-skill", "--yes"], { encoding: "utf8" });

    expect(run.status).toBe(2);
    expect(run.stderr).toContain("runs with the skill only");
  });
});
