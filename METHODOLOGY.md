# Methodology 0.9.0-beta

The score is how much of what could identify you your browser hides. Recomputable by hand from the report the tool prints.

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

Absolute values do move. LibreWolf reads 43 as shipped, 50 under equal weights, 63 with tiers inverted and 67 with equal weights and no category rule: same readings, a 24-point range. Treat a few points as noise and a tier as real.

So the ordering is supported. A particular absolute score is not, being one weighting, one machine, one date.

There is also a ceiling. Six readings have no uniform value recorded for any browser family and no mask this code detects: element geometry, MathML render size, text metrics, font measurement, media codecs and device details. A browser that returns a real value for all of them cannot score above 62, whatever else it hides, and Tor and Mullvad sit exactly there. Grades A and B need a browser that refuses readings no shipping browser refuses, so nothing here reaches them.

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

One machine, Windows 11, 2026-07-29. Real top-level window, three runs, single origin, opt-ins off.

| Browser | Version | Score | Grade | Runs | Cross-site |
|---|---|---|---|---|---|
| Mullvad Browser | 140.13.0 | 71 | C | 71, 71, 71 | 71, nothing differed |
| Tor Browser | 140.13.0 | 71 | C | 71, 71, 71 | 71, nothing differed |
| LibreWolf | 152.0.6-1 | 43 | D | 43, 43, 43 | probe blocked, not measurable |
| Brave | 150.1.92.144 | 5 | F | 5, 5, 5 | 14, range 10 to 14 |
| Firefox | 153.0.1 | 5 | F | 5, 5, 5 | 5, nothing differed |
| Chrome | 150.0.7871.187 | 0 | F | 0, 0, 0 | 0, nothing differed |
| Edge | 150.0.4078.105 | 0 | F | 0, 0, 0 | 0, nothing differed |

- **Your result will differ.** The score depends on installed fonts, screen, GPU and window size.
- **Each Score figure is one visit to one site.** The Cross-site column is the separate measurement.
- **Brave's 5 is not a verdict on Brave.** It re-seeds per session and keys per site, so within one visit its values are stable and it reads as exposed. Its defence appears between visits.
- **Tor and Mullvad ran with the proxy forced to a direct connection and their bundled NoScript moved aside**, so both are resistFingerprinting engine tests and say nothing about the Tor network. NoScript intermittently blocks all script loading on plain http, which makes a benchmark unusable; it is not a fingerprinting defence and does not touch resistFingerprinting.
- **Fingerprint findability only.** Not tracker blocking, state partitioning, or the network layer.
- **Numbers drift as browsers ship.** The date and versions are part of the result.

## Limits

- Your IP and the TLS handshake are sent before any script and cannot be read here.
- Most of the uniform-value credits name a target in Firefox's `RFPTargets.inc`, and the readings Tor still shows have none. Four do not come from engine source: device memory, which Gecko never implemented, and three hashes (SVG text metrics, WebGL extensions, WebGL params) measured on one machine. Those three are the weakest credits here.
- Two readings, rendered sound and 3D rendered image, are classified on whether the render produced output, not on the output itself. The hash is in the raw view but is not what the score reads. An earlier version credited every Firefox-family browser as protected because its rendered sound was present, which is what a working audio pipeline reports in any browser; that credit is gone.
- The two-read check that detects a per-read randomizer reaches only the readings taken live. Twelve are pulled from rows the collectors already computed, so a second call returns them unchanged and they can never be credited for varying. Canvas is covered separately by drawing twice. This under-credits rather than over-credits.
- **A refused reading is credited as protection, and nothing distinguishes a browser withholding a value from this tool's own probe failing.** It fails in the flattering direction. It has happened: an extension scan that found nothing was scored as protection and every published number was three points too high. The mitigation is a test layer that breaks each probe deliberately and asserts a broken one never scores as shown.
- The category rule under-counts when readings in a category are independent. Dropping it moves Tor 71 to 80 and LibreWolf 43 to 59, without changing the order.
- For a per-session farbler the cross-site number needs the median across fresh launches, not the single-site one: runs sharing a launch share a farbling seed. The CLI launches a fresh browser per run but reports `crossSite: null`, so it gives the single-site median only. The cross-site figures here come from the page, driven one launch at a time.
- The cross-site second origin is `localhost` against `127.0.0.1`, which browsers treat more permissively than two registered domains, so a randomizer's cross-site figure is a floor.

## Checking

`__KIT.findability` holds every scored reading, its weight and its state. The catalog is `PRIORS`; the scoring is `findability` beside it. Everything else the tool reads sits in the raw view and never touches the score.
