import { api } from "./guard.mjs";
const tag = process.env.GITHUB_REF?.replace("refs/tags/", "");
if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag ?? ""))
  throw Error("Release tag required");
const release = await api(`releases/tags/${tag}`);
if (release.draft || release.prerelease || release.tag_name !== tag)
  throw Error("Published final release required before production");
