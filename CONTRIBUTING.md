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

- Author `greenblacked <23718180+greenblacked@users.noreply.github.com>`.
- Conventional Commits: `<type>(<scope>): <imperative summary>`.
- The subject is at most 72 characters.
- Types: `feat`, `fix`, `docs`, `ci`, `chore`, `refactor`, `test`, `perf`, `build`, `release`.
- A release uses `release`, never `chore`. The pull request title is `release: vX.Y.Z`.
- Merge commits are allowed. Everything else must match the subject rule.

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

- [ ] Serhii's explicit go-ahead.
- [ ] `CI OK` is green on the pull request head, and the latest push to the target branch is green. Nothing red, pending, or queued.
- [ ] Every review thread is resolved.
- [ ] One merge at a time. Wait for the target branch's checks after each merge.

Do not force-push a branch that has already been pushed. An unpushed commit may be reworded.

Hosting for `stage` and `main` is not connected in this repository yet. The branches and the checks are the gate. Say where each environment should deploy when that should be added.
