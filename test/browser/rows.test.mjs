// paRow looks readings up by category and a lowercase needle. A needle that matches nothing, or
// two rows, silently feeds the wrong value into the score, so every lookup is resolved for real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SRC } from "../helpers/extract.mjs";
import { startServer } from "../helpers/server.mjs";
import { launch, runAudit } from "../helpers/browser.mjs";

function needles() {
  const out = [];
  for (const m of SRC.matchAll(/paRow\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g)) out.push({ cat: m[1], needle: m[2] });
  return out;
}

test("paRow: the source actually contains the calls this test checks", () => {
  assert.ok(needles().length >= 10, `expected at least 10 paRow call sites, found ${needles().length}`);
});

// Needles whose row is emitted only when a condition holds, so zero matches is correct rather than
// a defect. Each entry must say why, and the list must stay short: every name added here is a
// reading the exactly-one guard no longer protects. A needle NOT on this list matching zero rows
// means the tool scores it as refused, which credits protection it never measured.
const CONDITIONAL = {
  "fontface local() blocked": "the row exists only when the engine rejects FontFace local(). Chrome does not, so it is absent, and an absent row correctly means not-blocked. fontLocalBlocked is not a scored surface either; it only feeds the fontSet mask test.",
};

test("paRow: every needle resolves to exactly one row in a real audit", async () => {
  const srv = await startServer();
  const page = await launch({ port: srv.port });
  try {
    const kit = await runAudit(page);
    const cats = kit.categories || {};
    const problems = [];
    for (const { cat, needle } of needles()) {
      const c = cats[cat];
      if (!c) { problems.push(`category "${cat}" does not exist, so needle "${needle}" can never match`); continue; }
      const hits = c.rows.filter((r) => String(r[0]).toLowerCase().includes(needle));
      if (hits.length === 0 && !CONDITIONAL[needle]) {
        problems.push(`"${needle}" in "${cat}" matched no row, so the reading reads as refused and credits protection that was never measured`);
      }
      if (hits.length > 1) problems.push(`"${needle}" in "${cat}" matched ${hits.length} rows (${hits.map((h) => h[0]).join(", ")}); paRow returns the first and the rest are unreachable`);
    }
    assert.deepEqual(problems, []);
  } finally { await page.close(); srv.close(); }
});

test("paRow: the conditional allowlist stays honest - every entry is still a real needle", () => {
  const live = new Set(needles().map((n) => n.needle));
  const stale = Object.keys(CONDITIONAL).filter((n) => !live.has(n));
  assert.deepEqual(stale, [], "an allowlisted needle that no longer exists silently widens the exemption");
});

test("paRow: every needle is lowercase, since the match lowercases the label only", async () => {
  const bad = needles().filter(({ needle }) => needle !== needle.toLowerCase());
  assert.deepEqual(bad.map((b) => b.needle), [], "an uppercase character in a needle can never match");
});

test("paRow: every needle names a category that exists", async () => {
  const srv = await startServer();
  const page = await launch({ port: srv.port });
  try {
    const kit = await runAudit(page);
    const names = Object.keys(kit.categories || {});
    const bad = [...new Set(needles().map((n) => n.cat))].filter((c) => !names.includes(c));
    assert.deepEqual(bad, [], `paRow was called with category names that do not exist; available: ${names.join(", ")}`);
  } finally { await page.close(); srv.close(); }
});
