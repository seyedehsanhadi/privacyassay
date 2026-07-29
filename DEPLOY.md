# Deploy

The kit is one file. Host `index.html` anywhere static and it works. The only setup worth doing is the companion origin, which turns the two-origin cross-site test on for real visitors instead of just localhost.

## Why a companion

A per-site randomizer (Brave) shows a different fingerprint on every registrable domain. To measure that, the kit opens a second site and compares. On `localhost` it fakes this with `127.0.0.1`, which browsers treat too permissively, so the cross-site number is soft. A real second domain gives the honest number.

## Setup

1. Host `index.html` on your main site, say `privacyassay.example`.
2. Host the same `index.html` on a second origin with a different registrable domain. A free `*.pages.dev`, `*.github.io` or `*.netlify.app` each counts as its own domain, so any of them works as the companion.
3. In the main site's `index.html`, set two lines near the top of the script:

```
var PA_COMPANION="https://companion.pages.dev/index.html";
var PA_HOME="https://privacyassay.example/";
```

`PA_COMPANION` is the companion's full URL. `PA_HOME` redirects a direct visit to the companion back to the main site. Leave both empty for local use.

4. Add **both** origins to the `Content-Security-Policy` meta tag at the top of `index.html`. This step is not optional and it is easy to miss, because skipping it fails silently: the policy ships allowing only `'self'` and loopback, so a real companion is refused, the hidden frame never loads, and the cross-site result reads as unmeasured rather than as an error. Put both origins in the one tag, since the two copies are byte-identical. The directives that carry the test are `frame-src` and `child-src`; the supercookie cache probes additionally need `img-src`, `script-src`, `style-src` and `connect-src`.

## Keep them in sync

The two copies must be byte-identical. Point both hosts at the same file (a shared repo, or a build step that copies `index.html` to the companion), so a change ships to both at once.

## Notes

- Most browsers use a hidden same-page frame. Brave and the supercookie opt-in open a brief window on the Run click, which pop-up blockers allow.
- Serve over HTTPS. The kit also runs from `file://` for a quick local look, but some anti-fingerprinting browsers letterbox window and screen size only on web origins, so `file://` can under-score them (LibreWolf, for one, reads lower on `file://` than over http). Serve over http for the accurate number. The two-origin cross-site test also needs an http origin and is skipped on `file://`.
- A `<meta>` CSP cannot set `X-Frame-Options` or `frame-ancestors`. If you care whether the report can be framed by another site, set those headers at the server or CDN.
- `schema.json` ships with no `$id`, because the canonical domain is not owned yet. Once it is, add `"$id": "https://<your-domain>/schema/privacyassay-summary-1.0.json"` as the second key, so consumers have a stable identifier that actually resolves.
- `serve.py` is a local dev helper. It binds to `127.0.0.1` and serves this folder. Directory listings are refused, and binding to anything other than loopback prints a warning first, but the whole folder is still served either way, so do not point it at a public interface.
