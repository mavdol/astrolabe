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

  it("build writes the site and names the files it copies into it, which become public", () => {
    const folder = mkdtempSync(join(tmpdir(), "astrolabe-cli-"));

    cpSync("examples/json-cli-parse", folder, { recursive: true });

    const build = runAstrolabe("build", join(folder, "benchmark.json"), "--format", "site");

    expect(build.status).toBe(0);
    expect(build.stdout).toContain("copied into the site, public once it is published: benchmark.json, data/runs.jsonl");
    expect(existsSync(join(folder, "dist", "site", "index.html"))).toBe(true);
    expect(existsSync(join(folder, "dist", "site", ".nojekyll"))).toBe(true);
  });

  it("build links the README card to the page at --url, and to the full results without it", () => {
    const folder = mkdtempSync(join(tmpdir(), "astrolabe-cli-"));
    const benchmarkPath = join(folder, "benchmark.json");

    cpSync("examples/json-cli-parse", folder, { recursive: true });

    const withAddress = runAstrolabe("build", benchmarkPath, "--url", "https://owner.github.io/repository/");
    const withoutAddress = runAstrolabe("build", benchmarkPath);

    expect(withAddress.status).toBe(0);
    expect(withAddress.stdout).toContain("linked to the page at https://owner.github.io/repository/");
    expect(withAddress.stdout).toContain('<a href="https://owner.github.io/repository/">');
    expect(withoutAddress.stdout).toMatch(/<a href="[^"]*dist\/benchmark\.md">/);
  });

  it("build refuses a --url that is not the full address of a web page", () => {
    const folder = mkdtempSync(join(tmpdir(), "astrolabe-cli-"));

    cpSync("examples/json-cli-parse", folder, { recursive: true });
    rmSync(join(folder, "dist"), { recursive: true, force: true });

    const build = runAstrolabe("build", join(folder, "benchmark.json"), "--url", "owner.github.io/repository");

    expect(build.status).toBe(2);
    expect(build.stderr).toContain("--url takes the full address of the site");
    expect(existsSync(join(folder, "dist"))).toBe(false);
  });
});
