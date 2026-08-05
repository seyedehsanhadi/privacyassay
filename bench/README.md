# bench

The harness behind the numbers in [METHODOLOGY.md](../METHODOLOGY.md), and the captures they were
computed from. Everything here is reproducible; nothing here ships in the npm package.

| Script | Recomputes |
|---|---|
| `calibration.mjs` | the 0.76 tier correlation, and the agreement against published per-attribute entropy |
| `sensitivity.mjs` | the six alternative weightings and the thirteen-category jackknife |
| `matrix.mjs` | the seven-browser by four-setting table, over a loopback pair |
| `live.mjs` | the same table against a deployed pair, which is what the published one is |
| `postback.mjs`, `runner.js`, `runner.html` | how a headful browser reports a run back |

## Recompute the published figures

No browser needed. These read the captures in `captures/`.

```bash
node bench/calibration.mjs
node bench/sensitivity.mjs
```

## Re-measure from scratch

Needs the browsers installed. Copy `captures/browsers.example.json` to
`captures/browsers.json` and set each path to your own binary.

```bash
node bench/live.mjs                    # every browser against the deployed pair, opt-ins off
PA_STORE=1 node bench/live.mjs         # with the supercookie opt-in
PA_BROWSERS=brave,firefox node bench/live.mjs
PA_URL=https://your-site.example/ node bench/live.mjs
```

`live.mjs` is the one that reproduces the published table. `matrix.mjs` measures the same grid over
a loopback pair, which is not the same measurement: see below.

```bash
node bench/matrix.mjs
```

Roughly two hours for 7 browsers times 4 settings times 3 runs. `PA_BROWSERS` and `PA_RUNS`
narrow it.

## Why there are two harnesses

`matrix.mjs` serves `index.html` from its own server and has the page report back over that same
connection. That is why it is fast and needs no network, and also why its second origin is always
`127.0.0.1`. A deployed copy refuses that channel by design: its Content-Security-Policy allows
`connect-src 'self'` only, and its reply target resolves to its own `PA_HOME` rather than a local
harness.

`live.mjs` drives the browser instead of hosting it, over CDP for Chromium and WebDriver BiDi for
Gecko, and reads `window.__KIT` once the audit finishes. Nothing is served and nothing is posted.

The two disagree in one cell. Brave with the supercookie opt-in reads 5 over loopback and 17 across
two registrable domains, because it carries `document.cookie` and `CookieStore` across the loopback
pair while blocking both between real sites. `localStorage` is partitioned on both, so it is cookies
specifically. Chrome and Edge carry that cookie pair across both pairs, so Brave is the only browser
the loopback figure misreads.

Tor is the one browser `live.mjs` cannot measure: reaching a public site needs its network
bootstrapped, and the harness forces a direct connection. Its row in the published table is the
loopback figure and is marked as such.

## The captures

Seven browsers, both opt-ins off, one machine, Windows 11, 2026-07-31.

These are sanitised. The harness reads the page's live state rather than the redacted export, so a
raw capture carries the real machine: user agent, GPU string, timezone and fingerprint hashes.
Publishing that from a privacy tool would be indefensible, so every reading is reduced to
`[label, state, tier]`, which is all the scoring uses. That is why each file is 8KB rather than
280KB, and why a capture cannot be used to re-derive the machine it came from.

`matrix.json` holds the full 7 by 4 grid over loopback. `live.json` and `live-store.json` hold the
deployed-pair runs behind the published table. The other 44 captures, one per browser per setting,
are not committed because they are 12MB and regenerable with `matrix.mjs`.

Your own numbers will differ. The score depends on installed fonts, screen, GPU and window size,
which is the point.
