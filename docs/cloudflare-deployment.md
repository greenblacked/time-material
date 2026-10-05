# Cloudflare deployment

One Worker, `time-material`, serves production at https://time.szolotov.com.
The named Worker Preview `stage` serves https://stage.time.szolotov.com.
This is the same single-Worker/custom-domain/named-preview topology as the
neighboring AI application (`../AI/deploy/wrangler.json`), with this app's own
Worker entry, assets, bindings and domains. No second stage Worker is created.
`dev` never deploys. Pull requests build, run workerd smoke checks and perform a
credential-free Wrangler dry run. Existing Node/Vercel builds remain supported.

## Build and delivery

Use Node 22 in Docker locally. These commands run inside the sanitized container:

```sh
npm ci
npm run typecheck
npm run test:ci
npm run build:cloudflare
npm run deploy:cloudflare:dry-run
npm run preview:cloudflare -- --host 0.0.0.0 --port 8081
```

The Cloudflare build uses the native TanStack Worker adapter and outputs
`dist/client` and `dist/server/wrangler.json`. It does not run database migrations
and needs no deployment credentials. The native entry preserves the dynamic
manifest, install tutorial and streamed PWA/OG head tags.

The workflow builds without Cloudflare credentials. A separate publication job
installs with lifecycle scripts disabled and downloads the exact built artifact.
Only publication and the guarded rollback step receive `CLOUDFLARE_API_TOKEN`
and `CLOUDFLARE_ACCOUNT_ID`.
The repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are used
only by publication and guarded rollback. Their names have been supplied; their values
and permissions have not been verified. GitHub environments `production` and
`staging` select the target. Required reviewers can be configured as an additional
human gate; their presence is not assumed.
Branch promotion still requires all gates in CONTRIBUTING.md; a successful local
build does not authorize a merge or deployment.

The first production deployment must register `time.szolotov.com` and its
preview wildcard before publishing the named `stage` preview. The stage workflow
requires Wrangler's last preview output to include the exact URL
`https://stage.time.szolotov.com`; missing domain registration therefore fails
verification instead of being reported as a ready stage deployment.
Deployment updates the Worker's declared custom domains; dashboard-only domains
are not part of this configuration. DNS and certificate provisioning require
appropriate zone permissions. No account identifier is stored in the repository.

## Stage privacy and indexing

Serhii configures Cloudflare Zero Trust Access for **stage.time.szolotov.com only**.
The repository does not create or modify Access policies. Both `workers.dev` and
version preview URLs are disabled to avoid alternate public hosts. Stage's
preview bindings set `ROBOTS=noindex`; document responses carry `X-Robots-Tag`,
and `/robots.txt` disallows crawling. Production permits indexing. Robots rules
are indexing hints, not an access-control mechanism.

## Database and authentication

Cloudflare builds never bootstrap PGlite. Database access without `DATABASE_URL`
fails explicitly instead of creating an ephemeral database in an isolate.
The comparison board can render without database credentials. Existing auth and
calendar gates remain unchanged; unavailable calendar data remains unknown.

Database-backed features require persistent PostgreSQL supplied as Worker
secrets. Direct Google, Zoom and Microsoft Teams OAuth is requested but is not
implemented by this adapter; provider registrations and credentials are a
separate application change. Existing broker auth is not certified as the
production integration. Production and preview bindings are separate: stage must use
its own database and auth origin, not the production database. Apply existing
SQL migrations through the normal Node migration command against the intended
database before enabling those features. Local checks do not prove external
PostgreSQL connectivity, real calendar access or OAuth callback behavior.

## Publication and rollback

The workflow publishes pushes to `main` as production and pushes to `stage` as
its named preview. This branch trigger remains unchanged; it does not adopt the
AI application's tag-release process. In an authorized publishing environment,
these commands publish the already-built artifact without rebuilding:

```sh
npm run deploy:cloudflare
npm run deploy:cloudflare:stage
```

Their exact CLI commands are:

```sh
wrangler deploy --no-autoconfig --no-install-skills --config dist/server/wrangler.json
wrangler preview --no-install-skills --config dist/server/wrangler.json --name stage --ignore-base-config
wrangler deploy --dry-run --no-autoconfig --no-install-skills --config dist/server/wrangler.json
```

The production and dry-run commands disable automatic project configuration and
skill installation; preview also disables skill installation. Stage is a preview
of the same `time-material` Worker and never takes production traffic. Both
hostnames were published and checked on 2026-10-05. Later changes on `dev` are
local until explicitly published or promoted through the deployment workflow.
The workflow verifies the uploaded Worker version through `X-Worker-Version`,
then checks its SSR/JavaScript/manifest with request timeouts. A failed smoke
triggers rollback only if the currently answering version is still that failed
version, then waits for a different version to answer. Missing version metadata,
failed publication, an intervening version or failed rollback requires manual
inspection; those states are not reported as passing. Rollback does not revert
database changes.
After deployment, verify production SSR, fonts, JavaScript, dynamic manifest and
install tutorial. Verify stage after signing in through Access, including its
noindex header and robots response. A CI service token for Access is not configured,
so automated public smoke checks must not be mistaken for stage verification.

To roll production back using the pinned CLI in an authorized environment:

```sh
npx --no-install wrangler rollback --name time-material
```

Rollback restores Worker code, not PostgreSQL schema or external auth settings.
Restore stage by publishing the desired revision as the same `stage` preview.

## Sources

- [Cloudflare TanStack Start guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/)
- [Worker Preview configuration](https://developers.cloudflare.com/workers/previews/configuration/)
- [Preview custom domains](https://developers.cloudflare.com/workers/previews/custom-domains/)
