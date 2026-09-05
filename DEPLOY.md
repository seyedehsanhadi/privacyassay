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

## Search indexing

The main site should return HTTP 200, allow crawling in `robots.txt`, and declare its own HTTPS URL as canonical. Keep the sitemap URL in robots.txt. The companion declares the main site as canonical so its duplicate audit page does not compete with the primary URL.

For a missing Google result, inspect the homepage in Google Search Console: check the indexing reason, last crawl, rendered page, Google-selected canonical, manual actions and security issues. Submit `https://privacyassay.com/sitemap.xml` and request indexing after deployment. A successful public fetch alone does not establish that Google indexed the page.

`llms.txt` documents the project for consumers that use it; it is not a Google indexing fix. [Google says it does not use llms.txt for Search visibility or ranking](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide). Keep useful explanations accessible in the initial HTML, with ordinary crawlable links. Do not add fictitious ratings, keywords or crawler-specific content.

The reported “Crawled - currently not indexed” example was `/METHODOLOGY.md`, not the homepage. The release adds `/methodology.html` as the linked, canonical HTML explanation and lists it in the sitemap. Keep the Markdown source accessible for existing links. Redirect exclusions can be normal; investigate the exact two 404 URLs before adding redirects. Do not redirect arbitrary missing URLs to the homepage.

Google decides which eligible pages to index. After deployment, use URL Inspection on the homepage and `/methodology.html`, submit the sitemap and request indexing. This verifies the remaining Search Console step; a code change cannot guarantee inclusion.

## Hosting notes

- All browsers open a companion window on the Run click. A blocked popup or mismatched build leaves the cross-site comparison unmeasured. Storage also uses a companion frame for its write control.
- The supercookie cache probes call `/__res` and `/__ctr`, which only `serve.py` answers. On a static host they fail and those probes remain unmeasured. They are opt-in and unscored, so the score is unaffected.
- Serve over HTTPS. `file://` works for a quick look but the two-origin test is skipped there, so it reports single-site numbers only.
- A `<meta>` CSP cannot set `X-Frame-Options` or `frame-ancestors`. Set those at the server or CDN if you care whether the report can be framed.
- `schema.json` ships with no `$id`. To pin one, add `"$id": "https://<domain>/schema/privacyassay-summary-1.1.json"`.
- `serve.py` is a local dev helper. It binds to `127.0.0.1`, refuses directory listings, and warns before binding anything other than loopback, but it serves the whole folder either way. Do not point it at a public interface.
