import { execFileSync } from "node:child_process";
import { guard } from "./guard.mjs";
await guard("release");
const tag = process.env.TAG;
const gh = (...args) => execFileSync("gh", args, { stdio: "inherit" });
try {
  execFileSync("gh", ["release", "view", tag], { stdio: "pipe" });
} catch {
  gh(
    "release",
    "create",
    tag,
    "--verify-tag",
    "--draft",
    "--title",
    tag,
    "--notes-file",
    `${process.env.RUNNER_TEMP}/release-notes.md`,
  );
}
gh("release", "upload", tag, `${process.env.RUNNER_TEMP}/time-material-worker.tar.gz`, "--clobber");
gh(
  "release",
  "edit",
  tag,
  "--draft=false",
  "--prerelease=false",
  "--notes-file",
  `${process.env.RUNNER_TEMP}/release-notes.md`,
);
