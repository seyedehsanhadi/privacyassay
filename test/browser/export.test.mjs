import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../helpers/server.mjs";
import { launch, runAudit } from "../helpers/browser.mjs";

/* ================================================================
   Verbatim from the task-12 brief. No id or mechanism fixes were
   needed here: this file builds its own summary object and never
   drives redactOptin or calls paSave.
   ================================================================ */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = JSON.parse(fs.readFileSync(path.join(HERE, "..", "..", "schema.json"), "utf8"));

function validate(obj, schema, at = "$") {
  const errs = [];
  for (const req of schema.required || []) if (!(req in obj)) errs.push(`${at}: missing required "${req}"`);
  for (const [k, v] of Object.entries(obj)) {
    const spec = (schema.properties || {})[k];
    if (!spec) { if (schema.additionalProperties === false) errs.push(`${at}.${k}: not declared in schema`); continue; }
    const t = spec.type;
    if (!t) continue;
    const types = Array.isArray(t) ? t : [t];
    const actual = v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "number" ? (Number.isInteger(v) ? "integer" : "number") : typeof v;
    const ok = types.some((x) => x === actual || (x === "number" && actual === "integer"));
    if (!ok) errs.push(`${at}.${k}: schema says ${types.join("|")}, value is ${actual}`);
  }
  return errs;
}

test("export: schema.json constrains every property it lists", () => {
  // const and enum are stronger constraints than type, not weaker, so either satisfies this.
  // Requiring `type` alone would flag {"const": "privacyassay-summary/1.0"} as a defect.
  const loose = Object.entries(SCHEMA.properties || {})
    .filter(([, v]) => !v.type && v.const === undefined && !v.enum)
    .map(([k]) => k);
  assert.deepEqual(loose, [], "a property with no type, const or enum cannot be validated by a consumer");
});

test("export: a real audit result validates against schema.json", async () => {
  const srv = await startServer();
  const page = await launch({ port: srv.port });
  try {
    const kit = await runAudit(page);
    const F = kit.findability;
    const summary = {
      schema: "privacyassay-summary/1.0", tool: "privacyassay", version: kit.version,
      userAgent: await page.ev("navigator.userAgent"),
      score: F.score, grade: F.grade, verdict: F.verdict || null,
      strongest: F.strongest || null, exposedStrong: F.exposedStrong || [],
      shownCount: F.shownCount, readingsTotal: (F.checks && F.checks.total) || null,
      randomizer: false, crossSite: null, note: "test",
    };
    assert.deepEqual(validate(summary, SCHEMA), []);
  } finally { await page.close(); srv.close(); }
});
