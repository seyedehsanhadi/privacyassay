# Privacyassay 0.9.0-beta

One HTML file that shows what a website can read about your browser and how much of it singles you out. Everything runs on your machine; the fingerprint is never uploaded.

Each reading is your real value (**shown**), a value every user of that browser shares or one that changes on every read (**blended**), or nothing (**refused**). The score is the share of what this tool checks that your browser hides, weighted by how identifying each reading is. It does not estimate how rare you are, which would need a population of real fingerprints. [METHODOLOGY.md](METHODOLOGY.md) has the formula and the numbers.

Redact is on by default, so values on screen and in any saved report are masked. Turn it off on the start card to see your own values. The score is identical either way.

A `<meta>` Content-Security-Policy denies everything by default and allows only this origin, plus loopback frames for the two-origin test. CSP cannot govern WebRTC, which is why the STUN test is opt-in and off by default.

## Results

One machine, Windows 11, 2026-07-31. Three runs per setting, a fresh browser launch each. Higher means more of what this tool checks is hidden.

```
           0        20        40        60        80       100
           +----+----+----+----+----+----+----+----+----+----+
Tor                                             ##              74-78
Mullvad                                         ##              74-78
LibreWolf                       #######                         42-55
Firefox        ######                                            8-20
Brave        #                                                    4-5
Chrome     |                                                        0
Edge       |                                                        0
```

| Browser | Version | Default | Range | Why it moves |
|---|---|---:|---:|---|
| Tor Browser | 140.13.0 | 74 | 74-78 | the WebRTC test adds a category it refuses outright |
| Mullvad Browser | 140.13.0 | 74 | 74-78 | same |
| LibreWolf | 152.0.6-1 | 48 | 42-55 | loses on WebRTC, gains on supercookies; one run of three did not finish that probe |
| Firefox | 153.0.1 | 9 | 8-20 | partitions storage well, which only counts when you ask for it |
| Brave | 150.1.92.144 | 5 | 4-5 | flat within a single visit by design |
| Chrome | 150.0.7871.187 | 0 | 0 | nothing hidden under any setting |
| Edge | 150.0.4078.105 | 0 | 0 | nothing hidden under any setting |

Cross-site is a separate measurement, and the only column where Brave differs from Chrome: **17 to 30 across sessions**, because it re-seeds each session and keys per site. Every other browser's cross-site figure equals its single-site score.

These ranges are not measurement noise. Within one launch and setting, six of the seven browsers returned an identical score on all three runs. The spread comes from the opt-in setting, which changes the denominator, and for LibreWolf from a probe that did not always finish, so **two scores taken under different settings cannot be compared**. [METHODOLOGY.md](METHODOLOGY.md) separates the causes.

## Run it

Open `index.html` and press Run.

Three checks (request-header echo, two-origin cross-site, supercookies) need a real origin:

```bash
python serve.py
```

Serves `http://localhost:8000`, loopback only.

## In CI

```bash
node bin/privacyassay.mjs                 # print the result as JSON
node bin/privacyassay.mjs --min-score 40  # and fail below a threshold
```

Headless, fresh browser per run so a farbling browser cannot re-use one seed. It serves `127.0.0.1` and `localhost` from one handler, so it reports the two-origin cross-site figure as well; `--no-cross` skips it. Needs Node 22+ and a Chromium-family browser. Set the threshold against the browser CI runs: a stock Chromium scores near zero.

## Reviewing this

The whole tool is `index.html`, one file. Sections are marked `/* TITLE ==== */` and subsections `/* - detail ---- */`, so both levels scan as their own column down the file. There are no other comments: the reason behind each fix lives in the test that pins it. What decides a score:

| What | Where |
|---|---|
| The scored catalog and its weights | `PRIORS` |
| Reading to shown / blended / refused | `findability` |
| The two-origin comparison | `findabilityCross` |
| What a shared report may contain | `paRedactVal` |

```bash
npm test              # scoring arithmetic, every classifier branch, catalog consistency, docs against code
npm run test:browser  # a real browser, including deliberate probe sabotage
npm run test:stress   # repeated runs, re-entrancy, viewport extremes
```

A refused reading is credited as protection, so a broken probe would raise the score. The browser suite breaks each probe on purpose and asserts it never scores as a value handed over.

## What it cannot do

- **Tell you how rare you are in the real world.** That needs a live population; the weights are judgment, not measured rarity.
- **See the network layer.** TLS, HTTP/2, TCP and DNS are sent before any script runs.
- **See behaviour.** Mouse, typing and scroll are not measured.
- **Test true cross-site behaviour.** The two-origin test uses `localhost` and `127.0.0.1`, which browsers treat more permissively than two registered domains.

A high score means most of what it checks is hidden, not that you are anonymous.

## License

Apache-2.0, &copy; Seyed Ehsan Hadi. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
