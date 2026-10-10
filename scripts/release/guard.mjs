import { execFileSync } from "node:child_process";
import { readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function version(value) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value ?? ""))
    throw Error("Version must be strict X.Y.Z");
  return value.split(".").map(BigInt);
}
export function compare(a, b) {
  const x = version(a),
    y = version(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}
export function notes(text, value) {
  version(value);
  const lines = text.split("\n");
  const start = lines.findIndex(
    (line) => line === `## [${value}]` || line.startsWith(`## [${value}] - `),
  );
  if (start < 0) throw Error("Missing CHANGELOG section");
  const end = lines.findIndex((line, i) => i > start && /^## /.test(line));
  const body = lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join("\n")
    .trim();
  if (!body.replace(/^###.*$/gm, "").trim()) throw Error("Empty CHANGELOG section");
  return body + "\n";
}
export function selectCI(runs, sha, branch, repository) {
  const matching = runs.filter(
    (run) =>
      run.head_sha === sha &&
      run.head_branch === branch &&
      run.event === "push" &&
      run.head_repository?.full_name === repository,
  );
  matching.sort((a, b) => b.run_number - a.run_number || b.run_attempt - a.run_attempt);
  const run = matching[0];
  if (!run || run.status !== "completed" || run.conclusion !== "success")
    throw Error("Latest exact-SHA branch push CI must succeed");
  return run;
}
export function checkJobs(jobs) {
  const gate = jobs.filter((job) => job.name === "CI").sort((a, b) => b.id - a.id)[0];
  if (!gate || gate.status !== "completed" || gate.conclusion !== "success")
    throw Error("CI must succeed");
}
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
export async function api(path, method = "GET", body) {
  const response = await fetch(
    `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${process.env.GH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  if (!response.ok) throw Error(`GitHub ${method} ${path}: ${response.status}`);
  return response.status === 204 ? null : response.json();
}
export async function verifyCI(sha, branch) {
  const runs = [];
  for (let page = 1; page <= 10; page++) {
    const data = await api(
      `actions/workflows/ci.yml/runs?head_sha=${sha}&event=push&per_page=100&page=${page}`,
    );
    runs.push(...data.workflow_runs);
    if (data.workflow_runs.length < 100) break;
    if (page === 10) throw Error("CI pagination limit reached");
  }
  const run = selectCI(runs, sha, branch, process.env.GITHUB_REPOSITORY);
  const jobs = await api(`actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`);
  if (jobs.total_count > 100) throw Error("Too many CI jobs");
  checkJobs(jobs.jobs);
  return run.id;
}
export function checkHead(sha, current, branch) {
  if (sha !== current) throw Error(`${branch} moved during validation`);
}
export async function guard(mode) {
  const ref = process.env.GITHUB_REF,
    event = process.env.GITHUB_EVENT_NAME;
  const sha = git("rev-parse", "HEAD");
  if (!["push", "workflow_dispatch"].includes(event)) throw Error("Unauthorized event");
  const branch = "main";
  git("fetch", "--force", "origin", `refs/heads/${branch}:refs/remotes/origin/${branch}`, "--tags");
  let value;
  if (mode === "cut") {
    if (event !== "workflow_dispatch" || ref !== "refs/heads/main")
      throw Error("Cut release only on main dispatch");
    if (sha !== git("rev-parse", "origin/main")) throw Error("Cut requires latest main HEAD");
    value = process.env.VERSION;
    version(value);
    const tags = git("tag", "--list", "v*")
      .split("\n")
      .filter((tag) => /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag));
    if (tags.some((tag) => compare(value, tag.slice(1)) <= 0))
      throw Error("Version must exceed every existing release tag");
  } else if (mode === "release") {
    if (!ref?.startsWith("refs/tags/v")) throw Error("Release requires a tag");
    value = ref.slice("refs/tags/v".length);
    version(value);
    if (git("rev-parse", `${ref}^{commit}`) !== sha) throw Error("Tag changed since checkout");
    git("merge-base", "--is-ancestor", sha, "origin/main");
  } else if (mode === "stage") {
    if (event !== "push" || ref !== "refs/heads/main" || sha !== git("rev-parse", "origin/main"))
      throw Error("Stage preview requires latest main push");
  } else throw Error("Unknown guard mode");
  if (value) {
    if (JSON.parse(readFileSync("package.json", "utf8")).version !== value)
      throw Error("Package version must match release");
    writeFileSync(
      `${process.env.RUNNER_TEMP}/release-notes.md`,
      notes(readFileSync("CHANGELOG.md", "utf8"), value),
    );
  }
  if (mode === "stage") {
    const deadline = Date.now() + 600000;
    while (true) {
      try {
        await verifyCI(sha, branch);
        break;
      } catch (error) {
        if (Date.now() >= deadline) throw error;
        await new Promise((resolve) => setTimeout(resolve, 15000));
      }
    }
  } else await verifyCI(sha, branch);
  if (mode === "cut" || mode === "stage")
    checkHead(sha, (await api(`git/ref/heads/${branch}`)).object.sha, branch);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `sha=${sha}\nversion=${value ?? ""}\n`);
  return sha;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await guard(process.argv[2]);
