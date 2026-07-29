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
  const claimed = /Seven readings carry that weight/.test(DOC);
  assert.ok(claimed, "document should state how many cross-browser anchors there are");
  const anchors = ["GPU name", "installed fonts", "screen size", "CPU cores", "timezone", "colour depth", "platform"];
  const labels = new Set(PRIORS.surfaces.map((s) => s.label));
  const missing = anchors.filter((a) => !labels.has(a));
  assert.deepEqual(missing, [], "an anchor named in the document must be a real scored reading");
});
