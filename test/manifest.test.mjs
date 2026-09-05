// The parts that must agree with each other: package.json, schema.json, the CLI flags, the README
// section markers, and the deadlines the document quotes. Drift here is invisible until it ships.
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { grabVar, grabFn } from "./helpers/extract.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, "schema.json"), "utf8"));
const CLI = fs.readFileSync(path.join(ROOT, "bin", "privacyassay.mjs"), "utf8");
const { PRIORS } = new Function(grabVar("PRIORS") + "return {PRIORS};")();
// ---- manifests: package.json, schema.json and the CLI help ----

test("manifest: package.json version and PRIORS.version agree", () => {
  assert.equal(PKG.version, PRIORS.version, "a version that drifts makes every exported report unattributable");
});

test("manifest: the no-dependencies claim on the README badge is still true", () => {
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"])
    assert.deepEqual(Object.keys(PKG[field] || {}), [],
      `package.json declares ${field}, but the README badge and the headline both say there are none`);
});

test("manifest: entry page remains a standalone document",()=>{const html=fs.readFileSync(path.join(ROOT,"index.html"),"utf8");assert.match(html,/<!doctype html>/i);assert.equal(/<script[^>]+src=/.test(html),false);});

test("historical charts are not presented as current rankings",()=>{const readme=fs.readFileSync(path.join(ROOT,"README.md"),"utf8");assert.match(readme,/not comparable/i);assert.match(readme,/0.9.1-beta/);assert.match(readme,/generated from the current catalog/);});

test("historical captures remain distinct from the current methodology",()=>{const readme=fs.readFileSync(path.join(ROOT,"README.md"),"utf8");assert.match(readme,/0.9.1-beta/);assert.match(readme,/0.9.2/);assert.match(readme,/not comparable/i);});

test("manifest: the citation file agrees with the package it cites", () => {
  const cff = fs.readFileSync(path.join(ROOT, "CITATION.cff"), "utf8");
  const field = (k) => (cff.match(new RegExp(`^${k}:\\s*(.+)$`, "m")) || [])[1]?.trim();
  assert.equal(field("version"), PKG.version,
    "CITATION.cff cites a version the package is not on, so anyone citing this work names the wrong release");
  assert.equal(field("license"), PKG.license, "the cited licence differs from the package licence");
  assert.equal(field("cff-version"), "1.2.0", "GitHub renders the citation button from cff-version 1.2.0");
  assert.match(cff, /^authors:/m, "a citation without an author cannot be cited");
  assert.ok(!/date-released/.test(cff) || /^date-released:\s*\d{4}-\d{2}-\d{2}$/m.test(cff),
    "date-released must be a real ISO date or absent; there is no release to date");
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

// Listing a flag is not the same as describing it truthfully. The help said "default 25000" for
// --cross-timeout after the code moved to 50000, so the one place a user looks to understand the
// tool disagreed with the tool. Every default the help quotes is compared against the real one.
test("manifest: every default the help text quotes is the default the CLI uses", () => {
  const help = (CLI.match(/Usage: privacyassay[\s\S]*?`\)/) || [""])[0];
  const real = new Map([...CLI.matchAll(/(?:num|val)\("(--[a-z-]+)",\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const wrong = [];
  // The value only: a help line may read "(default 1; farbling browsers vary run to run)".
  for (const m of help.matchAll(/(--[a-z-]+)[^\n]*?\(default ([^;)\s]+)/g)) {
    const [, flag, stated] = m;
    if (!real.has(flag)) continue;
    if (real.get(flag) !== stated.trim()) wrong.push(`${flag}: help says ${stated.trim()}, code uses ${real.get(flag)}`);
  }
  assert.deepEqual(wrong, [], "the help text quotes a default the CLI does not use");
});

test("manifest: the CLI help text lists every flag the CLI reads", () => {
  const help = (CLI.match(/Usage: privacyassay[\s\S]*?`\)/) || [""])[0];
  const read = [...new Set([...CLI.matchAll(/(?:flag|val|num)\("(--[a-z-]+)"/g)].map((m) => m[1]))];
  const undocumented = read.filter((f) => !help.includes(f));
  assert.deepEqual(undocumented, []);
});
// ---- the README's description of the source ----

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
// ---- second-origin: entry points, reply targets and deadlines ----

const SRC = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const originSrc = [grabFn("otherOrigin"), grabFn("paIsLocalPage"), grabFn("paCompanion"), grabFn("paBackOrigin")].join("\n");
const onPage = (href, fn) => {
  const u = new URL(href);
  const location = { protocol: u.protocol, hostname: u.hostname, port: u.port, pathname: u.pathname, origin: u.origin };
  return new Function("location", "PA_COMPANION", "PA_HOME", `${originSrc};return ${fn}();`)(
    location, "https://privacyassay.github.io/index.html", "https://privacyassay.com/");
};
const LOCAL = ["http://127.0.0.1:8000/index.html", "http://localhost:8000/index.html",
  "file:///C:/tmp/index.html", "http://[::1]:8000/index.html", "https://localhost/index.html"];

test("second-origin: no local form of the page ever contacts the deployed pair", () => {
  for (const href of LOCAL) {
    const c = onPage(href, "paCompanion");
    assert.ok(!c || !/privacyassay\.(com|github\.io)/.test(c.host),
      `${href} framed the deployed companion (${c && c.host}); a local copy must reach nothing`);
    const back = onPage(href, "paBackOrigin");
    assert.ok(!/privacyassay\.com/.test(back),
      `${href} would post its reply to ${back}; a local parent never receives it`);
  }
});

test("second-origin: the loopback pair still resolves both ways", () => {
  assert.match(onPage("http://127.0.0.1:8000/index.html", "paCompanion").host, /^localhost/);
  assert.match(onPage("http://localhost:8000/index.html", "paCompanion").host, /^127\.0\.0\.1/);
  assert.match(onPage("http://127.0.0.1:8000/index.html", "paBackOrigin"), /^http:\/\/localhost/);
});

test("second-origin: a deployed page uses the configured pair", () => {
  assert.match(onPage("https://privacyassay.com/", "paCompanion").host, /github\.io$/);
  assert.equal(onPage("https://privacyassay.github.io/", "paBackOrigin"), "https://privacyassay.com");
});

test("second-origin: loopback is an exact address, not a prefix", () => {
  const isLocal = (href) => {
    const u = new URL(href);
    return new Function("location", grabFn("paIsLocalPage") + ";return paIsLocalPage();")(
      { protocol: u.protocol, hostname: u.hostname });
  };
  for (const href of ["http://127.0.0.1:8000/", "http://localhost:8000/", "http://[::1]/", "file:///c:/x.html"])
    assert.equal(isLocal(href), true, `${href} is local`);
  for (const href of ["https://localhost.example.com/", "https://127.0.0.1.example.com/", "https://privacyassay.com/"])
    assert.equal(isLocal(href), false, `${href} is a remote host, not loopback`);
});

test("second-origin: the CSP allows both configured origins to be framed", () => {
  const csp = (SRC.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1];
  assert.ok(csp, "the CSP meta tag was not found");
  const configured = ["PA_COMPANION", "PA_HOME"]
    .map((v) => (SRC.match(new RegExp(`var ${v}="([^"]*)"`)) || [])[1])
    .filter((u) => /^https?:\/\//.test(u))
    .map((u) => new URL(u).origin);
  assert.equal(configured.length, 2, "both PA_COMPANION and PA_HOME must name an absolute origin once deployed");
  assert.ok(!/\?/.test((SRC.match(/var PA_COMPANION="([^"]*)"/) || [])[1] || ""),
    "PA_COMPANION must carry no query string; the supercookie write appends its own");
  for (const directive of ["frame-src", "child-src"]) {
    const list = (csp.match(new RegExp(`${directive} ([^;]+)`)) || [])[1] || "";
    for (const origin of configured) {
      assert.ok(list.includes(origin),
        `${directive} does not allow ${origin}; the frame is refused and the row reads "not measurable" with no error`);
    }
  }
});

test("second-origin: a copy hosted at a third domain pairs with nothing", () => {
  for (const href of ["https://example.com/index.html", "https://privacyassay.net/", "https://evil.example/pa.html"])
    assert.equal(onPage(href, "paCompanion"), null,
      `${href} would frame a companion that replies to PA_HOME, so it waits out the budget for a message it can never receive`);
});

test("second-origin: the supercookie write resolves its target the same way everything else does", () => {
  const body = SRC.slice(SRC.indexOf("function paPartitionWrite"), SRC.indexOf("/* LIE-DETECTION"));
  assert.match(body, /paCompanion\(\)/,
    "paPartitionWrite must resolve the second origin through paCompanion, or it writes nothing on a deployed copy");
  assert.equal((body.match(/otherOrigin\(\)/g) || []).length, 0,
    "otherOrigin only knows the loopback pair; using it here silently disables the storage test in production");
});

test("second-origin: the hosts the docs name are the hosts the tool configures", () => {
  const hosts = ["PA_COMPANION", "PA_HOME"]
    .map((v) => new URL((SRC.match(new RegExp(`var ${v}="([^"]+)"`)) || [])[1]).host);
  for (const doc of ["README.md", "METHODOLOGY.md"]) {
    const text = fs.readFileSync(path.join(ROOT, doc), "utf8");
    const named = [...text.matchAll(/\b(?:[a-z0-9-]+\.)*privacyassay\.(?:com|github\.io)\b/g)].map((m) => m[0]);
    for (const h of named) {
      assert.ok(hosts.includes(h), `${doc} names ${h}, which is neither configured host (${hosts.join(", ")})`);
    }
  }
});

test("second-origin: the reply target is resolved in one place", () => {
  assert.equal((SRC.match(/PA_HOME&&\/\^https\?:\/i\.test\(PA_HOME\)/g) || []).length, 1,
    "the reply-target resolution is duplicated; both copies have to be fixed every time");
});

test("companion: the home redirect exempts every second-origin entry point", () => {
  const src = fs.readFileSync(path.join(HERE, "..", "index.html"), "utf8");
  const guard = (src.match(/if\(location\.host===_cu\.host&&PA_HOME&&!\/([^/]+)\/\.test/) || [])[1];
  assert.ok(guard, "the PA_HOME redirect guard was not found");
  for (const mode of ["pabeacon", "pastore"]) {
    assert.ok(new RegExp(mode).test(guard),
      `the redirect guard does not exempt #${mode}, so that load is bounced to PA_HOME on a real deployment`);
  }
});

test("second-origin: a reply target is never derived from document.referrer", () => {
  const src = fs.readFileSync(path.join(HERE, "..", "index.html"), "utf8");
  assert.equal((src.match(/document\.referrer/g) || []).length, 0,
    "a second-origin reply target derived from document.referrer is empty on any browser that strips it");
});

test("cli: the cross-site deadline is not shorter than the page's own budget", () => {
  const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const page = Number((src.match(/var PA_CROSS_MS\s*=\s*(\d+)/) || [])[1]);
  const cli = Number((CLI.match(/num\("--cross-timeout",\s*"(\d+)"/) || [])[1]);
  assert.ok(page > 0 && cli > 0, `could not read both budgets: page=${page} cli=${cli}`);
  assert.ok(cli >= page,
    `CLI waits ${cli}ms for the cross-site result but the page waits ${page}ms; the CLI gives up first`);
});

test("cross-site: the companion is given long enough for a hardened build to answer", () => {
  const src = fs.readFileSync(path.join(HERE, "..", "index.html"), "utf8");
  const budget = Number((src.match(/var PA_CROSS_MS\s*=\s*(\d+)/) || [])[1]);
  const fallback = Number((src.match(/PA_CROSS_FALLBACK_MS\s*=\s*(\d+)/) || [])[1]);
  assert.ok(budget >= 40000, `cross-site budget is ${budget}ms; a hardened Gecko build needs more`);
  assert.ok(fallback < budget, `the iframe fallback (${fallback}ms) must fire well before the budget expires`);
  assert.equal((src.match(/},\s*15000\)/g) || []).length, 0,
    "a hardcoded 15s timeout is back; every cross-site deadline must use the named constant");

  const body = src.slice(src.indexOf("function paPartitionWrite"), src.indexOf("/* LIE-DETECTION"));
  assert.match(body, /PA_CROSS_MS/,
    "paPartitionWrite must share the named cross-origin budget, not carry its own deadline");
  for (const m of body.matchAll(/,\s*(\d{4,})\s*\)/g)) {
    const ms = Number(m[1]);
    assert.ok(ms < 2000 || ms >= 40000,
      `paPartitionWrite has a ${ms}ms deadline; the second origin needs the full budget`);
  }

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

test("index.html: every inline script parses", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const tags = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)];
  const js = tags.filter((m) => !/type\s*=\s*"application\/ld\+json"/.test(m[1]));
  const ld = tags.filter((m) => /type\s*=\s*"application\/ld\+json"/.test(m[1]));
  assert.ok(js.length >= 3, `expected the tool's inline scripts, found ${js.length}`);
  const broken = [];
  js.forEach((m, i) => {
    if (!m[2].trim()) return;
    try { new Function(m[2]); } catch (e) { broken.push(`script ${i}: ${e.message}`); }
  });
  assert.deepEqual(broken, [], "a script that does not parse means the page loads nothing");

  assert.equal(ld.length, 1, "the page should carry exactly one structured-data block");
  let data = null;
  try { data = JSON.parse(ld[0][2]); } catch (e) {
    assert.fail(`the structured-data block is not valid JSON, so every crawler drops it: ${e.message}`);
  }
  const { PRIORS: P } = new Function(grabVar("PRIORS") + "return {PRIORS};")();
  assert.equal(data.softwareVersion, P.version,
    "the version in structured data drifted from the one the tool reports");
  assert.equal(data.url, "https://privacyassay.com/");
});

test("figures: published charts match the current catalog",()=>{execFileSync(process.execPath,[path.join(ROOT,"bench/figures.mjs"),"--check"],{cwd:ROOT});});

test("cli: median report keeps completion and bounds from the same run", () => {
  const start = CLI.indexOf("  const out = FULL ?");
  const end = CLI.indexOf("  process.stdout.write", start);
  const report = new Function("med", "results", "scores", "RUNS", "FULL", "NOCROSS", CLI.slice(start, end) + ";return out;");
  const complete = { score: 50, grade: "D", complete: true, coverage: 100, upperBound: 50 };
  const incomplete = { score: 0, grade: "I", complete: false, coverage: 0, upperBound: 100 };
  for (const med of [complete, incomplete]) {
    const out = report(med, [incomplete, complete, complete], [0, 50, 50], 3, false, true);
    for (const key of ["score", "grade", "complete", "coverage", "upperBound"]) assert.equal(out[key], med[key]);
    assert.match(out.note, /1 incomplete/);
  }
});
