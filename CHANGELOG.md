# Changelog

Notable changes per release.

## 0.9.2 - 2026-09-05

- Separate unknown measurements from protection; expose coverage and score bounds.
- Re-run fingerprint stimuli; correct GPU identity and font classifications.
- Bind companion replies to the window, run token and methodology version.
- Use the same top-level comparison for all browsers and report unmeasured contexts.
- Bound asynchronous probes and avoid late AI/WebGPU result mutation.
- Add summary schema 1.1 and fail CLI thresholds on incomplete runs.
- Preserve installed browser extensions and scope harness cleanup to launched processes.
- Add a public HTML methodology page and update indexing documentation.
- Retain the original browser charts and screenshot with historical methodology labels; refresh the social card.
- Correct fault-injection coverage checks on runners without a usable WebGPU adapter.
- Read cross-site storage once so a partial companion reply cannot win a race.
- Report unmeasured storage mechanisms and singular incomplete verdicts accurately.
- Treat a missing OPFS file and explicitly disabled GPU or voice APIs as completed protection outcomes.

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
