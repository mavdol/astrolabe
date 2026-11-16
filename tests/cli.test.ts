import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const runAstrolabe = (...args: string[]) =>
  spawnSync(process.execPath, ["--import", "tsx", "src/cli/index.ts", ...args], { encoding: "utf8", timeout: 60_000 });

describe("the command line", () => {
  it("build writes nothing from a file that fails validate", () => {
    const folder = mkdtempSync(join(tmpdir(), "astrolabe-cli-"));

    cpSync("examples/json-cli-parse", folder, { recursive: true });
    rmSync(join(folder, "dist"), { recursive: true, force: true });

    const benchmarkPath = join(folder, "benchmark.json");
    const file = JSON.parse(readFileSync(benchmarkPath, "utf8"));

    file.results.values[0].value *= 2;
    writeFileSync(benchmarkPath, JSON.stringify(file));

    const build = runAstrolabe("build", benchmarkPath);

    expect(build.status).toBe(1);
    expect(build.stdout).toContain("Nothing was written");
    expect(existsSync(join(folder, "dist"))).toBe(false);
  });
});
