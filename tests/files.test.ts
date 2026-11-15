import { describe, expect, it } from "vitest";
import { compute } from "../src/compute/compute.js";
import { resultsKeepingPlanAsWritten } from "../src/compute/files.js";
import { planOf, rawFileOf } from "./helpers.js";

describe("writing computed results", () => {
  it("keeps the plan as its author wrote it, and replaces only the fields compute owns", () => {
    const plan = planOf();
    const rows = ["base", "new"].flatMap((candidate) =>
      [1, 2, 3, 4, 5, 6].map((value, index) => ({ candidate, measure: "score", value, run: index + 1 })),
    );
    const computed = compute(plan, { data: rawFileOf(rows) }, { resamples: 200 });
    const [firstMetric] = plan.metrics;
    const metricWithKeysReordered = Object.fromEntries(Object.entries(firstMetric).reverse());
    const { limitations, ...restOfPlan } = plan;
    const resultsAsWritten = {
      limitations,
      ...restOfPlan,
      metrics: [metricWithKeysReordered],
      comparisons: ["stale"],
      values: ["stale"],
    };

    const written = resultsKeepingPlanAsWritten(resultsAsWritten, computed);

    expect(Object.keys(written).slice(0, 2)).toEqual(["limitations", "benchmark"]);
    expect(Object.keys((written.metrics as object[])[0])).toEqual(Object.keys(metricWithKeysReordered));
    expect(written.comparisons).toEqual(computed.comparisons);
    expect(written.values).toEqual(computed.values);
    expect(Object.keys(written).slice(-6)).toEqual(["values", "failures", "exclusions", "comparisons", "observed", "computed"]);
    expect(written.raw_data).toEqual([{ ...plan.raw_data[0], rows: 12, sha256: computed.raw_data[0].sha256 }]);
  });
});
