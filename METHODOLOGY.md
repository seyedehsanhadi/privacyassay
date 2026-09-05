# Methodology 0.9.2

Updated 2026-09-05. This version measures observed fingerprint exposure. Its scores are not comparable with 0.9.1-beta captures.

## Outcomes

- **shown**: the probe returned an observable value.
- **blended**: the canvas experiment observed a mask, or repeated measurements returned different values.
- **refused**: an API is unsupported, access was explicitly denied, or a completed optional test observed no exposed value.
- **unknown**: missing, invalid, failed, timed-out or incomplete measurement. Unknown readings receive no protection credit.

Browser names, common values, a letterbox-shaped window, an empty voice list, and a failed local-font load do not establish uniformity across users. They do not earn masking credit. Browser identification remains informational.

## Weights

The catalog has 32 readings in 13 categories. Strong = 3, medium = 2, weak = 1. These are judgment-based weights, not measured entropy or tracking probabilities.

| Category | Readings (weight) |
|---|---|
| GPU | canvas drawing (3), GPU name (2), 3D rendered image (2), GPU feature list (2), GPU limits (2), WebGPU adapter (2), WebGPU limits (2) |
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
upperBound = round(100 × sum(category earned + unknown share) / sum(category weight))
coverage = round(100 × known readings / requested readings)
```

Grades for complete measurements: A 90+, B 75–89, C 60–74, D 40–59, F below 40. **I means incomplete**: no A–F grade is assigned. In an incomplete result, score is a lower bound and upperBound includes the unknown weight. An empty or all-error run has score 0, upperBound 100, coverage 0 and grade I.

The score summarizes the experiment; it does not predict whether a tracker can recognize someone. Multiple different fingerprints can be linked by remaining attributes. Observed variation does not prove resistance to averaging or every tracking method.

## Repeated measurements

Canvas, WebGL, audio rendering, fonts and layout are measured again with the same stimuli. Scalar properties are read again within the same session. A repeat failure marks that reading unknown rather than being credited as variation. Audio hashes use the rendered buffer. GPU identity reads the renderer, not only its vendor.

Some capability inventories are sampled once and remain informational. The tool is not a population-based uniqueness estimate.

## Cross-site comparison

On the hosted pair, privacyassay.com opens privacyassay.github.io as a top-level window. Every browser uses the same context. Popup blocking, a missing companion, a mismatched build or a severed opener is reported as unmeasured; a third-party frame is not substituted for a first-party comparison.

The companion must answer within forty-five seconds. Replies are checked against the origin, source window, run token, catalog version and observation shape. Failed or absent measurements cannot count as changes. Window and screen dimensions are not compared because the windows have different dimensions. The result states how many comparable readings changed, without claiming the visitor is recognized or anonymous.

The CLI launches a fresh browser per run and serves 127.0.0.1 and localhost. This loopback pair is not equivalent to independent public domains. Compare runs with the same browser/OS versions, settings, opt-ins and context. Different configurations cannot be compared as equivalent.

For multiple CLI runs, all report fields describe the run with the median score. The summary states how many runs were incomplete; any incomplete run fails `--min-score`.

## Optional tests

WebRTC and cross-site storage are off by default. WebRTC opt-in contacts a public STUN server. It records completion, timeout or failure, and reports observed IP candidates. This is not a VPN-bypass certification.

Storage plants a token in a companion frame and reads it back with that origin top-level. Only confirmed writes and successful reads establish isolation or carryover. Missing readbacks and failed controls remain unknown. Persistent stores affect the score; HTTP-cache probes remain informational and need the local server. This is not a complete common-tracker-under-two-first-parties partitioning suite.

Extension resource enumeration is not measured under the page's CSP. Positive page-visible extension evidence can be reported; no detected extension is not credited as protection.

## Exports and privacy

Redaction is on by default and affects display/export values, not scoring. Full exports use privacyassay-full/1.1. Summary schema privacyassay-summary/1.1 includes complete, coverage, upperBound, grade I and unknown counts. RecognizedOnSecondSite is not inferred; the corresponding legacy field is null. CLI --min-score rejects incomplete runs even if their lower bound exceeds the threshold. Historical captures retain their original methodology version.

A local copy uploads no fingerprint. The hosted companion receives normal page requests and sends measured values only between windows in the visitor's browser. The WebRTC opt-in contacts the configured STUN service.

## Scope

The AI section checks web API availability; it cannot read Firefox AI Controls or certify browser-assistant data handling. Network-layer fingerprinting, browser telemetry, tracker blocking, bounce tracking, behavioral tracking and all-browser compatibility are outside this score. Unsupported, unknown and not tested are distinct outcomes.

Historical 0.9.1-beta captures in bench/captures are retained for reproducibility, not current browser recommendations. Their calibration validates arithmetic over recorded states. New measurements must include catalog version, browser/OS version, configuration, context and completion. No new seven-browser ranking is claimed by this release.
