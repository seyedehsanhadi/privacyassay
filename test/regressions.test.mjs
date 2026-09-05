// Each test here pins one defect found in the August 2026 audit. Every one was written failing
// against the code as it stood, then the fix was made minimal enough to turn only that test green.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { grabVar, grabFn } from "./helpers/extract.mjs";

const HTML = readFileSync(new URL("../index.html", import.meta.url), "utf8");

const core = grabVar("PRIORS") + "\n" + grabFn("paTier") + "\n" + grabFn("paLetterboxed") + "\n"
  + grabFn("paIsLB") + "\n" + grabFn("findability") + "\n"
  + "return { findability, paLetterboxed, PRIORS };";
const { findability, paLetterboxed, PRIORS } = new Function(core)();

function allShown() {
  const o = {};
  PRIORS.surfaces.forEach((s) => { o[s.k] = "shown_" + s.k; });
  o.canvasClass = "realpixels";
  o.webglRenderClass = "present";
  o.audioRenderClass = "present";
  o.availFrame = "40x40";
  o.speechVoices = "22 voices";
  o.fontLocalBlocked = "";
  o.fontSet = "abc";
  return o;
}

// A1. A desktop with no reserved screen area is not a defence. Windows with an auto-hide taskbar,
// a tiling WM and essentially every phone report availWidth === width, and used to collect the
// same credit as a browser that deliberately masks the frame.
test("taskbar auto-hide and browser brand do not prove protection",()=>{const base=findability(allShown(),"other").score;const o={...allShown(),availFrame:"masked"};assert.equal(findability(o,"other").score,base);assert.equal(findability(o,"brave").score,base);});

// A2. Firefox steppedSize uses stepping 200 on BOTH axes above 1600, and 50 up to and including
// 500. The old width arm used a strict <500, so a 500px letterboxed width was scored as exposed.
test("paLetterboxed accepts every size Firefox letterboxing can emit", () => {
  const stepped = (d, isW) => {
    let s;
    if (d <= 50) return d;
    else if (d <= 500) s = 50;
    else if (d <= 1600) s = isW ? 200 : 100;
    else s = 200;
    return d - (d % s);
  };
  const widths = new Set(), heights = new Set();
  for (let d = 51; d <= 4000; d++) { widths.add(stepped(d, true)); heights.add(stepped(d, false)); }
  for (const w of widths) for (const h of [600, 900, 1600, 1800, 2000]) {
    if (w > 50 && h > 50) assert.ok(paLetterboxed(w, h), `reachable letterbox ${w}x${h} rejected`);
  }
  assert.ok(paLetterboxed(500, 600), "width 500 is a reachable stepped output");
  // Heights 1601..1799 floor to 1600, so 1700 is not reachable and must not be accepted.
  assert.equal(paLetterboxed(1400, 1700), false, "1700 is not a reachable letterboxed height");
});

// A3. FNV-1a needs Math.imul. With a plain multiply the product leaves the exact-integer range of
// a double and low bits are lost, which is why the file's own fnv()/fnvBytes() use imul.
test("the canvas per-read probe uses a real FNV-1a", () => {
  const src = /function cvh\(\)\{[\s\S]*?\n/.exec(HTML);
  assert.ok(src, "cvh() not found");
  assert.ok(/Math\.imul\(h,\s*16777619\)/.test(src[0]),
    "cvh must multiply with Math.imul, not *");
  assert.ok(!/h\s*=\s*\(h\s*\*\s*16777619\)/.test(src[0]),
    "the float multiply must be gone");
});

// A4. paIsRand is declared inside the page IIFE, so the CLI evaluating it in global scope always
// got "undefined" and silently reported randomizer:false for every browser including Brave.
test("paIsRand is reachable from outside the IIFE", () => {
  assert.ok(/window\.__paIsRand\s*=\s*paIsRand/.test(HTML),
    "paIsRand must be exported on window for the CLI to read");
  const cli = readFileSync(new URL("../bin/privacyassay.mjs", import.meta.url), "utf8");
  assert.ok(/window\.__paIsRand/.test(cli), "the CLI must read the exported symbol");
  assert.ok(!/typeof paIsRand\s*===\s*"function"/.test(cli),
    "the bare identifier is invisible in global scope and must not be probed");
});

// A5. Claiming a per-site shuffle is a measurement, not an inference from the brand name.
test("paIsRand does not infer randomization from the browser name", () => {
  const fn = grabFn("paIsRand");
  assert.ok(!/Brave/i.test(fn), "the Brave name leg must be gone; strategy is measurement-derived");
  const paIsRand = new Function(grabFn("paIsRand") + "\nreturn paIsRand;")();
  assert.equal(paIsRand({ strategy: "uniformity", whoYouAre: [{ what: "Brave 1.93" }] }), false);
  assert.equal(paIsRand({ strategy: "randomization" }), true);
  assert.equal(paIsRand({ strategy: "randomization", findabilityCross: { changedAcrossOrigins: [] } }), false);
});

// A6. whoYouAre embeds live readings as free text (WebGL vendor, plugin count), so it has to obey
// the same redaction gate as every field beside it.
test("whoYouAre is redacted like its neighbours in the full export", () => {
  const m = /whoYouAre:\s*([^,]+),/.exec(HTML);
  assert.ok(m, "whoYouAre export line not found");
  assert.ok(/red\s*\?/.test(m[1]), "whoYouAre must be gated on the redact flag");
});

// A7. The linkability badge compared changed-rows against ALL rows, but only rows shown on the
// first origin can change. Tor and Mullvad expose 6 of 29, so the badge could never go green.
test("linkability compares changed rows against the rows that could change", () => {
  const fn = grabFn("paCrossData");
  assert.ok(/shownTotal|eligible/.test(fn),
    "paCrossData must derive a denominator of rows eligible to change");
  assert.ok(!/anon\s*<\s*Math\.max\(3,\s*Math\.round\(total\s*\*\s*0\.2\)\)/.test(fn),
    "the all-rows denominator must be gone");
});

// A8. A pref that disables WebGL is not an extension. Hardened Firefox and LibreWolf ship WebGPU
// with WebGL off, and were told an extension they do not have was installed.
test("a WebGL-off pref is not reported as an extension", () => {
  const fn = grabFn("identify");
  const m = /hit\("[^"]*NoScript[\s\S]*?\);/.exec(fn);
  assert.ok(m, "the NoScript hit was not found");
  assert.ok(!/,\s*"addon"\s*\)/.test(m[0]),
    "a pref-or-extension inference must not be classified as a confirmed addon");
  assert.ok(/pref|setting/i.test(m[0]),
    "the wording must admit a pref can cause it");
});

// A9. An unmeasured timer must not print as a measured zero, least of all on the hardened
// browsers whose whole point is that the timer is coarse.
test("performance.now resolution never prints a fabricated 0 ms", () => {
  const fn = grabFn("collectTiming");
  assert.ok(!/isFinite\(mn\)\?mn\.toFixed\(5\):"0"/.test(fn.replace(/\s/g, "")),
    "the Infinity case must not fall back to the string 0");
  assert.ok(/not measurable|no tick/i.test(fn),
    "the no-tick case must say so rather than print a number");
});

// A10. The card said "no response" while the probe was still running.
test("the cross-site card distinguishes measuring from failed", () => {
  const fn = grabFn("paCrossData");
  assert.ok(/measuring:\s*true/.test(fn) && /crossFailed\s*===\s*"measuring"/.test(fn),
    "the measuring sentinel must return its own shape, not failed:true");
});
