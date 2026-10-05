import assert from "node:assert/strict";
import test from "node:test";
import { version, compare, notes, selectCI, checkJobs, checkHead } from "./guard.mjs";
test("strict versions reject injected refs, leading zeroes and prereleases", () => {
  for (const value of ["01.2.3", "v1.2.3", "1.2.3-rc1", "1.2.3\n", "1.2.3/evil", "1.2"])
    assert.throws(() => version(value));
  assert.equal(compare("1.10.0", "1.9.99"), 1);
  assert.equal(compare("1.0.0", "1.0.0"), 0);
  assert.equal(compare("0.1.0", "1.0.0"), -1);
});
test("release notes require exact nonempty version section", () => {
  assert.equal(
    notes("## [1.2.3] - 2026-10-05\n### Added\n- Ship\n## [1.2.2]\nOld", "1.2.3"),
    "### Added\n- Ship\n",
  );
  assert.throws(() => notes("## [1.2.30]\nWrong", "1.2.3"));
  assert.throws(() => notes("## [1.2.3]\n### Added\n## [1.2.2]\nOld", "1.2.3"));
});
const run = (extra = {}) => ({
  id: 1,
  head_sha: "abc",
  head_branch: "main",
  event: "push",
  head_repository: { full_name: "owner/repo" },
  run_number: 1,
  run_attempt: 1,
  status: "completed",
  conclusion: "success",
  ...extra,
});
test("CI binds repository, branch, SHA and push event", () => {
  for (const extra of [
    { head_sha: "wrong" },
    { head_branch: "stage" },
    { event: "pull_request" },
    { head_repository: { full_name: "fork/repo" } },
  ])
    assert.throws(() => selectCI([run(extra)], "abc", "main", "owner/repo"));
  assert.throws(() => selectCI([], "abc", "main", "owner/repo"));
});
test("latest run and latest attempt override older success regardless of API ordering", () => {
  assert.throws(() =>
    selectCI([run(), run({ run_number: 2, conclusion: "failure" })], "abc", "main", "owner/repo"),
  );
  assert.throws(() =>
    selectCI(
      [run({ run_attempt: 2, status: "in_progress", conclusion: null }), run()],
      "abc",
      "main",
      "owner/repo",
    ),
  );
  assert.equal(selectCI([run({ run_number: 2, id: 2 }), run()], "abc", "main", "owner/repo").id, 2);
});
test("CI requires actual completed success, never skipped or missing", () => {
  for (const jobs of [
    [],
    [{ name: "CI", status: "completed", conclusion: "skipped" }],
    [{ name: "other", status: "completed", conclusion: "success" }],
  ])
    assert.throws(() => checkJobs(jobs));
  checkJobs([{ name: "CI", status: "completed", conclusion: "success" }]);
});

test("branch must still point at validated SHA after CI polling", () => {
  checkHead("abc", "abc", "stage");
  assert.throws(() => checkHead("abc", "new", "stage"), /stage moved/);
  assert.throws(() => checkHead("abc", "new", "main"), /main moved/);
});
