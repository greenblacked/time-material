const jobs = ["LINT", "TYPECHECK", "TEST", "BUILD", "COMMITS", "WORKFLOWS", "BRANCH"];
const bad = jobs.filter((name) => {
  const result = process.env[name];
  const intentionalSkip = name === "BRANCH" && result === "skipped" &&
    ["push", "merge_group", "workflow_dispatch"].includes(process.env.EVENT_NAME);
  return result !== "success" && !intentionalSkip;
});

if (bad.length > 0) {
  for (const name of bad) console.error(`${name}=${process.env[name]}`);
  process.exit(1);
}

console.log("CI OK");
