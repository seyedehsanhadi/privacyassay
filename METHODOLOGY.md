# Methodology

The score is how much of what could identify you your browser hides. Anyone can recompute it by hand from the report.

## Three states

Each reading is **shown** (your real value, what a tracker uses), **blended** (a value every user of that browser shares, or one that changes on every read), or **refused** (blank, blocked, or error). Only shown counts against you.

## Weights

Each reading is **strong (3)**, **medium (2)**, or **weak (1)** by how much it narrows you down — our judgment, not a measured rarity. Readings in a category share one cause, so only the heaviest counts and its weight becomes the category's.

| Category | Readings (weight in parentheses) |
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

The same catalog scores every browser against the same total: thirteen categories summing to 30. Three of them only count when they actually fire: WebRTC and the supercookie test are opt-in, and extension detection is positive-only, so nothing detected is left out rather than credited as protection (it is not proof no extension is present, only that none revealed itself). A browser with none of the three is scored on the remaining ten categories summing to 21. An unmeasured or unfired reading is left out of the total.

## The formula

Per category that produced a reading:

```
category weight = weight of its heaviest reading
shown weight    = weight of the heaviest reading it still SHOWS (0 if none)
hidden          = category weight - shown weight

score = round( 100 * sum(hidden) / sum(category weight) )
grade = A 90+ | B 75-89 | C 60-74 | D 40-59 | F below 40
```

Hide more, the score rises; expose more, it falls. No cap. A strong reading still shown is named next to the grade, because one is enough to follow you.

## Cross-site

Over `http://` the catalog runs on two origins and compares. A reading counts as cross-site protection only if it was shown on one site and differs on the other; a value already blended (per-read noise) that differs across origins is noise, not protection. Readings that stay identical still link the visits.

The supercookie surface scores only the persistent stores: cookies, localStorage, IndexedDB, CacheStorage, CookieStore, and OPFS. The HTTP-cache probes (script, stylesheet, image, prefetch, and the rest) are reported but left out of the score, because browsers now partition the cache per site and the load-timing read is too noisy to score reliably.

Most browsers are read in a hidden same-page frame. A per-domain farbler (Brave) gives that frame the top page's seed, so it is measured in a first-party window opened on the run instead; a blocked pop-up falls back to a button. Score over http, not `file://`, because the two-origin comparison needs a real origin and is skipped otherwise. The single-site score itself did not move between origins on the browser tested for it: LibreWolf reads 43 on both.

## Cross-browser

Most of what a site reads is browser-specific and resets when you switch browsers: the user agent, the JavaScript engine's quirks, the CSS feature set. A smaller set comes from the hardware and the operating system, and it stays the same in a different browser on the same machine. Seven readings carry that weight here: GPU name, installed fonts, screen size, CPU cores, timezone, colour depth, and platform. The report counts how many of those anchors your browser exposes and hashes them into a separate cross-browser signature, so you can see the part of your fingerprint that follows you even after you change browsers. A hardened browser that masks the GPU and normalizes cores and timezone shrinks that set; a stock browser hands over all of it.

Device memory is left out on purpose, even though the amount of RAM in a machine obviously does not change when you open a different browser. Only Chromium reports it. A Chrome reading and a Firefox reading could never be joined on a value one of them never provides, so including it would have handed the same machine two different signatures and understated exactly the linkage this section exists to show.

## Redacting a shared report

Redact is on by default. It sits with the other two switches on the start card, so you can turn it off before the first scan if you would rather see your own values from the beginning. With it on, the values shown on screen and the values written into a saved file are masked. What survives is the shape of the result: which readings were taken, whether each was shown, blended or refused, the weight each carries, the score, and the coherence checks. Someone else can recompute the arithmetic from that without learning anything about your machine.

The masking is default-deny. Instead of listing values to strip, it keeps only what it recognises as harmless: status words such as true, false, absent and granted, plain numbers, and the short hashes the report already uses as its own currency. Everything else is replaced. An earlier version worked the other way round, listing patterns to hide, and it let the user agent, the GPU model and the timezone through into files people were invited to post publicly. A list of things to hide can never be finished; a list of things to keep can.

Turning Redact off reveals your real values, on screen and in anything saved afterwards. The score is identical either way, because redaction touches only display and export, never the readings the score is computed from.

## Reference measurements

One machine running Windows 11, measured 2026-07-29. Every row went through the same path: a real top-level window, three runs, a single origin, both opt-ins off. Read the caveats under the table before quoting any number from it.

| Browser | Version | Score | Grade | Runs | Cross-site |
|---|---|---|---|---|---|
| Mullvad Browser | 140.13.0 | 71 | C | 71, 71, 71 | 71, nothing differed |
| Tor Browser | 140.13.0 | 71 | C | 71, 71, 71 | 71, nothing differed |
| LibreWolf | 152.0.6-1 | 43 | D | 43, 43, 43 | probe blocked, not measurable |
| Brave | 150.1.92.144 | 5 | F | 5, 5, 5 | 14, range 10 to 14 |
| Firefox | 153.0.1 | 5 | F | 5, 5, 5 | 5, nothing differed |
| Chrome | 150.0.7871.187 | 0 | F | 0, 0, 0 | 0, nothing differed |
| Edge | 150.0.4078.105 | 0 | F | 0, 0, 0 | 0, nothing differed |

**The ordering is the result. The number is an indicator.** This is the most important thing to know before quoting anything above, and it comes from testing the model against its own arbitrary choices rather than from modesty.

The weights are judgment, as this document says plainly. So the table was recomputed from the same captured readings under five alternative weightings: every reading equal, the tiers inverted so weak counts 3 and strong counts 1, the tiers squared, and both with and without the rule that only a category's heaviest reading counts. **The ordering did not change once, in any scheme, including with the tiers fully inverted.** A jackknife that dropped each of the thirteen categories in turn did not change it either. No single category is load-bearing.

The absolute values are a different story. LibreWolf reads 43 as shipped, 50 with equal weights, 63 with inverted tiers and 67 without the category rule: the same data, a 24-point range. Tor moves between 71 and 81 across the same schemes.

So `Tor scores higher than LibreWolf, which scores higher than Brave, which scores higher than stock Chromium` is a claim this method supports. `Tor scores exactly 71` is a claim about this weighting, on this machine, on this date. Treat a difference of a few points as noise and a difference of a tier as real.

**Your result will differ.** These are one machine's readings. The score depends on the fonts installed, the screen, the GPU and the window size, so the same browser on your hardware will not necessarily land on the same number. Run it yourself; that is what the tool is for.

**This measures one visit to one site.** Both opt-ins were off and the runs were single-origin, so the WebRTC and supercookie categories are absent and nothing here describes cross-site linkability. The score is what a single site learns on a single visit.

**Brave's 5 is not a verdict on Brave.** It re-seeds its farbling per session and keys it per site, so inside one page load its values are perfectly stable and it correctly reads as exposed. Its protection is real and lives between visits, which is what the two-origin comparison measures and this table does not. The same caution applies to any randomizing browser.

**Tor and Mullvad were measured with the proxy forced to a direct connection.** Both numbers are therefore pure resistFingerprinting engine tests and say nothing about the Tor network, which is the larger part of what Tor Browser actually provides. Tor additionally needed its bundled NoScript moved aside for the capture, because NoScript intermittently blocks all script loading on a plain http origin and no script means no measurement. Neither change touches resistFingerprinting, but both differ from the browser as a user runs it.

**This is fingerprint findability only.** Tracker blocking, state partitioning and network privacy are not scored, and a browser can be excellent at those while scoring poorly here. privacytests.org covers that ground across roughly 156 checks and ranks these browsers differently, with Brave near the top. Neither ordering is wrong; they answer different questions.

**Numbers drift as browsers ship.** The date above is part of the result. A row without its date and version is not a measurement.

## Limits

The score is not a proof of anonymity. Your IP and the TLS handshake are sent before any script and cannot be read here. Blended is credited only for values a browser is documented to report for every user, checked against engine source, not a live crowd; a value masked to a per-machine constant could be over-credited, so the blended set is kept narrow.

**A refused reading is credited as protection, and nothing distinguishes a browser withholding a value from this tool's own probe failing.** That is a property of the design rather than a bug, and it fails in the flattering direction, so it is worth stating outright. It has happened: an extension scan that found nothing was once scored as protection, and every published number was three points too high until the arithmetic was re-derived by hand. The mitigation is a test layer that breaks each probe deliberately and asserts a broken one never scores as a value handed over, plus a check that every reading the scorer looks up actually resolves to a live row. Those run on every change. They are the only thing standing between a future refactor and a quietly inflated score.

A browser that randomizes (Brave, Tor, Mullvad, Firefox private) changes its raw fingerprint between runs while its score stays put. Measured over three runs each on one machine, Brave scored 5, 5, 5 and Tor and Mullvad each scored 71, 71, 71, with their canvas and audio hashes differing on every run. That is the intended behaviour: a value that will not repeat cannot follow you between visits, so it is credited as blended and the score does not move when the noise does.

For a per-session farbler it is the **cross-site** number that needs the median, not the single-site one. That is the opposite of the obvious guess and it was measured: Brave's single-site score was 5 on every run without exception, while its cross-site score read 10, 14 and 14 across three separate launches. Farbling re-seeds per session, so several runs inside one browser launch all share a seed and agree with each other for the wrong reason. The CLI's `--runs N` launches a fresh browser per run, which is what makes its median meaningful.

What single-site stability does not tell you is how much a randomizer protects you across sites, because a browser that re-seeds per site or per session looks fully exposed within a single visit. Brave scores 5 here for exactly that reason: inside one page load its values are constant, and its defence only appears between origins, where it gained nine points. For any randomizing browser, read the cross-site number alongside the single-site one.

A cross-site number that cannot be obtained is not a zero. LibreWolf blocked the second-site probe outright, which for a browser that reshuffles per site is protection working; its cross-site figure is unmeasurable here rather than nil. The table above says blocked for that reason.

## Checking

`__KIT.findability` in the console holds every scored reading, its weight, and its state; the catalog is `PRIORS` and the scoring is `findability` beside it in source. Everything else the tool reads sits in the raw view and never touches the score.
