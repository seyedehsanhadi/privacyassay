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
  assert.deepEqual(PRIORS.browsers.firefox.implies, { deviceMemory: ["undefined"] },
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

test("mask: an unavailable render class blends for webgl and audio only", () => {
  assert.equal(stateOf({ webglRenderClass: "unavailable" }, "other", "webglRenderClass"), "blended");
  assert.equal(stateOf({ audioRenderClass: "unavailable" }, "other", "audioRenderClass"), "blended");
  assert.equal(stateOf({ webglRenderClass: "3f2a11bc" }, "other", "webglRenderClass"), "shown");
});

test("mask: a letterboxed size blends only for a family whose build letterboxes", () => {
  const lb = { screenClass: "1000x700", innerSize: "1000x700" };
  const boxed = Object.keys(PRIORS.browsers).filter((k) => PRIORS.browsers[k].letterboxes);
  assert.ok(boxed.length, "no family declares letterboxes, so this credit is unreachable");
  for (const fam of boxed) {
    assert.equal(stateOf(lb, fam, "screenClass"), "blended", `${fam} should credit a letterboxed screen`);
    assert.equal(stateOf(lb, fam, "innerSize"), "blended", `${fam} should credit a letterboxed window`);
  }
  assert.equal(stateOf(lb, "other", "screenClass"), "shown", "a browser that does not letterbox gets no credit");
  assert.equal(stateOf({ screenClass: "1536x864", innerSize: "1536x864" }, boxed[0], "screenClass"), "shown",
    "an off-grid size is not a letterbox even in a family that letterboxes");
});

test("mask: availFrame masked blends, a real taskbar size does not", () => {
  assert.equal(stateOf({ availFrame: "masked" }, "other", "availFrame"), "blended");
  assert.equal(stateOf({ availFrame: "0x48" }, "other", "availFrame"), "shown");
});

test("mask: zero voices blends, a real voice count does not", () => {
  assert.equal(stateOf({ speechVoices: "0 (none)" }, "other", "speechVoices"), "blended");
  assert.equal(stateOf({ speechVoices: "22 voices" }, "other", "speechVoices"), "shown");
});

test("mask: a blocked local() font probe blends the font list it was read with", () => {
  assert.equal(stateOf({ fontSet: "9c1f8f43", fontLocalBlocked: "blocked" }, "other", "fontSet"), "blended");
  assert.equal(stateOf({ fontSet: "9c1f8f43", fontLocalBlocked: "protected" }, "other", "fontSet"), "blended");
  assert.equal(stateOf({ fontSet: "9c1f8f43", fontLocalBlocked: "" }, "other", "fontSet"), "shown");
});

// ---- the refused branch: the tool's headline behaviour ----

test("refused: an error or unavailable string is refused, never shown", () => {
  for (const v of ["ERR", "ERR:SecurityError", "n/a", "unavailable", "blocked", "absent"])
    assert.equal(stateOf({ timezone: v }, "other", "timezone"), "refused", `${v} must not read as a value`);
});

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

test("implies: the documented uniform values are the ones the classifier credits", () => {
  const expect = [
    ["firefox-rfp", "timezone", "Atlantic/Reykjavik"],
    ["firefox-rfp", "cores", "4"],
    ["firefox-rfp", "audioRate", "44100"],
    ["firefox-rfp", "colorDepth", "24"],
    ["firefox-rfp", "webglVendor", "Mozilla"],
    ["tor-build", "timezone", "Atlantic/Reykjavik"],
    ["tor-build", "cores", "8"],
  ];
  for (const [fam, key, value] of expect) {
    const imp = PRIORS.browsers[fam] && PRIORS.browsers[fam].implies;
    assert.ok(imp && imp[key], `${fam}.implies.${key} is gone; every ${fam} user is now scored as exposed there`);
    assert.ok(imp[key].map(String).includes(value),
      `${fam}.implies.${key} no longer lists ${value}, so a real ${fam} reading would score shown`);
    assert.equal(stateOf({ [key]: value }, fam, key), "blended");
  }
});

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

test("implies: every implied value is a string the classifier can actually match", () => {
  const bad = [];
  for (const fam of Object.keys(PRIORS.browsers)) {
    const imp = PRIORS.browsers[fam].implies || {};
    for (const k of Object.keys(imp)) {
      if (!SURFACE[k]) { bad.push(`${fam}.implies.${k} names no surface`); continue; }
      for (const v of imp[k])
        if (stateOf({ [k]: v }, fam, k) !== "blended") bad.push(`${fam}.implies.${k} = ${v} does not blend`);
    }
  }
  assert.deepEqual(bad, []);
});

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
    assert.equal(stateOf({ [k]: "ERR" }, "other", k), "refused");
    assert.equal(stateOf({ [k]: "" }, "other", k), "refused");
    assert.equal(stateOf({ [k]: "a6c73a99" }, "other", k), "shown");
  }
  const gpu = PRIORS.surfaces.filter((s) => s.group === "gpu");
  assert.equal(Math.max(...gpu.map((s) => s.tier)), 3,
    "canvas still caps the GPU category, so adding WebGPU did not change the denominator");
});

// ---- the ceiling the catalog imposes ----
// A reading with no uniform value in any family can only be credited by being refused, so the
// readings that have none set a hard cap on the score. METHODOLOGY states that cap; if a credit
// is added or dropped without updating it, the published ceiling silently becomes wrong.
test("ceiling: the readings with no uniform value in any family cap the score where the document says", () => {
  const NAMED = ["element geometry (subpixel)", "MathML render size", "text metrics", "font measurement",
    "media codecs", "rendered sound", "device details (client hints)"];
  const byLabel = Object.fromEntries(PRIORS.surfaces.map((s) => [s.label, s]));
  const credited = new Set();
  for (const f of Object.keys(PRIORS.browsers))
    for (const k of Object.keys(PRIORS.browsers[f].implies || {})) credited.add(k);

  for (const label of NAMED) {
    const s = byLabel[label];
    assert.ok(s, `${label} is named in METHODOLOGY but is not a reading`);
    assert.ok(!credited.has(s.k), `${label} now has a uniform value somewhere, so the documented ceiling is stale`);
  }

  // Run the real scorer rather than re-deriving the formula here: a test that recomputes the
  // arithmetic its own way keeps passing when the scorer changes underneath it.
  const observed = {};
  for (const s of PRIORS.surfaces) {
    if (s.optional) continue;
    observed[s.k] = NAMED.includes(s.label) ? "a_real_value" : undefined; // undefined reads as refused
  }
  const F = findability(observed, "other");
  const shown = F.rows.filter((r) => r.state === "shown").map((r) => r.label).sort();
  assert.deepEqual(shown, [...NAMED].sort(), "only the seven uncreditable readings should be shown here");
  assert.equal(F.score, 70, "the documented ceiling for a browser that answers all seven and hides everything else");

  const total = Object.values(PRIORS.surfaces.filter((s) => !s.optional)
    .reduce((a, s) => (a[s.group] = Math.max(a[s.group] || 0, s.tier), a), {}))
    .reduce((a, b) => a + b, 0);
  assert.equal(total, 21, "the non-optional denominator the document states");
});

// ---- the row shape the methodology promises ----

test("rows: every row carries its catalog weight, and tier is zero unless the reading is shown", () => {
  const F = findability({ timezone: "Europe/Berlin", canvasClass: "noise-per-read" }, "other");
  const bad = F.rows.filter((r) => typeof r.weight !== "number" || r.weight < 1 || r.weight > 3);
  assert.deepEqual(bad.map((r) => r.label), [], "a row without its weight cannot be recomputed by hand");
  for (const r of F.rows) assert.equal(r.tier, r.state === "shown" ? r.weight : 0);
});
