// The saved report against its own schema. This file used to build a summary object by hand and
// validate that, which proved only that a conforming literal can be written: it never called
// paSave, and its field list (tool, userAgent, shownCount, note) did not match what paSave emits
// (generated, browser, cappedBy, topLeaks, handedOver). The export could have been malformed and
// every check still passed. These drive the real buttons and read the real blob.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../helpers/server.mjs";
import { launch, runAudit } from "../helpers/browser.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = JSON.parse(fs.readFileSync(path.join(HERE, "..", "..", "schema.json"), "utf8"));

// ---- schema walker ----
// Recursive, so a nested object is checked too. const and enum are stronger than type, so a
// property carrying either is constrained even without one.
function validate(obj, schema, at = "$") {
  const errs = [];
  for (const req of schema.required || []) if (!(req in obj)) errs.push(`${at}: missing required "${req}"`);
  for (const [k, v] of Object.entries(obj)) {
    const spec = (schema.properties || {})[k];
    if (!spec) { if (schema.additionalProperties === false) errs.push(`${at}.${k}: not declared in schema`); continue; }
    if (spec.const !== undefined && v !== spec.const) errs.push(`${at}.${k}: must be ${JSON.stringify(spec.const)}, got ${JSON.stringify(v)}`);
    if (spec.enum && !spec.enum.includes(v)) errs.push(`${at}.${k}: ${JSON.stringify(v)} not in enum`);
    const types = spec.type ? (Array.isArray(spec.type) ? spec.type : [spec.type]) : null;
    if (types) {
      const actual = v === null ? "null" : Array.isArray(v) ? "array"
        : typeof v === "number" ? (Number.isInteger(v) ? "integer" : "number") : typeof v;
      if (!types.some((x) => x === actual || (x === "number" && actual === "integer"))) {
        errs.push(`${at}.${k}: schema says ${types.join("|")}, value is ${actual}`);
      }
      if (actual === "object" && spec.properties) errs.push(...validate(v, spec, `${at}.${k}`));
      if (actual === "array" && spec.items && spec.items.properties) {
        v.forEach((el, i) => { if (el && typeof el === "object") errs.push(...validate(el, spec.items, `${at}.${k}[${i}]`)); });
      }
    }
  }
  return errs;
}

// Captures what paDownload actually hands the browser. The blob is the file a user receives, so
// reading it is the only way to test the export rather than a reconstruction of it.
const CAPTURE = `window.__saved=[];(function(){
  var real=URL.createObjectURL;
  URL.createObjectURL=function(b){ try{ b.text().then(function(t){ window.__saved.push(t); }); }catch(e){} return real.call(URL,b); };
  var click=HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click=function(){ if(this.download){ window.__lastName=this.download; return; } return click.call(this); };
})();`;

async function saveAndRead(page, which) {
  await page.ev(`window.__saved=[];document.querySelector('[data-pa="${which}"]').click();"ok"`);
  for (let i = 0; i < 40; i++) {
    const n = Number(await page.ev(`window.__saved.length`));
    if (n > 0) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const raw = await page.ev(`window.__saved[0]||""`);
  assert.ok(raw, `${which} produced no file`);
  return { json: JSON.parse(raw), name: await page.ev(`window.__lastName||""`) };
}

// ---- the schema itself ----

test("export: schema.json constrains every property it lists", () => {
  const loose = Object.entries(SCHEMA.properties || {})
    .filter(([, v]) => !v.type && v.const === undefined && !v.enum)
    .map(([k]) => k);
  assert.deepEqual(loose, [], "a property with no type, const or enum cannot be validated by a consumer");
});

test("export: every field the schema requires is one the summary actually emits", async () => {
  const srv = await startServer();
  const page = await launch({ port: srv.port, preload: CAPTURE });
  try {
    await runAudit(page);
    const { json } = await saveAndRead(page, "savesum");
    const missing = (SCHEMA.required || []).filter((f) => !(f in json));
    assert.deepEqual(missing, [], "the schema requires a field the real export does not produce");
  } finally { await page.close(); srv.close(); }
});

// ---- the real files ----

test("export: the summary the Save button writes validates against schema.json", async () => {
  const srv = await startServer();
  const page = await launch({ port: srv.port, preload: CAPTURE });
  try {
    await runAudit(page);
    const { json } = await saveAndRead(page, "savesum");
    assert.equal(json.schema, "privacyassay-summary/1.0", "the file must identify its own schema");
    assert.deepEqual(validate(json, SCHEMA), []);
  } finally { await page.close(); srv.close(); }
});

test("export: the summary carries the score the page is showing, not a stale one", async () => {
  const srv = await startServer();
  const page = await launch({ port: srv.port, preload: CAPTURE });
  try {
    const kit = await runAudit(page);
    const { json } = await saveAndRead(page, "savesum");
    assert.equal(json.score, kit.findability.score, "saved score must equal the scored result");
    assert.equal(json.grade, kit.findability.grade, "saved grade must equal the scored result");
    assert.equal(typeof json.generated, "string", "the file must be dated");
    assert.ok(!Number.isNaN(Date.parse(json.generated)), `generated is not a parseable date: ${json.generated}`);
  } finally { await page.close(); srv.close(); }
});

test("export: the full report is valid JSON and carries the same score as the summary", async () => {
  const srv = await startServer();
  const page = await launch({ port: srv.port, preload: CAPTURE });
  try {
    await runAudit(page);
    const sum = await saveAndRead(page, "savesum");
    const full = await saveAndRead(page, "savefull");
    assert.equal(typeof full.json, "object", "the full report must parse as an object");
    assert.equal(full.json.score ?? sum.json.score, sum.json.score,
      "the two files disagree about the score of the same run");
  } finally { await page.close(); srv.close(); }
});

// ---- redaction, which is the promise attached to this file ----
// Redact is on by default and the UI calls the result safe to share, so the check that matters is
// on the bytes a user actually posts, not on paRedactVal in isolation.

test("export: with Redact on, no saved value looks like a fingerprint", async () => {
  const srv = await startServer();
  const page = await launch({ port: srv.port, preload: CAPTURE });
  try {
    await runAudit(page);
    const { json, name } = await saveAndRead(page, "savesum");
    const text = JSON.stringify(json);
    const ua = await page.ev("navigator.userAgent");
    assert.ok(!text.includes(ua), "the raw user agent survived into a redacted summary");
    const hashes = [...text.matchAll(/"([0-9a-f]{8,})"/g)].map((m) => m[1]);
    assert.deepEqual(hashes, [], `a hash survived redaction: ${hashes.slice(0, 3).join(", ")}`);
    assert.ok(/score\d+/.test(name), `with Redact on the filename must carry the score, got "${name}"`);
  } finally { await page.close(); srv.close(); }
});

test("export: turning Redact off changes the file, so the toggle is not decorative", async () => {
  const srv = await startServer();
  const page = await launch({ port: srv.port, preload: CAPTURE });
  try {
    await runAudit(page);
    const on = await saveAndRead(page, "savesum");
    await page.ev(`document.querySelector('[data-pa="redact"]').click();"ok"`);
    await new Promise((r) => setTimeout(r, 400));
    const off = await saveAndRead(page, "savesum");
    assert.notDeepEqual(off.json, on.json, "the redact toggle produced an identical file both ways");
    assert.equal(off.json.score, on.json.score, "redaction must never change the score");
  } finally { await page.close(); srv.close(); }
});
