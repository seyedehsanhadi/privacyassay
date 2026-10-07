# Changelog

Notable changes per release.

## 0.9.6 - 2026-10-07

- Read a client-hints answer that carries only brands, mobile and platform as withheld, which is how a browser restricts high-entropy hints. It was reported as an empty collector error and left the run incomplete. The page now names the withheld fields. A NotAllowedError rejection is refused; any other rejection, a malformed answer or a timeout stays unknown.
- Keep the reason for a failed reading. A SecurityError or NotAllowedError thrown by a probe is a refusal, other exceptions stay unknown with their name, and a repeat that fails now records both attempts instead of replacing them with a bare marker.
- Score WebGPU that is present but unavailable as unavailable, the same state a missing API or a null adapter gets, and keep the exception when requestAdapter rejects. Refused readings now say whether the API was unavailable, the request was denied or the hints were withheld, and the summary export counts each kind.
- Check each hidden reading through a second route: the same read in a fresh same-origin frame, and hit-testing text with elementFromPoint for the font and layout readings. If that route recovers a stable value, the reading counts as exposed and the result names it. Across two sites the second route must also match on both. Cross-site and single-site scores can drop for browsers or extensions whose protection does not cover new frames or hit-testing.
- Label uniformity credit as assumed from the family's documented values. Two sites on one machine cannot show that every user of the family reports the same value.

## 0.9.5 - 2026-10-07

- Credit uniformity on the cross-site score. A reading counts as hidden when a Tor, Mullvad or resistFingerprinting browser reports its family's fixed value on both origins. Randomizers keep their credit for readings that differ between the origins. A browser that merely shows the same value on both earns nothing, and nothing is credited on a single-site run.
- Cross-site scores of Tor Browser, Mullvad Browser and LibreWolf are not comparable with 0.9.4.

## 0.9.4 - 2026-10-07

- Treat a WebGL readback refused with NotSupportedError, as Mullvad Browser and Tor Browser do, as a refused reading. It was classed unknown, which made every run in those browsers incomplete.
- Send the second-site reply with both the exact target origin and a wildcard fallback. Browsers that isolate first parties silently drop a message with an exact cross-origin target, so the cross-site comparison never completed in Mullvad and Tor. The receiver still checks origin, window, token and version.
- Benchmark harness: connect Tor Browser automatically and let it reach the loopback server.

## 0.9.3 - 2026-10-06

- Compare canvas across sites on decoded pixels instead of encoded PNG bytes. Firefox can return different PNG bytes for identical pixels, which earned cross-site canvas credit that nothing supported. Cross-site canvas results are not comparable with 0.9.2; lower scores remove false credit and are not browser regressions.
- Count a reading as compared across sites only when both origins returned a usable comparison value. A missing, empty, non-finite, error or timeout value now leaves the reading unknown instead of completing the comparison.
- Keep a cookie write that silently fails to read back unknown. It becomes a measured refusal only when the companion's first-party control for the same cookie API succeeds and the cross-site read completes with no token.
- Stop requesting DRM key systems in the default run, which raised a native DRM prompt on Android Firefox. A new DRM opt-in runs them and keeps available, rejected, error and timeout distinct; late answers cannot change a finished result, and missing or failed key systems earn the media diagnostic no credit.

## 0.9.2 - 2026-09-05

- Complete supercookie comparisons when third-party storage is explicitly refused, with a first-party Cookie Store control for ambiguous write errors.
- Wait for storage writes before readback and keep the report and JSON exports synchronized after rescoring.
- Keep failed storage reads unknown, validate cache controls, and explain script-blocked pages.
- Stop identifying Goanna from disabled worker and push APIs, which also occur in hardened Firefox builds.
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
