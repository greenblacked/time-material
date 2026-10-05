const jobs = ["LINT", "TYPECHECK", "TEST", "BUILD", "COMMITS", "BRANCH"];
const bad = jobs.filter((name) => {
  const result = process.env[name];
  return result !== "success" && result !== "skipped";
});

if (bad.length > 0) {
  for (const name of bad) console.error(`${name}=${process.env[name]}`);
  process.exit(1);
}

console.log("CI OK");
