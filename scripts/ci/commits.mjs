import { execSync } from "node:child_process";

const event = process.env.GITHUB_EVENT_NAME ?? "";
const subject =
  /^(feat|fix|docs|ci|chore|refactor|test|perf|build|release)(\([a-z0-9._/-]+\))?: .+$/;

function range() {
  if (event === "pull_request") {
    const base = process.env.BASE_SHA;
    const head = process.env.HEAD_SHA;
    if (!base || !head) throw new Error("Pull request is missing a commit range.");
    return `${base}...${head}`;
  }
  if (event === "push") {
    const before = process.env.BEFORE_SHA ?? "";
    const sha = process.env.GITHUB_SHA;
    if (!sha) throw new Error("Push is missing a head SHA.");
    if (!before || /^0+$/.test(before)) return null;
    return `${before}..${sha}`;
  }
  return null;
}

const spec = range();
if (!spec) {
  console.log("No commit range for this event.");
  process.exit(0);
}

const log = execSync(`git log --format=%H%x1f%s ${spec}`, { encoding: "utf8" }).trim();
if (!log) {
  console.log("No commits in range.");
  process.exit(0);
}

let failed = false;
for (const line of log.split("\n")) {
  const [sha, message] = line.split("\x1f");
  if (!sha || message === undefined) continue;
  if (message.startsWith("Merge ")) continue;
  const badShape = !subject.test(message);
  const tooLong = message.length > 72;
  if (badShape || tooLong) {
    failed = true;
    console.error(
      `${sha.slice(0, 7)} ${tooLong ? `(${message.length} characters) ` : ""}${message}`,
    );
  }
}

if (failed) {
  console.error(
    "Subjects must be Conventional Commits, at most 72 characters. Merge commits are allowed.",
  );
  process.exit(1);
}

console.log("Commits follow the subject rules.");
