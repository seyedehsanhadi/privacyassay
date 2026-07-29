# Privacyassay

One HTML file that shows what a website can read about your browser and how much of it singles you out. Everything runs on your machine; the fingerprint is never uploaded.

Each reading is your real value (**shown**), the value everyone on your browser shares (**blended**), or nothing (**refused**). The score is the share of what could identify you that your browser hides, weighted by how much each reading gives you away, with a letter grade. Served over http it also reports whether a tracker could recognise you on a second site, and how much of your fingerprint comes from hardware that follows you into a different browser on the same machine.

A strict Content-Security-Policy (`default-src 'none'`, `connect-src 'self'`) blocks external loads and connections; confirm it in the network panel. The one thing CSP cannot govern is WebRTC, which is why the STUN test is opt-in and off by default.

Redact is on by default, so the values on screen and in any saved report are masked and a screenshot or a shared file gives nothing away. Turn it off on the start card to reveal your own values. The score is identical either way.

## Run it

```bash
git clone https://github.com/seyedehsanhadi/privacyassay.git
# open index.html and press Run
```

Two checks (request-header echo, two-origin cross-site) need a real origin:

```bash
python serve.py        # http://localhost:8000, loopback only
```

Serve over http rather than `file://`: some anti-fingerprinting browsers letterbox window and screen size only on web origins, so `file://` can under-score them.

## Benchmark it in CI

```bash
node bin/privacyassay.mjs                 # print the result as JSON
node bin/privacyassay.mjs --min-score 40  # and fail the build below a threshold
```

Runs headless, prints the result as JSON, and exits non-zero below the threshold. Pick the threshold against the browser your CI actually runs: the runner drives a Chromium-family browser, and a stock one scores near zero, so a high gate fails every time. The gate is for catching a regression in a hardened build, not for passing on a default runner. Needs Node 22+ and a Chromium-family browser; by default it makes no external request (`--webrtc` opts into the one STUN test). The scoring formula is unit-tested with `npm test`.

## What it cannot do

- **Tell you how rare you are in the real world** — that needs a live population; the weights are a judgment of how much each reading gives away, not a measured rarity.
- **See the network layer** — TLS, HTTP/2, TCP and DNS are sent before any script runs.
- **See behaviour** — mouse, typing and scroll are not measured.
- **Test true cross-site behaviour** — the two-origin test uses `localhost` and `127.0.0.1`, which browsers treat more permissively than two registered domains.

A high score means most of what it checks is hidden, not that you are anonymous. The method and the scored catalog are in [METHODOLOGY.md](METHODOLOGY.md).

## License

Apache-2.0, &copy; Seyed Ehsan Hadi. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
