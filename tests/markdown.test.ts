import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resultsHash } from "../src/compute/files.js";
import { buildDateFrom, continuousIntegrationFrom, renderMarkdown } from "../src/render/markdown.js";
import { benchmarkSchema, type Benchmark } from "../src/schema/benchmark.js";

const loadBenchmark = (id: string): Benchmark => benchmarkSchema.parse(JSON.parse(readFileSync(`examples/${id}/benchmark.json`, "utf8")));
const context = { generatorVersion: "0.1.0", buildDate: "2026-11-15" };

describe("what the Markdown output says", () => {
  const usability = renderMarkdown(loadBenchmark("notes-apps-onboarding"), context);
  const runtimes = renderMarkdown(loadBenchmark("js-runtimes"), context);

  it("keeps the interval, the number of observations and the failures next to every value", () => {
    expect(runtimes).toContain("| Candidate | Median (s) | 95% interval | n | Failures |");
    expect(runtimes).toContain("| Deno | 0.241 | 0.238 to 0.243 | 30 | 0 |");
    expect(usability).toContain("| 5 of 24 |");
  });

  it("marks declared figures, qualified verdicts and results that leave failures out", () => {
    expect(usability).toContain("(declared)");
    expect(usability).toContain("Declared by the author, not computed from raw data.");
    expect(runtimes).toContain("| likely better | successful attempts only |");
    expect(usability).toContain(
      "Create and format a note | −9.4% | −31.5 to +14.8% (95%) | inconclusive | successful attempts only; warning: the candidates did not fail equally often",
    );
    expect(usability).toContain("### Exploratory comparisons");
  });

  it("states the level of adjusted intervals", () => {
    expect(runtimes).toContain("(97.5%)");
    expect(runtimes).toContain("widened together for the 2 comparisons (Bonferroni)");
  });

  it("ends with a provenance line that carries the hash of the results", () => {
    const shortHash = resultsHash(loadBenchmark("js-runtimes").results).slice(0, 12);

    expect(runtimes.trimEnd().split("\n").at(-1)).toBe(
      `<sub>results sha256 \`${shortHash}\` · 2026-11-15 · source https://github.com/mavdol/astrolabe · built with astrolabe-bench 0.1.0</sub>`,
    );
  });

  it("drops the built-with mention when style.attribution is false, and keeps the rest", () => {
    const benchmark = { ...loadBenchmark("js-runtimes"), style: { attribution: false } };
    const lastLine = renderMarkdown(benchmark, context).trimEnd().split("\n").at(-1)!;

    expect(lastLine).not.toContain("built with");
    expect(lastLine).toContain("results sha256");
    expect(lastLine).toContain("astrolabe-bench 0.1.0");
  });

  it("adds the commit and the run link when built in CI", () => {
    const continuousIntegration = { commit: "5e7550ddd55d63b851cc16c56680619ea4ea9808", runUrl: "https://github.com/o/r/actions/runs/1" };
    const lastLine = renderMarkdown(loadBenchmark("js-runtimes"), { ...context, continuousIntegration })
      .trimEnd()
      .split("\n")
      .at(-1)!;

    expect(lastLine).toContain("commit 5e7550ddd55d, [CI run](https://github.com/o/r/actions/runs/1)");
  });

  it("refuses results that have not been computed", () => {
    const { computed: _stamp, ...plan } = loadBenchmark("js-runtimes").results;

    expect(() => renderMarkdown({ ...loadBenchmark("js-runtimes"), results: plan }, context)).toThrow(/astrolabe compute/);
  });
});

describe("build context", () => {
  it("takes the date from SOURCE_DATE_EPOCH when set", () => {
    expect(buildDateFrom({ SOURCE_DATE_EPOCH: "1763164800" })).toBe("2025-11-15");
    expect(buildDateFrom({}, new Date("2026-11-15T23:00:00Z"))).toBe("2026-11-15");
  });

  it("reads the commit and the run of GitHub Actions", () => {
    expect(continuousIntegrationFrom({})).toBeUndefined();
    expect(
      continuousIntegrationFrom({
        GITHUB_ACTIONS: "true",
        GITHUB_SHA: "abc",
        GITHUB_SERVER_URL: "https://github.com",
        GITHUB_REPOSITORY: "o/r",
        GITHUB_RUN_ID: "7",
      }),
    ).toEqual({ commit: "abc", runUrl: "https://github.com/o/r/actions/runs/7" });
  });
});
