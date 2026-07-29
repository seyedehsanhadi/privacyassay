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

Most browsers are read in a hidden same-page frame. A per-domain farbler (Brave) gives that frame the top page's seed, so it is measured in a first-party window opened on the run instead; a blocked pop-up falls back to a button. Score over http, not `file://` — some browsers letterbox window and screen size only on web origins.

## Cross-browser

Most of what a site reads is browser-specific and resets when you switch browsers: the user agent, the JavaScript engine's quirks, the CSS feature set. A smaller set comes from the hardware and the operating system, and it stays the same in a different browser on the same machine. Seven readings carry that weight here: GPU name, installed fonts, screen size, CPU cores, timezone, colour depth, and platform. The report counts how many of those anchors your browser exposes and hashes them into a separate cross-browser signature, so you can see the part of your fingerprint that follows you even after you change browsers. A hardened browser that masks the GPU and normalizes cores and timezone shrinks that set; a stock browser hands over all of it.

Device memory is left out on purpose, even though the amount of RAM in a machine obviously does not change when you open a different browser. Only Chromium reports it. A Chrome reading and a Firefox reading could never be joined on a value one of them never provides, so including it would have handed the same machine two different signatures and understated exactly the linkage this section exists to show.

## Redacting a shared report

Redact is on by default. It sits with the other two switches on the start card, so you can turn it off before the first scan if you would rather see your own values from the beginning. With it on, the values shown on screen and the values written into a saved file are masked. What survives is the shape of the result: which readings were taken, whether each was shown, blended or refused, the weight each carries, the score, and the coherence checks. Someone else can recompute the arithmetic from that without learning anything about your machine.

The masking is default-deny. Instead of listing values to strip, it keeps only what it recognises as harmless: status words such as true, false, absent and granted, plain numbers, and the short hashes the report already uses as its own currency. Everything else is replaced. An earlier version worked the other way round, listing patterns to hide, and it let the user agent, the GPU model and the timezone through into files people were invited to post publicly. A list of things to hide can never be finished; a list of things to keep can.

Turning Redact off reveals your real values, on screen and in anything saved afterwards. The score is identical either way, because redaction touches only display and export, never the readings the score is computed from.

## Limits

The score is not a proof of anonymity. Your IP and the TLS handshake are sent before any script and cannot be read here. Blended is credited only for values a browser is documented to report for every user, checked against engine source, not a live crowd; a value masked to a per-machine constant could be over-credited, so the blended set is kept narrow.

A browser that randomizes (Brave, Tor, Mullvad, Firefox private) changes its raw fingerprint between runs while its score stays put. Measured over three runs each on one machine, Brave scored 5, 5, 5 and Tor and Mullvad each scored 71, 71, 71, with their canvas and audio hashes differing on every run. That is the intended behaviour: a value that will not repeat cannot follow you between visits, so it is credited as blended and the score does not move when the noise does. The CLI's `--runs N` reports a median for the cases where a browser does wobble, but a stable score under a shifting fingerprint is the expected result rather than a lucky one.

What that stability does not tell you is how much a randomizer protects you across sites, because a browser that re-seeds per site or per session looks fully exposed within a single visit. Brave scores 5 here for exactly that reason: inside one page load its values are constant, and its defence only appears between origins. For any randomizing browser, read the cross-site number alongside the single-site one.

## Checking

`__KIT.findability` in the console holds every scored reading, its weight, and its state; the catalog is `PRIORS` and the scoring is `findability` beside it in source. Everything else the tool reads sits in the raw view and never touches the score.
