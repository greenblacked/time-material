# How changes ship

Three long-lived branches. Work never lands on production directly.

| Branch | Role |
| --- | --- |
| `dev` | Integration. Continuous integration only. |
| `stage` | Release candidate. Continuous integration, then a human gate. |
| `main` | Production. The same gates as stage. |

```text
work ──▶ dev ── pull request (merge commit) ──▶ stage ── pull request (merge commit) ──▶ main
```

## Commits

- Use your own configured Git identity; a verified or GitHub privacy email is recommended.
- Follow Conventional Commits: `<type>(<scope>): <imperative summary>`. The scope is optional.
- Keep the subject within 72 characters and describe the concrete change.
- Use `feat`, `fix`, `docs`, `ci`, `chore`, `refactor`, `test`, `perf`, `build` or `release`.
- Explain the reason and relevant validation in the body when the subject is insufficient.
- Keep commits focused and exclude generated artifacts, credentials and local tooling state.
- Use `release` for version preparation. Release pull requests use `release: vX.Y.Z`.
- Only the repository owner reviews and merges pull requests. Use merge commits for branch promotion;
  other commits must follow the subject convention.

## Branches

Feature work uses `<type>/<short-kebab>`. No tool-named prefixes.

`dev`, `stage`, and `main` are the only long-lived names.

## Pull requests

Promotion uses a merge commit. Do not squash and do not rebase the long-lived branches.

1. Land atomic commits on `dev`, or a merge commit of a feature branch.
2. Keep one draft pull request from `dev` into `stage` while a batch is open. Its description lists "Landed so far" and "Still to land".
3. Keep the batches small. `dev` should not drift far ahead of `stage`.
4. Before marking that pull request ready, `dev` must contain `stage`:

```bash
git fetch origin
git merge-base --is-ancestor origin/stage origin/dev
```

If that fails, merge `stage` into `dev`, re-check, then push.

## Merge gates

Into `stage` and into `main`, every time:

- [ ] The repository owner's review, explicit approval and merge.
- [ ] `CI` is green on the pull request head, and the latest push to the target branch is green. Nothing red, pending, or queued.
- [ ] Every review thread is resolved.
- [ ] One merge at a time. Wait for the target branch's checks after each merge.

Do not force-push a branch that has already been pushed. An unpushed commit may be reworded.

Cloudflare Workers deployment is configured in `.github/workflows/deploy.yml`.
`main` publishes production at `https://time.szolotov.com`; `stage` publishes
the named `stage` preview of the same Worker at `https://stage.time.szolotov.com`.
See `docs/cloudflare-deployment.md` for credentials, local checks and rollback.
Cloudflare Zero Trust protection is managed separately for the stage hostname.
Local validation does not establish that either environment has been published.
