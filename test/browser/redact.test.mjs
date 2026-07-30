import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../helpers/server.mjs";
import { launch, runAudit } from "../helpers/browser.mjs";

// Redaction protects a file users are explicitly invited to post in public, so it is tested
// against what the export actually writes, never against window.__KIT. __KIT is the in-memory
// result object and legitimately holds every real value, because the score is computed from them.
// Asserting on it reports a leak that does not exist.
//
// paDownload builds a Blob and hands it to URL.createObjectURL, and both it and paSave are
// lexically scoped inside the page's IIFE, so neither can be replaced from outside. Intercepting
// createObjectURL captures exactly the bytes a user would receive.
//
// The control test exercises the SAME path as the assertion. An earlier version controlled on
// document.body.innerText, which never shows the raw values even with redaction off, so it could
// not pass and the leak search above it proved nothing.

const PRELOAD = `
window.__BLOBS = [];
(function () {
  var orig = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function (b) { try { window.__BLOBS.push(b); } catch (e) {} return orig(b); };
})();`;

// audioRate is deliberately not harvested. paRedactVal allows bare numbers on purpose so a
// redacted report stays checkable by hand, and test/scoring.test.mjs already asserts that "48000"
// survives redaction. Treating it as a leak would contradict a documented design decision.
const HARVEST = `
JSON.stringify((function () {
  var o = {}, put = function (k, v) { v = String(v == null ? "" : v); if (v.length >= 6) o[k] = v; };
  put("userAgent", navigator.userAgent);
  put("platform", navigator.platform);
  try { put("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone); } catch (e) {}
  put("screen", screen.width + "x" + screen.height);
  put("inner", innerWidth + "x" + innerHeight);
  try {
    var g = document.createElement("canvas").getContext("webgl");
    var d = g && g.getExtension("WEBGL_debug_renderer_info");
    if (d) { put("glRenderer", g.getParameter(d.UNMASKED_RENDERER_WEBGL)); put("glVendor", g.getParameter(d.UNMASKED_VENDOR_WEBGL)); }
  } catch (e) {}
  return o;
})())`;

const CLICK_EXPORTS = `
(function () {
  var els = Array.prototype.slice.call(document.querySelectorAll("button, a"));
  var hits = els.filter(function (e) {
    var t = ((e.textContent || "") + " " + (e.id || "")).toLowerCase();
    return t.indexOf("save") >= 0 || t.indexOf("export") >= 0 || t.indexOf("download") >= 0 || t.indexOf("json") >= 0;
  });
  hits.forEach(function (e) { try { e.click(); } catch (x) {} });
  return hits.length;
})()`;

const READ_BLOBS = `
(async function () {
  var out = [];
  for (var i = 0; i < window.__BLOBS.length; i++) { try { out.push(await window.__BLOBS[i].text()); } catch (e) {} }
  return out.join("\\n");
})()`;

async function capture(port, redact) {
  const page = await launch({ port, preload: PRELOAD });
  try {
    const secrets = JSON.parse(await page.ev(HARVEST));
    assert.ok(Object.keys(secrets).length >= 4, "harvest returned too little to prove anything");
    await page.ev(`(function(){var c=document.getElementById("redactOptin");c.checked=${redact};c.dispatchEvent(new Event("change"));return c.checked;})()`);
    assert.equal(
      await page.ev(`document.getElementById("redactOptin").checked`), redact,
      "the redact toggle did not take the requested state, so this test would prove nothing",
    );
    const kit = await runAudit(page);
    const clicked = await page.ev(CLICK_EXPORTS);
    assert.ok(clicked > 0, "no export control was found to click, so nothing was captured");
    await new Promise((r) => setTimeout(r, 900));
    const exportedRaw = await page.ev(READ_BLOBS);
    assert.ok(exportedRaw.length > 500, `expected a substantial export, got ${exportedRaw.length} bytes`);
    const dom = await page.ev("document.body.innerText");

    // Row labels are the tool's own static vocabulary and are identical on every machine. One of
    // them is literally "viewport 800x600 (headless default)", and headless Chrome's real screen
    // IS 800x600, so a naive substring search reports a leak that does not exist. Strip the labels
    // before searching so a match means leaked DATA rather than the tool's own wording.
    const labels = JSON.parse(await page.ev(
      `JSON.stringify(Object.keys(window.__KIT.categories||{}).flatMap(function(c){` +
      `return (window.__KIT.categories[c].rows||[]).map(function(r){return String(r[0]);});}))`,
    ));
    let exported = exportedRaw;
    for (const label of labels) if (label) exported = exported.split(label).join("");

    return { secrets, exported, dom, score: kit.findability.score };
  } finally { await page.close(); }
}

const leaksIn = (haystack, secrets) =>
  Object.entries(secrets).filter(([, v]) => haystack.includes(v)).map(([k, v]) => `${k}=${JSON.stringify(v.slice(0, 30))}`);

test("redact control: with redaction OFF the export does contain real values, so the search can detect a leak", async () => {
  const srv = await startServer();
  try {
    const { secrets, exported } = await capture(srv.port, false);
    const found = leaksIn(exported, secrets);
    assert.ok(found.length >= 3, `expected harvested values to appear unredacted, found ${found.length}: ${found.join(", ")}`);
  } finally { srv.close(); }
});

test("redact: no real value survives into the exported file", async () => {
  const srv = await startServer();
  try {
    const { secrets, exported } = await capture(srv.port, true);
    assert.deepEqual(leaksIn(exported, secrets), [], "a real value in a file users are invited to share publicly is a leak");
  } finally { srv.close(); }
});

test("redact: no real value is visible in the rendered report", async () => {
  const srv = await startServer();
  try {
    const { secrets, dom } = await capture(srv.port, true);
    assert.deepEqual(leaksIn(dom, secrets), []);
  } finally { srv.close(); }
});

// The harvest above collects values from the environment. It cannot see the tool's own derived
// hashes, which are the more dangerous leak: two "redacted" reports carrying the same canvas
// hash link to each other, and a hash of a fingerprint is the fingerprint. Every one of these
// survived redaction at some point - the per-vector hashes through an 8-hex allow-list, the
// per-category hashes and the fingerprint, stable hash and cross-browser signature by never
// being gated at all.
const OWN_HASHES = `
JSON.stringify((function () {
  var K = window.__KIT || {}, out = {}, add = function (k, v) {
    v = String(v == null ? "" : v); if (/^[0-9a-f]{8}$/i.test(v)) out[k] = v;
  };
  add("fingerprint", K.fingerprint);
  add("stableHash", K.stableHash);
  add("crossBrowser", K.crossBrowser && K.crossBrowser.hash);
  Object.keys(K.categories || {}).forEach(function (c) {
    add("cat:" + c, K.categories[c].hash);
    (K.categories[c].rows || []).forEach(function (r, i) {
      var v = Array.isArray(r[1]) ? r[1][0] : r[1];
      add("row:" + c + ":" + i, v);
    });
  });
  return out;
})())`;

test("redact: none of the tool's own hashes survive into the export or the screen", async () => {
  const srv = await startServer();
  try {
    const page = await launch({ port: srv.port, preload: PRELOAD });
    try {
      await page.ev(`(function(){var c=document.getElementById("redactOptin");c.checked=true;c.dispatchEvent(new Event("change"));return c.checked;})()`);
      await runAudit(page);
      const hashes = JSON.parse(await page.ev(OWN_HASHES));
      assert.ok(Object.keys(hashes).length >= 5,
        `expected the run to produce several hashes to test against, got ${Object.keys(hashes).length}`);
      await page.ev(CLICK_EXPORTS);
      await new Promise((r) => setTimeout(r, 900));
      const exported = await page.ev(READ_BLOBS);
      const dom = await page.ev("document.body.innerText");
      const leaked = Object.entries(hashes)
        .filter(([, v]) => exported.includes(v) || dom.includes(v))
        .map(([k, v]) => `${k}=${v}`);
      assert.deepEqual(leaked, [], "a hash in a report the UI calls safe to share links two reports together");
    } finally { await page.close(); }
  } finally { srv.close(); }
});

test("redact: the score is identical with redaction on and off", async () => {
  const srv = await startServer();
  try {
    const on = await capture(srv.port, true);
    const off = await capture(srv.port, false);
    assert.equal(on.score, off.score, "METHODOLOGY.md states redaction touches display and export only, never the readings scored");
  } finally { srv.close(); }
});
