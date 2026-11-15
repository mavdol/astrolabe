import { readFileSync } from "node:fs";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { compute, parseRaw } from "../src/compute/compute.js";
import { importInspect, readInspectLog, type InspectLog } from "../src/import/inspect.js";
import { ImportError, rawFileContent } from "../src/import/raw-file.js";
import { planOf } from "./helpers.js";

const log = (name: string) => readInspectLog(name, readFileSync(`tests/fixtures/inspect/${name}`));
const models = [
  { id: "model_a", name: "Model A" },
  { id: "model_b", name: "Model B" },
];
const mockModel = [{ id: "mock", name: "mockllm/model" }];
const canReadZstd = "zstdDecompressSync" in zlib;

/** A copy of a log with its header changed, to test what a real run rarely produces. */
const withHeader = (source: InspectLog, change: (header: Record<string, any>) => void): InspectLog => {
  const header = structuredClone(source.header) as Record<string, any>;

  change(header);

  return { ...source, header };
};

describe("Inspect logs", () => {
  const imported = importInspect([log("arithmetic-model_a-deflate.eval"), log("arithmetic-model_b.json")], models, ["arithmetic"]);

  it("maps the sample id to item, the epoch to repeat and the task to node, one row per measure", () => {
    expect(imported.samplesPerCandidate).toEqual(
      new Map([
        ["model_a", 12],
        ["model_b", 12],
      ]),
    );
    expect(imported.measures).toEqual(["match", "input_tokens", "output_tokens", "total_tokens", "total_time", "working_time"]);
    expect(imported.rows[0]).toMatchObject({
      candidate: "model_a",
      node: "arithmetic",
      item: "q1",
      repeat: "1",
      measure: "match",
      value: 1,
    });
  });

  it("reads the .eval archive and the JSON log alike", () => {
    const fromArchive = importInspect([log("arithmetic-model_a-deflate.eval")], models, ["arithmetic"]);

    expect(fromArchive.rows).toHaveLength(72);
    expect(fromArchive.rows.every((row) => row.candidate === "model_a")).toBe(true);
  });

  it.skipIf(!canReadZstd)("reads the zstd archives Inspect writes today, as it reads the older deflate ones", () => {
    const zstd = importInspect([log("arithmetic-model_a.eval")], models, ["arithmetic"]);
    const deflate = importInspect([log("arithmetic-model_a-deflate.eval")], models, ["arithmetic"]);

    expect(zstd.rows).toEqual(deflate.rows);
  });

  it("orders the rows by epoch then item, so the same logs always give the same bytes", () => {
    const again = importInspect([log("arithmetic-model_a-deflate.eval"), log("arithmetic-model_b.json")], models, ["arithmetic"]);
    const firstItems = imported.rows.filter((row) => row.measure === "match").map((row) => `${row.repeat}:${row.item}`);

    expect(rawFileContent(again.rows)).toBe(rawFileContent(imported.rows));
    expect(firstItems.slice(0, 7)).toEqual(["1:q1", "1:q2", "1:q3", "1:q4", "1:q5", "1:q6", "2:q1"]);
  });
});

describe("scores, failures and tokens", () => {
  const imported = importInspect([log("edge-cases.json"), log("limited.json")], mockModel, ["edge_cases", "limited"]);
  const row = (item: string, measure: string) =>
    imported.rows.find((entry) => entry.item === item && entry.repeat === "1" && entry.measure === measure);

  it("reads C, P and N as 1, 0.5 and 0, and a scorer with several values as one measure per key", () => {
    expect(row("q1", "graded")!.value).toBe(1);
    expect(row("q2", "graded")!.value).toBe(0.5);
    expect(row("q3", "graded")!.value).toBe(0);
    expect(row("q1", "rubric.helpful")!.value).toBe(0.8);
    expect(row("q1", "rubric.safe")!.value).toBe(1);
  });

  it("counts an errored sample as a failure on every measure", () => {
    const boom = imported.rows.filter((entry) => entry.item === "boom" && entry.repeat === "1");

    expect(boom.map((entry) => entry.measure)).toEqual(imported.measures);
    expect(boom.every((entry) => entry.value === null && entry.status === "error")).toBe(true);
  });

  it("counts a sample that hit a limit as a failure, even though Inspect scored it", () => {
    expect(imported.rows.filter((entry) => entry.node === "limited").every((entry) => entry.status === "limit_message")).toBe(true);
  });

  it("marks a score the grader could not give, written NaN by Inspect, as not scored", () => {
    expect(row("q1", "model_graded_qa")).toMatchObject({ value: null, status: "not_scored" });
  });

  it("leaves the grader's tokens out of the candidate's, when both run on the same model", () => {
    expect(row("q1", "total_tokens")!.value).toBe(34);
  });
});

describe("candidates and nodes", () => {
  const arithmetic = log("arithmetic-model_b.json");

  it("finds the candidate from the log's metadata, else from the model name", () => {
    const byModel = withHeader(arithmetic, (header) => delete header.eval.metadata);

    expect(importInspect([byModel], mockModel, ["arithmetic"]).samplesPerCandidate).toEqual(new Map([["mock", 12]]));
    expect(() => importInspect([byModel], models, ["arithmetic"])).toThrow(/--metadata candidate=<id>/);
  });

  it("finds the node from the log's metadata, else from the task name", () => {
    const renamed = withHeader(arithmetic, (header) => (header.eval.metadata.node = "sums"));

    expect(importInspect([renamed], models, ["sums"]).rows[0].node).toBe("sums");
    expect(() => importInspect([arithmetic], models, ["sums"])).toThrow(/--metadata node=<id> \(nodes: sums\)/);
  });

  it("refuses several tasks in a plan without structure, where their items would mix", () => {
    expect(() => importInspect([log("edge-cases.json"), log("limited.json")], mockModel, undefined)).toThrow(/declare one node per task/);
  });
});

describe("logs it refuses", () => {
  const arithmetic = log("arithmetic-model_b.json");

  it("refuses an evaluation that did not finish, since samples would be missing", () => {
    const stopped = withHeader(arithmetic, (header) => (header.status = "error"));

    expect(() => importInspect([stopped], models, ["arithmetic"])).toThrow(/did not finish.*--no-fail-on-error/);
  });

  it("refuses the same samples imported twice", () => {
    expect(() => importInspect([arithmetic, arithmetic], models, ["arithmetic"])).toThrow(/appears twice in arithmetic-model_b\.json/);
  });

  it("refuses a file that is not an Inspect log", () => {
    expect(() => readInspectLog("notes.txt", Buffer.from("hello"))).toThrow(ImportError);
    expect(() => importInspect([{ name: "x.json", header: { results: [] }, samples: [] }], models, undefined)).toThrow(
      /not an Inspect log/,
    );
  });
});

describe("the raw file", () => {
  it("is read by compute: one item per sample, its epochs as repeats, paired across candidates", () => {
    const imported = importInspect([log("arithmetic-model_a-deflate.eval"), log("arithmetic-model_b.json")], models, undefined);
    const plan = planOf({
      candidates: ["model_b", "model_a"],
      metrics: [
        {
          id: "accuracy",
          unit: "%",
          statistic: "share",
          compare_as: "difference",
          minimum_meaningful: 5,
          failures_count_as: "zero",
          from: { raw: "data", measure: "match" },
        },
      ],
    });
    const results = compute(
      { ...plan, baseline: "model_b" },
      { data: parseRaw("data", rawFileContent(imported.rows)) },
      { resamples: 500 },
    );
    const valueOf = (candidate: string) => results.values!.find((value) => value.candidate === candidate)!;

    expect(valueOf("model_a").n).toBe(6);
    expect(valueOf("model_a").value).toBeGreaterThan(valueOf("model_b").value!);
    expect(results.comparisons![0].paired).toBe(true);
  });
});
