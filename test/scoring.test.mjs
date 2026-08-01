// The arithmetic and what it is allowed to credit: the share rule, the grade bands, redaction,
// and the claims the verdict sentence is permitted to make.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { grabVar, grabFn } from "./helpers/extract.mjs";

// The tool is one self-contained index.html, so the scoring core is not importable.
// Pull PRIORS + findability (and their two pure helpers) out of the inline script with a
// string/comment-aware brace matcher, then run them in isolation. No browser, no DOM.

const core = grabVar("PRIORS") + "\n" + grabFn("paTier") + "\n" + grabFn("paLetterboxed") + "\n" + grabFn("paIsLB") + "\n" + grabFn("findability") + "\n" + grabFn("findabilityCross") + "\nreturn { findability, findabilityCross, PRIORS };";
const { findability, findabilityCross, PRIORS } = new Function(core)();

// Build an "observed" where every surface reads as SHOWN (real value, no mask trigger),
// against family "other" which has no implies/letterboxes, so nothing blends.
function allShown() {
  const o = {};
  PRIORS.surfaces.forEach((s) => { o[s.k] = "shown_" + s.k; });
  o.canvasClass = "realpixels";           // not noise-per-read / uniform-masked
  o.webglRenderClass = "present";          // not "unavailable"
  o.audioRenderClass = "present";
  o.availFrame = "40x40";                  // not "masked"
  o.speechVoices = "22 voices";            // not /^0[\s(]/
  o.fontLocalBlocked = "";                 // so fontSet isn't masked
  o.fontSet = "abc";
  return o;
}

test("all readings refused -> 100 / A", () => {
  const F = findability({}, "other");      // every non-optional key undefined = refused; optionals skipped
  assert.equal(F.score, 100);
  assert.equal(F.grade, "A");
});

test("all readings shown -> 0 / F", () => {
  const F = findability(allShown(), "other");
  assert.equal(F.score, 0);
  assert.equal(F.grade, "F");
});

test("hiding one reading can only raise the score (monotonic)", () => {
  const base = findability(allShown(), "other").score;          // 0
  const obs = allShown();
  obs.canvasHash = "";                                          // hide the strongest GPU reading
  obs.canvasClass = "";
  const F = findability(obs, "other");
  assert.ok(F.score > base, `expected >${base}, got ${F.score}`);
});

test("optional readings only count when measured", () => {
  const off = findability({}, "other");                        // webrtcIP undefined -> dropped
  const on = findability({ webrtcIP: "exposed" }, "other");    // network category now shown
  assert.equal(off.score, 100);
  assert.ok(on.score < 100, `exposed WebRTC IP must lower the score, got ${on.score}`);
  assert.notEqual(on.grade, "A");
});

test("score is round(100 * hidden / total) with grade bands A>=90 B>=75 C>=60 D>=40 F", () => {
  const F = findability({ webrtcIP: "exposed" }, "other");
  const bandOf = (n) => (n >= 90 ? "A" : n >= 75 ? "B" : n >= 60 ? "C" : n >= 40 ? "D" : "F");
  assert.equal(F.grade, bandOf(F.score));
  assert.equal(F.score, Math.round(F.score));                  // integer, no fractional leak
});

// ---- classification + cross-site: the half where every real browser score is actually decided ----

test("classification: canvas noise-per-read blends (not shown)", () => {
  const o = allShown();
  o.canvasClass = "noise-per-read";
  const row = findability(o, "other").rows.find((r) => r.label === "canvas drawing");
  assert.equal(row.state, "blended");
});

test("classification: a blocked local() font list blends", () => {
  const o = allShown();
  o.fontLocalBlocked = "blocked - protected";
  const row = findability(o, "other").rows.find((r) => r.label === "installed fonts");
  assert.equal(row.state, "blended");
});

test("classification: a value the browser family implies blends", () => {
  const fam = "firefox-rfp";
  const impliedKey = Object.keys(PRIORS.browsers[fam].implies || {})[0];
  const surf = PRIORS.surfaces.find((s) => s.k === impliedKey);
  assert.ok(surf, "firefox-rfp should imply at least one scored surface");
  const o = allShown();
  o[impliedKey] = String(PRIORS.browsers[fam].implies[impliedKey][0]);
  const row = findability(o, fam).rows.find((r) => r.label === surf.label);
  assert.equal(row.state, "blended", `${surf.label} should blend at its implied value`);
});

test("cross: a reading shown on one site and differing on the other is credited", () => {
  const a = allShown();
  const b = allShown();
  const surf = PRIORS.surfaces.find((s) => !s.noCrossDiff && !s.optional && !s.hashKey);
  b[surf.k] = "different_" + surf.k;
  const cross = findabilityCross(a, b, "other");
  assert.ok(cross.changedAcrossOrigins.includes(surf.label), `${surf.label} should be credited as changed`);
  assert.ok(cross.score >= findability(a, "other").score, "crediting a change cannot lower the cross score");
});

test("cross: a mask-blended reading stays blended across origins (B4 regression)", () => {
  const a = allShown();
  a.fontLocalBlocked = "blocked - protected";   // installed fonts -> blended single-site
  const b = allShown();
  b.fontSet = "a-different-font-hash";           // it "changes" across origins
  assert.equal(findability(a, "other").rows.find((r) => r.label === "installed fonts").state, "blended");
  const cross = findabilityCross(a, b, "other");
  const row = cross.rows.find((r) => r.label === "installed fonts");
  assert.equal(row.state, "blended", "a masked reading must not flip to shown cross-site");
  assert.ok(!cross.exposedStrong.includes("installed fonts"), "masked fonts must not become a cross-site leak");
});

// ---- redaction: decides what survives into a report the user is invited to share ----
// paRedactVal is default-deny. Only recognised safe primitives pass; anything else is masked,
// so a value nobody anticipated cannot leak the way the raw UA and GPU string once did.
const { paRedactVal } = new Function(grabFn("paRedactVal") + "\nreturn { paRedactVal };")();

test("redaction: high-entropy identifiers never survive a redacted report", () => {
  const leaky = [
    ["userAgent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/150.0.0.0 Safari/537.36"],
    ["WebGL unmasked renderer", "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x0000A7A1) Direct3D11)"],
    ["Intl timeZone", "Europe/Stockholm"],
    ["platform", "Win32"],
    ["screen.width x height", "1536 x 960"],
    ["OS / app tells (inferred from fonts)", "Windows 10+, Microsoft Office, Korean language pack"],
    ["uaFullVersion", "150.0.7871.181"],
    ["private/local IP leaked", "192.168.1.42"],
  ];
  for (const [k, v] of leaky) assert.equal(paRedactVal(k, v), "[redacted]", `${k} must not survive`);
});

test("redaction: default-deny, an unforeseen value is masked rather than passed through", () => {
  assert.equal(paRedactVal("a reading nobody anticipated", "some novel device string"), "[redacted]");
});

test("redaction: safe primitives survive so a redacted report is still readable", () => {
  for (const v of ["true", "false", "none", "absent", "granted", "48000", "1.25", "0.8 ms"])
    assert.equal(paRedactVal("some capability", v), v, `${v} should survive`);
});

test("redaction: a hash-named key is masked even when its value looks like a safe primitive", () => {
  assert.equal(paRedactVal("font list hash", "55f644fd"), "[redacted]");
});

// A hash of a fingerprint IS the fingerprint. These labels carry an FNV hash and contain no
// word the key-deny matches, so an allow-list for 8-hex values published them verbatim out of
// a report the UI calls safe to share.
test("redaction: an FNV hash is masked under a label that does not contain the word hash", () => {
  for (const k of ["canvas 2D toDataURL", "SVG getComputedTextLength+BBox", "webgl params", "textmetrics extras"])
    assert.equal(paRedactVal(k, "a6c73a99"), "[redacted]", `${k} must not publish its hash`);
});

// A full-precision float is a measurement, not a capability. Text metrics and audio readings
// are exactly this shape, and the number allow-list used to pass any length of decimal.
test("redaction: a full-precision measurement is masked, a short capability number is not", () => {
  for (const v of ["2.0000000000000004", "1234.56789012", "0.9999999999999999"])
    assert.equal(paRedactVal("textmetrics width", v), "[redacted]", `${v} is a measurement`);
  for (const v of ["48000", "44100", "1.25", "0.8 ms", "24", "-1"])
    assert.equal(paRedactVal("sample rate", v), v, `${v} should survive`);
});

// paIdentity composes the reported browser label from whoYouAre. An extension-class
// detection (kind:"addon") must read as "<base browser>, with <addon>", never as the browser itself.
const idCore = grabFn("paUABaseName") + "\n" + grabFn("paIdentity") + "\nreturn { paIdentity, paUABaseName };";
const makeIdentity = (ua) => new Function("navigator", idCore)({ userAgent: ua });

test("identity: a stock browser with no tell stays 'not identified'", () => {
  const { paIdentity } = makeIdentity("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/150.0.0.0 Safari/537.36");
  assert.equal(paIdentity({ whoYouAre: [] }), "not identified");
});

test("identity: an addon-only detection reads as base browser + addon, not the addon alone", () => {
  const { paIdentity } = makeIdentity("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/150.0.0.0 Safari/537.36");
  assert.equal(paIdentity({ whoYouAre: [{ what: "Privacy Badger", kind: "addon" }] }), "Chrome, with Privacy Badger");
});

test("identity: a browser detection is reported as-is", () => {
  const { paIdentity } = makeIdentity("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/150.0.0.0 Safari/537.36");
  assert.equal(paIdentity({ whoYouAre: [{ what: "Brave", kind: "browser" }] }), "Brave");
});

test("identity: browser and addons compose, multiple addons join with +", () => {
  const { paIdentity } = makeIdentity("Mozilla/5.0 (Windows NT 10.0; rv:140.0) Gecko/20100101 Firefox/140.0");
  assert.equal(
    paIdentity({ whoYouAre: [
      { what: "Firefox with resistFingerprinting active", kind: "browser" },
      { what: "JShelter or JavaScript Restrictor", kind: "addon" },
      { what: "Privacy Badger", kind: "addon" },
    ] }),
    "Firefox with resistFingerprinting active, with JShelter or JavaScript Restrictor + Privacy Badger",
  );
});

test("identity: an addon under an unrecognised UA still names the addon", () => {
  const { paIdentity } = makeIdentity("something nonstandard");
  assert.equal(paIdentity({ whoYouAre: [{ what: "Privacy Badger", kind: "addon" }] }), "an unrecognised browser, with Privacy Badger");
});

// The verdict sentence branched on the colour string paBandFor returns, comparing it against
// "var(--green)" and "var(--amber)". That function only ever returns "var(--gradeA)" through
// "var(--gradeF)", so both branches were dead and every browser was told it was easy to identify,
// including the ones that hide the most. It must key off the grade instead.
const sentenceSrc = grabFn("paBandFor");
test("verdict: the sentence is not decided by a colour string that paBandFor never returns", () => {
  const { paBandFor } = new Function(sentenceSrc + ";return { paBandFor };")();
  const bands = ["A", "B", "C", "D", "F"].map((g) => paBandFor(g).band);
  for (const b of bands) {
    assert.notEqual(b, "var(--green)", "a dead comparison target is back");
    assert.notEqual(b, "var(--amber)", "a dead comparison target is back");
  }
  const src = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(src, /color===\"var\(--green\)\"/,
    "the sentence must key off the grade, not a colour string that is never produced");
});

// "mixed" meant randomizer, so LibreWolf, Tor and Mullvad were all told "your browser shuffles its
// fingerprint per site; its real protection is cross-site, measured below" while the cross-site
// card beside it showed the identical score and 0 of 29 signals changed. Nothing shuffled. The
// claim is disproved by our own measurement, so it must not survive a cross-site result that found
// no change. With no cross-site result there is nothing to disprove it with, so it stands.
const { paIsRand } = new Function(grabFn("paIsRand") + ";return { paIsRand };")();

test("randomizer: a cross-site result showing no change disproves the per-site shuffle claim", () => {
  const mixed = { strategy: "mixed", whoYouAre: [] };
  assert.equal(paIsRand({ ...mixed }), true, "with no cross-site result the claim stands");
  assert.equal(paIsRand({ ...mixed, findabilityCross: { changedAcrossOrigins: [] } }), false,
    "measured across two origins and nothing changed, so it is not shuffling per site");
  assert.equal(paIsRand({ ...mixed, findabilityCross: { changedAcrossOrigins: ["canvas drawing"] } }), true,
    "something did change across origins, so the claim holds");
});

test("randomizer: Brave still reads as a randomizer once its values differ across origins", () => {
  const brave = { strategy: "randomization", whoYouAre: [{ what: "Brave" }],
    findabilityCross: { changedAcrossOrigins: ["canvas drawing", "GPU name"] } };
  assert.equal(paIsRand(brave), true);
});
