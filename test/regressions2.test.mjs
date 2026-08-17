// Second wave of the August 2026 audit: the defects left open after 0.9.1's first pass.
// Every test here was written failing against the code as it stood.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { grabFn } from "./helpers/extract.mjs";

const HTML = readFileSync(new URL("../index.html", import.meta.url), "utf8");

// B1. The realm rows (iframe / Worker / SharedWorker scope) were scored into coherenceScore but
// never rendered: the accordion skips the category and the side panel reads a different object.
// The panel header printed "23/23 pass" while the real tally was 33/34.
test("every coherence row that is scored is also reachable in the UI", () => {
  assert.ok(/R\.coherence\.rows\s*=\s*cohRows/.test(HTML),
    "the scored rows must be published on R.coherence for the panel to read");
  assert.ok(/\(ch\.rows\|\|\[\]\)\.forEach/.test(HTML),
    "the panel must fold the realm rows into its own list before counting");
  assert.ok(/keys\.push\(k\)/.test(HTML),
    "folded rows must enter keys so the pass tally and the buckets both see them");
});

// B2. Rows pushed into a category after cat() computed its hash left the exported hash describing
// fewer rows than the rows shipped beside it.
test("exported category hashes describe the rows exported with them", () => {
  const i = HTML.indexOf("R.categories=Object.keys(C).reduce(");
  assert.ok(i > 0, "the categories rebuild was not found");
  const build = HTML.slice(i, i + 300);
  assert.ok(/catHash\(C\[k\]\.rows\)/.test(build),
    "the rebuild must recompute the hash from the rows it is about to ship");
  assert.ok(/handHash/.test(build),
    "categories that build a hash deliberately must be exempt from the recompute");
  assert.equal((HTML.match(/handHash:true/g) || []).length, 3,
    "exactly the three hand-built categories are exempt");
});

// B3. identify() created two WebGL contexts and released neither, unlike the nine other creation
// sites. Browsers cap live contexts and reclaim the oldest.
test("identify releases every WebGL context it creates", () => {
  const fn = grabFn("identify");
  const created = (fn.match(/getContext\((["'])(?:webgl2?|experimental-webgl)\1/g) || []).length;
  assert.ok(created > 0, "identify no longer creates a context; update this test");
  assert.ok(/glDone\(/.test(fn), "identify must release its contexts before returning");
});

// B4. The four headline tiles counted categories while the sentence beside them counted readings,
// so the same page showed "10" and "29" for the same quantity.
test("the headline tiles say what unit they are counting", () => {
  assert.ok(HTML.indexOf('["Handed over"') > 0, "the tiles were not found");
  assert.ok(/Counts are categories, not readings/.test(HTML),
    "the page must state the tiles' unit, since the sentence beside them counts readings");
});

// B5. Dead code: an uncalled classifier sitting next to a live one invites reuse of a heuristic
// the scoring model deliberately avoids.
test("paHashClass is gone", () => {
  assert.ok(!/function paHashClass/.test(HTML), "paHashClass is never called and must be removed");
});

// B6. Redaction let every bare number through, so a report marked redacted still carried the
// hardware anchors that narrow a user down.
test("redaction masks the hardware anchors", () => {
  const paRedactVal = new Function(grabFn("paRedactVal") + "\nreturn paRedactVal;")();
  for (const [k, v] of [
    ["hardwareConcurrency", "16"], ["cores", "16"], ["deviceMemory", "8"],
    ["maxTouchPoints", "10"], ["devicePixelRatio", "1.25"], ["timezoneOffset", "-60"],
    
  ]) {
    assert.equal(paRedactVal(k, v), "[redacted]", `${k} must not survive redaction`);
  }
  // Status words and genuinely non-identifying values still pass, or the report becomes useless.
  assert.equal(paRedactVal("cookies enabled", "true"), "true");
  assert.equal(paRedactVal("webdriver", "false"), "false");
});

// B7. The test harness bound 127.0.0.1 only, while the CLI binds ::1 as well with a comment
// explaining that a machine resolving localhost to ::1 breaks the companion origin.
test("the browser-test server binds the same pair the CLI does", () => {
  const srv = readFileSync(new URL("./helpers/server.mjs", import.meta.url), "utf8");
  assert.ok(/listen\([^)]*"::1"/.test(srv),
    "the helper must bind ::1 as well, as bin/privacyassay.mjs already does");
});

// B8. The doc undercounted the surfaces that cannot show per-read noise, because two of them
// reach paRow through a helper the guard test's regex could not see.
test("the methodology states the real number of row-backed surfaces", () => {
  const md = readFileSync(new URL("../METHODOLOGY.md", import.meta.url), "utf8");
  assert.ok(!/Fifteen are pulled from rows/i.test(md), "the count of fifteen is wrong");
  assert.ok(/Seventeen are pulled from rows/i.test(md), "seventeen is the measured count");
});
