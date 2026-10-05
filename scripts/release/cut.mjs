import { guard, api } from "./guard.mjs";
import { readFileSync } from "node:fs";
const sha = await guard("cut");
const tag = `v${process.env.VERSION}`;
const object = await api("git/tags", "POST", {
  tag,
  message: readFileSync(`${process.env.RUNNER_TEMP}/release-notes.md`, "utf8"),
  object: sha,
  type: "commit",
});
if ((await api("git/ref/heads/main")).object.sha !== sha)
  throw Error("Main moved; refusing tag ref creation");
await api("git/refs", "POST", { ref: `refs/tags/${tag}`, sha: object.sha });
try {
  await api("actions/workflows/release.yml/dispatches", "POST", { ref: tag });
} catch (error) {
  throw Error(
    `Tag ${tag} exists. Recover by dispatching release.yml on ${tag}; do not cut again. ${error.message}`,
  );
}
