# Browser measurements

`live.mjs` drives installed Chromium browsers through CDP and Gecko browsers through WebDriver BiDi. It uses a fresh automation profile and preserves bundled extensions and privacy defaults. It only terminates its own launched process tree. Tor may require interactive network bootstrap; a failed run is not a browser rating.

Copy `captures/browsers.example.json` to `captures/browsers.json` and set installed executable paths. Vivaldi is included in the example. Select browsers with `PA_BROWSERS`, runs with `PA_RUNS`, and the page with `PA_URL`. `PA_STORE=1` and `PA_RTC=1` enable the optional tests. Set environment variables using your shell's syntax.

```sh
node bench/live.mjs
node bench/postback.mjs firefox 1
```

New live captures are versioned separately from historical results. Incomplete runs retain their coverage and diagnostics and are excluded from score arrays. A companion must run the matching catalog version. Loopback checks exercise functionality; localhost and 127.0.0.1 do not reproduce storage partitioning between two public registrable domains.

`postback.mjs`, `runner.js` and `matrix.mjs` are local diagnostic harnesses. Their raw captures can contain fingerprint values: inspect and sanitize before publishing. They are not evidence of compatibility with untouched user profiles or other operating systems.

`calibration.mjs` and `sensitivity.mjs` analyze the historical 0.9.1-beta captures. Those figures are not validated browser rankings for 0.9.2. Preserve historical captures; do not silently mix methodology versions.

The README browser charts and screenshot preserve the historical presentation and measurements, labeled separately from 0.9.2. Replace their values only with new comparable browser measurements; keep their layout and styling.

Run `node bench/figures.mjs` to update the social-card SVG (`--check` verifies its version), then `node bench/render-assets.mjs` with Chrome installed to render the PNG. These commands do not overwrite the README charts or screenshot.
