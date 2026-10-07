// 0.9.6: an outside audit found five classification defects. Each test fails on 0.9.5.
import { test } from "node:test";
import assert from "node:assert/strict";
import { grabVar, grabFn, SRC as INDEX_SRC } from "./helpers/extract.mjs";

const core = [grabVar("PRIORS"), grabVar("PA_STD"), grabFn("fnv"), grabFn("fnvDead"), grabFn("fnvParts"),
  grabFn("paDeadline"), grabFn("paErr"), grabFn("paTier"), grabFn("paLetterboxed"), grabFn("paIsLB"), grabFn("findability"),
  grabFn("findabilityCross"), grabFn("paRead"), grabFn("paRepeatMerge"), grabFn("paUaChShape"), grabFn("paUaChValue"),
  grabFn("highEntropy"), grabFn("paWebgpuVectors"),
  "return { PRIORS, findability, findabilityCross, paRead, paRepeatMerge, paUaChShape, paUaChValue, highEntropy, paWebgpuVectors };"].join("\n");
const make = (nav) => new Function("navigator", core)(nav || {});
const M = make();
const LABEL = Object.fromEntries(M.PRIORS.surfaces.map((s) => [s.k, s.label]));
const row = (F, k) => F.rows.find((r) => r.label === LABEL[k]);

const named = (name) => { const e = new Error(name); e.name = name; return e; };
const uaNav = (impl) => ({ userAgentData: { getHighEntropyValues: impl } });

// ---- 1. client hints: a restricted answer is a refusal, not a broken collector ----
test("client hints: brands, mobile and platform only means the high-entropy fields were withheld", async () => {
  const { highEntropy, paUaChValue, findability } = make(uaNav(() => Promise.resolve({ brands: [{ brand: "X", version: "1" }], mobile: false, platform: "Windows" })));
  const u = await highEntropy();
  assert.equal(paUaChValue(u), "withheld");
  assert.equal(u.__paWithheld.length, 8, "every requested field is named as withheld");
  assert.equal(JSON.stringify(u).includes("__paWithheld"), false, "the bookkeeping must not change the exported answer");
  const r = row(findability({ uaCh: paUaChValue(u) }, "chromium"), "uaCh");
  assert.equal(r.state, "refused");
  assert.equal(r.refusal, "withheld");
});

test("client hints: a partial answer is still exposure, and names what was withheld", async () => {
  const { highEntropy, paUaChValue } = make(uaNav(() => Promise.resolve({ brands: [], mobile: false, platform: "Windows", architecture: "x86", bitness: "64" })));
  const u = await highEntropy();
  assert.equal(paUaChValue(u), "x86 | 64");
  assert.deepEqual(u.__paWithheld, ["model", "platformVersion", "uaFullVersion", "fullVersionList", "wow64", "formFactors"]);
});

test("client hints: a response without the low-entropy fields is malformed, not withheld", async () => {
  const { highEntropy, paUaChValue, findability } = make(uaNav(() => Promise.resolve({})));
  const v = paUaChValue(await highEntropy());
  assert.equal(v, "ERR:malformed-client-hints");
  assert.equal(row(findability({ uaCh: v }, "chromium"), "uaCh").state, "unknown");
});

test("client hints: NotAllowedError is the spec's denial and is refused; any other rejection stays unknown", async () => {
  const denied = make(uaNav(() => Promise.reject(named("NotAllowedError"))));
  const dv = denied.paUaChValue(await denied.highEntropy());
  assert.equal(dv, "blocked:NotAllowedError");
  assert.equal(row(M.findability({ uaCh: dv }, "chromium"), "uaCh").state, "refused");
  const broken = make(uaNav(() => Promise.reject(named("TypeError"))));
  const bv = broken.paUaChValue(await broken.highEntropy());
  assert.equal(bv, "ERR:TypeError");
  assert.equal(row(M.findability({ uaCh: bv }, "chromium"), "uaCh").state, "unknown");
});

// ---- 2. failure reasons survive reading and repeating ----
test("read: an explicit denial is refused, an unexpected exception is unknown", () => {
  assert.equal(M.paRead(() => { throw named("NotAllowedError"); }, ""), "blocked:NotAllowedError");
  assert.equal(M.paRead(() => { throw named("SecurityError"); }, ""), "blocked:SecurityError");
  assert.equal(M.paRead(() => { throw named("TypeError"); }, ""), "ERR:TypeError");
  assert.equal(M.paRead(() => { throw new Error("x"); }, ""), "ERR:Error");
  assert.equal(M.paRead(() => undefined, "d"), "d");
});

test("repeat: an incomplete repeat keeps both attempts instead of a bare marker", () => {
  const first = { cores: "8" }, second = { cores: "ERR:timeout" };
  const out = M.paRepeatMerge(first, second, M.findability(first, "other"), M.findability(second, "other"));
  assert.match(out.cores, /^ERR:repeat-incomplete/);
  assert.ok(out.cores.includes("8") && out.cores.includes("ERR:timeout"), out.cores);
});

test("repeat: a reading that already failed keeps its own reason", () => {
  const first = { cores: "ERR:NotReadableError" }, second = { cores: "ERR:timeout" };
  const out = M.paRepeatMerge(first, second, M.findability(first, "other"), M.findability(second, "other"));
  assert.equal(out.cores, "ERR:NotReadableError");
});

test("repeat: a value that changes between reads is marked noisy, a stable one is not", () => {
  const first = { cores: "8", timezone: "UTC" }, second = { cores: "7", timezone: "UTC" };
  const out = M.paRepeatMerge(first, second, M.findability(first, "other"), M.findability(second, "other"));
  assert.deepEqual(out._noisy, { cores: 1 });
});

// ---- 3. availability is reported apart from extraction ----
const gpuRows = (pairs) => pairs.map(([l, v]) => [l, v]);
test("webgpu: an API that is present but unavailable is refused as unavailable, not unknown", () => {
  const v = M.paWebgpuVectors(gpuRows([["WebGPU (navigator.gpu)", ["unavailable / disabled", "ok"]]]));
  assert.deepEqual(v, { adapter: "unsupported", limits: "unsupported" });
  const r = row(M.findability({ webgpuAdapter: v.adapter }, "chromium"), "webgpuAdapter");
  assert.equal(r.state, "refused");
  assert.equal(r.refusal, "unavailable");
});

test("webgpu: a null adapter is a denial, and both routes get the same state", () => {
  const nul = M.paWebgpuVectors(gpuRows([["GPUAdapter", ["null (blocked)", "ok"]]]));
  assert.deepEqual(nul, { adapter: "blocked", limits: "blocked" });
  assert.equal(row(M.findability({ webgpuAdapter: nul.adapter }, "chromium"), "webgpuAdapter").refusal, "denied");
});

test("webgpu: a rejected requestAdapter keeps its exception; only a denial is refused", () => {
  assert.deepEqual(M.paWebgpuVectors(gpuRows([["WebGPU", ["ERR:OperationError", "no"]]])), { adapter: "ERR:OperationError", limits: "ERR:OperationError" });
  assert.deepEqual(M.paWebgpuVectors(gpuRows([["WebGPU", ["blocked:NotAllowedError", "ok"]]])), { adapter: "blocked:NotAllowedError", limits: "blocked:NotAllowedError" });
});

test("webgpu: a timeout before the adapter answered stays unknown", () => {
  const v = M.paWebgpuVectors(gpuRows([["preferredCanvasFormat (OS-correlated)", "bgra8unorm"]]));
  assert.equal(row(M.findability({ webgpuAdapter: v.adapter, webgpuLimits: v.limits }, "chromium"), "webgpuAdapter").state, "unknown");
});

test("webgpu: a real adapter is extracted unchanged", () => {
  const v = M.paWebgpuVectors(gpuRows([["adapter vendor", "nvidia"], ["adapter architecture", "ampere"], ["adapter device", "(empty)"],
    ["adapter description", "(empty)"], ["GPUAdapter.limits (40)", "abcd1234"]]));
  assert.equal(v.limits, "abcd1234");
  assert.match(v.adapter, /^[0-9a-f]{8}$/);
});

test("findability: the export counts unavailable and denied refusals separately", () => {
  const F = M.findability({ webgpuAdapter: "unsupported", webgpuLimits: "blocked", uaCh: "withheld" }, "chromium");
  assert.equal(F.checks.refusedUnavailable, 1);
  assert.equal(F.checks.refusedDenied, 1);
  assert.equal(F.checks.refusedWithheld, 1);
});

// ---- 4. a reading hidden on the main path but recovered another way is exposed ----
test("bypass: a refused reading that a fresh frame still returns is shown, and names the route", () => {
  const F = M.findability({ webglVendor: "blocked:SecurityError", _alt: { webglVendor: "ANGLE (NVIDIA)" } }, "chromium");
  const r = row(F, "webglVendor");
  assert.equal(r.state, "shown");
  assert.equal(r.bypass, "frame");
  assert.deepEqual(F.bypassed, [LABEL.webglVendor]);
});

test("bypass: noise on the main read does not earn credit when hit-testing recovers stable widths", () => {
  const F = M.findability({ rects: "a1", _noisy: { rects: 1 }, _alt: { rects: "431.25,512" } }, "other");
  assert.equal(row(F, "rects").state, "shown");
  assert.equal(row(F, "rects").bypass, "hit");
});

test("bypass: a masked canvas that a fresh frame draws normally is shown", () => {
  const F = M.findability({ canvasClass: "noise-per-read", _alt: { canvasClass: "deadbeef" } }, "other");
  assert.equal(row(F, "canvasClass").state, "shown");
});

test("bypass: with no alternate value, every protection keeps its credit", () => {
  const F = M.findability({ webglVendor: "blocked:SecurityError", rects: "a1", _noisy: { rects: 1 }, canvasClass: "noise-per-read", _alt: {} }, "other");
  assert.equal(row(F, "webglVendor").state, "refused");
  assert.equal(row(F, "rects").state, "blended");
  assert.equal(row(F, "canvasClass").state, "blended");
  assert.deepEqual(F.bypassed, []);
});

test("bypass: across two sites the alternate route must also match, or the variation stands", () => {
  const A = { measureTextW: "1.1", _alt: { measureTextW: "200.5" } };
  const same = M.findabilityCross(A, { measureTextW: "1.2", _alt: { measureTextW: "200.5" } }, "chromium");
  assert.equal(row(same, "measureTextW").state, "shown", "stable hit-test widths link the two sites");
  const diff = M.findabilityCross(A, { measureTextW: "1.2", _alt: { measureTextW: "201.0" } }, "chromium");
  assert.equal(row(diff, "measureTextW").state, "blended", "the alternate route varies too");
  const none = M.findabilityCross(A, { measureTextW: "1.2" }, "chromium");
  assert.equal(row(none, "measureTextW").state, "blended", "the second site could not measure the route");
});

test("bypass: uniformity is never overruled, because the frame reads the same standard value", () => {
  const RFP = { cores: "4", _alt: { cores: "4" } };
  const F = M.findabilityCross(RFP, { cores: "4", _alt: { cores: "4" } }, "tor-build");
  assert.equal(row(F, "cores").state, "blended");
  assert.equal(row(F, "cores").mask, "uniform");
});

test("repeat: an alternate route that changes between reads is not a recovery", () => {
  const first = { rects: "a", _alt: { rects: "1", canvasClass: "c" } }, second = { rects: "b", _alt: { rects: "2", canvasClass: "c" } };
  const out = M.paRepeatMerge(first, second, M.findability(first, "other"), M.findability(second, "other"));
  assert.deepEqual(out._alt, { canvasClass: "c" });
});

// ---- 5. assumed uniformity is labelled as assumed ----
test("uniform: a uniformity credit is marked as assumed from the family's documented values", () => {
  const F = M.findabilityCross({ cores: "4" }, { cores: "4" }, "tor-build");
  const r = row(F, "cores");
  assert.equal(r.basis, "assumed-uniform");
  assert.doesNotMatch(r.why, /every user/i, "two sites on one machine cannot show what every user reports");
  assert.match(r.why, /not measure|not measured/i);
  assert.equal(F.checks.assumedUniform, 1);
});

test("uniform: measured readings carry no assumed basis", () => {
  const F = M.findability({ cores: "8", webglVendor: "blocked" }, "chromium");
  assert.equal(row(F, "cores").basis, "");
  assert.equal(row(F, "webglVendor").basis, "");
  assert.equal(F.checks.assumedUniform, 0);
});

test("bypass: across two sites a recovered reading is compared on the recovered route, not the blocked main value", () => {
  const A = { webglVendor: "blocked:SecurityError", _alt: { webglVendor: "ANGLE (NVIDIA)" } };
  const same = M.findabilityCross(A, { webglVendor: "blocked:SecurityError", _alt: { webglVendor: "ANGLE (NVIDIA)" } }, "chromium");
  assert.equal(row(same, "webglVendor").state, "shown");
  assert.equal(row(same, "webglVendor").bypass, "frame");
  const missing = M.findabilityCross(A, { webglVendor: "blocked:SecurityError" }, "chromium");
  assert.equal(row(missing, "webglVendor").state, "unknown", "one site recovered it and the other could not run the route");
});

// ---- second audit (A1-A7 and the measured/assumed split) ----
const core2 = [grabVar("PRIORS"), grabVar("PA_STD"), grabFn("fnv"), grabFn("fnvDead"), grabFn("fnvParts"), grabFn("paErr"),
  grabFn("paTier"), grabFn("paLetterboxed"), grabFn("paIsLB"), grabFn("findability"), grabFn("findabilityCross"),
  grabFn("paRepeatMerge"), grabFn("paCanvasClass"),
  "return { findability, findabilityCross, paRepeatMerge, paCanvasClass };"].join("\n");
const N = new Function(core2)();

test("A1: a canvas readback the browser denies keeps the denial instead of an empty string", () => {
  const ctx = { fillRect() {}, getImageData() { throw named("NotAllowedError"); } };
  const doc = { createElement: () => ({ getContext: () => ctx }) };
  assert.equal(N.paCanvasClass(doc), "blocked:NotAllowedError");
  const broken = { createElement: () => ({ getContext: () => ({ fillRect() {}, getImageData() { throw named("TypeError"); } }) }) };
  assert.equal(N.paCanvasClass(broken), "ERR:TypeError");
});

test("A2: the same denial scores the same whatever prefix the collector used", () => {
  for (const v of ["ERR:NotAllowedError", "blocked:NotAllowedError", "ERR:SecurityError", "blocked:SecurityError"]) {
    const r = row(N.findability({ audioRenderClass: v }, "other"), "audioRenderClass");
    assert.equal(r.state, "refused", v);
    assert.equal(r.refusal, "denied", v);
  }
  assert.equal(row(N.findability({ audioRenderClass: "ERR:TypeError" }, "other"), "audioRenderClass").state, "unknown");
  assert.equal(row(N.findability({ audioRenderClass: "ERR:timeout" }, "other"), "audioRenderClass").state, "unknown");
});

test("A3: blocked then readable is exposed in either order, and the mix is recorded", () => {
  for (const [x, y] of [["blocked", "12"], ["12", "blocked"]]) {
    const first = { cores: x }, second = { cores: y };
    const out = N.paRepeatMerge(first, second, N.findability(first, "other"), N.findability(second, "other"));
    const r = row(N.findability(out, "other"), "cores");
    assert.equal(r.state, "shown", `${x} then ${y}`);
    assert.equal(out.cores, "12");
    assert.match(r.why, /refused on one read/i);
  }
});

test("A3: a value readable on one site and refused on the other is exposed in either order", () => {
  for (const [x, y] of [["blocked", "12"], ["12", "blocked"]]) {
    const F = N.findabilityCross({ cores: x }, { cores: y }, "other");
    assert.equal(row(F, "cores").state, "shown", `${x} / ${y}`);
    assert.equal(row(F, "cores").value, "12");
  }
});

test("A4: a readable fresh frame exposes a reading whose main probe failed", () => {
  const r = row(N.findability({ cores: "ERR:TypeError", _alt: { cores: "12" } }, "other"), "cores");
  assert.equal(r.state, "shown");
  assert.equal(r.bypass, "frame");
  assert.equal(row(N.findability({ cores: "ERR:TypeError", _alt: {} }, "other"), "cores").state, "unknown");
});

test("A4: assumed uniformity does not survive a fresh frame that reports a different value", () => {
  const F = N.findabilityCross({ cores: "4", _alt: { cores: "12" } }, { cores: "4", _alt: { cores: "12" } }, "tor-build");
  assert.equal(row(F, "cores").state, "shown");
  const same = N.findabilityCross({ cores: "4", _alt: { cores: "4" } }, { cores: "4", _alt: { cores: "4" } }, "tor-build");
  assert.equal(row(same, "cores").mask, "uniform", "the frame confirms the standard value");
});

test("measured score leaves out assumed uniformity; the headline keeps it", () => {
  const RFP = { cores: "4", timezone: "Atlantic/Reykjavik", colorDepth: "24", devicePixelRatio: "2" };
  const F = N.findabilityCross(RFP, { ...RFP }, "tor-build");
  assert.ok(F.score > F.measuredScore, `${F.score} vs ${F.measuredScore}`);
  const G = N.findabilityCross(RFP, { ...RFP }, "firefox");
  assert.equal(G.score, F.measuredScore, "the measured score does not depend on the family label");
  assert.equal(G.measuredScore, G.score);
});

// ---- third audit: wildcard disclosure, masked-vs-readable order, WebGPU repeat ----
test("disclosure: results are never posted to a window, only over a verified port", () => {
  assert.doesNotMatch(INDEX_SRC, /function paPostBack/, "the wildcard sender is gone");
  assert.doesNotMatch(INDEX_SRC, /postMessage\([^;]*,\s*"\*"(?![^;]*\[ch\.port2\])/, "a wildcard target may only carry the hello port");
});

test("disclosure: the companion answers only a hello from the trusted origin and window, and only over its port", () => {
  const listeners = [];
  const win = { addEventListener: (t, f) => listeners.push(f) };
  const parent = {}, stranger = {};
  const { paAnswer } = new Function("window", "PRIORS", grabFn("paAnswer") + ";return { paAnswer };")(win, { version: "v" });
  const ans = paAnswer("tok", "https://home.example", [parent]);
  ans.send({ paObs: { cores: 8 } });
  const sent = [];
  const port = { postMessage: (m) => sent.push(m) };
  const fire = (e) => listeners.forEach((f) => f(e));
  fire({ origin: "https://evil.example", source: parent, data: { paHello: "tok" }, ports: [port] });
  fire({ origin: "https://home.example", source: stranger, data: { paHello: "tok" }, ports: [port] });
  fire({ origin: "https://home.example", source: parent, data: { paHello: "other" }, ports: [port] });
  assert.equal(sent.length, 0, "nothing goes to a wrong origin, window or token");
  fire({ origin: "https://home.example", source: parent, data: { paHello: "tok" }, ports: [port] });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].paObs, { cores: 8 });
  assert.equal(sent[0].paToken, "tok");
  ans.send({ paStoreCleared: "tok" });
  assert.equal(sent.length, 2, "later messages reuse the verified port");
});

test("disclosure: with no trusted origin the companion never answers", () => {
  const listeners = [];
  const { paAnswer } = new Function("window", "PRIORS", grabFn("paAnswer") + ";return { paAnswer };")({ addEventListener: (t, f) => listeners.push(f) }, { version: "v" });
  const ans = paAnswer("tok", "", [{}]);
  ans.send({ paObs: {} });
  const sent = [];
  listeners.forEach((f) => f({ origin: "", source: {}, data: { paHello: "tok" }, ports: [{ postMessage: (m) => sent.push(m) }] }));
  assert.equal(sent.length, 0);
});

test("A3: masked on one read and readable on the other is exposed in either order", () => {
  for (const [x, y] of [["noise-per-read", "unique"], ["unique", "noise-per-read"]]) {
    const first = { canvasClass: x, canvasHash: "h1" }, second = { canvasClass: y, canvasHash: "h1" };
    const out = N.paRepeatMerge(first, second, N.findability(first, "other"), N.findability(second, "other"));
    assert.equal(row(N.findability(out, "other"), "canvasClass").state, "shown", `${x} then ${y}`);
    const F = N.findabilityCross({ canvasClass: x, canvasHash: "h1" }, { canvasClass: y, canvasHash: "h2" }, "other");
    assert.equal(row(F, "canvasClass").state, "shown", `cross ${x} / ${y}`);
  }
});

test("A3: variation seen only by repeating on one site is not overruled by a single read on the other", () => {
  const F = N.findabilityCross({ cores: "8", _noisy: { cores: 1 } }, { cores: "8" }, "other");
  assert.equal(row(F, "cores").state, "blended");
});
