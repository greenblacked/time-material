# Time Material

A timezone planner for comparing cities and finding shared working hours.

## Features

- Search the worldwide city directory or IANA time zones and reorder the reference city.
- Swipe the timeline on touch devices and keep distinct cities in the same timezone.
- Compare local dates and times, including daylight-saving changes.
- Select a meeting interval and adjust working hours.
- Use light or dark glass controls and a custom date picker.
- Share a board, copy meeting details, download an ICS file, or open a Google Calendar event draft.

Account login and calendar synchronization are not included. The app requires no database or OAuth credentials. Calendar exports do not connect to your account or read events.

The [city directory](docs/city-data.md) contains over five million GeoNames populated-place records. Search loads compressed shards on demand; coverage follows the source dataset.

## Development

Use Node.js 22 or 24. Run application checks in Docker.

```sh
npm ci
npm run dev
```

The development server listens on port 8080.

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm run build:cloudflare
npm run deploy:cloudflare:dry-run
```

Browser checks use Playwright with Chromium and WebKit across desktop, phone, and tablet layouts in both themes. Browser emulation does not establish compatibility with every physical device.

## Delivery

Work follows `dev` → `stage` → `main`. The required check is `CI`. A push to `main` deploys the stage preview of the same Cloudflare Worker. Production deploys only from a `v*` release tag.

Dependency checks run npm audit and OSV-Scanner against the lockfile. High or critical npm advisories, any OSV finding, and scanner errors fail the required security job. Dependabot proposes weekly package and workflow updates to `dev`, with a seven-day cooldown for new versions; updates require review.

- Production: https://time.szolotov.com
- Stage: https://stage.time.szolotov.com

See [contribution guidelines](CONTRIBUTING.md), [deployment](docs/cloudflare-deployment.md), and [releases](docs/release.md).
