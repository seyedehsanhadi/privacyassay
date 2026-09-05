// Deliberate sabotage: failed readings must stay unknown and earn no protection credit.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../helpers/server.mjs";
import { launch, runAudit } from "../helpers/browser.mjs";

// Fault injection must produce unknown outcomes without protection credit.

const OVERRIDE = (prop, mode) => `
(function(){
  var target = ${prop.split(".").slice(0, -1).join(".") || "window"};
  var name = ${JSON.stringify(prop.split(".").pop())};
  var impl;
  if (${JSON.stringify(mode)} === "throw") impl = function(){ throw new Error("injected"); };
  else if (${JSON.stringify(mode)} === "undefined") impl = function(){ return undefined; };
  else if (${JSON.stringify(mode)} === "constant") impl = function(){ return 4; };
  else impl = function(){ return Math.floor(Math.random()*1e9); };
  try { Object.defineProperty(target, name, { get: impl, configurable: true }); } catch(e) {}
})();`;

// probeExpr lets a caller confirm its injection actually took. An injection that silently fails
// makes the test pass while proving nothing, which is how a broken helper survived here unnoticed.
async function scoreWith(port, preload, probeExpr) {
  const page = await launch({ port, preload });
  try {
    const kit = await runAudit(page);
    const patched = probeExpr ? await page.ev(probeExpr) : undefined;
    return { complete: kit.findability.complete, score: kit.findability.score, rows: kit.findability.rows, patched };
  } finally { await page.close(); }
}

// ---- single probes: one surface sabotaged at a time ----
test("inject: a probe that throws is never scored as shown", async () => {
  const srv = await startServer();
  try {
    const { rows } = await scoreWith(srv.port, OVERRIDE("navigator.hardwareConcurrency", "throw"));
    const row = rows.find((r) => r.label === "CPU cores");
    assert.ok(row, "CPU cores should be a scored reading");
    assert.equal(row.state, "unknown", "a throwing read must not be credited to the tracker as a real value");
  } finally { srv.close(); }
});

test("inject: a probe that throws makes the result incomplete", async () => {
  const srv = await startServer();
  try {
    const thrown = await scoreWith(srv.port, OVERRIDE("navigator.hardwareConcurrency", "throw"));
    assert.equal(thrown.complete, false);
  } finally { srv.close(); }
});

test("inject: breaking several readings leaves an incomplete result", async () => {
  const srv = await startServer();
  const all = ["navigator.hardwareConcurrency", "navigator.deviceMemory", "navigator.maxTouchPoints", "screen.colorDepth"]
    .map((p) => OVERRIDE(p, "throw")).join("\n");
  try {
    const broken = await scoreWith(srv.port, all);
    assert.equal(broken.complete, false);
    for (const label of ["CPU cores", "device memory", "touch points", "colour depth"]) {
      assert.equal(broken.rows.find(r => r.label === label)?.state, "unknown", label);
    }
  } finally { srv.close(); }
});

test("inject: a per-read random value is classified as blended, not shown", async () => {
  const srv = await startServer();
  try {
    const { rows } = await scoreWith(srv.port, OVERRIDE("navigator.hardwareConcurrency", "random"));
    const row = rows.find((r) => r.label === "CPU cores");
    assert.equal(row.state, "blended", "repeatedly changing values are marked as changed");
  } finally { srv.close(); }
});

test("inject: the score never leaves the range 0 to 100 under any injection", async () => {
  const srv = await startServer();
  const modes = ["throw", "undefined", "constant", "random"];
  try {
    for (const mode of modes) {
      const { score } = await scoreWith(srv.port, OVERRIDE("navigator.hardwareConcurrency", mode));
      assert.ok(Number.isInteger(score) && score >= 0 && score <= 100, `mode ${mode} produced ${score}`);
    }
  } finally { srv.close(); }
});

// Fault injection must produce unknown outcomes without protection credit.

const METHOD_BREAK = (targetExpr, name, mode) => `
(function(){
  try{
    var t = ${targetExpr};
    var impl = (${JSON.stringify(mode)} === "throw")
      ? function(){ throw new Error("injected"); }
      : function(){ return undefined; };
    Object.defineProperty(t, ${JSON.stringify(name)}, { value: impl, configurable: true, writable: true });
  }catch(e){}
})();`;

// navigator.userAgentData returns a FRESH NavigatorUAData on every access - in Chrome
// navigator.userAgentData === navigator.userAgentData is false - so defining the method on the
// object this preload sees patches a throwaway and the page still gets the real values. The
// patch has to go on the prototype. An earlier instance-patching version of this helper injected
// nothing, which is why any test using it passed without proving anything.
const UACH_BREAK = (mode) => `
(function(){
  try{
    if(typeof NavigatorUAData === "undefined") return;
    var impl = (${JSON.stringify(mode)} === "sync-throw")
      ? function(){ throw new Error("injected"); }
      : (${JSON.stringify(mode)} === "throw")
        ? function(){ return Promise.reject(new Error("injected")); }
        : function(){ return Promise.resolve(undefined); };
    Object.defineProperty(NavigatorUAData.prototype, "getHighEntropyValues", { value: impl, configurable: true, writable: true });
    window.__UACH_PATCHED = true;
  }catch(e){}
})();`;

// Surfaces reachable as a plain getter (navigator/screen/window property,
// or a real getter on a built-in prototype) - the brief's OVERRIDE helper
// applies directly. Excludes deviceMemory/platform/languages (see above).
const PROP_SURFACES = [
  ["CPU cores", "navigator.hardwareConcurrency"],
  ["touch points", "navigator.maxTouchPoints"],
  ["colour depth", "screen.colorDepth"],
  ["display scaling", "window.devicePixelRatio"],
  ["screen size", "screen.width"],
  ["screen size", "screen.height"],
  ["window size", "window.innerWidth"],
  ["window size", "window.innerHeight"],
  ["taskbar size", "screen.width"],
  ["sound sample rate", "AudioContext.prototype.sampleRate"],
  // Both WebGPU readings come from navigator.gpu, and the collector writes "(empty)" for an
  // adapter field the browser withheld. Hashing three of those would produce a normal-looking
  // fingerprint for a browser that answered nothing, so this pair guards that normalisation.
  ["WebGPU adapter", "navigator.gpu"],
  ["WebGPU limits", "navigator.gpu"],
];
const PROP_LABELS = [...new Set(PROP_SURFACES.map((s) => s[0]))];
function propPreload(mode) {
  const paths = [...new Set(PROP_SURFACES.map((s) => s[1]))];
  return paths.map((p) => OVERRIDE(p, mode)).join("\n");
}

// Surfaces reached through a method rather than a plain property read.
const METHOD_SURFACES = [
  ["canvas drawing", "CanvasRenderingContext2D.prototype", "getImageData"],
  ["GPU name", "WebGLRenderingContext.prototype", "getParameter"],
  ["GPU limits", "WebGLRenderingContext.prototype", "getParameter"],
  ["GPU feature list", "WebGLRenderingContext.prototype", "getSupportedExtensions"],
  ["3D rendered image", "WebGLRenderingContext.prototype", "readPixels"],
  ["element geometry (subpixel)", "Element.prototype", "getBoundingClientRect"],
  ["MathML render size", "Element.prototype", "getBoundingClientRect"],
  ["SVG text metrics", "SVGTextContentElement.prototype", "getComputedTextLength", ["SVGGraphicsElement.prototype", "getBBox"]],
  ["text metrics", "CanvasRenderingContext2D.prototype", "measureText"],
  ["font measurement", "CanvasRenderingContext2D.prototype", "measureText"],
  ["media codecs", "MediaSource", "isTypeSupported"],
  ["installed voices", "window.speechSynthesis", "getVoices"],
  ["timezone", "Intl.DateTimeFormat.prototype", "resolvedOptions"],
  ["rendered sound", "OfflineAudioContext.prototype", "createOscillator"],
];
// installed fonts is covered by its own offsetWidth test above, and device details by the
// synchronous-throw test at the end of this file, so there is no all-at-once method preload:
// breaking every DOM method simultaneously breaks the page rather than the probes.

let sharedServer = null;
async function getServer() {
  if (!sharedServer) sharedServer = await startServer();
  return sharedServer;
}
after(() => { if (sharedServer) sharedServer.close(); });
let cleanCache = null;
async function getClean() {
  if (cleanCache) return cleanCache;
  const srv = await getServer();
  cleanCache = await scoreWith(srv.port, null);
  return cleanCache;
}

function diffBatch(rows, cleanRows, labels) {
  const noEffect = [];
  const invalidState = [];
  const absent = [];
  for (const label of labels) {
    const row = rows.find((r) => r.label === label);
    const cleanRow = cleanRows.find((r) => r.label === label);
    if (!row || !cleanRow) { noEffect.push(`${label} (row missing from response)`); continue; }
    if (row.state !== "unknown") invalidState.push(`${label} (state=${row.state})`);
    // An unavailable baseline cannot prove an injection changed a measurement. It must still
    // remain unknown after sabotage, and it does not count toward the coverage floor below.
    if (cleanRow.state === "unknown" || cleanRow.state === "refused") { absent.push(label); continue; }
    if (row.value === cleanRow.value && row.state === cleanRow.state) noEffect.push(`${label} (value unchanged: ${JSON.stringify(row.value)})`);
  }
  return { noEffect, invalidState, absent };
}

function assertBatch(kind, { noEffect, invalidState, absent }, labels) {
  assert.equal(noEffect.length + invalidState.length, 0,
    `gaps (no observable effect): ${noEffect.join(" | ") || "none"} || failed readings not unknown after ${kind}: ${invalidState.join(" | ") || "none"}`);
  assert.ok(labels.length - absent.length >= Math.ceil(labels.length * 0.6),
    `only ${labels.length - absent.length} of ${labels.length} surfaces have usable baselines, so the ${kind} matrix barely tested anything: ${absent.join(", ")}`);
}

// ---- matrix: every scored surface, sabotaged on its own ----
test("inject-matrix: unavailable baselines cannot hide credited failures or satisfy coverage", () => {
  const label = "WebGPU adapter", labels = [label];
  const unknown = { label, state: "unknown", value: "ERR:repeat-incomplete" };
  for (const state of ["unknown", "refused"]) {
    const clean = { ...unknown, state };
    const batch = diffBatch([unknown], [clean], labels);
    assert.deepEqual(batch, { noEffect: [], invalidState: [], absent: labels });
    assert.throws(() => assertBatch("throw", batch, labels), /barely tested anything/);
    for (const badState of ["shown", "blended", "refused"]) {
      assert.equal(diffBatch([{ ...unknown, state: badState }], [clean], labels).invalidState.length, 1);
    }
  }
  const shown = { label, state: "shown", value: "adapter" };
  assert.equal(diffBatch([shown], [shown], labels).noEffect.length, 1);
  assert.equal(diffBatch([], [shown], labels).noEffect.length, 1);
  assertBatch("throw", diffBatch([unknown], [shown], labels), labels);
});

test("inject-matrix: a browser without a usable WebGPU adapter confirms no identity but leaves limits unknown", async () => {
  const srv = await getServer();
  const noAdapter = 'Object.defineProperty(navigator,"gpu",{configurable:true,value:{requestAdapter:async function(){return null;}}});';
  const clean = await scoreWith(srv.port, noAdapter);
  assert.equal(clean.rows.find(r => r.label === "WebGPU adapter")?.state, "refused");
  assert.equal(clean.rows.find(r => r.label === "WebGPU limits")?.state, "unknown");
  for (const mode of ["throw", "undefined"]) {
    const broken = await scoreWith(srv.port, noAdapter + propPreload(mode));
    assert.equal(broken.complete, false);
    assertBatch(mode, diffBatch(broken.rows, clean.rows, PROP_LABELS), PROP_LABELS);
  }
});

test("inject-matrix: property surfaces (throw) - never shown, failed readings stay unknown", async () => {
  const srv = await getServer();
  const clean = await getClean();
  const { rows, score } = await scoreWith(srv.port, propPreload("throw"));
  const batch = diffBatch(rows, clean.rows, PROP_LABELS);

  assertBatch("throw", batch, PROP_LABELS);
});

test("inject-matrix: property surfaces (undefined) - never shown, failed readings stay unknown", async () => {
  const srv = await getServer();
  const clean = await getClean();
  const { rows, score } = await scoreWith(srv.port, propPreload("undefined"));
  const batch = diffBatch(rows, clean.rows, PROP_LABELS);

  assertBatch("undefined", batch, PROP_LABELS);
});

// installed fonts (tier 3, the only tier-3 reading in its category) is measured through the
// offsetWidth getter rather than a callable method, so the per-method matrix above never reaches
// it, and the override that would have covered it sat in a helper nothing called. With the getter
// returning undefined the detector finds nothing, and fnv("") is a normal-looking hash: the
// heaviest font reading reported a broken probe as a font list handed over.
test("inject: a broken font measurement is never scored as a font list handed over", async () => {
  const srv = await getServer();
  const clean = await getClean();
  for (const mode of ["throw", "undefined"]) {
    const { rows, score } = await scoreWith(srv.port, OVERRIDE("HTMLElement.prototype.offsetWidth", mode));
    const row = rows.find((r) => r.label === "installed fonts");
    const cleanRow = clean.rows.find((r) => r.label === "installed fonts");
    assert.ok(row && cleanRow, "the installed fonts reading must be present in both runs");
    assert.notEqual(row.value, cleanRow.value, `breaking offsetWidth (${mode}) had no observable effect on the font list`);
    assert.equal(row.state, "unknown", `a font list read through a broken getter (${mode}) cannot have been handed over`);

  }
});

// device details (tier 2, the only tier-2 reading in its category) comes from an async call, so
// the per-method matrix cannot reach it either. UACH_SAFE was written for it and never used.
test("inject: client hints that reject or resolve empty are never scored as details handed over", async () => {
  const srv = await getServer();
  const clean = await getClean();
  const cleanRow = clean.rows.find((r) => r.label === "device details (client hints)");
  assert.ok(cleanRow, "the client-hints reading must exist in a clean run");
  assert.equal(cleanRow.state, "shown", "a clean headless Chrome hands its client hints over, or this test proves nothing");
  for (const mode of ["throw", "undefined"]) {
    const { rows, score, patched } = await scoreWith(srv.port, UACH_BREAK(mode), "!!window.__UACH_PATCHED");
    assert.equal(patched, true, "the injection did not take, so this run proves nothing");
    const row = rows.find((r) => r.label === "device details (client hints)");
    assert.ok(row, "the client-hints reading must survive the injection");
    assert.equal(row.state, "unknown", `client hints that ${mode === "throw" ? "reject" : "resolve empty"} cannot have been handed over`);

  }
});

// Each method surface is injected ON ITS OWN, not all at once. Breaking every DOM method
// simultaneously also breaks the page (every .getBoundingClientRect().width throws), which models
// nothing any browser or privacy extension does and produced a failure that said only "the page
// died". One API patched at a time is what a real anti-fingerprinting extension does.
//
// An injection that leaves the reading unchanged is reported as UNPROVEN rather than as a broken
// guarantee. It means the override never reached the code path, so nothing was measured either
// way. Counting it as a pass would be a lie; counting it as a failure would be a different lie.
// Overriding one of these breaks the PAGE, not a probe: every `.getBoundingClientRect().width` and
// `.measureText(...).width` in the rendering path throws when the method returns undefined. No
// browser or privacy extension does that, so a crash from one of them is a limit of the harness
// rather than a defect in the tool. Anything NOT listed here must survive its probe being broken.
const FUNDAMENTAL = new Set(["Element.prototype.getBoundingClientRect", "CanvasRenderingContext2D.prototype.measureText"]);

async function injectOne(port, target, name, mode, label, clean, extra) {
  // A reading built from several independent measurements is only fully broken when every one of
  // them is. SVG text metrics hashes getComputedTextLength plus getBBox width and height, so
  // breaking one leaves real data in the hash and `shown` is the correct verdict.
  const preload = [METHOD_BREAK(target, name, mode)]
    .concat((extra || []).map(([t, n]) => METHOD_BREAK(t, n, mode)))
    .join("\n");
  let rows, score;
  try {
    ({ rows, score } = await scoreWith(port, preload));
  } catch (e) {
    // Report the crash against its surface instead of aborting the whole matrix, which previously
    // hid which of fourteen surfaces was responsible.
    return { label, verdict: FUNDAMENTAL.has(`${target}.${name}`) ? "crashed-fundamental" : "crashed", error: e.message };
  }
  const before = clean.rows.find((r) => r.label === label);
  const after = rows.find((r) => r.label === label);
  if (!after) return { label, verdict: "missing" };
  const moved = before && (before.value !== after.value || before.state !== after.state);
  if (!moved) return { label, verdict: "unproven" };
  if (after.state === "shown") return { label, verdict: "still-shown", value: String(after.value).slice(0, 40) };
  if (after.state !== "unknown") return { label, verdict: "failure-credited", state: after.state };
  return { label, verdict: "ok" };
}

const methodResults = new Map();
for (const mode of ["throw", "undefined"]) {
  test(`inject-matrix: each method surface alone (${mode}) never scores as shown and never credits failure`, async () => {
    const srv = await getServer();
    const clean = await getClean();
    const results = [];
    for (const [label, target, name, extra] of METHOD_SURFACES) {
      results.push(await injectOne(srv.port, target, name, mode, label, clean, extra ? [extra] : []));
    }
    methodResults.set(mode, results);
    const bad = results.filter((r) => r.verdict === "still-shown" || r.verdict === "failure-credited" || r.verdict === "crashed" || r.verdict === "missing");
    const unproven = results.filter((r) => r.verdict === "unproven").map((r) => r.label);
    const fundamental = results.filter((r) => r.verdict === "crashed-fundamental").map((r) => r.label);
    if (unproven.length) console.log(`      unproven under ${mode} (injection had no observable effect, so untested here): ${unproven.join(", ")}`);
    if (fundamental.length) console.log(`      not testable under ${mode} (overriding the method breaks the page itself): ${fundamental.join(", ")}`);
    assert.deepEqual(
      bad.map((r) => `${r.label}: ${r.verdict}${r.value ? " value=" + r.value : ""}${r.error ? " (" + r.error + ")" : ""}`), [],
      "a broken probe must never be scored as a value the browser handed over, must never credit a failure, and must never kill the audit",
    );
  });
}

test("inject-matrix: at least half the method surfaces are genuinely injectable, or this matrix proves little", async () => {
  const srv = await getServer();
  const clean = await getClean();
  const results = methodResults.get("throw") || [];
  if (!results.length) for (const [label, target, name, extra] of METHOD_SURFACES) {
    results.push(await injectOne(srv.port, target, name, "throw", label, clean, extra ? [extra] : []));
  }
  const proven = results.filter((r) => r.verdict === "ok").length;
  assert.ok(proven >= Math.ceil(METHOD_SURFACES.length / 2),
    `only ${proven} of ${METHOD_SURFACES.length} method surfaces could be injected; the guarantee is untested on the rest`);
});

// ---- regressions: sabotage that used to take the whole page down ----
test("inject-crash regression: a throw in deviceMemory, platform or languages still produces a score", async () => {
  const srv = await getServer();
  const preload = [
    OVERRIDE("navigator.deviceMemory", "throw"),
    OVERRIDE("navigator.platform", "throw"),
    OVERRIDE("navigator.languages", "throw"),
  ].join("\n");
  const page = await launch({ port: srv.port, preload });
  try {
    const kit = await runAudit(page);
    assert.equal(typeof kit.findability.score, "number", "the audit must still produce a score when these three throw");
    for (const label of ["device memory", "platform", "language"]) {
      const row = kit.findability.rows.find((r) => r.label === label);
      assert.ok(row, `${label} should still appear as a scored reading`);
      assert.equal(row.state, "unknown", `${label} threw, so it must not be scored as a value handed over`);
    }
    assert.equal(await page.ev("!!window.__KIT_DONE"), true, "the audit must finish rather than hang");
  } finally { await page.close(); }
});

// getHighEntropyValues and the header fetch are the only awaited probes, so a SYNCHRONOUS throw
// from either rejects the promise the run awaits and the audit produces no score at all. A .catch
// on the returned promise cannot help: nothing is returned to attach one to. Both are wrapped now.
//
// The earlier version of this test asserted the opposite, that the audit never finished, and it
// passed for two wrong reasons: it patched the userAgentData instance, which Chrome hands out
// fresh on every access, so nothing was injected; and it ran with a 6-second timeout against an
// audit that takes about fifteen, so the rejection it caught was its own deadline.
test("inject-hang: a synchronously-throwing getHighEntropyValues still produces a score", async () => {
  const srv = await getServer();
  const page = await launch({ port: srv.port, preload: UACH_BREAK("sync-throw") });
  try {
    const kit = await runAudit(page);
    assert.equal(await page.ev("!!window.__UACH_PATCHED"), true, "the injection did not take, so this run proves nothing");
    assert.equal(await page.ev("!!window.__KIT_DONE"), true, "the audit must finish even when a probe throws on call");
    assert.ok(Number.isFinite(kit.findability.score), "a throwing probe must still leave a score");
    const uaCh = kit.findability.rows.find((r) => r.label === "device details (client hints)");
    assert.ok(uaCh, "the client-hints reading must still be present");
    assert.notEqual(uaCh.state, "shown", "a probe that threw cannot have handed a value over");
  } finally { await page.close(); }
});
