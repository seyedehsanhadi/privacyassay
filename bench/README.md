# Browser measurements

`live.mjs` drives installed Chromium browsers through CDP and Gecko browsers through WebDriver BiDi. It uses a fresh automation profile and preserves bundled extensions and privacy defaults. It only terminates its own launched process tree. Tor may require interactive network bootstrap; a failed run is not a browser rating.

Copy `captures/browsers.example.json` to `captures/browsers.json` and set installed executable paths. Vivaldi is included in the example. Select browsers with `PA_BROWSERS`, runs with `PA_RUNS`, and the page with `PA_URL`. `PA_STORE=1` and `PA_RTC=1` enable the optional tests. `PA_HEADLESS=1` keeps browsers invisible. The expected methodology defaults to `package.json`; use `PA_VERSION=0.9.6` for the historical deployed build. Set environment variables using your shell's syntax.

```sh
node bench/live.mjs
node bench/postback.mjs firefox 1
```

New live captures are versioned separately from historical results. Incomplete runs retain their coverage and diagnostics and are excluded from score arrays. A companion must run the matching catalog version. Loopback checks exercise functionality; localhost and 127.0.0.1 do not reproduce storage partitioning between two public registrable domains.

For Gecko regression tests, set `PRIVACYASSAY_ENGINE=gecko` and `PRIVACYASSAY_BROWSER` to the installed executable. The disposable profile initializes Tor/Mullvad Standard security through the browser's own NoScript integration; bundled extensions remain enabled. `test/browser/sites.test.mjs` serves two HTTPS domains on loopback. For Tor, `PRIVACYASSAY_SITE_IPS=1` uses two distinct HTTPS IP sites while keeping DNS disabled. Only fixture hosts bypass its proxy, and certificate trust is limited to the disposable session. These local tests do not exercise the Tor network or replace deployed-domain measurements.

`PRIVACYASSAY_ENGINE=webkit` runs the common audit/export checks with an installed Playwright WebKit runtime. Use `PRIVACYASSAY_SITE_IPS=1` for its two-site HTTPS fixture. Windows WebKit establishes engine compatibility, not Safari privacy behavior; genuine Safari testing requires an Apple environment.

The CI `safari` job uses Apple's native SafariDriver on a macOS runner. It runs the common audit, saved-export, denial, and two-HTTPS-site checks sequentially. Safari preload controls enter through a loopback HTML proxy before the page script. The test certificate is trusted only on the disposable runner; capabilities and failures are printed in the job log.

`postback.mjs`, `runner.js` and `matrix.mjs` are local diagnostic harnesses. Their raw captures can contain fingerprint values: inspect and sanitize before publishing. They are not evidence of compatibility with untouched user profiles or other operating systems.

`calibration.mjs` and `sensitivity.mjs` analyze the historical 0.9.1-beta captures. Those figures are not validated browser rankings for 0.9.2. Preserve historical captures; do not silently mix methodology versions.

The README chart and table are 0.9.6 measurements from `live.mjs` across the four opt-in settings.

Run `node bench/figures.mjs` to update the social-card SVG (`--check` verifies its version), then `node bench/render-assets.mjs` with Chrome installed to render the PNG.
