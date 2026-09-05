# Privacyassay

An open-source browser fingerprint diagnostic. One HTML file, no build or dependencies. Measurements and scoring run in your browser; your fingerprint is not uploaded.

[Run the test](https://privacyassay.com/) · [Methodology](methodology.html) · [Technical method](METHODOLOGY.md)

## What it measures

Canvas, WebGL, WebGPU, audio, fonts, layout, device details and selected leak checks. The raw report includes browser/API capability information. WebRTC and cross-site storage are optional and off by default. Redaction is on by default.

Version **0.9.2** distinguishes measured results from unknowns. Failed measurements receive no privacy credit. Incomplete runs display grade **I**, measurement coverage and a lower-bound score; CLI thresholds reject them. Browser-family guesses and common values do not earn masking credit.

A high score is not proof of anonymity. This is not a complete tracker-blocking, AI privacy, network or browser security assessment. Read the methodology before comparing runs.

## Run locally

Open index.html and press Run, or serve the directory:

```sh
python serve.py
```

Use http://127.0.0.1:8000. Local cross-site checks pair 127.0.0.1 with localhost, which is not equivalent to two registered domains. The hosted pair is privacyassay.com and privacyassay.github.io. A companion window opens from the Run click; blocked windows produce an unmeasured comparison.

## CLI and checks

Requires Node 22+ and a Chromium-family browser. Set PRIVACYASSAY_BROWSER for a custom binary.

```sh
node bin/privacyassay.mjs
node bin/privacyassay.mjs --min-score 40
npm test
npm run test:browser
npm run test:stress
```

The CLI launches a fresh profile per run. Reports identify the methodology version and completion state. Summary exports use privacyassay-summary/1.1.

## Scoring weights

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="chart-dark.svg">
  <img src="chart-light.svg" alt="Current category weights, generated from the scoring catalog; not browser rankings.">
</picture>

The chart is generated from the current catalog with `node bench/figures.mjs`. It shows judgment-based weights, not measured entropy or browser recommendations. The base denominator is 21; adding every optional category makes it 30.

[Example report screenshot](screenshot.png) shows one redacted local run, not a browser ranking.

## Results and contributions

The older 0.9.1-beta captures remain in [bench/captures](bench/captures) as historical data. They are **not comparable** with 0.9.2 scores, and are not a current browser ranking. [Benchmark instructions](bench/README.md) describe new measurements, including Vivaldi configuration. Default and modified profiles must be labeled separately.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and [DEPLOY.md](DEPLOY.md). Share minimal reproductions with browser version and settings; keep raw fingerprints out of public issues.

Apache-2.0. See [LICENSE](LICENSE).
