# Changelog

## [Unreleased]

## [0.2.1]

### Changed

- Production releases publish without first requiring a healthy production response, so the first deployment needs no separate bootstrap. The post-publication version check reports only, and there is no automatic rollback.
- Browser tests run in the pinned Playwright image on Ubuntu 24.04.

### Fixed

- Meeting details: Start and End time pickers share one width, and row labels align with their first control.
- Production re-runs no longer fail on an expired build artifact; it is kept for 7 days.

## [0.2.0]

### Added

- Worldwide city search with on-demand catalog shards and IANA timezone choices.
- Independent settings for cities sharing a timezone and native touch timeline scrolling.
- WebGPU mesh gradient behind the header. It loads only where a GPU adapter is available and motion is allowed; elsewhere a still CSS gradient shows.
- Undo for a removed city is announced to screen readers, waits while focused or hovered, and responds to Ctrl/Cmd+Z.

### Changed

- Flat, token-based redesign with one blue accent in light and dark themes.
- Work hours and meeting start/end use time pickers that follow the board's 24/12-hour setting and skip times that do not exist on daylight-saving days.

### Removed

- The Background preference (Quiet, Glass, Full). The saved `time-material:background` value is cleared on load.

### Fixed

- Legacy timezone names such as Europe/Kiev resolve to the current city in search, saved boards and shared links instead of a duplicate row.
- City search handles responses already decompressed by the browser.
- City picker stays within the viewport and preserves focus after outside clicks.
- Opening the calendar on phones no longer scrolls the page in WebKit.

### Security

- `sharp` is pinned to 0.35.5 through an npm override for GHSA-wq5f-xc86-pv6w.

## [0.1.0]

### Added

- Timezone day board with per-city working hours and meeting overlap calculations.
- Glass date picker, shareable boards, and calendar exports.
- Cloudflare Worker production and named stage preview delivery configuration.
