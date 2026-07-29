import { test } from "node:test";
import assert from "node:assert/strict";
import { grabVar, grabFn } from "./helpers/extract.mjs";

const { PRIORS, paTier } = new Function(grabVar("PRIORS") + grabFn("paTier") + "return {PRIORS, paTier};")();

test("priors: every surface has a key, a label, a group and a tier of 1, 2 or 3", () => {
  const bad = PRIORS.surfaces.filter((s) => !s.k || !s.label || !s.group || ![1, 2, 3].includes(paTier(s)));
  assert.deepEqual(bad.map((s) => s.k || s.label), [], "surfaces missing a required field");
});

test("priors: surface keys are unique", () => {
  const seen = new Set(), dupes = [];
  for (const s of PRIORS.surfaces) { if (seen.has(s.k)) dupes.push(s.k); seen.add(s.k); }
  assert.deepEqual(dupes, []);
});

test("priors: surface labels are unique, because findability rows are looked up by label", () => {
  const seen = new Set(), dupes = [];
  for (const s of PRIORS.surfaces) { if (seen.has(s.label)) dupes.push(s.label); seen.add(s.label); }
  assert.deepEqual(dupes, [], "two surfaces sharing a label make one of them unreachable by label lookup");
});

test("priors: every implies key names a real surface", () => {
  const keys = new Set(PRIORS.surfaces.map((s) => s.k));
  const bad = [];
  for (const [fam, br] of Object.entries(PRIORS.browsers))
    for (const k of Object.keys(br.implies || {}))
      if (!keys.has(k)) bad.push(`${fam}.${k}`);
  assert.deepEqual(bad, [], "an implies entry for a nonexistent surface can never fire and silently does nothing");
});

test("priors: every hashKey names a real surface key or a key observeVectors produces", () => {
  const keys = new Set(PRIORS.surfaces.map((s) => s.k));
  const aux = new Set(["canvasHash", "webglHash", "audioHash", "fontSet", "fontLocalBlocked"]);
  const bad = PRIORS.surfaces.filter((s) => s.hashKey && !keys.has(s.hashKey) && !aux.has(s.hashKey));
  assert.deepEqual(bad.map((s) => `${s.k}->${s.hashKey}`), []);
});

test("priors: every browser family that implies a value cites a source", () => {
  const bad = [];
  for (const [fam, br] of Object.entries(PRIORS.browsers))
    if (br.implies && Object.keys(br.implies).length && !br.verified) bad.push(fam);
  assert.deepEqual(bad, [], "an implies entry is a claim about every user of a browser and must cite where it came from");
});

test("priors: version is a semver string", () => {
  assert.match(String(PRIORS.version), /^\d+\.\d+\.\d+$/);
});

test("priors: group weights sum to the documented totals", () => {
  const groupTier = {};
  for (const s of PRIORS.surfaces) groupTier[s.group] = Math.max(groupTier[s.group] || 0, paTier(s));
  const optionalGroups = new Set(PRIORS.surfaces.filter((s) => s.optional).map((s) => s.group));
  const all = Object.values(groupTier).reduce((a, b) => a + b, 0);
  const nonOptional = Object.entries(groupTier).filter(([g]) => !optionalGroups.has(g)).reduce((a, [, t]) => a + t, 0);
  assert.equal(all, 30, `METHODOLOGY.md states thirteen categories summing to 30, computed ${all}`);
  assert.equal(nonOptional, 21, `METHODOLOGY.md states the non-optional ten sum to 21, computed ${nonOptional}`);
});
