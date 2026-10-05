const head = process.env.HEAD_REF ?? "";
const longLived = /^(dev|stage|main)$/;
const named =
  /^(feat|fix|docs|ci|chore|refactor|test|perf|build|release)\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

if (longLived.test(head) || named.test(head)) {
  console.log(`${head} is an allowed branch name.`);
  process.exit(0);
}

console.error(
  `Branch "${head}" must be dev, stage, main, or <type>/<short-kebab>.`,
);
process.exit(1);
