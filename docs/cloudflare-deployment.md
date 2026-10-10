# Cloudflare deployment

Time Material runs on one Worker, with production at `time.szolotov.com` and the named `stage` preview at `stage.time.szolotov.com`.

The timezone planner needs no database or OAuth secrets. Account synchronization is not included.

## Configuration

`wrangler.jsonc` defines the Worker, assets, version metadata, and domains. The stage preview sets `ROBOTS=noindex`. Protect the stage hostname with Cloudflare Access if private access is required; a noindex header does not provide access control.

GitHub Actions uses repository secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. The token must permit the configured Worker deployment and domain configuration.

## Validation

Run checks in Docker before publication:

```sh
npm ci
npm test
npm run lint
npm run typecheck
npm run build:cloudflare
npm run deploy:cloudflare:dry-run
node scripts/ci/worker-smoke.mjs
```

## Publication

A push to `stage` publishes its named preview after the exact commit passes `CI`. Production publication follows a successful `main` check and a published versioned release. See [release workflow](release.md).

Deployment checks the deployed version, page, assets, manifest, and indexing headers. Production publishes without a pre-publication health check; the post-publication version check only reports, and rollback is manual (`npx wrangler rollback <version-id> --name time-material`).
