# Methodology 0.9.7

Updated 2026-10-10. This version measures observed fingerprint exposure. Its scores are not comparable with 0.9.1-beta captures. 0.9.3 changed the canvas comparison value from encoded PNG bytes to decoded pixels, so its cross-site canvas results are not comparable with 0.9.2 captures. A lower 0.9.3 score on the same browser removes credit 0.9.2 gave in error; it is not a browser regression. 0.9.4 scores a WebGL readback that the browser refuses with NotSupportedError (Mullvad, Tor) as a refused reading instead of unknown, so those browsers can now complete a run and are not comparable with 0.9.3. 0.9.5 adds uniformity credit to the cross-site score, so cross-site scores of Tor Browser, Mullvad Browser and LibreWolf are not comparable with 0.9.4. 0.9.6 counts a hidden reading as exposed when a fresh same-origin frame or hit-testing recovers it, so scores of browsers or extensions that miss those routes are not comparable with 0.9.5. 0.9.7 retains any alternate-route exposure even if another read fails, rejects one-sided exposure as proof of per-site variation, and adds WebGPU features. Scores are not directly comparable with 0.9.6.

## Outcomes

- **shown**: the probe returned an observable value.
- **blended**: the canvas experiment observed a mask, repeated measurements returned different values, or the cross-site score found the standard value of a uniformizing family on both origins (mask: uniform).
- **refused**: the API is unavailable, access was explicitly denied (SecurityError, NotAllowedError, NotSupportedError, a null adapter), the browser withheld every requested high-entropy client hint, or a completed optional test observed no exposed value. Each refused row records which of these it was.
- **unknown**: missing, invalid, failed, timed-out or incomplete measurement. Unknown readings receive no protection credit.

A hidden, failed or assumed-uniform reading is checked through a second route before it earns credit: the same read in a fresh same-origin frame (WebGPU through a real adapter request there), or, for element geometry and MathML size, hit-testing with `document.elementFromPoint`. Any readable second-route value remains evidence of exposure, including a value seen before a failed repeat. A stable alternate value prevents credit for noise on the main path. Variation earns credit only when the main path is masked, refused or varied and the alternate path also varies on valid repeated reads. Missing alternate reads cannot prove variation. An assumed-uniform reading keeps its credit only when the frame reports the same standard value. Cross-site variation requires comparable, repeat-stable alternate values on both origins. A reading refused or masked on one read or one site and readable on the other is shown.

Both origins repeat the scored rendering and capability reads. A result distinguishes per-read variation from values that remain stable within each site but differ between the sites (`variationKind`). These finite samples do not establish long-term stability. A randomizer is credited for measured variation, with cross-site differences recorded separately. A uniformizer is credited when a reading carries the fixed value its family standardizes, identically on both origins. That other users of the family report the same value is assumed from the family's documentation, not measured: two origins on one machine cannot establish it. Such rows are marked as assumed, and the cross-site result also reports its score without them (`measuredScore`). A plain browser that shows the same value on both earns neither.

Uniformity credit applies to the cross-site score only, never to a single-site run, and only to Tor Browser, Mullvad Browser (family tor-build) and Firefox with resistFingerprinting, LibreWolf included (family firefox-rfp). Both families: CPU cores 4 or 8, timezone Atlantic/Reykjavik or UTC, colour depth 24, display scaling 2, touch points 10 or 5, sample rate 44100, language en-US, taskbar size masked. Tor builds only: window size on the letterbox grid, and screen size equal to that window. Installed fonts, text metrics and font measurement are not credited, because the tool cannot verify the bundled set. Browser names and values outside these sets earn nothing. Browser identification remains informational.

## Weights

The catalog has 33 readings in 13 categories. Strong = 3, medium = 2, weak = 1. These are judgment-based weights, not measured entropy or tracking probabilities.

| Category | Readings (weight) |
|---|---|
| GPU | canvas drawing (3), GPU name (2), 3D rendered image (2), GPU feature list (2), GPU limits (2), WebGPU adapter (2), WebGPU limits (2), WebGPU features (2) |
| Window | window size (3) |
| Fonts | installed fonts (3), text metrics (2), font measurement (2) |
| Network | WebRTC IP leak (3) |
| Extensions | extensions enumerable (3) |
| Storage | storage carried across sites (3) |
| Layout | element geometry (subpixel) (2), SVG text metrics (2), MathML render size (2) |
| Display | taskbar size (2), screen size (2), display scaling (2), colour depth (1) |
| Media | installed voices (2), media codecs (2) |
| Audio | rendered sound (2), sound sample rate (1) |
| OS | device details (client hints) (2), touch points (1), platform (1) |
| Hardware | CPU cores (1), device memory (1) |
| Locale | language (1), timezone (1) |

Thirteen categories summing to 30. WebRTC and storage are opt-in; extension detection is positive-only, so nothing detected is left out rather than credited. A browser with none of the three is scored on the remaining ten summing to 21.

## Calculation and completeness

A category is worth its heaviest reading. Within that category, only blended and refused readings contribute to hidden weight. Unknown readings stay in the denominator.

```
category earned = category weight × hidden reading weight / total reading weight
score = round(100 × sum(category earned) / sum(category weight))
upperBound = round(100 × sum(category earned + unknown share + incomplete comparison share) / sum(category weight))
coverage = round(100 × known readings / requested readings)
```

Grades for complete measurements: A 90+, B 75–89, C 60–74, D 40–59, F below 40. **I means incomplete**: no A–F grade is assigned. In an incomplete result, score is a lower bound and upperBound includes weight from unknown readings and incomplete comparisons. An empty or all-error run has score 0, upperBound 100, coverage 0 and grade I.

The score summarizes the experiment; it does not predict whether a tracker can recognize someone. Multiple different fingerprints can be linked by remaining attributes. Observed variation does not prove resistance to averaging or every tracking method.

## Repeated measurements

Canvas, WebGL, audio rendering, fonts and layout are measured again with the same stimuli. Scalar properties are read again within the same session. Ordinary font lookup can change during scanning; a differing font set stays exposed with an incomplete comparison, without per-read protection credit. This also undercredits genuine per-read font randomizers. Stable per-site font changes remain eligible when each site's repeats agree. After a failed repeat, any established exposure remains shown and the comparison is incomplete. A reading with no established outcome is unknown. Neither earns protection credit. Audio hashes use the rendered buffer. GPU identity reads the renderer, not only its vendor.

Some capability inventories are sampled once and remain informational. The tool is not a population-based uniqueness estimate.

## Cross-site comparison

On the hosted pair, privacyassay.com opens privacyassay.github.io as a top-level window. Every browser uses the same context. Popup blocking, a missing companion, a mismatched build or a severed opener is reported as unmeasured; a third-party frame is not substituted for a first-party comparison. Explicitly configured local IP companions reply to their configured home; an unconfigured local page does not use the public home as its reply target.

The companion must answer within forty-five seconds. The companion answers only a request from the expected origin and window, and replies over the private message channel that request carried; the reply is then checked against the run token, catalog version and observation shape. Failed or absent measurements cannot count as changes. A reading shown on both origins counts as compared only when both returned a usable comparison value. A missing, empty, non-finite, error or timeout value leaves the comparison incomplete while preserving established exposure. Different values from different read routes cannot establish origin-specific variation. Equal recovered values can establish a comparable exposure. A reading refused on both stays refused, and one refused or masked on one origin but readable on the other counts as shown. Zero is a usable value.

Canvas is compared on the decoded pixels of the drawing (`getImageData`), not on the PNG that `toDataURL` encodes. A browser can return different PNG bytes for identical pixels, and that difference says nothing about what a tracker can read. Metadata-only variation therefore earns no canvas credit. Window and screen dimensions are not compared because the windows have different dimensions. The result states how many comparable readings changed, without claiming the visitor is recognized or anonymous.

The CLI launches a fresh browser per run and serves 127.0.0.1 and localhost. This loopback pair is not equivalent to independent public domains. Compare runs with the same browser/OS versions, settings, opt-ins and context. Different configurations cannot be compared as equivalent.

For multiple CLI runs, all report fields describe the run with the median score. The summary states how many runs were incomplete; any incomplete run fails `--min-score`.

## Optional tests

WebRTC and cross-site storage are off by default. WebRTC opt-in contacts a public STUN server. It records completion, timeout or failure, and reports observed IP candidates. This is not a VPN-bypass certification.

Storage plants a token in a companion frame and reads it back with that origin top-level. Only confirmed writes and successful reads establish isolation or carryover. Missing readbacks and failed controls remain unknown. Persistent stores affect the score; HTTP-cache probes remain informational and need the local server. This is not a complete common-tracker-under-two-first-parties partitioning suite.

Storage readback waits for the frame's write result. Explicit access denials are recorded as write refusals. A cookie write that silently does not read back is not a refusal on its own, because a cookie path broken everywhere looks the same. It stays unknown unless the companion's own first-party write and readback of the same cookie API succeeds, the first-party read of the third-party token completes, and that read finds no token. Only then is it a measured refusal. A generic Cookie Store write error alone remains unknown: it counts as a context-specific refusal only when a successful top-level read finds no token and the same write/read control succeeds there afterward. That control runs after the carryover read so it cannot create a false carryover result. Both contexts then clear the test's storage. Cache probes require a working server counter before reporting a measured cache result; they never affect the persistent-storage score.

DRM key systems (Widevine, PlayReady, FairPlay) are requested only when the DRM opt-in is on, because the browser may show a permission or component-install prompt. The default run checks decode capabilities only and records the key systems as not run. When opted in, each key system ends as available, rejected (unsupported or denied, which the API does not distinguish), error or timeout; a late answer cannot change a finished result. Only DRM rows feed the secondary media diagnostic, never the findability score, and a not-run, rejected, failed or timed-out key system earns that diagnostic no credit.

A completed WebGPU request returning no adapter, an API made unavailable, or a request denied with SecurityError or NotAllowedError is refused, unless a fresh frame recovers an adapter. Any other failed request, or an adapter whose limits cannot be read, remains unknown for the affected reading.

Extension resource enumeration is not measured under the page's CSP. Positive page-visible extension evidence can be reported; no detected extension is not credited as protection.

## Exports and privacy

Exposure and comparison completeness are separate. A known exposure remains shown when its repeat or second-site comparison fails, with `comparisonIncomplete` set. This earns no protection credit and forces grade I. `coverage` counts established exposure outcomes; `comparisonCoverage` also excludes incomplete comparisons. `upperBound` includes their unresolved potential weight. Unknown, exposed and held counts remain disjoint.

Redaction is on by default and affects display/export values, not scoring. It masks raw numeric readings and detected browser/extension identity; status words, scores and counts remain visible. Full exports use privacyassay-full/1.1. Summary schema privacyassay-summary/1.1 includes complete, coverage, upperBound, grade I and unknown counts. RecognizedOnSecondSite is not inferred; the corresponding legacy field is null. CLI --min-score rejects incomplete runs even if their lower bound exceeds the threshold. Historical captures retain their original methodology version.

A local copy uploads no fingerprint. The hosted companion receives normal page requests and sends measured values only between windows in the visitor's browser. The WebRTC opt-in contacts the configured STUN service.

## Research coverage

WebGPU features are measured separately from limits and adapter identity. [Mozilla bug 2064438](https://bugzilla.mozilla.org/show_bug.cgi?id=2064438) reports hardware features surviving Firefox RFP limit normalization; it does not establish a Tor leak, since Tor disables WebGPU. The reading measures observable capability exposure, without estimating population uniqueness.

[WGPULens](https://arxiv.org/abs/2606.26412) studies compilation state across controlled boundaries. The existing pipeline timing is an unscored diagnostic and does not reproduce that experiment. [FROST](https://www.rolandczerny.com/publications/2026-frost/) requires SSD-contention controls; the OPFS storage token is not such a test. [WebAssembly fingerprinting research](https://arxiv.org/abs/2506.00719) uses behavioral workloads; the engine feature bitmap does not validate resistance to them. These attacks receive no protection credit from this assay.

## Scope

The AI section checks web API availability; it cannot read Firefox AI Controls or certify browser-assistant data handling. Network-layer fingerprinting, browser telemetry, tracker blocking, bounce tracking, behavioral tracking and all-browser compatibility are outside this score. Unsupported, unknown and not tested are distinct outcomes.

Historical 0.9.1-beta captures in bench/captures are retained for reproducibility, not current browser recommendations. Their calibration validates arithmetic over recorded states. New measurements must include catalog version, browser/OS version, configuration, context and completion. The current table reports headless measurements on one machine, not a general browser ranking.
