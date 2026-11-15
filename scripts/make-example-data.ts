// Writes the synthetic raw files of the four examples, as a measuring script would
// write them: one JSON line per observation, failures included. The data is invented
// and reproducible: the same seed always gives the same files.
import { mkdirSync, writeFileSync } from "node:fs";
import { Xoshiro128 } from "../src/compute/rng.js";

type RawRow = Record<string, string | number | null>;

function seededRandom(seed: number) {
  const generator = new Xoshiro128([seed, seed ^ 0x9e3779b9, seed + 0x85ebca6b, seed ^ 0xc2b2ae35]);
  const uniform = () => (generator.next() + 0.5) / 4294967296;
  const normal = (mean: number, standardDeviation: number) =>
    mean + standardDeviation * Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
  const pickDistinct = (count: number, from: number) => {
    const picked = new Set<number>();

    while (picked.size < count) picked.add(Math.floor(uniform() * from));

    return picked;
  };

  return { uniform, normal, pickDistinct };
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const roundTo = (value: number, decimals: number) => Number(value.toFixed(decimals));
const padded = (index: number, width: number) => String(index).padStart(width, "0");

function writeRawFile(exampleId: string, fileName: string, rows: RawRow[]) {
  mkdirSync(`examples/${exampleId}/data`, { recursive: true });
  writeFileSync(`examples/${exampleId}/data/${fileName}`, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  console.log(`${exampleId}/data/${fileName}: ${rows.length} rows`);
}

function runTimeOfThreeParsers() {
  const random = seededRandom(11);
  const parsers = [
    { id: "stdjson", seconds: 4.18, secondsSpread: 0.07, mebibytes: 310, mebibytesSpread: 4 },
    { id: "fastjson", seconds: 2.11, secondsSpread: 0.03, mebibytes: 895, mebibytesSpread: 12 },
    { id: "tinyjson", seconds: 3.98, secondsSpread: 0.08, mebibytes: 119, mebibytesSpread: 1.5 },
  ];
  const rows: RawRow[] = [];

  for (let run = 1; run <= 10; run++) {
    for (const parser of parsers) {
      rows.push({
        candidate: parser.id,
        measure: "wall_time",
        value: roundTo(random.normal(parser.seconds, parser.secondsSpread), 3),
        run,
      });
      rows.push({
        candidate: parser.id,
        measure: "peak_rss",
        value: roundTo(random.normal(parser.mebibytes, parser.mebibytesSpread), 1),
        run,
      });
    }
  }

  writeRawFile("json-cli-parse", "runs.jsonl", rows);
}

function twoGeocodingApis() {
  const random = seededRandom(22);
  const sessionStarts = ["2026-11-03T08:00:00Z", "2026-11-03T19:30:00Z", "2026-11-04T08:00:00Z", "2026-11-04T19:30:00Z"];
  const apis = [
    { id: "geo_a", medianLatency: 82, logSpread: 0.45, matchRate: 0.947 },
    { id: "geo_b", medianLatency: 60, logSpread: 0.75, matchRate: 0.961 },
  ];
  const addresses = Array.from({ length: 1000 }, (_, index) => ({
    id: `addr-${padded(index + 1, 4)}`,
    latencyFactor: Math.exp(random.normal(0, 0.15)),
    matchDifficulty: random.normal(0, 0.04),
  }));
  const rows: RawRow[] = [];

  sessionStarts.forEach((ts, sessionIndex) => {
    for (const address of addresses) {
      for (const api of apis) {
        const shared = { candidate: api.id, item: address.id, run: sessionIndex + 1, ts };
        const latency = api.medianLatency * address.latencyFactor * Math.exp(random.normal(0, api.logSpread));
        const matched = random.uniform() < clamp(api.matchRate - address.matchDifficulty, 0, 1);

        rows.push({ ...shared, measure: "latency_ms", value: roundTo(latency, 1) });
        rows.push({ ...shared, measure: "match", value: matched ? 1 : 0 });
      }
    }
  });
  writeRawFile("geocoding-apis", "requests.jsonl", rows);
}

function twoNoteTakingApps() {
  const random = seededRandom(33);
  const apps = [
    {
      id: "notes_a",
      prefix: "a",
      failureStatus: "gave_up",
      susMean: 73,
      susSpread: 14,
      tasks: [
        { node: "t_create", seconds: 130, failures: 5 },
        { node: "t_share", seconds: 146, failures: 4 },
        { node: "t_find", seconds: 155, failures: 5 },
      ],
    },
    {
      id: "notes_b",
      prefix: "b",
      failureStatus: "time_limit",
      susMean: 76,
      susSpread: 10,
      tasks: [
        { node: "t_create", seconds: 115, failures: 0 },
        { node: "t_share", seconds: 110, failures: 4 },
        { node: "t_find", seconds: 128, failures: 6 },
      ],
    },
  ];
  const participantsPerApp = 24;
  const rows: RawRow[] = [];

  for (const app of apps) {
    const failingParticipants = app.tasks.map((task) => random.pickDistinct(task.failures, participantsPerApp));

    for (let participant = 0; participant < participantsPerApp; participant++) {
      const item = `${app.prefix}${padded(participant + 1, 2)}`;
      const personalPace = Math.exp(random.normal(0, 0.15));

      app.tasks.forEach((task, taskIndex) => {
        const shared = { candidate: app.id, item, node: task.node };

        if (failingParticipants[taskIndex].has(participant)) {
          rows.push({ ...shared, measure: "success", value: null, status: app.failureStatus });
          rows.push({ ...shared, measure: "seconds", value: null, status: app.failureStatus });
        } else {
          rows.push({ ...shared, measure: "success", value: 1 });
          rows.push({
            ...shared,
            measure: "seconds",
            value: Math.round(clamp(task.seconds * personalPace * Math.exp(random.normal(0, 0.22)), 40, 295)),
          });
        }
      });
      const susScore = clamp(Math.round(random.normal(app.susMean, app.susSpread) / 2.5) * 2.5, 0, 100);

      rows.push({ candidate: app.id, item, node: "study", measure: "sus", value: susScore });
    }
  }

  writeRawFile("notes-apps-onboarding", "sessions.jsonl", rows);
}

function twoModelsOnSupportTasks() {
  const random = seededRandom(44);
  const repeats = 5;
  const dayOfRepeat = (repeat: number) => (repeat <= 3 ? "2026-11-03T08:00:00Z" : "2026-11-04T19:30:00Z");
  const tasks = [
    { node: "math_word", items: 200, accuracy: { model_a: 0.76, model_b: 0.72 } },
    { node: "policy_qa", items: 150, accuracy: { model_a: 0.656, model_b: 0.715 } },
    { node: "bugfix", items: 120, accuracy: { model_a: 0.62, model_b: 0.45 } },
  ];
  const models = [
    { id: "model_a" as const, costPerItem: 0.00433, failure: { node: "policy_qa", count: 1, status: "no_answer" } },
    { id: "model_b" as const, costPerItem: 0.00119, failure: { node: "bugfix", count: 10, status: "timeout" } },
  ];
  const rows: RawRow[] = [];

  for (const task of tasks) {
    const attemptsPerModel = task.items * repeats;
    const failedAttempts = new Map(
      models.map((model) => [
        model.id,
        model.failure.node === task.node ? random.pickDistinct(model.failure.count, attemptsPerModel) : new Set<number>(),
      ]),
    );

    for (let itemIndex = 0; itemIndex < task.items; itemIndex++) {
      const item = `${task.node}-${padded(itemIndex + 1, 3)}`;
      const itemDifficulty = random.normal(0, 0.25);
      const itemLength = Math.exp(random.normal(0, 0.05));

      for (let repeat = 1; repeat <= repeats; repeat++) {
        for (const model of models) {
          const shared = { candidate: model.id, item, repeat, node: task.node, ts: dayOfRepeat(repeat) };
          const attemptIndex = itemIndex * repeats + (repeat - 1);

          if (failedAttempts.get(model.id)!.has(attemptIndex)) {
            rows.push({ ...shared, measure: "correct", value: null, status: model.failure.status });
            rows.push({ ...shared, measure: "cost_usd", value: null, status: model.failure.status });
            continue;
          }

          const chanceOfCorrectAnswer = clamp(task.accuracy[model.id] - itemDifficulty, 0.02, 0.98);

          rows.push({ ...shared, measure: "correct", value: random.uniform() < chanceOfCorrectAnswer ? 1 : 0 });
          rows.push({
            ...shared,
            measure: "cost_usd",
            value: roundTo(model.costPerItem * itemLength * Math.exp(random.normal(0, 0.04)), 6),
          });
        }
      }
    }
  }

  writeRawFile("support-assistant-eval", "items.jsonl", rows);
}

runTimeOfThreeParsers();
twoGeocodingApis();
twoNoteTakingApps();
twoModelsOnSupportTasks();
