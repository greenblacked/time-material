# Changelog

## [Unreleased]

### Added

- Worldwide city search with on-demand catalog shards and IANA timezone choices.
- Independent settings for cities sharing a timezone and native touch timeline scrolling.

### Changed

- Flat, token-based redesign with one blue accent in light and dark themes.
- Work hours and meeting start/end use time pickers that follow the board's 24/12-hour setting.

### Removed

- The Background preference (Quiet, Glass, Full). The saved `time-material:background` value is cleared on load.

### Fixed

- Device timezone aliases such as Europe/Kiev resolve to the existing city instead of a duplicate row.
- City search handles responses already decompressed by the browser.
- City picker stays within the viewport and preserves focus after outside clicks.

## [0.1.0]

### Added

- Timezone day board with per-city working hours and meeting overlap calculations.
- Glass date picker, shareable boards, and calendar exports.
- Cloudflare Worker production and named stage preview delivery configuration.
