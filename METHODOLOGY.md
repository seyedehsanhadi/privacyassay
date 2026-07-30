# Methodology 0.9.0-beta

The score is how much of what this tool checks your browser hides, weighted by how identifying each reading is. It is not an estimate of how rare you are: that needs a population of real fingerprints, and nothing here has one. Every number below is recomputable by hand from the report the tool prints.

## Three states

- **shown** — your real value
- **blended** — credited three ways and no others: the catalog records that browser family as reporting one value for every user, or the value differed between two reads in the same page, or the code recognised a specific mask it looks for (a blanked or noisy canvas, an unavailable render, a letterboxed window or screen, a zeroed taskbar, an empty voice list, a blocked `local()` font probe)
- **refused** — blank, blocked, or an error

Only shown counts against you. Rarity is never assumed: a value is not credited for looking unusual.

## Weights

Each reading is strong (3), medium (2) or weak (1). These are judgment, not measured rarity. Readings in a category share one cause, so only the heaviest counts and its weight becomes the category's.

| Category | Readings (weight) |
|---|---|
| GPU | canvas drawing (3), GPU name (2), 3D rendered image (2), GPU feature list (2), GPU limits (2) |
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

## Formula

```
category weight = weight of its heaviest reading
shown weight    = weight of the heaviest reading it still SHOWS (0 if none)
hidden          = category weight - shown weight

score = round( 100 * sum(hidden) / sum(category weight) )
grade = A 90+ | B 75-89 | C 60-74 | D 40-59 | F below 40
```

## How much the number means

The ordering is the result; the number is an indicator. Recomputed under five alternative weightings — all readings equal, tiers inverted, tiers squared, and the shipped and equal weightings again with the category rule dropped — the ordering never changed. A jackknife dropping each of the thirteen categories in turn did not change it either.

Absolute values do move. LibreWolf reads 33 as shipped, 40 under equal weights, 54 with tiers inverted and 63 with equal weights and no category rule: same readings, a 32-point range. Treat a few points as noise and a tier as real.

So the ordering is supported. A particular absolute score is not, being one weighting, one machine, one date.

There is also a ceiling. Seven readings have no uniform value recorded for any browser family, so a browser that returns a real value for one of them cannot be credited for it: element geometry, MathML render size, text metrics, font measurement, media codecs, rendered sound and device details. They sit in five categories worth 10 of the 21 non-optional points, so showing all seven caps the score at 52. Tor and Mullvad hide everything else and refuse only device details, which is exactly their 62. Grades A and B need a browser that refuses readings no shipping browser refuses, so nothing measured here reaches them.

## Cross-site

Over `http://` the catalog runs on two origins and compares. A reading counts as cross-site protection only if it was shown on one origin and differs on the other; a value already blended cannot be credited twice. Window and screen size are never diffed, because the second origin runs in a differently sized frame.

Brave gets a first-party window on the Run click, because a third-party frame inherits the top page's farbling seed. A blocked pop-up falls back to a button.

A cross-site number that cannot be obtained is not a zero. When the second site does not answer within fifteen seconds the result is reported as not measurable, and nothing is credited: a timeout does not distinguish a browser blocking the probe from the probe failing.

Storage scores only the persistent stores: cookies, localStorage, IndexedDB, CacheStorage, CookieStore, OPFS. HTTP-cache probes are reported but unscored.

## Cross-browser

Seven readings come from hardware or OS and survive switching browsers: GPU name, installed fonts, screen size, CPU cores, timezone, colour depth, platform. The report counts how many you expose and hashes them separately.

Device memory is excluded: only Chromium reports it, so including it would give one machine two signatures.

## Redaction

On by default. Values on screen and in saved files are masked; the shape of the result survives, so the arithmetic stays checkable. The score is identical either way.

Default-deny: only recognised-harmless values pass, meaning status words and plain numbers. Everything else is replaced, including every hash: a hash of a fingerprint is the fingerprint. With Redact on, the saved file's name carries the score rather than the fingerprint, and the fingerprint, stable hash and cross-browser identity fields are masked too.

## Reference measurements

One machine, Windows 11, 2026-07-30. Real top-level window, three runs, a fresh browser launch per run, single origin, opt-ins off.

| Browser | Version | Score | Grade | Runs | Cross-site |
|---|---|---|---|---|---|
| Mullvad Browser | 140.13.0 | 62 | C | 62, 62, 62 | 62, nothing differed |
| Tor Browser | 140.13.0 | 62 | C | 62, 62, 62 | 62, nothing differed |
| LibreWolf | 152.0.6-1 | 33 | F | 33, 33, 33 | 33 on the one run of three that completed |
| Firefox | 153.0.1 | 5 | F | 5, 5, 5 | 5 on the one run of three that completed |
| Brave | 150.1.92.144 | 0 | F | 0, 0, 0 | 14, five readings differed |
| Chrome | 150.0.7871.187 | 0 | F | 0, 0, 0 | 0, nothing differed |
| Edge | 150.0.4078.105 | 0 | F | 0, 0, 0 | 0, nothing differed |

- **Your result will differ.** The score depends on installed fonts, screen, GPU and window size.
- **Each Score figure is one visit to one site.** The Cross-site column is the separate measurement, and it is the only column where Brave differs from Chrome.
- **Brave's 0 is not a verdict on Brave.** It re-seeds per session and keys per site, so within one visit its values are stable and it reads as exposed. Its defence appears between visits, which is what its 14 measures.
- **The two-origin probe is unreliable on Gecko over loopback.** Firefox and LibreWolf each completed it on one of three runs; the other four runs timed out and are reported as not measurable rather than as zero.
- **Tor and Mullvad ran with the proxy forced to a direct connection and their bundled NoScript moved aside**, so both are resistFingerprinting engine tests and say nothing about the Tor network. NoScript intermittently blocks all script loading on plain http, which makes a benchmark unusable; it is not a fingerprinting defence and does not touch resistFingerprinting.
- **Fingerprint findability only.** Not tracker blocking, state partitioning, or the network layer.
- **Numbers drift as browsers ship.** The date and versions are part of the result.

## Limits

- Your IP and the TLS handshake are sent before any script and cannot be read here.
- The uniform-value credits are checked against Firefox's `RFPTargets.inc`. Most name a target there. Four do not: device memory, which Gecko never implemented, and three hashes (SVG text metrics, WebGL extensions, WebGL params) measured on one machine rather than read from source. Those three are the weakest credits here.
- Of the six readings Tor still shows, four have no target at all: element geometry, MathML render size, text metrics and font measurement. The other two do. `MediaCapabilities` and `AudioContext` both exist as targets, but they cover `mediaCapabilities.decodingInfo` and the audio graph rather than the `MediaSource.isTypeSupported` list and the rendered-output check this scores, so those two readings are scored as shown against a browser that does normalize a neighbouring API.
- WebGPU is read in full and scored in nothing. The adapter, its limits, its feature set and its texture-format matrix appear in the raw view only, so a browser that hides them gets no credit and a browser that hands them over pays nothing. `RFPTargets.inc` has three WebGPU targets, so this is a gap in the catalog, not in the engines.
- Two readings, rendered sound and 3D rendered image, are classified on whether the render produced output, not on the output itself. The hash is in the raw view but is not what the score reads. An earlier version credited every Firefox-family browser as protected because its rendered sound was present, which is what a working audio pipeline reports in any browser; that credit is gone.
- The two-read check that detects a per-read randomizer reaches only the readings taken live. Twelve are pulled from rows the collectors already computed, so a second call returns them unchanged and they can never be credited for varying. Canvas is covered separately by drawing twice. This under-credits rather than over-credits.
- **A refused reading is credited as protection, and nothing distinguishes a browser withholding a value from this tool's own probe failing.** It fails in the flattering direction. It has happened: an extension scan that found nothing was scored as protection and every published number was three points too high. The mitigation is a test layer that breaks each probe deliberately and asserts a broken one never scores as shown.
- The category rule under-counts when readings in a category are independent. Dropping it moves Tor 62 to 76 and LibreWolf 33 to 55, without changing the order.
- For a per-session farbler the single-site number says nothing: Brave reads 0 there and 14 across origins. Runs sharing a browser launch share a farbling seed, so every run above is a fresh launch. The CLI launches a fresh browser per run but reports `crossSite: null`, so it gives the single-site number only; the cross-site figures here come from the page.
- The cross-site second origin is `localhost` against `127.0.0.1`, which browsers treat more permissively than two registered domains, so a randomizer's cross-site figure is a floor.

## Checking

`__KIT.findability` holds every scored reading, its weight and its state. The catalog is `PRIORS`; the scoring is `findability` beside it. Everything else the tool reads sits in the raw view and never touches the score.
