import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { grabVar, grabFn, SRC } from "./helpers/extract.mjs";

const lineWith = (s, src = SRC) => { const i = src.indexOf(s); assert.ok(i >= 0, s); return src.slice(src.lastIndexOf("\n", i) + 1, src.indexOf("\n", i)); };
const catStub = "function cat(name,rows,note){return {name:name,rows:rows};}";
const rowOf = (rows, label) => rows.find((r) => r[0] === label);

test("features: blocked site storage does not drop the Browser Feature Detection category", () => {
  const win = {};
  for (const k of ["localStorage", "sessionStorage"]) Object.defineProperty(win, k, { get() { const e = new Error("denied"); e.name = "SecurityError"; throw e; } });
  const run = new Function("window", "navigator", "performance", "WebAssembly",
    [grabFn("probe"), grabFn("present"), grabFn("paErr"), grabFn("paRead"), grabFn("fnv"), catStub, grabFn("collectFeatures"), "return collectFeatures();"].join("\n"));
  const out = run(win, {}, {}, undefined);
  assert.equal(out.name, "Browser Feature Detection");
  assert.equal(rowOf(out.rows, "localStorage")[1], true);
  assert.equal(rowOf(out.rows, "sessionStorage")[1], true);
  assert.equal(rowOf(out.rows, "indexedDB")[1], false);
});

const runGpu = (ad) => new Promise((res) => {
  const go = new Function("navigator", "performance", "paFrameGpu",
    [grabFn("paErr"), grabFn("fnv"), grabFn("fnvParts"), catStub, grabFn("collectWebGPU"), "return collectWebGPU();"].join("\n"));
  go({ gpu: { requestAdapter: () => Promise.resolve(ad) } }, { now: () => 0 }, () => Promise.resolve(null)).then((c) => res(c.rows));
});

test("webgpu: isFallbackAdapter and subgroup sizes are read from GPUAdapterInfo", async () => {
  const rows = await runGpu({ info: { vendor: "v", isFallbackAdapter: true, subgroupMinSize: 8, subgroupMaxSize: 64 }, limits: {}, features: new Set() });
  assert.equal(rowOf(rows, "adapter.isFallbackAdapter")[1], "true");
  assert.equal(rowOf(rows, "subgroup size range (GPU execution-unit width)")[1], "8 - 64");
});

test("webgpu: the older adapter and limits locations still work as a fallback", async () => {
  const rows = await runGpu({ info: { vendor: "v" }, isFallbackAdapter: false, limits: { subgroupMinSize: 4, subgroupMaxSize: 32 }, features: new Set() });
  assert.equal(rowOf(rows, "adapter.isFallbackAdapter")[1], "false");
  assert.equal(rowOf(rows, "subgroup size range (GPU execution-unit width)")[1], "4 - 32");
  const none = await runGpu({ info: {}, limits: {}, features: new Set() });
  assert.equal(rowOf(none, "adapter.isFallbackAdapter")[1], "absent");
});

test("sensors: iPadOS with a desktop Macintosh UA and touch is treated as mobile", () => {
  const run = new Function("window", "navigator", [grabFn("present"), catStub, grabFn("collectSensors"), "return collectSensors();"].join("\n"));
  const ipad = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15", maxTouchPoints: 5 };
  const mac = { ...ipad, maxTouchPoints: 0 };
  const win = { ondevicemotion: null };
  assert.equal(rowOf(run(win, ipad).rows, "devicemotion / deviceorientation events")[1][1], "mid");
  assert.equal(rowOf(run(win, mac).rows, "devicemotion / deviceorientation events")[1][1], "ok");
});

test("coherence: empty plugins on Android Chrome is not a Cloudflare tell", () => {
  const run = new Function("navigator", "checks", lineWith('checks["plugins present (empty on desktop Chrome'));
  const key = "plugins present (empty on desktop Chrome = Cloudflare tell)";
  const check = (nav) => { const c = {}; run(nav, c); return c[key]; };
  assert.equal(check({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36", platform: "Linux armv8l", plugins: [] }), true);
  assert.equal(check({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36", platform: "Win32", plugins: [] }), false);
});

test("run button: the companion popup honours __paSkipCross like paRunCrossWindow", () => {
  const h = SRC.indexOf('document.getElementById("runBtn").addEventListener("click"');
  assert.ok(h >= 0);
  assert.match(SRC.slice(h, SRC.indexOf("\n", SRC.indexOf("var comp=", h))), /var comp=window\.__paSkipCross\?null:paCompanion\(\);/);
});

test("CLI: a finished audit is not discarded when the cross wait reaches the deadline", () => {
  const cli = fs.readFileSync(path.join(process.env.PRIVACYASSAY_TEST_ROOT || path.resolve("."), "bin", "privacyassay.mjs"), "utf8");
  const a = cli.indexOf("let crossTimedOut"), b = cli.indexOf("const data = await ev(", a);
  assert.ok(a >= 0 && b > a);
  assert.doesNotMatch(cli.slice(a, b), /remaining\(\)/);
});

test("render: unmeasured coherence rows are not counted as failed checks", () => {
  const run = new Function("ch", "keys", lineWith("(ch.rows||[]).forEach(function(r){var k=r&&r[0];"));
  const ch = { checks: { a: true }, detail: {}, rows: [["native receiver probes unmeasured", ["x", "mid"]], ["worker realm unmeasured", ["e", "mid"]], ["iframe realm mismatch", ["d", "no"]]] }, keys = ["a"];
  run(ch, keys);
  assert.deepEqual(keys, ["a", "iframe realm mismatch"]);
  assert.equal("worker realm unmeasured" in ch.checks, false);
});

test("catalog: no verified sentence is cut off mid-clause", () => {
  const P = new Function(grabVar("PRIORS") + ";return PRIORS;")();
  for (const s of P.surfaces) assert.doesNotMatch(s.verified, /\b(and|are|which|where|origin|the|of|to|that)$/, s.k);
});

test("identify: Edge on Android and iOS is named", () => {
  const re = /\[(\/Edg[^,]*\/),"Edge"\]/.exec(SRC);
  assert.ok(re);
  const rx = new Function("return " + re[1])();
  for (const ua of ["Mozilla/5.0 (Linux; Android 14) Chrome/129.0 Mobile Safari/537.36 EdgA/129.0.2792.84", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 EdgiOS/129.0.2792.84 Mobile/15E148 Safari/605.1.15", "Mozilla/5.0 (Windows NT 10.0) Chrome/129.0 Safari/537.36 Edg/129.0.2792.79"])
    assert.equal(rx.exec(ua)[1].startsWith("129.0.2792"), true, ua);
});

test("base name: iOS Chrome, Firefox and Edge are not labelled Safari", () => {
  const name = (ua) => new Function("navigator", grabFn("paUABaseName") + ";return paUABaseName();")({ userAgent: ua });
  const ios = (tok) => "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) " + tok + " Mobile/15E148 Safari/604.1";
  assert.equal(name(ios("CriOS/129.0.6668.69")), "Chrome");
  assert.equal(name(ios("FxiOS/131.0")), "Firefox");
  assert.equal(name(ios("EdgiOS/129.0.2792.84")), "Edge");
  assert.equal(name(ios("Version/17.0")), "Safari");
});
