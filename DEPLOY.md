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

`PA_HOME` redirects a direct visit to the companion back to the main site. Both ship set to this
project's own pair, so a copy you host yourself has to change them or it gets no cross-site result:
the companion answers only to the `PA_HOME` it was built with, and a reply addressed elsewhere is
dropped by the browser. A page served from loopback ignores both values and pairs with loopback
instead; opened from disk it pairs with nothing at all. Either way a local copy never contacts
either host.

4. Add **both** origins to the `Content-Security-Policy` meta tag. Skipping this fails silently: the shipped policy allows `'self'`, loopback and this project's own
two origins, so a companion of yours that is not named there never loads and the cross-site result
reads as unmeasured rather than as an error. Only `frame-src` and `child-src` name the companion origin. Every probe URL is relative apart from the STUN server the opt-in WebRTC check contacts, so the rest stays same-origin inside whichever page runs it.

The two copies must stay byte-identical. Point both hosts at the same file. `.gitattributes` pins line endings so a checkout cannot rewrite them and break the match or a published hash.

## Notes

- Most browsers use a hidden same-page frame. Brave and the supercookie opt-in open a brief window on the Run click, which pop-up blockers allow.
- The supercookie cache probes call `/__res` and `/__ctr`, which only `serve.py` answers. On a static host they fail and those probes report as unsupported. They are opt-in and unscored, so the score is unaffected.
- Serve over HTTPS. `file://` works for a quick look but the two-origin test is skipped there, so it reports single-site numbers only.
- A `<meta>` CSP cannot set `X-Frame-Options` or `frame-ancestors`. Set those at the server or CDN if you care whether the report can be framed.
- `schema.json` ships with no `$id`. To pin one, add `"$id": "https://<domain>/schema/privacyassay-summary-1.0.json"`.
- `serve.py` is a local dev helper. It binds to `127.0.0.1`, refuses directory listings, and warns before binding anything other than loopback, but it serves the whole folder either way. Do not point it at a public interface.
