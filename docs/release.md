# Releases

Prepare `package.json`, the lockfile package version and a nonempty `## [X.Y.Z]`
section in `CHANGELOG.md` on `dev`. Promote through approved `dev → stage → main`
pull requests under the gates in `CONTRIBUTING.md`. Version 0.1.0 initializes the
release metadata; this changelog does not claim a previous published release.

After the latest main push has successful CI and `CI`, run **Cut release** in
Actions on **main**, supplying strict `X.Y.Z` (no `v`). It checks the package
version, changelog, main HEAD and monotonic version, creates an annotated tag using
the GitHub API, then dispatches **Release** on that tag. Tags created with
`GITHUB_TOKEN` do not trigger tag-push workflows, so the explicit dispatch is
required. This operation is a maintainer publication action and needs approval.

If the tag exists but dispatch failed, recover by running **Release** on that
existing tag. Do not rerun Cut release or move the tag. A manually pushed `vX.Y.Z`
tag enters the same Release workflow; other versions and branch dispatches fail.

Release verifies tag ancestry on main, matching package version, changelog and
successful exact-SHA main push CI including `CI`. The required CI includes a
credential-free Worker build, dry run and workerd smoke in index/noindex modes.
It creates a draft GitHub
release, uploads `time-material-worker.tar.gz` containing the application build,
package manifests and documentation, then publishes the release. Rerunning the
same tag refreshes its asset and notes. Production starts only after that job
succeeds. The reusable deploy workflow rebuilds and verifies the same immutable
tag without Cloudflare credentials; publication rechecks CI and published release
before exposing Cloudflare credentials in the publication step. There is no
production deployment on an ordinary main push.

Pushes to `main` publish the named stage preview of the same Worker; production
publishes only from a `v*` release tag. Stage publication waits up to ten minutes
for exact-SHA `main` CI and `CI`; failure or a moved `main` prevents publication.
A successful stage upload does not prove app
behavior behind Cloudflare Access. Production publishes without a pre-publication
health check, so the first deployment needs no bootstrap. After publication it
reports whether the exact deployed Worker version is served; that check never
fails or undoes the release, and there is no automatic rollback. Roll back by
hand with `npx wrangler rollback <version-id> --name time-material`.
See `cloudflare-deployment.md` for the smoke limitations.

Configure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for the production and
staging environments. Production environment branch/tag policy must admit release
`v*` tags; staging must admit main. Keep required reviewers and repository rules
active. The cut job needs contents/actions write for tagging and dispatch, the
release job needs contents write and actions read, and deployment needs only
contents/actions read. No credential or real database mount belongs in builds.

Local Docker tests exercise strict version/notes and exact CI selection, including
fork, wrong branch/SHA/event, missing gate, pending reruns and failed newer runs.
They do not create tags, GitHub releases or live deployments.
