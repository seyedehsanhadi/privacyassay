# Deploy

Host `index.html` anywhere static and it works. The one thing worth setting up is the companion origin, which turns the two-origin cross-site test on for real visitors instead of loopback.

## Companion origin

A per-site randomizer shows a different fingerprint on every registrable domain. The kit opens a second site and compares. On loopback it uses `localhost` against `127.0.0.1`, which browsers treat too permissively: Brave's canvas did not change across that pair once, despite Brave re-seeding canvas farbling per site.

1. Host `index.html` on your main site.
2. Host the identical file on a second origin with a different registrable domain. A free `*.pages.dev`, `*.github.io` or `*.netlify.app` each counts as its own domain.
3. Set two lines near the top of the main site's script:

```
var PA_COMPANION="https://companion.pages.dev/index.html";
var PA_HOME="https://your-domain.example/";
```

`PA_HOME` redirects a direct visit to the companion back to the main site. Both ship empty for local use.

4. Add **both** origins to the `Content-Security-Policy` meta tag. Skipping this fails silently: the shipped policy allows only `'self'` and loopback, so the frame never loads and the cross-site result reads as unmeasured rather than as an error. The test needs `frame-src` and `child-src`; the supercookie cache probes also need `img-src`, `script-src`, `style-src` and `connect-src`.

The two copies must stay byte-identical. Point both hosts at the same file. `.gitattributes` pins line endings so a checkout cannot rewrite them and break the match or a published hash.

## Notes

- Most browsers use a hidden same-page frame. Brave and the supercookie opt-in open a brief window on the Run click, which pop-up blockers allow.
- Serve over HTTPS. `file://` works for a quick look but the two-origin test is skipped there, so it reports single-site numbers only.
- A `<meta>` CSP cannot set `X-Frame-Options` or `frame-ancestors`. Set those at the server or CDN if you care whether the report can be framed.
- `schema.json` ships with no `$id` because the canonical domain is not owned yet. Once it is, add `"$id": "https://<domain>/schema/privacyassay-summary-1.0.json"`.
- `serve.py` is a local dev helper. It binds to `127.0.0.1`, refuses directory listings, and warns before binding anything other than loopback, but it serves the whole folder either way. Do not point it at a public interface.
