import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./branch-name.mjs", import.meta.url));
function run(head, base, fork = false) {
  const env = { HEAD_REF: head, FROM_FORK: String(fork) };
  if (base !== undefined) env.BASE_REF = base;
  return spawnSync(process.execPath, [script], { env, encoding: "utf8" });
}

for (const [head, base, fork] of [
  ["feat/city-hours", "dev", false],
  ["fix/calendar-parse", "dev", true],
  ["release/update-version", "dev", false],
  ["dependabot/npm_and_yarn/vite-8.2.1", "dev", false],
  ["dev", "stage", false],
  ["stage", "main", false],
]) {
  test(`accepts ${head} into ${base} (fork=${fork})`, () => {
    assert.equal(run(head, base, fork).status, 0);
  });
}

for (const [head, base, fork] of [
  ["feat/city-hours", "stage", false],
  ["fix/calendar-parse", "main", false],
  ["dependabot/npm_and_yarn/vite-8.2.1", "stage", false],
  ["main", "dev", false],
  ["main", "stage", false],
  ["dev", "main", false],
  ["stage", "dev", false],
  ["dev", "stage", true],
  ["stage", "main", true],
  ["dev", "dev", true],
  ["feat/city-hours", "unknown", false],
  ["feat/city-hours", "", false],
  ["feature/city-hours", "dev", false],
  ["fix/Uppercase", "dev", false],
  ["fix/trailing-", "dev", false],
  ["", "dev", false],
]) {
  test(`rejects ${head} into ${base} (fork=${fork})`, () => {
    const output = run(head, base, fork);
    assert.equal(output.status, 1);
    assert.match(output.stderr, /not allowed/);
  });
}

test("without routing context validates names only", () => {
  assert.equal(run("dev").status, 0);
  assert.equal(run("docs/review-guide").status, 0);
  assert.equal(run("unsupported/task").status, 1);
});
