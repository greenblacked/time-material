import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const gate = fileURLToPath(new URL("./gate.mjs", import.meta.url));
const jobs = ["LINT", "TYPECHECK", "TEST", "BUILD", "COMMITS", "WORKFLOWS", "BRANCH"];
const passing = Object.fromEntries(jobs.map((job) => [job, "success"]));
function run(overrides = {}) {
  const env = { ...passing, EVENT_NAME: "pull_request", ...overrides };
  for (const key of Object.keys(env)) {
    if (env[key] === undefined) delete env[key];
  }
  return spawnSync(process.execPath, [gate], { env, encoding: "utf8" });
}

test("all required jobs passing produces CI OK", () => {
  const result = run();
  assert.equal(result.status, 0);
  assert.match(result.stdout, /CI OK/);
});

for (const job of jobs) {
  for (const result of ["failure", "cancelled", "skipped", undefined]) {
    test(`${job}=${result} fails on a pull request`, () => {
      const output = run({ [job]: result });
      assert.equal(output.status, 1);
      assert.match(output.stderr, new RegExp(`${job}=`));
    });
  }
}

for (const event of ["push", "merge_group", "workflow_dispatch"]) {
  test(`only the branch job may skip on ${event}`, () => {
    assert.equal(run({ EVENT_NAME: event, BRANCH: "skipped" }).status, 0);
    for (const job of jobs.filter((name) => name !== "BRANCH")) {
      assert.equal(run({ EVENT_NAME: event, [job]: "skipped" }).status, 1);
    }
  });
}

test("missing or unknown event does not authorize a skipped branch check", () => {
  for (const event of [undefined, "unknown"]) {
    assert.equal(run({ EVENT_NAME: event, BRANCH: "skipped" }).status, 1);
  }
});
