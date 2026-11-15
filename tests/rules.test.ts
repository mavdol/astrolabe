import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { allRules, rule } from "../src/rules/registry.js";

const filesUnder = (folder: string): string[] =>
  readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);

    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });

/** Rule ids the code reports: the first argument of ComputeError, error(), warning(), and rule fields in issues. */
function ruleIdsCitedBySource(): Set<string> {
  const cited = new Set<string>();
  const citation = /(?:ComputeError\(|\berror\(|\bwarning\(|\brule: |\[\/[^\]]*\/, )"([A-Z]\d+)"/g;

  for (const path of filesUnder("src").filter((file) => file.endsWith(".ts"))) {
    for (const match of readFileSync(path, "utf8").matchAll(citation)) cited.add(match[1]);
  }

  return cited;
}

describe("the rule registry", () => {
  it("has one entry per id", () => {
    const ids = allRules().map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("knows every rule the code reports, so every error can be explained", () => {
    const cited = [...ruleIdsCitedBySource()];

    expect(cited.length).toBeGreaterThan(30);
    expect(cited.filter((id) => rule(id) === undefined)).toEqual([]);
  });

  it("finds a rule whatever the case of its id", () => {
    expect(rule("s11")?.id).toBe("S11");
    expect(rule("Z99")).toBeUndefined();
  });
});
