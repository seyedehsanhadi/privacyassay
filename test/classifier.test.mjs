// Every branch that decides shown, blended or refused. These run against PRIORS directly, so a
// classification change shows up here before any browser is launched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { grabVar, grabFn } from "./helpers/extract.mjs";

// Every branch that decides a state used to be reachable only through the whole-catalog tests,
// which assert a total. A total survives most single-branch mutations: deleting one mask
// condition, inverting the error-string test, or changing one PRIORS constant all left the
// suite green while silently rescoring real browsers. Each test here fails on exactly one
// mutation, so the branch it names cannot be removed without a red build.

const core = grabVar("PRIORS") + "\n" + grabFn("paTier") + "\n" + grabFn("paLetterboxed") + "\n"
  + grabFn("paIsLB") + "\n" + grabFn("paFamilyKey") + "\n" + grabFn("findability")
  + "\nreturn { findability, PRIORS, paFamilyKey };";
const { findability, PRIORS, paFamilyKey } = new Function(core)();

// Which family a run resolves to decides every uniform-value credit it can receive. identify()
// is wrapped in a try/catch that falls back to an empty list, so a throw inside it silently
// drops a Tor run onto the plain "firefox" entry and takes every tor-build credit with it.
const TOR_UA = "Mozilla/5.0 (Windows NT 10.0; rv:140.0) Gecko/20100101 Firefox/140.0";

// ---- family: which catalog a browser is scored against ----
test("family: a Tor or Mullvad build routes to tor-build, not to the Firefox entries below it", () => {
  assert.equal(paFamilyKey("Tor Browser", TOR_UA), "tor-build");
  assert.equal(paFamilyKey("Mullvad Browser", TOR_UA), "tor-build");
  assert.equal(paFamilyKey("Tor Browser | resistFingerprinting", TOR_UA), "tor-build",
    "a Tor build also answers the resistFingerprinting check, and must not fall through to it");
});

test("family: LibreWolf and a plain Firefox with the pref on route to firefox-rfp", () => {
  assert.equal(paFamilyKey("LibreWolf", TOR_UA), "firefox-rfp");
  assert.equal(paFamilyKey("resistFingerprinting", TOR_UA), "firefox-rfp");
});

test("family: with no detection the user agent alone decides, and no family credit is given", () => {
  assert.equal(paFamilyKey("", TOR_UA), "firefox");
  assert.equal(paFamilyKey("", "Mozilla/5.0 (Windows NT 10.0) Chrome/150.0.0.0 Safari/537.36"), "chromium");
  assert.equal(paFamilyKey("", "Mozilla/5.0 (Windows NT 10.0) Edg/150.0.0.0"), "chromium");
  assert.equal(paFamilyKey("", ""), "other");
  assert.equal(PRIORS.browsers.firefox.implies, undefined,
    "a Tor run that loses its detection lands here, so this entry must not carry tor-build credits");
});

test("family: every key paFamilyKey can return exists in PRIORS.browsers", () => {
  const cases = [["Brave", ""], ["Tor Browser", ""], ["LibreWolf", ""], ["Safari", ""],
    ["", TOR_UA], ["", "Chrome/1"], ["", ""]];
  for (const [n, u] of cases)
    assert.ok(PRIORS.browsers[paFamilyKey(n, u)], `${paFamilyKey(n, u)} is not a family in PRIORS`);
});

const SURFACE = Object.fromEntries(PRIORS.surfaces.map((s) => [s.k, s]));
const stateOf = (observed, family, key) => {
  const row = findability(observed, family).rows.find((r) => r.label === SURFACE[key].label);
  assert.ok(row, `no row for ${key}`);
  return row.state;
};

// ---- the six mask conditions, one test each ----

test("mask: canvas noise-per-read and uniform-masked blend, any other canvas value does not", () => {
  assert.equal(stateOf({ canvasClass: "noise-per-read" }, "other", "canvasClass"), "blended");
  assert.equal(stateOf({ canvasClass: "uniform-masked" }, "other", "canvasClass"), "blended");
  assert.equal(stateOf({ canvasClass: "unique" }, "other", "canvasClass"), "shown");
});

// These two are labelled "3D rendered image" and "rendered sound", and they now score the render
// itself. They used to score paHashClass's present/unavailable, so the reading answered whether
// audio WORKS rather than what it sounds like: a browser randomizing its audio per read showed a
// constant "present" and read as exposed, which is exactly the strategy Brave uses.
test("render failures remain unknown; measured changes blend",()=>{for(const k of ["webglRenderClass","audioRenderClass"]){assert.equal(stateOf({[k]:"abcdef01"},"other",k),"shown");for(const v of ["ERR","ERR:TypeError","unavailable",""])assert.equal(stateOf({[k]:v},"other",k),"unknown");assert.equal(stateOf({[k]:"unsupported"},"other",k),"refused");assert.equal(stateOf({[k]:"abcdef01",_noisy:{[k]:1}},"other",k),"blended");}});

test("a grid-aligned window does not prove letterboxing",()=>{for(const fam of Object.keys(PRIORS.browsers)){assert.equal(stateOf({innerSize:"1000x700"},fam,"innerSize"),"shown");assert.equal(stateOf({screenClass:"1000x700"},fam,"screenClass"),"shown");}});

test("zero taskbar geometry does not earn brand-based credit",()=>{for(const fam of Object.keys(PRIORS.browsers))assert.equal(stateOf({availFrame:"masked"},fam,"availFrame"),"shown");});

test("empty voice inventory does not prove masking",()=>{assert.equal(stateOf({speechVoices:"0 (ERR)"},"other","speechVoices"),"unknown");assert.equal(stateOf({speechVoices:"22 voices"},"other","speechVoices"),"shown");});

test("local-font failure cannot override independent enumeration",()=>{for(const fontLocalBlocked of ["blocked","protected",""])assert.equal(stateOf({fontSet:"9c1f8f43",fontLocalBlocked},"other","fontSet"),"shown");});

// ---- the refused branch: the tool's headline behaviour ----

test("unknown and confirmed unavailable outcomes are distinct",()=>{for(const v of ["ERR","ERR:SecurityError","n/a","unavailable","absent",""])assert.equal(stateOf({timezone:v},"other","timezone"),"unknown");for(const v of ["unsupported","blocked","blocked:SecurityError"])assert.equal(stateOf({timezone:v},"other","timezone"),"refused");});

test("refused: a value that merely starts with those letters is still shown", () => {
  assert.equal(stateOf({ timezone: "Europe/Berlin" }, "other", "timezone"), "shown");
  assert.equal(stateOf({ platform: "Linux x86_64" }, "other", "platform"), "shown");
});

// ---- the noisy branch: what classifies a per-read randomizer ----

test("noisy: a surface that differed between the two reads blends", () => {
  assert.equal(stateOf({ webglVendor: "Intel Inc.", _noisy: { webglVendor: 1 } }, "other", "webglVendor"), "blended");
  assert.equal(stateOf({ webglVendor: "Intel Inc." }, "other", "webglVendor"), "shown");
});

test("noisy: a noCrossDiff surface is never credited for differing, because a window can settle", () => {
  const nd = PRIORS.surfaces.filter((s) => s.noCrossDiff).map((s) => s.k);
  assert.deepEqual(nd.sort(), ["innerSize", "screenClass"]);
  for (const k of nd)
    assert.equal(stateOf({ [k]: "1512x845", _noisy: { [k]: 1 } }, "other", k), "shown",
      `${k} must not earn a blend from a size that moved`);
});

// ---- PRIORS.implies: the constants that produce Tor's and LibreWolf's scores ----

test("common constants remain observable regardless of inferred browser",()=>{for(const fam of Object.keys(PRIORS.browsers))for(const [key,value] of [["timezone","Atlantic/Reykjavik"],["cores",4],["colorDepth",24],["webglVendor","Mozilla"]])assert.equal(stateOf({[key]:value},fam,key),"shown");});

test("implies: a family's uniform value blends only for that family", () => {
  assert.equal(stateOf({ timezone: "Atlantic/Reykjavik" }, "chromium", "timezone"), "shown");
});

// firefox-rfp and tor-build both used to credit audioRenderClass = "present". Every browser that
// can render audio reports "present", including Chrome, so the credit rewarded working audio
// rather than any protection, and it funded 2 of the 21 non-optional points for Tor, Mullvad and
// LibreWolf. A credit has to be able to tell a protected browser from an unprotected one.
test("implies: a credit is never given for a value every working browser reports", () => {
  const vacuous = new Set(["present", "available", "supported", "ok", "true", "yes", "enabled"]);
  const bad = [];
  for (const fam of Object.keys(PRIORS.browsers)) {
    const imp = PRIORS.browsers[fam].implies || {};
    for (const k of Object.keys(imp))
      for (const v of imp[k])
        if (vacuous.has(String(v).toLowerCase())) bad.push(`${fam}.implies.${k} = ${v}`);
  }
  assert.deepEqual(bad, [], "this value does not distinguish a protected browser from an unprotected one");
});

test("missing values cannot acquire credit from browser metadata",()=>{for(const fam of Object.keys(PRIORS.browsers))assert.equal(stateOf({deviceMemory:"undefined"},fam,"deviceMemory"),"unknown");});

// ---- the two-origin comparison ----

test("cross: a probe that failed on the second origin is not a value that differed", () => {
  const { findabilityCross } = new Function(
    grabVar("PRIORS") + "\n" + grabFn("paTier") + "\n" + grabFn("paLetterboxed") + "\n" + grabFn("paIsLB")
    + "\n" + grabFn("findability") + "\n" + grabFn("findabilityCross") + "\nreturn { findabilityCross };")();
  const a = { timezone: "Europe/Berlin", platform: "Win32", cores: "8" };
  const real = findabilityCross(a, { timezone: "America/Denver", platform: "Win32", cores: "8" }, "other");
  assert.deepEqual(real.changedAcrossOrigins, ["timezone"], "a genuinely different value must still be credited");
  for (const broken of ["ERR", "ERR:SecurityError", "unavailable", "blocked", "n/a", "absent", "", "undefined"]) {
    const F = findabilityCross(a, { timezone: broken, platform: "Win32", cores: "8" }, "other");
    assert.deepEqual(F.changedAcrossOrigins, [], `${broken || "(empty)"} on origin B is a failure, not per-site variation`);
  }
});

// WebGPU names the GPU independently of WebGL, so it shares the GPU category: the category rule
// then lets it move a score only for a browser that hides canvas and WebGL and still answers
// WebGPU. Putting it in its own category would count one piece of hardware twice.
test("webgpu: both readings are scored, sit in the GPU category, and refuse when nothing was read", () => {
  for (const k of ["webgpuAdapter", "webgpuLimits"]) {
    const s = PRIORS.surfaces.find((x) => x.k === k);
    assert.ok(s, `${k} is not a scored reading`);
    assert.equal(s.group, "gpu", `${k} must share the GPU category, or one GPU is counted twice`);
    assert.equal(s.tier, 2);
    assert.equal(stateOf({ [k]: "ERR" }, "other", k), "unknown");
    assert.equal(stateOf({ [k]: "" }, "other", k), "unknown");
    assert.equal(stateOf({ [k]: "a6c73a99" }, "other", k), "shown");
  }
  const gpu = PRIORS.surfaces.filter((s) => s.group === "gpu");
  assert.equal(Math.max(...gpu.map((s) => s.tier)), 3,
    "canvas still caps the GPU category, so adding WebGPU did not change the denominator");
});

// The page shows its own working under "How this number was reached". It renders F.categories
// rather than recomputing, so these three have to stay true or the panel would contradict the
// score printed above it.
// ---- working: the breakdown the report shows must add up to the score ----
test("working: the per-category breakdown adds up to the score it is shown beside", () => {
  const cases = [
    ["all shown", Object.fromEntries(PRIORS.surfaces.filter((s) => !s.optional).map((s) => [s.k, "real_" + s.k]))],
    ["all refused", {}],
    ["mixed", { timezone: "Europe/Berlin", canvasClass: "unique", cores: "8", platform: "Win32" }],
  ];
  for (const [name, observed] of cases) {
    const F = findability(observed, "other");
    const summed = F.categories.reduce((a, c) => a + c.earned, 0);
    assert.ok(Math.abs(summed - F.earnedWeight) < 1e-9, `${name}: rows sum to ${summed}, header says ${F.earnedWeight}`);
    assert.equal(Math.round((100 * F.earnedWeight) / F.totalWeight), F.score, `${name}: the panel's arithmetic must reproduce the score`);
    for (const c of F.categories) {
      assert.ok(c.hiddenInside <= c.weightInside, `${name}/${c.id}: cannot hide more than the category holds`);
      assert.ok(c.earned >= 0 && c.earned <= c.weight + 1e-9, `${name}/${c.id}: earned ${c.earned} outside 0..${c.weight}`);
    }
  }
});

test("working: every category in the breakdown has a display name", () => {
  const src = grabVar("PAGRP");
  const F = findability({}, "other");
  for (const c of F.categories)
    assert.match(src, new RegExp("\\b" + c.id + "\\s*:"), `${c.id} has no label in PAGRP, so the panel would print a raw key`);
});

// ---- the ceiling the catalog imposes ----
// A reading with no uniform value in any family can only be credited by being refused, so the
// readings that have none set a hard cap on the score. METHODOLOGY states that cap; if a credit
// is added or dropped without updating it, the published ceiling silently becomes wrong.
test("only confirmed outcomes can reach the score ceiling",()=>{const o={};for(const s of PRIORS.surfaces)if(!s.optional)o[s.k]="unsupported";assert.equal(findability(o,"other").score,100);delete o.fontSet;const f=findability(o,"other");assert.equal(f.grade,"I");assert.ok(f.score<100);assert.equal(f.upperBound,100);});

// ---- the row shape the methodology promises ----

test("rows: every row carries its catalog weight, and tier is zero unless the reading is shown", () => {
  const F = findability({ timezone: "Europe/Berlin", canvasClass: "noise-per-read" }, "other");
  const bad = F.rows.filter((r) => typeof r.weight !== "number" || r.weight < 1 || r.weight > 3);
  assert.deepEqual(bad.map((r) => r.label), [], "a row without its weight cannot be recomputed by hand");
  for (const r of F.rows) assert.equal(r.tier, r.state === "shown" ? r.weight : 0);
});
