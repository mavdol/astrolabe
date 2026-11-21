#!/usr/bin/env node
// How much an agent wrote on the pages it built: the words of its titles, its readings and its text blocks,
// as the reader sees them (templates filled), and the blocks it chose. Reads the built pages only; costs nothing.
//
// usage: node scripts/measure-page-text.mjs <eval results folder>...   (a run made with --keep-temp)
//        node scripts/measure-page-text.mjs <folder>...                  (any folders holding built pages)
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const entities = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
const plain = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/g, (entity) => entities[entity] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
const wordsOf = (text) => (text ? text.split(" ").length : 0);
const sum = (numbers) => numbers.reduce((total, number) => total + number, 0);
const mean = (numbers) => (numbers.length > 0 ? sum(numbers) / numbers.length : 0);

function pagesUnder(folder) {
  const found = [];
  const walk = (path) => {
    for (const name of readdirSync(path)) {
      if (name === "node_modules" || name.startsWith(".")) continue;

      const child = join(path, name);

      if (statSync(child).isDirectory()) walk(child);
      else if (name === "index.html" && child.endsWith(join("dist", "site", "index.html"))) found.push(child);
    }
  };

  if (existsSync(folder)) walk(folder);

  return found;
}

function measure(page) {
  const html = readFileSync(page, "utf8");
  const titles = [...html.matchAll(/<h2 id="[^"]+-title"><a [^>]*>([\s\S]*?)<\/a>/g)].map((match) => plain(match[1]));
  const readings = [...html.matchAll(/<span class="reading">([\s\S]*?)<\/span>/g)].map((match) => plain(match[1]));
  const prose = [...html.matchAll(/<div class="chapter-body prose">([\s\S]*?)<\/div>/g)].map((match) => plain(match[1]));
  const benchmarkFile = join(dirname(dirname(dirname(page))), "benchmark.json");
  const blocks = existsSync(benchmarkFile) ? (JSON.parse(readFileSync(benchmarkFile, "utf8")).blocks ?? []) : [];
  // The method's own reading is written by the generator, not the agent.
  const agentReadings = readings.filter((reading) => reading !== "What was measured, what was declared, and how.");

  return {
    titleWords: sum(titles.map(wordsOf)),
    longestTitle: Math.max(0, ...titles.map((title) => title.length)),
    readingWords: sum(agentReadings.map(wordsOf)),
    longestReading: Math.max(0, ...agentReadings.map(wordsOf)),
    textBlockWords: sum(prose.map(wordsOf)),
    written: sum(titles.map(wordsOf)) + sum(agentReadings.map(wordsOf)) + sum(prose.map(wordsOf)),
    // A page with more charts writes more titles: per titled block is the fair comparison.
    perBlock:
      titles.length > 0
        ? Math.round(((sum(titles.map(wordsOf)) + sum(agentReadings.map(wordsOf)) + sum(prose.map(wordsOf))) / titles.length) * 10) / 10
        : 0,
    charts: blocks.filter((block) => block.type === "chart").map((block) => block.chart),
    textBlocks: blocks.filter((block) => block.type === "text").length,
  };
}

const COLUMNS = [
  ["perBlock", "words per block"],
  ["written", "words written"],
  ["titleWords", "title words"],
  ["longestTitle", "longest title (chars)"],
  ["readingWords", "reading words"],
  ["longestReading", "longest reading (words)"],
  ["textBlockWords", "text block words"],
  ["textBlocks", "text blocks"],
];

function report(label, runs) {
  console.log(`\n${label}`);

  for (const run of runs) {
    if (!run.page) {
      console.log(`  ${run.name}: no page built`);
      continue;
    }

    const { measures } = run;

    console.log(
      `  ${run.name}: ${COLUMNS.map(([key, name]) => `${name} ${measures[key]}`).join(", ")}; charts: ${measures.charts.join(", ") || "none"}`,
    );
  }

  const built = runs.filter((run) => run.page);

  if (built.length > 0)
    console.log(
      `  mean over ${built.length} page(s): ${COLUMNS.map(([key, name]) => `${name} ${mean(built.map((run) => run.measures[key])).toFixed(1)}`).join(", ")}`,
    );
}

for (const folder of process.argv.slice(2)) {
  const aggregateFile = join(folder, "aggregate-result.json");

  if (!existsSync(aggregateFile)) {
    report(
      folder,
      pagesUnder(folder).map((page) => ({ name: page, page, measures: measure(page) })),
    );
    continue;
  }

  const aggregate = JSON.parse(readFileSync(aggregateFile, "utf8"));

  for (const evalCase of aggregate.cases) {
    for (const [arm, runs] of Object.entries(evalCase.arms)) {
      const measured = runs.map((run, index) => {
        const workspace = run.tracePath ? dirname(dirname(run.tracePath)) : "";
        const [page] = pagesUnder(workspace);

        return { name: `run ${index + 1}`, page, measures: page ? measure(page) : undefined, workspace };
      });

      if (measured.every((run) => !run.workspace || !existsSync(run.workspace)))
        console.log(`\n${evalCase.name}, ${arm}: the runs' folders are gone; run the eval again with --keep-temp`);
      else report(`${evalCase.name}, ${arm} the skill (${folder})`, measured);
    }
  }
}
