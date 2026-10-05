const head = process.env.HEAD_REF ?? "";
const base = process.env.BASE_REF;
const fromFork = process.env.FROM_FORK === "true";
const longLived = /^(dev|stage|main)$/;
const named =
  /^(feat|fix|docs|ci|chore|refactor|test|perf|build|release)\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

const dependency = /^dependabot\/[a-z0-9][a-z0-9._/-]*$/;
const validName = longLived.test(head) || named.test(head) || dependency.test(head);
const hasContext = base !== undefined;
const validRoute =
  !hasContext ||
  ((named.test(head) || dependency.test(head)) && base === "dev") ||
  (!fromFork && head === "dev" && base === "stage") ||
  (!fromFork && head === "stage" && base === "main");

if (validName && validRoute) {
  console.log(`${head} is an allowed branch${hasContext ? ` into ${base}` : " name"}.`);
  process.exit(0);
}

console.error(
  `Branch "${head}"${hasContext ? ` into "${base}"` : ""} is not allowed. ` +
    "Use <type>/<short-kebab> or dependabot/* into dev, then same-repository dev into stage and stage into main.",
);
process.exit(1);
