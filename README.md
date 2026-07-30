# Privacyassay 0.9.0-beta

One HTML file that shows what a website can read about your browser and how much of it singles you out. Everything runs on your machine; the fingerprint is never uploaded.

Beta: the scoring model may still change. [METHODOLOGY.md](METHODOLOGY.md) states the formula, cites what every browser claim was checked against, and names the two places the model is knowingly imprecise.

Each reading is your real value (**shown**), a value every user of that browser shares or one that changes on every read (**blended**), or nothing (**refused**). The score is the share of what could identify you that your browser hides, weighted by how much each reading gives away.

Redact is on by default, so values on screen and in any saved report are masked and a screenshot gives nothing away. Turn it off on the start card to see your own values. The score is identical either way.

A strict Content-Security-Policy (`default-src 'none'`, `connect-src 'self'`) blocks external loads and connections; confirm it in the network panel. The one thing CSP cannot govern is WebRTC, which is why the STUN test is opt-in and off by default.

## Run it

```bash
git clone https://github.com/seyedehsanhadi/privacyassay.git
# open index.html and press Run
```

Two checks (request-header echo, two-origin cross-site) need a real origin:

```bash
python serve.py        # http://localhost:8000, loopback only
```

Serve over http rather than `file://`: the two-origin test needs a real origin and is skipped otherwise.

## Benchmark it in CI

```bash
node bin/privacyassay.mjs                 # print the result as JSON
node bin/privacyassay.mjs --min-score 40  # and fail the build below a threshold
```

Runs headless, exits non-zero below the threshold, launches a fresh browser per run so a farbling browser cannot re-use one seed. Pick the threshold against the browser your CI actually runs: a stock Chromium scores near zero, so a high gate fails every time. Needs Node 22+ and a Chromium-family browser. By default it makes no external request; `--webrtc` opts into the one STUN test.

## Reviewing this

The whole tool is `index.html`, one file, sectioned with `/* ===== */` banners. The parts that decide a score:

| What | Where |
|---|---|
| The scored catalog and its weights | `PRIORS` |
| Reading to shown / blended / refused | `findability` |
| The two-origin comparison | `findabilityCross` |
| What a shared report is allowed to contain | `paRedactVal` |

```bash
npm test              # 50 checks: scoring arithmetic, catalog consistency, docs against code
npm run test:browser  # 25 checks in a real browser, including deliberate probe sabotage
npm run test:stress   # 11 checks: repeated runs, re-entrancy, viewport extremes
```

The browser suite is the one worth reading. A refused reading is credited as protection, so a broken probe would raise the score; those tests break each probe on purpose and assert it never scores as a value handed over. That failure has happened once in this project's history.

Seven browsers measured on one machine are tabulated in [METHODOLOGY.md](METHODOLOGY.md#reference-measurements). Chrome and Edge read 0; Tor and Mullvad read 71.

## What it cannot do

- **Tell you how rare you are in the real world** — that needs a live population; the weights are judgment, not measured rarity.
- **See the network layer** — TLS, HTTP/2, TCP and DNS are sent before any script runs.
- **See behaviour** — mouse, typing and scroll are not measured.
- **Test true cross-site behaviour** — the two-origin test uses `localhost` and `127.0.0.1`, which browsers treat more permissively than two registered domains.

A high score means most of what it checks is hidden, not that you are anonymous.

## License

Apache-2.0, &copy; Seyed Ehsan Hadi. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
