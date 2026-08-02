# bench

The harness behind the numbers in [METHODOLOGY.md](../METHODOLOGY.md), and the captures they were
computed from. Everything here is reproducible; nothing here ships in the npm package.

| Script | Recomputes |
|---|---|
| `calibration.mjs` | the 0.76 tier correlation, and the agreement against published per-attribute entropy |
| `sensitivity.mjs` | the six alternative weightings and the thirteen-category jackknife |
| `matrix.mjs` | the seven-browser by four-setting table |
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
node bench/matrix.mjs
```

Roughly two hours for 7 browsers times 4 settings times 3 runs. `PA_BROWSERS` and `PA_RUNS`
narrow it.

## The captures

Seven browsers, both opt-ins off, one machine, Windows 11, 2026-07-31.

These are sanitised. The harness reads the page's live state rather than the redacted export, so a
raw capture carries the real machine: user agent, GPU string, timezone and fingerprint hashes.
Publishing that from a privacy tool would be indefensible, so every reading is reduced to
`[label, state, tier]`, which is all the scoring uses. That is why each file is 8KB rather than
280KB, and why a capture cannot be used to re-derive the machine it came from.

`matrix.json` holds the full 7 by 4 grid. The other 44 captures, one per browser per setting, are
not committed because they are 12MB and regenerable with `matrix.mjs`.

Your own numbers will differ. The score depends on installed fonts, screen, GPU and window size,
which is the point.
