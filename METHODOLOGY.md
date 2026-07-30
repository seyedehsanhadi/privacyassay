# Methodology 0.9.0-beta

Beta: the scoring model may still change. Every number here is recomputable by hand from the report the tool prints, and every claim about a browser cites what it was checked against.

The score is how much of what could identify you your browser hides.

## Three states

Each reading is **shown** (your real value), **blended** (a value every user of that browser shares, or one that changes on every read), or **refused** (blank, blocked, or an error). Only shown counts against you.

## Weights

Each reading is **strong (3)**, **medium (2)** or **weak (1)** by how much it narrows you down. This is judgment, not measured rarity. Readings in a category share one cause, so only the heaviest counts and its weight becomes the category's.

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

Thirteen categories summing to 30. Three count only when they fire: WebRTC and the supercookie test are opt-in, and extension detection is positive-only, so nothing detected is left out rather than credited as protection. A browser with none of the three is scored on the remaining ten summing to 21.

## The formula

```
category weight = weight of its heaviest reading
shown weight    = weight of the heaviest reading it still SHOWS (0 if none)
hidden          = category weight - shown weight

score = round( 100 * sum(hidden) / sum(category weight) )
grade = A 90+ | B 75-89 | C 60-74 | D 40-59 | F below 40
```

## How much to trust the number

**The ordering is the result. The number is an indicator.**

The weights are judgment, so the model was tested against its own choices. The table below was recomputed from the same readings under five alternative weightings: all readings equal, tiers inverted (weak 3, strong 1), tiers squared, and each with and without the category rule. **The ordering never changed, including under fully inverted tiers.** A jackknife dropping each of the thirteen categories in turn did not change it either.

The absolute values do move. LibreWolf reads 43 as shipped, 50 equal-weighted, 63 inverted, 67 without the category rule: same data, 24-point range. Tor moves 71 to 81.

So `Tor > LibreWolf > Brave > stock Chromium` is supported. `Tor scores exactly 71` is a statement about one weighting, one machine, one date. Treat a few points as noise and a tier as real.

## Cross-site

Over `http://` the catalog runs on two origins and compares. A reading counts as cross-site protection only if it was shown on one origin and differs on the other; a value already blended cannot be credited twice. Window and screen size are never diffed, because the second origin runs in a differently sized frame.

Most browsers are read in a hidden same-page frame. Brave gets a first-party window opened on the Run click, because a third-party frame inherits the top page's farbling seed; a blocked pop-up falls back to a button.

A cross-site number that cannot be obtained is not a zero. LibreWolf blocks the second-site probe outright, which for a per-site reshuffler is protection working.

The supercookie surface scores only the persistent stores: cookies, localStorage, IndexedDB, CacheStorage, CookieStore and OPFS. The HTTP-cache probes are reported but unscored, because browsers partition the cache per site and the load-timing read is too noisy.

## Cross-browser

Seven readings come from the hardware or OS and survive switching browsers: GPU name, installed fonts, screen size, CPU cores, timezone, colour depth and platform. The report counts how many you expose and hashes them into a separate signature.

Device memory is excluded on purpose. Only Chromium reports it, so including it would give the same machine two different signatures and understate the linkage this section exists to show.

## Redaction

On by default. Values on screen and in any saved file are masked; what survives is the shape of the result, so someone else can recompute the arithmetic without learning anything about your machine. The score is identical either way.

The masking is default-deny: it keeps only what it recognises as harmless (status words, plain numbers, the report's own short hashes) and replaces everything else. An earlier version listed patterns to hide and leaked the user agent, GPU model and timezone into files people were invited to post. A list of things to hide can never be finished; a list of things to keep can.

## Reference measurements

One machine, Windows 11, 2026-07-29. Same path for every row: real top-level window, three runs, single origin, opt-ins off.

| Browser | Version | Score | Grade | Runs | Cross-site |
|---|---|---|---|---|---|
| Mullvad Browser | 140.13.0 | 71 | C | 71, 71, 71 | 71, nothing differed |
| Tor Browser | 140.13.0 | 71 | C | 71, 71, 71 | 71, nothing differed |
| LibreWolf | 152.0.6-1 | 43 | D | 43, 43, 43 | probe blocked, not measurable |
| Brave | 150.1.92.144 | 5 | F | 5, 5, 5 | 14, range 10 to 14 |
| Firefox | 153.0.1 | 5 | F | 5, 5, 5 | 5, nothing differed |
| Chrome | 150.0.7871.187 | 0 | F | 0, 0, 0 | 0, nothing differed |
| Edge | 150.0.4078.105 | 0 | F | 0, 0, 0 | 0, nothing differed |

**Your result will differ.** The score depends on installed fonts, screen, GPU and window size.

**Each Score column figure is one visit to one site.** Both opt-ins were off and the runs were single-origin, so nothing in that column describes cross-site linkability; the Cross-site column is the separate measurement.

**Brave's 5 is not a verdict on Brave.** It re-seeds per session and keys per site, so within one visit its values are stable and it correctly reads as exposed. Its defence lives between visits, where it gained nine points. Only Brave gained anything: the uniformity browsers show no cross-origin difference because uniformity is the point.

**Tor and Mullvad ran with the proxy forced to a direct connection**, so both are resistFingerprinting engine tests and say nothing about the Tor network. Tor also needed its bundled NoScript moved aside, which intermittently blocks all script loading on a plain http origin.

**Fingerprint findability only.** No tracker blocking, no state partitioning, no network layer. privacytests.org covers that ground across roughly 156 checks and ranks these browsers differently, Brave near the top.

**Numbers drift as browsers ship.** The date and versions are part of the result.

## Limits

Your IP and the TLS handshake are sent before any script and cannot be read here.

Blended is credited only for values a browser is documented to report for every user, checked against engine source rather than a live crowd. Every blended credit in the table above maps to a named target in Firefox's `RFPTargets.inc`; every shown reading maps to none.

**A refused reading is credited as protection, and nothing distinguishes a browser withholding a value from this tool's own probe failing.** It fails in the flattering direction. It has happened: an extension scan that found nothing was scored as protection and every published number was three points too high until the arithmetic was re-derived. The mitigation is a test layer that breaks each probe deliberately and asserts a broken one never scores as shown, plus a check that every reading the scorer looks up resolves to a live row. Both run on every change.

For a per-session farbler the **cross-site** number needs the median, not the single-site one. Brave read 5 on every single-site run but 10, 14 and 14 across three fresh launches. Runs sharing one browser launch share a farbling seed and agree for the wrong reason. The CLI launches a fresh browser per run, which is what makes its median meaningful.

## Why the exposed readings are scored as exposed

Tor and Mullvad hide everything above except five readings: font measurement, text metrics, element geometry, MathML render size and media codecs. Two questions decide whether scoring them is fair, and both have answers.

**Does resistFingerprinting normalize them?** No. Firefox enumerates what it normalizes in `toolkit/components/resistfingerprinting/RFPTargets.inc`, 81 targets. Every reading credited as blended above has one: `CanvasRandomization`, `WebGLVendorConstant`, `ScreenRect`, `NavigatorHWConcurrency`, `JSDateTimeUTC`, `AudioSampleRate`, `FontVisibilityBaseSystem` and so on. None of the five has one. Font **visibility** has three targets; font **metrics** have none, so the engine restricts which fonts a site may see and does not normalize the dimensions of the ones that remain. That split is why Fonts scores 1 of 3 rather than 0 or 3.

**Are they actually identifying?** Yes, and measurably. Fifield and Egelman surveyed over 1,000 browsers and found font metrics alone produced 444 distinct fingerprints, 7.599 bits of entropy, uniquely identifying 34% of participants with a further 8% in pairs; 43 code points accounted for all the variation they saw. Element geometry has been measured separately at about 3.5 bits. Both exceed timezone or screen resolution, which this catalog also scores.

One correction to that, in our own disfavour: the published 7.599 bits covers an exhaustive sweep of 43 code points across many fonts. This tool samples a fraction of it, one string in one font plus the TextMetrics extras, so it detects the surface without extracting the full entropy. Weighting font measurement medium rather than strong is deliberate for that reason, not an oversight.

Tor Project does not claim otherwise. Its documentation says it is "practically impossible to make all Tor Browser users identical", that the goal is reducing distinguishable buckets, and names fonts specifically as able to infer hardware and operating system. A score of 100 here would contradict the vendor.

## Where the model is knowingly imprecise

**The category rule under-counts when readings are independent.** Only a category's heaviest reading counts, on the theory that readings in a category share one cause. Fonts is the clearest counter-example: the Fifield and Egelman technique works precisely because metrics reveal what a font list does not, so the two are less correlated than the rule assumes. Dropping the rule moves Tor to 80 and LibreWolf to 59 without changing the order. The rule is kept because it stops a category with many probes dominating one with few, and because the ordering does not depend on it.

**Crediting `refused` is a deliberate asymmetry.** A blank reading counts as protection, so a browser that successfully blocks something is rewarded and a browser that never implemented it is rewarded identically. Scoring only what is positively observed would avoid that, at the cost of penalising a browser for blocking successfully, which is the wrong incentive for a privacy tool. The asymmetry is kept; the failure mode it creates is stated under Limits.

**The cross-site figure for a randomizer is a floor, not an estimate.** The second origin is `localhost` against `127.0.0.1`. Brave's canvas did not change across that pair once, despite Brave re-seeding canvas farbling per site, so the pair is too permissive to provoke the defence. A companion on a separate registered domain would raise Brave's 14; `DEPLOY.md` documents the setup.

## Sources

- Fifield, D. and Egelman, S. *Fingerprinting Web Users Through Font Metrics.* Financial Cryptography and Data Security 2015, pp. 107-124.
- Firefox `RFPTargets.inc`, the authoritative list of what resistFingerprinting normalizes.
- Tor Project, *Fingerprinting protections*, support.torproject.org.
- Mozilla bug 1507879, investigating `getClientRects` for fingerprinting.

## Checking

`__KIT.findability` holds every scored reading, its weight and its state. The catalog is `PRIORS` and the scoring is `findability` beside it in source. Everything else the tool reads sits in the raw view and never touches the score.
