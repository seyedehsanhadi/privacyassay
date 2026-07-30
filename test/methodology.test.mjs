import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { grabVar, grabFn } from "./helpers/extract.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DOC = fs.readFileSync(path.join(HERE, "..", "METHODOLOGY.md"), "utf8");
const { PRIORS, paTier } = new Function(grabVar("PRIORS") + grabFn("paTier") + "return {PRIORS, paTier};")();

const TIERWORD = { 3: "strong", 2: "medium", 1: "weak" };

test("methodology: every reading named in the weight table exists in PRIORS with the stated weight", () => {
  const rows = DOC.split("\n").filter((l) => /^\| [A-Z]/.test(l) && l.includes("("));
  assert.ok(rows.length >= 10, `expected the weight table to have rows, found ${rows.length}`);
  const byLabel = new Map(PRIORS.surfaces.map((s) => [s.label, paTier(s)]));
  const bad = [];
  for (const line of rows) {
    // Start class must accept a capital or digit. An earlier [a-z] silently truncated every label
    // beginning with GPU, CPU, SVG, MathML, WebRTC or 3D, turning "GPU name" into "name" and
    // reporting seven readings as missing from PRIORS that were present all along.
    for (const m of line.matchAll(/([A-Za-z0-9][a-zA-Z0-9 /.'()-]*?) \((\d)\)/g)) {
      const label = m[1].trim(), weight = Number(m[2]);
      if (!byLabel.has(label)) bad.push(`${label}: named in METHODOLOGY.md, absent from PRIORS`);
      else if (byLabel.get(label) !== weight) bad.push(`${label}: doc says ${weight}, PRIORS says ${byLabel.get(label)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("methodology: every scored reading in PRIORS is named somewhere in the document", () => {
  const bad = PRIORS.surfaces.filter((s) => !DOC.includes(s.label)).map((s) => s.label);
  assert.deepEqual(bad, [], "a scored reading absent from the methodology cannot be recomputed by hand, which the document promises");
});

test("methodology: the grade bands in the document match the bands in findability", () => {
  const src = grabFn("findability");
  for (const [band, cut] of [["A", 90], ["B", 75], ["C", 60], ["D", 40]])
    assert.ok(src.includes(`>=${cut}?"${band}"`), `findability should cut ${band} at ${cut}`);
  assert.ok(DOC.includes("A 90+") && DOC.includes("B 75-89") && DOC.includes("C 60-74") && DOC.includes("D 40-59"));
});

test("methodology: the tier vocabulary in the document matches TIERWORD in source", () => {
  for (const w of Object.values(TIERWORD)) assert.ok(DOC.includes(w), `document should use the word ${w}`);
});

test("methodology: the cross-browser anchor count matches the surfaces marked as anchors", () => {
  // Assert the FACT (seven anchors, each a real scored reading), not the sentence wording,
  // so a rewrite cannot fail this while an actual removal still does.
  assert.match(DOC, /[Ss]even readings/, "the document must say how many cross-browser anchors there are");
  const anchors = ["GPU name", "installed fonts", "screen size", "CPU cores", "timezone", "colour depth", "platform"];
  const labels = new Set(PRIORS.surfaces.map((s) => s.label));
  const missing = anchors.filter((a) => !labels.has(a));
  assert.deepEqual(missing, [], "an anchor named in the document must be a real scored reading");
});

// The published reference table is the single most quotable thing in this repo, and the last one
// was wrong for weeks: every row was three points high because an extension scan that found
// nothing was scored as protection. These checks cannot re-measure a browser, but they catch a
// table that contradicts the tool's own documented arithmetic or its own stated runs.
function referenceRows() {
  return DOC.split("\n")
    .filter((l) => /^\| [A-Z][A-Za-z ]* \| \d+[\d.]*[\w.-]* \| \d+ \| [A-F] \|/.test(l))
    .map((l) => {
      const c = l.split("|").map((x) => x.trim()).filter(Boolean);
      return { browser: c[0], version: c[1], score: Number(c[2]), grade: c[3], runs: (c[4] || "").split(",").map((n) => Number(n.trim())) };
    });
}

test("reference table: every row is present and parses", () => {
  const rows = referenceRows();
  assert.equal(rows.length, 7, `expected seven browsers, parsed ${rows.length}: ${rows.map((r) => r.browser).join(", ")}`);
});

test("reference table: each grade matches the score under the documented bands", () => {
  const band = (n) => (n >= 90 ? "A" : n >= 75 ? "B" : n >= 60 ? "C" : n >= 40 ? "D" : "F");
  const bad = referenceRows().filter((r) => band(r.score) !== r.grade)
    .map((r) => `${r.browser} ${r.score} labelled ${r.grade}, bands say ${band(r.score)}`);
  assert.deepEqual(bad, []);
});

test("reference table: the published score is the median of the runs beside it", () => {
  const bad = [];
  for (const r of referenceRows()) {
    if (!r.runs.length || r.runs.some((n) => !Number.isFinite(n))) { bad.push(`${r.browser}: runs unparseable`); continue; }
    const sorted = r.runs.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor((sorted.length - 1) / 2)];
    if (median !== r.score) bad.push(`${r.browser}: score ${r.score} but runs ${r.runs.join(",")} median ${median}`);
  }
  assert.deepEqual(bad, []);
});

test("reference table: every score is a whole number in range", () => {
  const bad = referenceRows().filter((r) => !Number.isInteger(r.score) || r.score < 0 || r.score > 100).map((r) => `${r.browser}=${r.score}`);
  assert.deepEqual(bad, []);
});

test("reference table: the caveats that make the numbers honest are all present", () => {
  const required = [
    ["your result will differ", /Your result will differ/i],
    ["single visit scope", /one visit to one site/i],
    ["Brave is not a verdict", /Brave's 5 is not a verdict/i],
    ["Tor proxy forced direct", /proxy forced to a direct connection/i],
    ["NoScript moved aside", /NoScript/],
    ["fingerprint findability only", /fingerprint findability only/i],
    ["dated and drifts", /Numbers drift as browsers ship/i],
    ["measurement date", /2026-07-29/],
  ];
  const missing = required.filter(([, re]) => !re.test(DOC)).map(([n]) => n);
  assert.deepEqual(missing, [], "a published table without its caveats overstates what was measured");
});

// The calibration statement is the part of the document most likely to be trimmed by a future
// editor who thinks it reads as hedging. It is not hedging: it is the finding that the ordering
// survived five reweightings and a thirteen-category jackknife while the absolute values moved by
// up to 24 points. Losing it turns a defensible ranking back into an overclaimed number.
test("methodology: the calibration statement survives, with the evidence that earns it", () => {
  const required = [
    ["ordering named as the result", /ordering is the result/i],
    ["number named as an indicator", /number is an indicator/i],
    ["reweighting was actually run", /inverted tiers|tiers inverted/i],
    ["jackknife over the categories", /jackknife/i],
    ["the spread is quantified", /24-point range/i],
    ["the supported claim is spelled out", /is supported|this method supports/i],
    ["the unsupported claim is spelled out", /one weighting, one machine, one date/i],
  ];
  const missing = required.filter(([, re]) => !re.test(DOC)).map(([n]) => n);
  assert.deepEqual(missing, [], "the ordering-versus-number distinction must stay, or the table overclaims");
});

test("methodology: the refused-is-credited limit stays disclosed", () => {
  assert.match(DOC, /refused reading is credited as protection/i, "the structural weakness must be stated, not implied");
  assert.match(DOC, /three points too high/i, "the disclosure keeps its worked example, which is what makes it credible");
});

test("methodology: a blocked cross-site probe is never presented as a zero", () => {
  assert.match(DOC, /cannot be obtained is not a zero/i);
  const rows = DOC.split("\n").filter((l) => /^\| [A-Z][A-Za-z ]* \| \d+[\d.]*[\w.-]* \| \d+ \| [A-F] \|/.test(l));
  const libre = rows.find((l) => l.includes("LibreWolf"));
  assert.ok(libre && /blocked/i.test(libre), "LibreWolf's cross-site cell must say blocked rather than carry a number");
});

test("methodology: the cross-site median advice points at the cross-site number", () => {
  // Fact, not phrasing: the doc must point the median at the CROSS-SITE figure and must carry the
  // measurement that justifies it (single-site stable at 5, cross-site swinging 10/14/14).
  assert.match(DOC, /cross-site\*{0,2} number needs the median|cross-site\*{0,2} number that needs the median/i,
    "a per-session farbler needs the median on the cross-site figure, not the single-site one");
  assert.match(DOC, /10, 14 and 14/, "the claim must carry the launch-to-launch spread that proves it");
  assert.match(DOC, /launches a fresh browser per run/i, "the reason the CLI's median is meaningful must be stated");
});
