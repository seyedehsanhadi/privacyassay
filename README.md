<div align="center">

<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="logo-dark.svg">
    <img src="logo-light.svg" width="392" alt="Privacyassay">
  </picture>
</h1>

**One HTML file that shows what a website can read about your browser and how much of it singles you out.**
Everything runs on your machine; the fingerprint is never uploaded.

[![CI](https://github.com/seyedehsanhadi/privacyassay/actions/workflows/ci.yml/badge.svg)](https://github.com/seyedehsanhadi/privacyassay/actions/workflows/ci.yml)
[![Version](https://img.shields.io/github/package-json/v/seyedehsanhadi/privacyassay?color=blue)](package.json)
[![License](https://img.shields.io/github/license/seyedehsanhadi/privacyassay?color=blue)](LICENSE)
[![Dependencies](https://img.shields.io/badge/dependencies-none-blue)](package.json)

### [Open it at privacyassay.com](https://privacyassay.com)

[Results](#results) &middot; [Run it](#run-it) &middot; [Methodology](METHODOLOGY.md) &middot; [Reviewing this](#reviewing-this) &middot; [Limits](#what-it-cannot-do)

</div>

![Privacyassay result: Mullvad Browser, 74 of 100 hidden, grade C, 74 on a second site, no hardware anchors exposed](screenshot.png)

<div align="center"><sub>A real run on the hosted pair: Mullvad Browser 140.13.0, both opt-ins off, 2026-08-03. The two origins are privacyassay.com and privacyassay.github.io, separate registrable domains. Its bundled NoScript was moved aside, which is not a fingerprinting defence and does not touch resistFingerprinting. Your own result will differ.</sub></div>

---

- **One file, no build, no dependencies.** Open it, or host it anywhere static.
- **A formula you can recompute by hand** from the report it prints.
- **Says what it cannot measure** as loudly as what it can.
- **No fingerprint is uploaded.** Every reading is taken and scored in the browser. Redact is on by default, so screenshots stay safe to post.
- **Runs in CI** and fails a build below a threshold you set.

| | |
|---|---|
| **Size** | one HTML file, 278 KB |
| **Needs** | any current browser; Node 22+ for the CLI |
| **Status** | beta; the scoring model is settled, the published numbers are measured on two real domains |

Each reading is your real value (**shown**), a value every user of that browser shares or one that changes on every read (**blended**), or nothing (**refused**). The score is the share of what this tool checks that your browser hides, weighted by how identifying each reading is. It does not estimate how rare you are, which would need a population of real fingerprints. [METHODOLOGY.md](METHODOLOGY.md) has the formula and the numbers.

Redact is on by default, so values on screen and in any saved report are masked. Turn it off on the start card to see your own values. The score is identical either way.

A `<meta>` Content-Security-Policy denies everything by default. It allows this origin and the second origin the two-origin test needs, which is loopback for a local copy and `privacyassay.github.io` for the hosted one. CSP cannot govern WebRTC, which is why the STUN test is opt-in and off by default.

A copy you run yourself contacts neither of those hosts: the second origin is resolved local-first, so a file opened from disk or served on loopback pairs with loopback and reaches nothing. On the hosted copy the second origin is fetched like any page, so it sees the request the way any site you visit does. It is sent no reading; it measures in your browser and answers over `postMessage`.

## Results

One machine, Windows 11, 2026-08-03, measured on the hosted pair: `privacyassay.com` against `privacyassay.github.io`. Two runs per setting, a fresh browser launch each, and every cell returned the same score on both. Higher means more of what this tool checks is hidden.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="chart-dark.svg">
  <img src="chart-light.svg" width="756" alt="Score by browser: Tor 74 (range 74-78), Mullvad 74 (74-78), LibreWolf 48 (42-55), Firefox 9 (8-20), Brave 5 (5-17), Chrome 0, Edge 0">
</picture>

| Browser | Version | Default | Range | Why it moves |
|---|---|---:|---:|---|
| Tor Browser | 140.13.0 | 74 | 74-78 | the WebRTC test adds a category it refuses outright; loopback figure, see below |
| Mullvad Browser | 140.13.0 | 74 | 74-78 | same |
| LibreWolf | 152.0.6-1 | 48 | 42-55 | loses on WebRTC, gains on supercookies |
| Firefox | 153.0.1 | 9 | 8-20 | partitions storage well, which only counts when you ask for it |
| Brave | 151.1.93.129 | 5 | 5-17 | flat within a visit by design; its cookie blocking only shows between real domains |
| Chrome | 150.0.7871.187 | 0 | 0 | nothing hidden under any setting |
| Edge | 151.0.4129.59 | 0 | 0 | nothing hidden under any setting |

Every browser ran on a fresh profile with nothing changed from its defaults, so each figure is that browser as it ships; Brave's Shields are at their defaults. Every row is measured on the hosted pair except Tor: reaching a public site needs its network bootstrapped, which this harness does not do, so it keeps its loopback figure and its three runs. Mullvad runs the same engine at the same version and measures 74 on the hosted pair, matching Tor's loopback 74.

**Brave's 5 is not a verdict on Brave, and the table would mislead you if you read it as one.** This column is one visit to one site, and Brave's defence is not built to operate inside one visit: it re-seeds per session and keys per site, so its values hold still while you are on a page and it reads as exposed. Between two real domains it scores **21 to 34**, the only column where it separates from Chrome. Every other browser's cross-site figure equals its single-site score.

The same table measured on loopback differs in one place. `bench/captures/matrix.json` holds the `localhost` against `127.0.0.1` run, which anyone can recompute without a browser. Every cell agrees except Brave with supercookies on: 5 there, 17 here. Brave carries cookies across the loopback pair but blocks them between two real domains, and that single row is the whole storage category. The order does not change: at 17 Brave still sits below Firefox at 20.

> These ranges are not measurement noise. Every cell returned the same score on both runs. The spread comes entirely from the opt-in setting, which changes the denominator, so **two scores taken under different settings cannot be compared**.

## Run it

Open `index.html` and press Run.

Three checks (request-header echo, two-origin cross-site, supercookies) need a real origin:

```bash
python serve.py
```

Serves `http://127.0.0.1:8000`, loopback only, and pairs it with `localhost` as the second origin, which needs `localhost` to resolve to the address it binds.

Hosting it yourself works the same way for everything except those two-origin checks, which need a second host that answers back. [DEPLOY.md](DEPLOY.md) has the four steps. Until the two origins name the pair you actually serve from, the tool reports the second origin as missing rather than a result it did not measure.

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
- **Give a real cross-site figure from a local copy.** Run locally, the two-origin test pairs `localhost` with `127.0.0.1`, which browsers treat more permissively than two registered domains: Brave, for one, carries cookies across that pair but blocks them between real sites. The table above is measured on the hosted pair by `bench/live.mjs`, which drives the browser rather than hosting it; `bench/matrix.mjs` measures the same grid over loopback and is faster but is not the same measurement.

A high score means most of what it checks is hidden, not that you are anonymous.

## Prior art

Browser fingerprinting has been measured in public for years, and this tool is not the first to do it.

[EFF Cover Your Tracks](https://coveryourtracks.eff.org/) estimates how rare your browser is against a live population, which is the one thing measured here cannot do. [privacytests.org](https://privacytests.org/) tests browsers rather than the visitor, across a far wider matrix than seven. [CreepJS](https://abrahamjuliot.github.io/creepjs/) reads more surfaces than this does and is the reference for lie detection.

What is different here is the combination: one file with no build, a score whose arithmetic you can recompute by hand from the report, and a stated refusal to guess at anything it could not measure.

## Contributing

The most useful thing you can send is a browser this scores wrongly, and there is a form for it under New issue. Disagreeing with the method is just as welcome. [CONTRIBUTING.md](CONTRIBUTING.md) has the two conventions the test suite enforces.

## Security

[SECURITY.md](SECURITY.md) has what is in scope and how to report privately.

## License

Apache-2.0, &copy; Seyed Ehsan Hadi. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
