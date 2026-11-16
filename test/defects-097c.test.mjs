import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { grabFn, grabVar, SRC } from "./helpers/extract.mjs";

const SRC_SCHEMA = fs.readFileSync(path.join(process.env.PRIVACYASSAY_TEST_ROOT || path.join(import.meta.dirname, ".."), "schema.json"), "utf8");

const lineWith = (s) => { const i = SRC.indexOf(s); assert.ok(i >= 0, s); return SRC.slice(SRC.lastIndexOf("\n", i) + 1, SRC.indexOf("\n", i)); };
const hashFns = () => [grabFn("fnv"), grabFn("fnvDead"), grabFn("fnvParts")].join("\n");

test("webglExt: the main row and the frame read hash one extension list to one value", () => {
  const list = ["WEBGL_lose_context", "ANGLE_instanced_arrays", "OES_texture_float"];
  const gl = { getSupportedExtensions: () => list.slice() };
  const rows = [];
  new Function("gl", "rows", hashFns() + "\n" + lineWith('rows.push(["WebGL extensions"'))(gl, rows);
  const fl = lineWith("out.webglExt=");
  const out = {};
  new Function("g", "out", hashFns() + "\n" + fl.slice(fl.indexOf("var ex="), fl.indexOf("glDone(g)")))(gl, out);
  assert.equal(rows[0][1], out.webglExt);
});

test("svgMetrics: the text sets its own font family so two documents measure one font", () => {
  const attrs = [];
  const el = () => ({ style: {}, setAttribute: (k, v) => attrs.push([k, v]), appendChild() {}, getComputedTextLength: () => 1, getBBox: () => ({ width: 2, height: 3 }) });
  const doc = { createElementNS: () => el(), body: { appendChild() {}, removeChild() {} } };
  new Function("doc", hashFns() + "\n" + grabFn("paSvgMetrics") + "\nreturn paSvgMetrics(doc);")(doc);
  const fam = attrs.find((a) => a[0] === "font-family");
  assert.ok(fam && fam[1], "font-family attribute set");
});

const voicesRow = (v) => new Function(hashFns() + "\n" + grabFn("paVoicesRow") + "\nreturn paVoicesRow;")()(v);

test("speechVoices: a present API with zero voices is a shown value, not a refusal", () => {
  assert.equal(voicesRow([]), "0");
  assert.match(voicesRow([{ name: "a", lang: "en" }]), /^1 \([0-9a-f]{8}\)$/);
  assert.equal(voicesRow(null), "ERR:getVoices");
  const sites = SRC.split("\n").filter((l) => l.includes('rows.push(["SpeechSynthesis voices"'));
  assert.equal(sites.length, 2);
  for (const l of sites) assert.ok(l.includes("paVoicesRow(") && !l.includes('"blocked"'), l);
});

test("speechVoices: late-loading voices change a count into incomplete, not per-read credit", () => {
  const s = lineWith('{k:"speechVoices"');
  assert.match(s, /noPerReadCredit:true/);
});

test("groups: weight comes from the exposed readings, not from a hidden heavier one", () => {
  const groupsFrom = new Function("paTierMap", "PAGRP", grabFn("paGroupsFrom") + "\nreturn paGroupsFrom;")(() => ({ A: 3, B: 2 }), {});
  const row = (label, state, tier) => ({ group: "g", label, state, tier, value: "v", comparisonIncomplete: false });
  const [g] = groupsFrom({ rows: [row("A", "blended", 0), row("B", "shown", 2)] });
  assert.equal(g.state, "shown");
  assert.equal(g.weight, 2);
  const [h] = groupsFrom({ rows: [row("A", "shown", 3), row("B", "blended", 0)] });
  assert.equal(h.weight, 3);
  const [k] = groupsFrom({ rows: [row("A", "blended", 0), row("B", "refused", 0)] });
  assert.equal(k.weight, 3);
});

test("masked tile: the sentence covers varied, per-read and shared values, not only common ones", () => {
  const l = lineWith('" surfaces masked"');
  assert.ok(!/reported common values/.test(l));
  assert.match(l, /varied or looked common/);
});

test("summary counts: every count comes from the single-site findability they describe", () => {
  const l = lineWith("maskedByAssumedUniformity:");
  assert.ok(!/\bFc\b/.test(l), l);
  assert.match(JSON.parse(SRC_SCHEMA).properties.counts.properties.maskedByAssumedUniformity.description, /single-site/);
});

const crossMid = (cs) => new Function(grabFn("paCrossMid") + "\nreturn paCrossMid;")()(cs);

test("cross card: assumed-uniformity credit is labelled assumed and not styled as a measured gain", () => {
  const [text, color] = crossMid({ answer: "Matched", delta: 20, assumed: true });
  assert.match(text, /assumed/);
  assert.notEqual(color, "var(--gradeB)");
  assert.equal(crossMid({ answer: "Changed", delta: 5, assumed: false })[0], "+5");
  assert.equal(crossMid({ answer: "Yes", delta: 0 })[0], "linked");
});

test("incomplete runs: no delta between two lower bounds, and the page box says lower bound", () => {
  assert.equal(crossMid({ answer: "Incomplete", delta: 1, singleIncomplete: true, crossIncomplete: true })[0], "lower bounds");
  const axis = new Function("paEsc", "PAMONO", grabFn("paAxisPair") + "\nreturn paAxisPair;")((s) => String(s), "");
  const F = { complete: false, score: 3, checks: { held: 0 } };
  const html = axis({}, F, { score: 4, crossIncomplete: true });
  assert.match(html, /lower bound/);
  assert.match(html, /&#8805; 3/);
  assert.match(html, /&#8805; 4/);
  const ok = axis({}, { complete: true, score: 3, checks: { held: 0 } }, { score: 4 });
  assert.ok(!/lower bound|&#8805;/.test(ok));
});

test("score ring: the aria label says lower bound when the run is incomplete", () => {
  const l = lineWith('Protection score lower bound');
  assert.match(l, /lower bound/);
});

const CLI_PATH = path.join(process.env.PRIVACYASSAY_TEST_ROOT || path.join(import.meta.dirname, ".."), "bin", "privacyassay.mjs");
const CLI_SRC = fs.readFileSync(CLI_PATH, "utf8");

test("cli: an unknown --flag exits 2 and names the flag", () => {
  const r = spawnSync(process.execPath, [CLI_PATH, "--min-scor", "50"], { encoding: "utf8", timeout: 20000 });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown option --min-scor/);
  const eq = spawnSync(process.execPath, [CLI_PATH, "--bogus=1"], { encoding: "utf8", timeout: 20000 });
  assert.equal(eq.status, 2);
});

test("cli: the known-flag list is exactly the flags the CLI reads, and help states the incomplete rule", () => {
  const read = new Set([...CLI_SRC.matchAll(/(?:flag|val|num)\("(--[a-z-]+)"/g)].map((m) => m[1]));
  const known = new Set(JSON.parse(CLI_SRC.match(/const KNOWN = (\[.*?\]);/)[1]));
  read.add("--help");
  assert.deepEqual([...known].sort(), [...read].sort());
  assert.match(CLI_SRC.match(/--min-score N[^\n]*/)[0], /exit 2 if the run is incomplete/);
});

test("cli: --full output carries the same schema id as the saved full export", () => {
  assert.match(CLI_SRC, /schema: "privacyassay-full\/1\.1", \.\.\.med\.full/);
  assert.ok(SRC.includes('schema:"privacyassay-full/1.1"'));
});

test("taskbar size: no gap is the neutral word none, and only that earns the RFP uniform match", () => {
  assert.ok(SRC.includes('return (dw===0&&dh===0)?"none":(dw+"x"+dh);'));
  const STD = new Function(grabVar("PA_STD") + "\nreturn PA_STD;")();
  assert.equal(STD.rfp.availFrame("none"), true);
  assert.equal(STD.rfp.availFrame("masked"), false);
});

test("no-verdict card: the nothing-sent sentence is only used when no opt-in could send anything", () => {
  const note = new Function(grabFn("paSentNote") + "\nreturn paSentNote;")();
  assert.match(note({}), /^Nothing was sent anywhere/);
  assert.ok(!/Nothing was sent anywhere/.test(note({ webrtcStun: true })));
  assert.match(note({ webrtcStun: true }), /STUN/);
  assert.ok(!/Nothing was sent anywhere/.test(note({ storageTest: true })));
  assert.match(note({ storageTest: true }), /second-site window/);
  assert.match(note({ webrtcStun: true, storageTest: true }), /STUN.*second-site window/);
  assert.ok(!SRC.includes("so there is no verdict to show. Nothing was sent anywhere"));
});

test("redact wording: the UI says status words stay visible and does not promise safety", () => {
  for (const l of [lineWith('id="redactOptin"'), lineWith("Summary is a short, shareable result")]) {
    assert.match(l, /status words/i);
    assert.ok(!/stay safe/.test(l), l);
  }
});

test("linkVec: a failed read is left out on both sides instead of hashed into a real-looking value", () => {
  const part = new Function(hashFns() + "\n" + grabFn("paLinkDead") + "\n" + grabFn("paLinkPart") + "\nreturn paLinkPart;")();
  assert.equal(part(["ERR:InvalidStateError", "0a1b2c3d"]), "");
  assert.equal(part(["0a1b2c3d", "ERR"]), "");
  assert.equal(part(["blocked:SecurityError"]), "");
  assert.equal(part([null, "0a1b2c3d"]), "");
  assert.equal(part(["0a1b2c3d"]), "0a1b2c3d");
  assert.match(part(["0a1b2c3d", "4e5f6a7b"]), /^[0-9a-f]{8}$/);
  assert.ok(SRC.includes("var _lv={canvas:paLinkPart("));
  assert.ok(SRC.includes("function lv2(c1,l1,c2,l2){return paLinkPart("));
});

test("readback canvases ask for willReadFrequently so Safari does not throw on getImageData", () => {
  assert.match(lineWith("function canvas2dHash()"), /getContext\("2d",\{willReadFrequently:true\}\)/);
  assert.match(lineWith('rows.push(["canvas getImageData px"'), /getContext\("2d",\{willReadFrequently:true\}\)/);
  assert.match(lineWith("var src=\"var o={};try{var c=new OffscreenCanvas(64,32)"), /getContext\('2d',\{willReadFrequently:true\}\)/);
  assert.match(lineWith("function cvh()"), /getContext\("2d",\{willReadFrequently:true\}\)/);
  assert.ok(!lineWith('tc.width=256;tc.height=256').includes("willReadFrequently"));
});

test("cvh: a missing 2D context is an error, not three equal zeros read as stable", () => {
  const src = /function cvh\(\)\{[\s\S]*?\n/.exec(SRC)[0];
  const cvh = new Function("document", src + "\nreturn cvh;")({ createElement: () => ({ getContext: () => null }) });
  assert.throws(() => cvh());
});

test("docs: both methodology files say an empty WebGPU adapter info counts as withheld", () => {
  const root = process.env.PRIVACYASSAY_TEST_ROOT || path.join(import.meta.dirname, "..");
  for (const f of ["METHODOLOGY.md", "methodology.html"]) assert.match(fs.readFileSync(path.join(root, f), "utf8"), /adapter whose vendor, architecture, device and description are all empty counts as withheld/);
});
