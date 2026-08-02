// Reads the JSON the tool actually WRITES OUT for every browser and every opt-in setting, and
// checks it against itself, against the schema, and against the product. Bugs live here that
// __KIT never shows: an inverted count, a stale sentence, a hash surviving redaction.
import fs from "node:fs";
import path from "node:path";
import { grabVar } from "../test/helpers/extract.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const OUT = path.join(HERE, "captures");
const ROOT = path.resolve(HERE, "..");
const { PRIORS } = new Function(grabVar("PRIORS") + "return {PRIORS};")();
const SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, "schema.json"), "utf8"));
const INDEX = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

const SCEN = { "": "both off", "-rtc": "webrtc on", "-store": "storage on", "-rtcstore": "both on" };
const BROWSERS = ["chrome", "edge", "brave", "firefox", "librewolf", "mullvad", "tor"];
const HEX8 = /^[0-9a-f]{8}$/i;
const findings = [];
const add = (browser, scen, sev, what) => findings.push({ browser, scen, sev, what });

function walk(v, fn, keyPath = "") {
  if (v == null) return;
  if (Array.isArray(v)) return v.forEach((x, i) => walk(x, fn, keyPath + "[" + i + "]"));
  if (typeof v === "object") return Object.keys(v).forEach((k) => walk(v[k], fn, keyPath ? keyPath + "." + k : k));
  fn(v, keyPath);
}

// Minimal draft-07 subset: required, type, enum, const, minimum/maximum.
function validate(obj, schema, where = "") {
  const errs = [];
  const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
  const ok = (v, t) => (Array.isArray(t) ? t.some((x) => ok(v, x)) : t === "number" ? typeof v === "number"
    : t === "integer" ? Number.isInteger(v) : typeOf(v) === t);
  for (const r of schema.required || []) if (!(r in obj)) errs.push(`${where}: missing required "${r}"`);
  for (const [k, sub] of Object.entries(schema.properties || {})) {
    if (!(k in obj) || obj[k] === undefined) continue;
    const v = obj[k];
    if (sub.type && !ok(v, sub.type)) errs.push(`${where}${k}: expected ${JSON.stringify(sub.type)}, got ${typeOf(v)}`);
    if (sub.const !== undefined && v !== sub.const) errs.push(`${where}${k}: expected const ${sub.const}`);
    if (sub.enum && !sub.enum.includes(v)) errs.push(`${where}${k}: ${JSON.stringify(v)} not in enum`);
    if (typeof v === "number") {
      if (sub.minimum !== undefined && v < sub.minimum) errs.push(`${where}${k}: ${v} < ${sub.minimum}`);
      if (sub.maximum !== undefined && v > sub.maximum) errs.push(`${where}${k}: ${v} > ${sub.maximum}`);
    }
    if (sub.properties && v && typeof v === "object" && !Array.isArray(v)) errs.push(...validate(v, sub, where + k + "."));
  }
  return errs;
}

const band = (n) => (n >= 90 ? "A" : n >= 75 ? "B" : n >= 60 ? "C" : n >= 40 ? "D" : "F");
let checked = 0;

for (const b of BROWSERS) {
  for (const [tag, name] of Object.entries(SCEN)) {
    const f = path.join(OUT, `${b}-headful-postback${tag}.json`);
    if (!fs.existsSync(f)) { add(b, name, "gap", "no capture file"); continue; }
    const cap = JSON.parse(fs.readFileSync(f, "utf8"));
    const run = (cap.runs || []).find((r) => r && r.exports);
    if (!run) { add(b, name, "gap", "capture has no export"); continue; }
    const ex = run.exports, S = ex.summary, F = ex.full;
    (ex.errors || []).forEach((e) => add(b, name, "major", "export capture error: " + e));
    if (!S) { add(b, name, "blocker", "the Save summary button produced no JSON"); continue; }
    if (!F) { add(b, name, "blocker", "the Save full button produced no JSON"); continue; }
    checked++;

    for (const e of validate(S, SCHEMA)) add(b, name, "major", "schema: " + e);

    const fi = F.findability || {};
    const rows = fi.rows || [];
    if (S.score !== run.score) add(b, name, "blocker", `summary score ${S.score} != live score ${run.score}`);
    if (fi.score !== S.score) add(b, name, "blocker", `full findability score ${fi.score} != summary ${S.score}`);
    if (S.grade !== band(S.score)) add(b, name, "blocker", `grade ${S.grade} wrong for score ${S.score}`);

    const c = S.counts || {};
    if (c.readingsTotal !== rows.length) add(b, name, "major", `counts.readingsTotal ${c.readingsTotal} != rows ${rows.length}`);
    const shown = rows.filter((r) => r.state === "shown").length;
    if (c.readingsHidden !== rows.length - shown) add(b, name, "blocker", `counts.readingsHidden ${c.readingsHidden} != total-shown ${rows.length - shown}`);
    const masked = rows.filter((r) => r.state === "blended").length, ref = rows.filter((r) => r.state === "refused").length;
    if (c.masked !== masked) add(b, name, "major", `counts.masked ${c.masked} != ${masked}`);
    if (c.notReadable !== ref) add(b, name, "major", `counts.notReadable ${c.notReadable} != ${ref}`);
    if (c.readingsHidden !== (c.masked || 0) + (c.notReadable || 0))
      add(b, name, "blocker", `counts do not add up: hidden ${c.readingsHidden} != masked ${c.masked} + notReadable ${c.notReadable}`);
    if ((c.readingsTotal || 0) - (c.readingsHidden || 0) !== shown)
      add(b, name, "blocker", `counts: total-hidden ${(c.readingsTotal||0)-(c.readingsHidden||0)} != shown ${shown}`);

    if (S.cappedBy !== (fi.strongest || null)) add(b, name, "major", `cappedBy ${JSON.stringify(S.cappedBy)} != strongest ${JSON.stringify(fi.strongest)}`);
    const strong3 = rows.filter((r) => r.state === "shown" && r.tier >= 3).map((r) => r.label);
    if (JSON.stringify(S.topLeaks || []) !== JSON.stringify(strong3)) add(b, name, "major", `topLeaks ${JSON.stringify(S.topLeaks)} != shown tier-3 ${JSON.stringify(strong3)}`);
    if ((S.counts || {}).strongLeaks !== strong3.length) add(b, name, "major", `counts.strongLeaks ${c.strongLeaks} != ${strong3.length}`);

    if (S.crossSite && F.findabilityCross) {
      const xr = F.findabilityCross;
      if (S.crossSite.score !== xr.score) add(b, name, "major", `crossSite.score ${S.crossSite.score} != full ${xr.score}`);
    }
    if (S.crossSite && S.crossSite.signalsCompared != null && S.crossSite.signalsCompared !== rows.length)
      add(b, name, "major", `crossSite.signalsCompared ${S.crossSite.signalsCompared} != scored rows ${rows.length}`);

    if (F.version !== PRIORS.version) add(b, name, "major", `full.version ${JSON.stringify(F.version)} != PRIORS ${PRIORS.version}`);

    // Redaction: the capture runs with the default (on), so nothing identifying may survive.
    if (ex.redactOn) {
      for (const k of ["fingerprint", "stableHash", "crossBrowser", "coherence", "leaks", "realm", "worker", "uaHigh"])
        if (k in F && F[k] !== "[redacted]" && F[k] != null && typeof F[k] === "object")
          add(b, name, "blocker", `full.${k} not redacted with Redact on`);
      const hashes = [];
      walk(F, (v, p) => { if (typeof v === "string" && HEX8.test(v)) hashes.push(p + "=" + v); });
      if (hashes.length) add(b, name, "blocker", `${hashes.length} hash-shaped values survived redaction, e.g. ${hashes.slice(0, 3).join(", ")}`);
      if (ex.summaryName && !/score\d+/.test(ex.summaryName)) add(b, name, "major", `summary filename leaks: ${ex.summaryName}`);
      if (ex.fullName && !/score\d+/.test(ex.fullName)) add(b, name, "major", `full filename leaks: ${ex.fullName}`);
    }

    // The exported note must not re-make a claim the product retracted.
    if (/share of what could identify you/i.test(S.note || "") && !/what this tool checks/i.test(INDEX.match(/You hide "\+score\+"% of ([^"]*)"/)?.[1] || ""))
      add(b, name, "major", "summary.note still claims 'what could identify you' after the UI dropped it");
    if (/share of what could identify you/i.test(S.note || "")) add(b, name, "major", "summary.note repeats the population claim the verdict no longer makes");

    for (const [k, v] of Object.entries(S)) if (v === undefined) add(b, name, "major", `summary.${k} is undefined`);
    walk(S, (v, p) => { if (typeof v === "number" && !Number.isFinite(v)) add(b, name, "blocker", `summary.${p} is ${v}`); });
    walk(fi, (v, p) => { if (typeof v === "number" && !Number.isFinite(v)) add(b, name, "blocker", `findability.${p} is ${v}`); });
  }
}

const bySev = findings.reduce((a, f) => (a[f.sev] = (a[f.sev] || 0) + 1, a), {});
console.log(`checked ${checked} exports across ${BROWSERS.length} browsers x ${Object.keys(SCEN).length} settings`);
console.log("findings:", JSON.stringify(bySev));
const seen = new Set();
for (const sev of ["blocker", "major", "gap"]) {
  const list = findings.filter((f) => f.sev === sev);
  if (!list.length) continue;
  console.log(`\n== ${sev.toUpperCase()} ==`);
  for (const f of list) {
    const key = sev + f.what.replace(/\d+/g, "#");
    const first = !seen.has(key); seen.add(key);
    console.log(`  ${f.browser.padEnd(10)} ${f.scen.padEnd(11)} ${first ? f.what : f.what.slice(0, 90)}`);
  }
}
fs.writeFileSync(path.join(OUT, "export-audit.json"), JSON.stringify(findings, null, 2));
