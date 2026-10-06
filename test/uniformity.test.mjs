// Uniformity credit: a family's fixed values count as hidden only when the same standard value shows on
// both origins. A randomizer is credited for differing; a uniformizer for not differing from the standard.
import { test } from "node:test";
import assert from "node:assert/strict";
import { grabVar, grabFn } from "./helpers/extract.mjs";

const core = grabVar("PRIORS") + "\n" + grabVar("PA_STD") + "\n" + grabFn("paTier") + "\n" + grabFn("paLetterboxed")
  + "\n" + grabFn("paIsLB") + "\n" + grabFn("findability") + "\n" + grabFn("findabilityCross") + "\nreturn { findabilityCross, PRIORS };";
const { findabilityCross, PRIORS } = new Function(core)();
const LABEL = Object.fromEntries(PRIORS.surfaces.map((s) => [s.k, s.label]));
const row = (F, k) => F.rows.find((r) => r.label === LABEL[k]);

const RFP = { cores: "4", timezone: "Atlantic/Reykjavik", colorDepth: "24", devicePixelRatio: "2", maxTouchPoints: "10",
  audioRate: "44100", languages: "en-US", availFrame: "masked", innerSize: "1400x700", screenClass: "1400x700" };

test("uniform: standard values identical on both origins are hidden in a Tor build", () => {
  const F = findabilityCross(RFP, { ...RFP }, "tor-build");
  for (const k of Object.keys(RFP)) {
    assert.equal(row(F, k).state, "blended", k);
    assert.equal(row(F, k).mask, "uniform", k);
  }
  assert.equal(F.uniformAcrossOrigins.length, Object.keys(RFP).length);
});

test("uniform: the same values earn nothing for a family with no standard profile", () => {
  for (const fam of ["chromium", "firefox", "brave", "other"]) {
    const F = findabilityCross(RFP, { ...RFP }, fam);
    for (const k of Object.keys(RFP)) assert.equal(row(F, k).state, "shown", `${fam} ${k}`);
    assert.deepEqual(F.uniformAcrossOrigins, []);
  }
});

test("uniform: a standard value that differs between the origins is not uniformity", () => {
  const F = findabilityCross(RFP, { ...RFP, cores: "8", timezone: "UTC" }, "tor-build");
  assert.equal(row(F, "cores").mask, "varied");
  assert.equal(F.uniformAcrossOrigins.includes(LABEL.cores), false);
});

test("uniform: a value outside the family's standard set is shown even when identical", () => {
  const odd = { ...RFP, cores: "12", timezone: "Europe/Stockholm", devicePixelRatio: "1.25", audioRate: "48000" };
  const F = findabilityCross(odd, { ...odd }, "tor-build");
  for (const k of ["cores", "timezone", "devicePixelRatio", "audioRate"]) assert.equal(row(F, k).state, "shown", k);
});

test("uniform: window and screen size need the letterbox grid, which only a Tor build enforces", () => {
  const lw = findabilityCross({ ...RFP, innerSize: "1399x800", screenClass: "1399x800" }, { ...RFP, innerSize: "1399x800", screenClass: "1399x800" }, "firefox-rfp");
  assert.equal(row(lw, "innerSize").state, "shown");
  const grid = findabilityCross(RFP, { ...RFP }, "firefox-rfp");
  assert.equal(row(grid, "innerSize").state, "shown", "LibreWolf does not letterbox, so a grid-shaped window is luck");
  const off = findabilityCross({ ...RFP, innerSize: "1399x800", screenClass: "1399x800" }, { ...RFP, innerSize: "1399x800", screenClass: "1399x800" }, "tor-build");
  assert.equal(row(off, "innerSize").state, "shown");
  const split = findabilityCross({ ...RFP, screenClass: "1920x1080" }, { ...RFP, screenClass: "1920x1080" }, "tor-build");
  assert.equal(row(split, "screenClass").state, "shown", "a screen size that differs from the window is not RFP");
});

test("uniform: fonts are not credited because the tool cannot verify the bundled set", () => {
  const f = { ...RFP, fontSet: "abc", textMetrics: "x", measureTextW: "y" };
  const F = findabilityCross(f, { ...f }, "tor-build");
  for (const k of ["fontSet", "textMetrics", "measureTextW"]) assert.equal(row(F, k).state, "shown", k);
});

test("uniform: a single-site run never earns uniformity credit", () => {
  const F = findabilityCross(RFP, null, "tor-build");
  for (const k of Object.keys(RFP)) assert.notEqual(row(F, k).mask, "uniform", k);
});
