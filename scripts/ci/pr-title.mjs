const title = process.env.TITLE ?? "";
const conventional =
  /^(feat|fix|docs|ci|chore|refactor|test|perf|build)(\([a-z0-9._/-]+\))?: .+$/;
const release = /^release: v\d+\.\d+\.\d+$/;

if (title.length <= 72 && (conventional.test(title) || release.test(title))) {
  console.log("PR title is valid.");
  process.exit(0);
}

console.error(
  "PR title must be a Conventional Commit subject of at most 72 characters, or release: vX.Y.Z.",
);
console.error(title);
process.exit(1);
