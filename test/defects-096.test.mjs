// 0.9.6: an outside audit found five classification defects. Each test fails on 0.9.5.
import { test } from "node:test";
import assert from "node:assert/strict";
import { grabVar, grabFn } from "./helpers/extract.mjs";

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
