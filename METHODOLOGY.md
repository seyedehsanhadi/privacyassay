# Methodology 0.9.0-beta

The score is how much of what this tool checks your browser hides, weighted by how identifying each reading is. It is not an estimate of how rare you are: that needs a population of real fingerprints, and nothing here has one. Every number in the formula below is recomputable by hand from the report the tool prints. The measurements are not: those are observations, and they carry their date and versions.

## Three states

- **shown**: your real value
- **blended**: credited three ways and no others: the catalog records that browser family as reporting one value for every user, or the value differed between two reads in the same page, or the code recognised a specific mask it looks for (a blanked or noisy canvas, an unavailable render, a letterboxed window or screen, a zeroed taskbar, an empty voice list, a blocked `local()` font probe)
- **refused**: blank, blocked, or an error

Only shown counts against you. Rarity is never assumed: a value is not credited for looking unusual.

## Weights

Each reading is strong (3), medium (2) or weak (1). A category is worth its heaviest reading, so a category this tool probes seven times cannot outweigh one it probes once. Inside a category you earn the share of it you hide: hide half the weight in the GPU category and you get half of what the GPU category is worth.

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

## Formula

```
category weight = weight of its heaviest reading
category hidden = category weight x (weight you hide in it / all the weight in it)

score = round( 100 * sum(category hidden) / sum(category weight) )
grade = A 90+ | B 75-89 | C 60-74 | D 40-59 | F below 40
```

Worked example, the GPU category. Seven readings: canvas drawing (3), and six medium ones (2 each), so 15 points of weight in a category worth 3. A browser that hides canvas and the two WebGL hashes hides 7 of those 15, so it earns 3 x 7/15 = 1.4 of the 3 the category is worth.

An earlier version paid only for the heaviest reading a category still hid. That made hiding anything lighter worth nothing: seven of the twenty-nine readings could not move any score at all, and a browser hiding four of five GPU readings scored the same as one hiding none.

## How much the number means

The figures in this section are recomputed by `bench/calibration.mjs` and `bench/sensitivity.mjs` from the captures in `bench/captures/`. No browser needed.

The ordering is the result; the number is an indicator. Recomputed under six alternative weightings (all readings equal, tiers inverted, tiers squared, the previous heaviest-reading-only rule, and two schemes with the category weighting dropped entirely) the ordering never changed. A jackknife dropping each of the thirteen categories in turn changed it once.

Every perturbation that moves the ordering moves the same pair. Dropping the OS category, or replacing the weights with published per-attribute entropy estimates, puts Brave above Firefox; the two sit at 5 and 9 here and their difference is not something this model resolves. Every other pair held under all of it.

The weights themselves were checked against those published estimates and left alone. Ranked against them the three tiers correlate at 0.76, and rebuilding the tiers from entropy bands made the agreement worse, not better, because it inflates the categories with several light readings. The aggregation was what needed fixing.

The result of fixing it: scored against how many bits of published entropy each browser hides, the model now agrees to within four points on every browser and exactly on four of the seven. Before the change it was out by an average of seven and never in the browser's favour.

Absolute values still move. LibreWolf reads 48 as shipped, 58 under equal weights, 67 with tiers inverted and 42 with tiers squared: same readings, a 25-point range. Treat a few points as noise and a tier as real.

So the ordering is supported. A particular absolute score is not, being one weighting, one machine, one date.

There is also a ceiling. Seven readings have no uniform value recorded for any browser family, so a browser that returns a real value for one of them cannot be credited for it: element geometry, MathML render size, text metrics, font measurement, media codecs, rendered sound and device details. They sit in five categories, so showing all seven caps the score at 70. Tor and Mullvad hide everything else and refuse only device details, which puts them at 74. Grade A needs a browser that refuses readings no shipping browser refuses, and nothing here reaches it. B is reached only with an opt-in on: Tor and Mullvad read 78 with the WebRTC test enabled, because it adds a category they refuse outright.

## Cross-site

Over `http://` the catalog runs on two origins and compares. A reading counts as cross-site protection only if it was shown on one origin and differs on the other; a value already blended cannot be credited twice. Window and screen size are never diffed, because the second origin runs in a differently sized frame.

Brave gets a first-party window on the Run click, because a third-party frame inherits the top page's farbling seed. A blocked pop-up falls back to a button.

A cross-site number that cannot be obtained is not a zero. When the second site does not answer within forty-five seconds the result is reported as not measurable, and nothing is credited: a timeout does not distinguish a browser blocking the probe from the probe failing.

Storage scores only the persistent stores: cookies, localStorage, IndexedDB, CacheStorage, CookieStore, OPFS. HTTP-cache probes are reported but unscored. A store that neither answers nor fails within eight seconds is left out of the total rather than counted either way.

## Cross-browser

Seven readings come from hardware or OS and survive switching browsers: GPU name, installed fonts, screen size, CPU cores, timezone, colour depth, platform. The report counts how many you expose and hashes them separately.

Device memory is excluded: only Chromium reports it, so including it would give one machine two signatures.

## Redaction

On by default. Values on screen and in saved files are masked; the shape of the result survives, so the arithmetic stays checkable. The score is identical either way.

Default-deny: only recognised-harmless values pass, meaning status words and plain numbers. Everything else is replaced, including every hash: a hash of a fingerprint is the fingerprint. With Redact on, the saved file's name carries the score rather than the fingerprint, and the fingerprint, stable hash and cross-browser identity fields are masked too.

## Reference measurements

One machine, Windows 11, 2026-07-31. Real top-level window, three runs, a fresh browser launch per run, single origin, opt-ins off. Re-measured twice on separate days with identical results.

| Browser | Version | Score | Grade | Runs | Cross-site |
|---|---|---|---|---|---|
| Mullvad Browser | 140.13.0 | 74 | C | 74, 74, 74 | 74, nothing differed |
| Tor Browser | 140.13.0 | 74 | C | 74, 74, 74 | 74, nothing differed |
| LibreWolf | 152.0.6-1 | 48 | D | 48, 48, 48 | 48, nothing differed |
| Firefox | 153.0.1 | 9 | F | 9, 9, 9 | 9, nothing differed |
| Brave | 150.1.92.144 | 5 | F | 5, 5, 5 | 17 to 30, four to six readings differed |
| Chrome | 150.0.7871.187 | 0 | F | 0, 0, 0 | 0, nothing differed |
| Edge | 150.0.4078.105 | 0 | F | 0, 0, 0 | 0, nothing differed |

- **Your result will differ.** The score depends on installed fonts, screen, GPU and window size.
- **A score is only comparable to another score taken the same way.** See the range below.
- **Each Score figure is one visit to one site.** The Cross-site column is the separate measurement, and it is the only column where Brave differs from Chrome.
- **Brave's 5 is not a verdict on Brave.** It re-seeds per session and keys per site, so within one visit its values are stable and it reads as exposed. Its defence appears between visits, and that figure is a range rather than a number: 17 to 30 across the sessions measured here.
- **The two-origin probe completes on every browser, 85 runs of 85.** The companion runs a whole audit before it can answer, so the budget is 45 seconds. A run that does not complete is reported as not measurable, never as a zero.
- **Tor and Mullvad ran with the proxy forced to a direct connection and their bundled NoScript moved aside**, so both are resistFingerprinting engine tests and say nothing about the Tor network. NoScript intermittently blocks all script loading on plain http, which makes a benchmark unusable; it is not a fingerprinting defence and does not touch resistFingerprinting.
- **Fingerprint findability only.** Not tracker blocking, state partitioning, or the network layer.
- **Numbers drift as browsers ship.** The date and versions are part of the result.

## Why a browser has a range, not a number

The Score column above is one configuration: both opt-ins off, three runs, one machine. Turn the opt-ins on and the same browser on the same machine reads differently, because each opt-in adds a category to the denominator.

| Browser | Both off | WebRTC on | Supercookies on | Both on | Range |
|---|---|---|---|---|---|
| Tor Browser | 74 | 78 | 74 | 78 | 74-78 |
| Mullvad Browser | 74 | 78 | 74 | 78 | 74-78 |
| LibreWolf | 48 | 42 | 55 | 42-49 | 42-55 |
| Firefox | 9 | 8 | 20 | 18 | 8-20 |
| Brave | 5 | 5 | 5 | 4 | 4-5 |
| Chrome | 0 | 0 | 0 | 0 | 0 |
| Edge | 0 | 0 | 0 | 0 | 0 |

Three separate things move a score, and they should not be blurred together.

**The opt-in setting.** Both opt-ins are off by default and each adds a category worth 3. A browser that *blocks* the thing being tested gains: Tor refuses WebRTC, so turning the test on adds 3 to what it hides and 3 to the total, and its score rises from 74 to 78. A browser that leaks it loses: LibreWolf drops 48 to 42 for the same reason in reverse. **Turning on a leak test can raise your score, so two numbers taken under different settings cannot be compared.** Firefox moves most, 9 to 20, because it partitions storage well and that only counts when you ask for it.

**The browsing session.** A per-site randomizer re-seeds itself each time it starts, so its cross-site figure is not one number. Brave's read 17 to 30 across three rounds of measurement. Every one is correct for the session it was taken in, and none of them is the number.

**Whether the probe finished.** A test that cannot run leaves its category out, and the score changes accordingly. This is the largest source of spread here: LibreWolf's storage column read 55 in one round and 48 in the next purely because the supercookie test finished once and timed out the other time. Both it and the cross-site figure share one deadline, and raising it from fifteen seconds to forty-five made the cross-site figure reproduce on every browser, 85 runs of 85. The supercookie half still does not always finish, which is why LibreWolf's both-on cell is a range rather than a number. Tor and Mullvad plant the token but never deliver the read-back, so the category is left out of both the score and the total and their Supercookies column matches their default one. The second site does read its own storage, and finds nothing there; what it cannot do is report that back, because both browsers cut the link between a pop-up and the page that opened it. That severed link is itself the protection being tested, and on a static host there is no other channel, so this is reported as not measured rather than scored either way.

**The run.** Within a single launch and setting, six of the seven browsers returned an identical score on all three runs. LibreWolf with both opt-ins on returned 42, 49, 49, because its supercookie probe answered on two of the three. So run-to-run variation here is one probe finishing or not, never measurement noise in a reading that was taken.

## Limits

- Your IP and the TLS handshake are sent before any script and cannot be read here.
- The uniform-value credits are checked against Firefox's `RFPTargets.inc`. Most name a target there. Four do not: device memory, which Gecko never implemented, and three hashes (SVG text metrics, WebGL extensions, WebGL params) measured on one machine rather than read from source. Those three are the weakest credits here.
- Of the six readings Tor still shows, four have no target at all: element geometry, MathML render size, text metrics and font measurement. The other two do. `MediaCapabilities` and `AudioContext` both exist as targets, but they cover `mediaCapabilities.decodingInfo` and the audio graph rather than the `MediaSource.isTypeSupported` list and the rendered-output check this scores, so those two readings are scored as shown against a browser that does normalize a neighbouring API.
- WebGPU is scored through two readings, the adapter identity and the adapter limits, and both sit in the GPU category alongside the WebGL readings because they have the same cause. They change no single-site score in the table: Tor, Mullvad and LibreWolf refuse WebGPU outright, and the browsers that answer it already show canvas. They do lower Brave's cross-site figure, because Brave farbles its canvas per site and does not farble WebGPU, so the GPU stays linkable across origins. The rest of what the collector reads there, the feature set, the texture-format matrix and the compute timings, stays in the raw view.
- Rendered sound and 3D rendered image score the rendered output itself. They used to score only whether the render happened, which meant a browser altering its audio on every read still looked exposed, since "it worked" is constant.
- The two-read check that detects a per-read randomizer reaches only the readings taken live. Fifteen are pulled from rows the collectors already computed, so a second call returns them unchanged and they can never be credited for varying. Canvas is covered separately by drawing twice. This under-credits rather than over-credits.
- **A refused reading is credited as protection, and nothing distinguishes a browser withholding a value from this tool's own probe failing.** It fails in the flattering direction. It has happened: an extension scan that found nothing was scored as protection and every published number was three points too high. The mitigation is a test layer that breaks each probe deliberately and asserts a broken one never scores as shown.
- Weighting a category by its heaviest reading is still a judgment. Dropping the category weighting entirely and summing every reading moves Tor 74 to 77 and LibreWolf 48 to 58 without changing the order; it is kept because otherwise the GPU category, which this tool probes seven times, would outweigh Window, which it probes once.
- For a per-session farbler the single-site number says little: Brave reads 5 on one page and 19 to 24 across origins in the round measured here. Runs sharing a browser launch share a farbling seed, so every run above is a fresh launch. The CLI launches a fresh browser per run and reports both figures; it serves `127.0.0.1` and `localhost` from one handler and waits for the page to finish the comparison, so its cross-site number carries the same loopback floor as the page's.
- The cross-site second origin is `localhost` against `127.0.0.1`, which browsers treat more permissively than two registered domains, so a randomizer's cross-site figure is a floor.

## Checking

`__KIT.findability` holds every scored reading, its weight and its state. The catalog is `PRIORS`; the scoring is `findability` beside it. Everything else the tool reads sits in the raw view and never touches the score.
