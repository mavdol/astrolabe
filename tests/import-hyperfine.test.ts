import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compute, parseRaw } from "../src/compute/compute.js";
import { importHyperfine, ImportError, rawFileContent } from "../src/import/hyperfine.js";
import { planOf } from "./helpers.js";

const fixture = (name: string) => ({ name, content: JSON.parse(readFileSync(`tests/fixtures/hyperfine/${name}`, "utf8")) });
const runtimes = [
  { id: "node", name: "Node.js" },
  { id: "deno", name: "deno run --quiet workload.mjs" },
];

describe("hyperfine 1.x exports", () => {
  const imported = importHyperfine([fixture("version-1.json")], runtimes);

  it("reads wall time in seconds and peak memory in MiB, one row per run and measure", () => {
    expect(imported.measures).toEqual(["wall_time", "peak_rss"]);
    expect(imported.rows).toHaveLength(16);
    expect(imported.rows[0]).toEqual({ candidate: "node", measure: "wall_time", value: 0.0391, run: "1" });
    expect(imported.rows[1]).toEqual({ candidate: "node", measure: "peak_rss", value: 40, run: "1" });
  });

  it("matches a command by candidate id, else by candidate name", () => {
    expect(imported.runsPerCandidate).toEqual(
      new Map([
        ["node", 4],
        ["deno", 4],
      ]),
    );
  });

  it("keeps failed runs, with the exit code or the signal as their status", () => {
    const failedRuns = imported.rows.filter((row) => row.status !== undefined);

    expect(failedRuns).toEqual([
      { candidate: "deno", measure: "wall_time", value: null, run: "2", status: "exit_1" },
      { candidate: "deno", measure: "peak_rss", value: null, run: "2", status: "exit_1" },
      { candidate: "deno", measure: "wall_time", value: null, run: "4", status: "killed_by_signal" },
      { candidate: "deno", measure: "peak_rss", value: null, run: "4", status: "killed_by_signal" },
    ]);
  });
});

describe("hyperfine 2.0 exports", () => {
  const imported = importHyperfine([fixture("version-2.json")], runtimes);

  it("reads every measure of a measurement, and the custom command name", () => {
    expect(imported.measures).toEqual(["wall_time", "cpu_time", "user_time", "system_time", "peak_rss"]);
    expect(imported.runsPerCandidate).toEqual(
      new Map([
        ["node", 3],
        ["deno", 3],
      ]),
    );
    expect(imported.rows.filter((row) => row.candidate === "node" && row.run === "1" && row.measure === "peak_rss")).toEqual([
      { candidate: "node", measure: "peak_rss", value: 41, run: "1" },
    ]);
  });

  it("marks a non-zero exit code as a failure on every measure of the run", () => {
    const thirdDenoRun = imported.rows.filter((row) => row.candidate === "deno" && row.run === "3");

    expect(thirdDenoRun).toHaveLength(5);

    for (const row of thirdDenoRun) expect(row).toMatchObject({ value: null, status: "exit_2" });
  });
});

describe("several exports and errors", () => {
  it("numbers the runs of several exports as successive runs, in the order given", () => {
    const imported = importHyperfine([fixture("version-2.json"), fixture("version-1.json")], runtimes);

    expect(imported.runsPerCandidate).toEqual(
      new Map([
        ["node", 7],
        ["deno", 7],
      ]),
    );
    expect(imported.measures).toEqual(["wall_time", "cpu_time", "user_time", "system_time", "peak_rss"]);
  });

  it("refuses a command that matches no candidate, and says how to name it", () => {
    expect(() => importHyperfine([fixture("version-1.json")], [{ id: "node", name: "Node.js" }])).toThrow(/--command-name/);
  });

  it("refuses a file that is not a hyperfine export, and an unknown export version", () => {
    expect(() => importHyperfine([{ name: "other.json", content: { rows: [] } }], runtimes)).toThrow(ImportError);
    expect(() => importHyperfine([{ name: "future.json", content: { schema_version: 3, results: [] } }], runtimes)).toThrow(
      /schema_version 3/,
    );
  });
});

describe("the raw file", () => {
  it("is the same bytes for the same exports, and compute reads it", () => {
    const imported = importHyperfine([fixture("version-2.json"), fixture("version-1.json")], runtimes);
    const content = rawFileContent(imported.rows);

    expect(rawFileContent(importHyperfine([fixture("version-2.json"), fixture("version-1.json")], runtimes).rows)).toBe(content);
    expect(content.split("\n")[0]).toBe('{"candidate":"node","measure":"wall_time","value":0.0405,"run":1}');

    const plan = planOf({
      candidates: ["node", "deno"],
      metrics: [
        {
          id: "wall_time",
          statistic: "median",
          compare_as: "relative",
          minimum_meaningful: 10,
          failures_count_as: "excluded",
          from: { raw: "data", measure: "wall_time" },
        },
      ],
    });
    const results = compute({ ...plan, baseline: "node" }, { data: parseRaw("data", content) }, { resamples: 500 });

    expect(results.failures).toEqual([
      { candidate: "deno", metric: "wall_time", reason: "exit_1", count: 1, attempts: 7, unit: "attempts", counted_as: "excluded" },
      { candidate: "deno", metric: "wall_time", reason: "exit_2", count: 1, attempts: 7, unit: "attempts", counted_as: "excluded" },
      {
        candidate: "deno",
        metric: "wall_time",
        reason: "killed_by_signal",
        count: 1,
        attempts: 7,
        unit: "attempts",
        counted_as: "excluded",
      },
    ]);
    expect(results.values!.find((value) => value.candidate === "deno")!.n).toBe(4);
  });
});
