# Time Material

Compare local times across cities and timezones, find overlapping working hours,
and select a meeting on a shared timeline. The interface supports desktop and
mobile, a white theme with blue accents, a dark theme with yellow accents, and
frosted glass controls.

## Start using the board

1. Use **Add city or timezone** in the table header to add locations.
2. Choose a date and **Workday** or **Full day**.
3. Click or drag across the timeline to select a meeting. Move the selection or
   resize either edge. Hold Shift for five-minute steps; keyboard controls are
   available on the selection and resize handles.
4. Copy a shareable link or meeting brief, download a calendar file, or open a
   Google Calendar event template. An event template does not send invitations.

The first location is **Home** and defines the displayed day's axis. Its menu
can change the home location, reorder, rename or remove cities, and edit working
hours. Changing Home preserves the selected meeting's instant.

**Outside work hours** means the selected meeting is outside that location's
configured hours. The defaults are 09:00–17:00, with weekday filtering enabled;
these are editable application settings, not a calendar recommendation.
Daylight-saving transitions and local date rollovers are handled by timezone.

**Options** contains time formats, timezone and weekend display, backgrounds and
saved location groups. The theme switch is at the toolbar's right edge. Groups
and preferences are stored in this browser, not synchronized across devices.
The address bar stays clean while you edit. **Copy link** generates a detailed
URL containing the current board settings. Opening that link restores the board,
then removes its settings from the address bar.

## Integration status

Time comparison and calendar exports work without an account. Reading private
calendar events currently uses the inherited Time Material connector implementation.
Direct Google, Microsoft/Teams and Zoom authorization is requested but not yet
implemented. Cloudflare deployment secrets do not grant provider access.

Missing calendar data is shown as unread. Partial reads and pagination remain
release blockers: exported availability and Zoom claims are not yet reliable
when only part of a calendar response is available.

## Local development in Docker

Requires Docker. Run from the repository root. This stages source without local
credentials or generated files, then installs dependencies inside the container:

```sh
task_src=$(mktemp -d)
trap 'rm -rf -- "$task_src"' EXIT
tar --exclude='.git' --exclude='.agent' --exclude='.agents' \
  --exclude='.Time Material' --exclude='.Time Material' --exclude='.Time Material' \
  --exclude='.aws' --exclude='.ssh' --exclude='.npmrc' \
  --exclude='.env' --exclude='.env.*' --exclude='node_modules' \
  --exclude='dist' --exclude='.output' --exclude='.nitro' \
  --exclude='.wrangler' --exclude='.pglite' --exclude='.vercel' \
  --exclude='artifacts' --exclude='screenshots' --exclude='*.log' \
  -cf - . | tar -C "$task_src" -xf -
docker run --rm --init -p 127.0.0.1:8080:8080 \
  --mount "type=bind,source=$task_src,target=/source,readonly" \
  --workdir /workspace node:22-bookworm-slim \
  sh -ec 'cp -a /source/. /workspace/; npm ci; exec npm run dev'
```

Open http://localhost:8080. This runs a snapshot; restart with a fresh snapshot
to include source edits. Run installs, tests and builds inside Docker.

## Checks and release status

The package provides `lint`, `typecheck`, `test:ci`, `test`, `check:auth` and
`build`. `check:auth` needs a running development server. The Node `build` also
runs migrations when `DATABASE_URL` is supplied; Cloudflare builds do not.

Curated tests and local browser/runtime checks have passed. The full test suite
has 16 independently reproduced baseline fixture/configuration failures, and
the retained Nitro dependency chain has high-severity audit findings. CI still
needs the requested broader browser, Node-version and security coverage.
The application is not yet certified ready for production.

## Cloudflare deployment

Wrangler publishes one Worker, `time-material`:

| Branch  | Target                                         |
| ------- | ---------------------------------------------- |
| `main`  | Production: https://time.szolotov.com          |
| `stage` | Named preview: https://stage.time.szolotov.com |
| `dev`   | Checks only                                    |

Pull requests build, smoke-test the local Worker and run a credential-free dry
run. Publishing uses repository secrets `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN`. Stage's Cloudflare Zero Trust access policy is managed
separately; `noindex` is not access control.

See [deployment instructions](docs/cloudflare-deployment.md) for configuration,
checks, database requirements and rollback. Local checks do not prove a live
deployment or provider integration.

Changes follow `dev` → `stage` → `main`. See
[contribution and merge rules](CONTRIBUTING.md).
