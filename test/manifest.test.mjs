// The parts that must agree with each other: package.json, schema.json, the CLI flags, the README
// section markers, and the deadlines the document quotes. Drift here is invisible until it ships.
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

// PA_HOME bounces a direct visit to the companion host back to the main site. The exemption list
// is the only thing that keeps the companion's own machine-readable loads alive, and it named just
// pabeacon: the supercookie write frame loads ?pa=w#pastore=TOKEN, so on a real deployment it was
// redirected away before the store handler ran. Loopback never showed it, because PA_COMPANION is
// empty there and the whole guard is skipped. Every second-origin entry point must be exempt.
test("companion: the home redirect exempts every second-origin entry point", () => {
  const src = fs.readFileSync(path.join(HERE, "..", "index.html"), "utf8");
  const guard = (src.match(/if\(location\.host===_cu\.host&&PA_HOME&&!\/([^/]+)\/\.test/) || [])[1];
  assert.ok(guard, "the PA_HOME redirect guard was not found");
  for (const mode of ["pabeacon", "pastore"]) {
    assert.ok(new RegExp(mode).test(guard),
      `the redirect guard does not exempt #${mode}, so that load is bounced to PA_HOME on a real deployment`);
  }
});

// Tor and Mullvad strip the cross-origin referrer, so a second-origin handler that replies to
// new URL(document.referrer).origin computes an empty string and posts nowhere. postMessage with
// a falsy target is skipped, not thrown, so the write promise sat until its deadline and resolved
// null: the whole supercookie category was dropped for both browsers with nothing reported. The
// beacon half was fixed for this once; the store half kept the referrer and was missed. Every
// second-origin reply must resolve its target from PA_HOME or its own location instead.
test("second-origin: a reply target is never derived from document.referrer", () => {
  const src = fs.readFileSync(path.join(HERE, "..", "index.html"), "utf8");
  assert.equal((src.match(/document\.referrer/g) || []).length, 0,
    "a second-origin reply target derived from document.referrer is empty on any browser that strips it");
});

// The page runs the two-origin comparison and waits PA_CROSS_MS for it. The CLI polls with its own
// deadline, and that was 25s against the page's 45s: the CLI gave up twenty seconds early, so on
// exactly the hardened browsers that need the full budget it reported "not measurable" for a run
// the page went on to finish, failing a --min-score gate on a browser that was fine.
test("cli: the cross-site deadline is not shorter than the page's own budget", () => {
  const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const page = Number((src.match(/var PA_CROSS_MS\s*=\s*(\d+)/) || [])[1]);
  const cli = Number((CLI.match(/num\("--cross-timeout",\s*"(\d+)"/) || [])[1]);
  assert.ok(page > 0 && cli > 0, `could not read both budgets: page=${page} cli=${cli}`);
  assert.ok(cli >= page,
    `CLI waits ${cli}ms for the cross-site result but the page waits ${page}ms; the CLI gives up first`);
});

// The companion runs the whole audit before it can answer, and a hardened build is slower at it
// than a stock one. At 15s the cross-site figure timed out far more often than it completed on
// the three browsers this benchmark cares most about: measured over 12 runs each it finished
// 12/12 on Chrome, Edge, Brave and stock Firefox but only 6/12 on Mullvad, 5/12 on Tor and 1/12
// on LibreWolf. The budget is a named constant so it cannot drift back to a number that quietly
// turns those rows into "not measurable".
test("cross-site: the companion is given long enough for a hardened build to answer", () => {
  const src = fs.readFileSync(path.join(HERE, "..", "index.html"), "utf8");
  const budget = Number((src.match(/var PA_CROSS_MS\s*=\s*(\d+)/) || [])[1]);
  const fallback = Number((src.match(/PA_CROSS_FALLBACK_MS\s*=\s*(\d+)/) || [])[1]);
  assert.ok(budget >= 40000, `cross-site budget is ${budget}ms; a hardened Gecko build needs more`);
  assert.ok(fallback < budget, `the iframe fallback (${fallback}ms) must fire well before the budget expires`);
  assert.equal((src.match(/},\s*15000\)/g) || []).length, 0,
    "a hardcoded 15s timeout is back; every cross-site deadline must use the named constant");

  // The READ half was raised to the named constant and the WRITE half was missed: it kept its own
  // hardcoded 16000, one thousand past what the check above looks for. It loads the same whole
  // page at the second origin, so on a hardened Gecko build it expired, resolved null, and the
  // supercookie category was dropped for Tor and Mullvad without a reading ever being taken.
  const body = src.slice(src.indexOf("function paPartitionWrite"), src.indexOf("/* LIE-DETECTION"));
  assert.match(body, /PA_CROSS_MS/,
    "paPartitionWrite must share the named cross-origin budget, not carry its own deadline");
  for (const m of body.matchAll(/,\s*(\d{4,})\s*\)/g)) {
    const ms = Number(m[1]);
    assert.ok(ms < 2000 || ms >= 40000,
      `paPartitionWrite has a ${ms}ms deadline; the second origin needs the full budget`);
  }

  // The document said fifteen seconds in one section and forty-five in two others, because
  // nothing tied the prose to the constant. Whatever the budget becomes, the doc has to say it
  // and must not leave an older figure behind in another paragraph.
  const doc = fs.readFileSync(path.join(HERE, "..", "METHODOLOGY.md"), "utf8");
  const WORDS = { 15: "fifteen", 30: "thirty", 45: "forty-five", 60: "sixty" };
  const secs = budget / 1000;
  const said = WORDS[secs] || String(secs);
  const stated = [...doc.matchAll(/answer within ([a-z-]+|\d+) seconds/g)].map((m) => m[1]);
  assert.ok(stated.length > 0, "METHODOLOGY must state the deadline the second site is given");
  for (const v of stated) {
    assert.ok(v === said || v === String(secs),
      `METHODOLOGY says the second site gets "${v} seconds" but the budget is ${secs}s`);
  }
});

// Every unit test here extracts one function out of index.html and runs it in isolation, so a
// syntax error ANYWHERE ELSE in the file passes all of them while the page loads nothing at all.
// That happened: a mis-escaped quote in a style string took the whole tool down and 82 checks
// stayed green. Parse each inline script the way the browser would.
test("index.html: every inline script parses", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 3, `expected the tool's inline scripts, found ${scripts.length}`);
  const broken = [];
  scripts.forEach((src, i) => {
    if (!src.trim()) return;
    try { new Function(src); } catch (e) { broken.push(`script ${i}: ${e.message}`); }
  });
  assert.deepEqual(broken, [], "a script that does not parse means the page loads nothing");
});
