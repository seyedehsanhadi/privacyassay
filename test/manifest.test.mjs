import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { grabVar } from "./helpers/extract.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, "schema.json"), "utf8"));
const CLI = fs.readFileSync(path.join(ROOT, "bin", "privacyassay.mjs"), "utf8");
const { PRIORS } = new Function(grabVar("PRIORS") + "return {PRIORS};")();

test("manifest: package.json version and PRIORS.version agree", () => {
  assert.equal(PKG.version, PRIORS.version, "a version that drifts makes every exported report unattributable");
});

test("manifest: every file listed in package.json files exists", () => {
  const missing = PKG.files.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  assert.deepEqual(missing, []);
});

test("manifest: schema.json declares every field the summary output emits", () => {
  const emitted = [...CLI.matchAll(/^\s*(?:schema|tool|version|userAgent|score|grade|verdict|strongest|exposedStrong|shownCount|readingsTotal|randomizer|crossSite|note):/gm)]
    .map((m) => m[0].trim().replace(":", ""));
  assert.ok(emitted.length > 5, `expected to find summary fields in the CLI, found ${emitted.length}`);
  const declared = new Set(Object.keys(SCHEMA.properties || {}));
  const undeclared = [...new Set(emitted)].filter((f) => !declared.has(f));
  assert.deepEqual(undeclared, [], "a field the CLI emits but the schema does not declare cannot be validated by a consumer");
});

test("manifest: every required field in schema.json is actually emitted by the CLI", () => {
  const missing = (SCHEMA.required || []).filter((f) => !new RegExp(`\\b${f}\\s*:`).test(CLI));
  assert.deepEqual(missing, [], "a required field the CLI never emits makes every real output invalid against its own schema");
});

test("manifest: the CLI help text lists every flag the CLI reads", () => {
  const help = (CLI.match(/Usage: privacyassay[\s\S]*?`\)/) || [""])[0];
  const read = [...new Set([...CLI.matchAll(/(?:flag|val|num)\("(--[a-z-]+)"/g)].map((m) => m[1]))];
  const undocumented = read.filter((f) => !help.includes(f));
  assert.deepEqual(undocumented, []);
});

// The README tells a reviewer how the file is organised. A section added without a banner, or a
// stray explanatory comment creeping back in, both drift silently. Check counts are deliberately
// NOT asserted here: inject.test.mjs generates two tests from one loop, so any static count of
// `test(` calls is wrong by construction, and a test that is wrong by construction is worse than
// a stale number in a README.
test("readme: the section markers it describes are the ones the file uses", () => {
  const src = fs.readFileSync(path.join(HERE, "..", "index.html"), "utf8").split("\n");
  const sections = src.filter((l) => /^\/\* [A-Z].*=+ \*\/$/.test(l));
  const subs = src.filter((l) => /^\/\* - .*-+ \*\/$/.test(l));
  assert.ok(sections.length >= 20, `expected a sectioned file, found ${sections.length} section banners`);
  assert.ok(subs.length >= 10, `expected subsections, found ${subs.length}`);
  const widths = new Set(sections.map((l) => l.length));
  assert.equal(widths.size, 1, `section banners must all be one width, got ${[...widths].join(", ")}`);
  const subWidths = new Set(subs.map((l) => l.length));
  assert.equal(subWidths.size, 1, `subsection banners must all be one width, got ${[...subWidths].join(", ")}`);
  const loose = src.filter((l) => /^\s*\/\/(?!\/)/.test(l));
  assert.deepEqual(loose, [], "index.html carries navigation markers only; explanations belong in the tests");
});
