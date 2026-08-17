# Changelog

Notable changes per release.

## 0.9.1-beta - 2026-08-16

### Fixed

- Desktops with no taskbar were scored as protected. Worth up to 3 points.
- CLI `randomizer` was always `false`. Now measured.
- "Shuffles per site" could appear from the browser name alone, unmeasured.
- Redacted exports still carried identification text.
- Linkability compared changes against all readings, not the ones that could change.
- Canvas per-read probe used a broken FNV-1a.
- Letterbox detection rejected a valid 500px width.
- Cross-site card read "no response" while still measuring.
- WebGL disabled by a pref was reported as an extension.
- Timer resolution printed "0 ms" when nothing was measured.
- Eleven coherence checks were scored but never shown. Panel read 23/23; real tally 33/34.
- Category hashes described fewer rows than shipped beside them.
- Redaction passed every bare number, including CPU cores and timezone offset.
- `identify()` leaked two WebGL contexts per run.
- Headline tiles count categories; the text beside them counts readings.
- Test harness bound `127.0.0.1` only, breaking cross-site on `::1` machines.
- `/favicon.ico` returned 404.

### Changed

- Zeroed taskbar is credited per browser family, not universally.
- The two-read blind spot covers seventeen readings, not fifteen.
- `identify()` says "WebGL turned off, by a pref or an extension" rather than naming one.

### Removed

- `paHashClass`, never called.
- A duplicate category build, overwritten four categories later.

### Added

- Regression tests covering every fix above.
- `favicon.ico`.

## 0.9.0-beta

First public release.
