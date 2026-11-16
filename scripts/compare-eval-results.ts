import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

interface GraderResult {
  name: string;
  passed: boolean;
}

interface RunResult {
  score: number;
  passed: boolean;
  graders: GraderResult[];
}

interface CaseResult {
  name: string;
  arms: Record<string, RunResult[]>;
}

export interface EvalResults {
  costUsd?: number;
  suite?: { modelOverride?: string };
  cases: CaseResult[];
}

interface CaseSummary {
  runs: number;
  meanScore: number;
  lowestScore: number;
  highestScore: number;
  flipsBetweenRuns: boolean;
  passesByGrader: Map<string, number>;
}

type Change = "better" | "worse" | "same" | "not compared";

/** Scores closer than this are about one grader vote apart over three runs: not a difference three runs can show. */
const SMALLEST_CHANGE_REPORTED = 0.1;

const mean = (numbers: number[]) => numbers.reduce((sum, number) => sum + number, 0) / numbers.length;
const twoDecimals = (number: number) => number.toFixed(2);

function summaryOf(result: CaseResult): CaseSummary | undefined {
  const runs = Object.values(result.arms).flat();

  if (runs.length === 0) return undefined;

  const scores = runs.map((run) => run.score);
  const passesByGrader = new Map<string, number>();

  for (const run of runs)
    for (const grader of run.graders) passesByGrader.set(grader.name, (passesByGrader.get(grader.name) ?? 0) + (grader.passed ? 1 : 0));

  return {
    runs: runs.length,
    meanScore: mean(scores),
    lowestScore: Math.min(...scores),
    highestScore: Math.max(...scores),
    flipsBetweenRuns: new Set(runs.map((run) => run.passed)).size > 1,
    passesByGrader,
  };
}

function scoreCell(summary: CaseSummary | undefined): string {
  if (!summary) return "not run";

  const spread =
    summary.lowestScore === summary.highestScore ? "" : ` (${twoDecimals(summary.lowestScore)} to ${twoDecimals(summary.highestScore)})`;

  return `${twoDecimals(summary.meanScore)}${spread}`;
}

function gradersThatMoved(reference: CaseSummary, proposed: CaseSummary): string[] {
  const moved: string[] = [];

  for (const [grader, passesBefore] of reference.passesByGrader) {
    const passesAfter = proposed.passesByGrader.get(grader);

    if (passesAfter === undefined || passesAfter === passesBefore) continue;

    moved.push(`${grader}: ${passesBefore}/${reference.runs} → ${passesAfter}/${proposed.runs}`);
  }

  return moved;
}

function changeBetween(reference: CaseSummary | undefined, proposed: CaseSummary | undefined): Change {
  if (!reference || !proposed) return "not compared";

  const difference = proposed.meanScore - reference.meanScore;

  if (Math.abs(difference) < SMALLEST_CHANGE_REPORTED) return "same";

  return difference > 0 ? "better" : "worse";
}

/** The comparison of two evaluation runs, as Markdown to paste on a pull request. */
export function compareEvalResults(
  reference: EvalResults,
  proposed: EvalResults,
  names = { reference: "main", proposed: "this PR" },
): string {
  const referenceByCase = new Map(reference.cases.map((result) => [result.name, summaryOf(result)]));
  const proposedByCase = new Map(proposed.cases.map((result) => [result.name, summaryOf(result)]));
  const caseNames = [...new Set([...referenceByCase.keys(), ...proposedByCase.keys()])].sort();
  const changes = caseNames.map((name) => changeBetween(referenceByCase.get(name), proposedByCase.get(name)));
  const count = (change: Change) => changes.filter((entry) => entry === change).length;
  const rows = caseNames.map((name, index) => {
    const before = referenceByCase.get(name);
    const after = proposedByCase.get(name);
    const notes = [
      ...(before && after ? gradersThatMoved(before, after) : []),
      ...(after?.flipsBetweenRuns ? ["unstable: passes in some runs and fails in others"] : []),
    ];

    return `| ${name} | ${scoreCell(before)} | ${scoreCell(after)} | ${changes[index]} | ${notes.join("; ")} |`;
  });
  const runsPerCase = Math.max(0, ...[...proposedByCase.values()].map((summary) => summary?.runs ?? 0));
  const model = proposed.suite?.modelOverride ?? "the default model";
  const cost = (reference.costUsd ?? 0) + (proposed.costUsd ?? 0);
  const table = [
    `| Case | ${names.reference} | ${names.proposed} | Change | Graders that moved |`,
    "| --- | ---: | ---: | --- | --- |",
    ...rows,
  ];

  return [
    `## Skill evaluation: ${names.proposed} against ${names.reference}`,
    `${caseNames.length} cases, ${runsPerCase} runs each, on ${model}, with the same tool, cases and graders on both sides: ${count("worse")} worse, ${count("better")} better, ${count("same")} the same.`,
    table.join("\n"),
    `Scores are the mean share of graders passed, with the lowest and highest run when they differ. With ${runsPerCase} runs per case only clear changes show: a change under ${twoDecimals(SMALLEST_CHANGE_REPORTED)} counts as the same. Cost of these runs: $${cost.toFixed(2)}.`,
  ]
    .join("\n\n")
    .concat("\n");
}

const isRunAsScript = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isRunAsScript) {
  const [referencePath, proposedPath] = process.argv.slice(2);

  if (!referencePath || !proposedPath) {
    console.error("usage: tsx scripts/compare-eval-results.ts <aggregate-result.json of main> <aggregate-result.json of the PR>");
    process.exit(2);
  }

  const load = (path: string) => JSON.parse(readFileSync(path, "utf8")) as EvalResults;

  process.stdout.write(compareEvalResults(load(referencePath), load(proposedPath)));
}
