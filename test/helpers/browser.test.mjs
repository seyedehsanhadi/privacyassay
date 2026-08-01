// Tests the harness, not the tool. If launch or the preload hook is broken, every browser test
// below it passes for the wrong reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./server.mjs";
import { launch, runAudit } from "./browser.mjs";

test("harness: serves index.html and completes an audit", async () => {
  const srv = await startServer();
  const page = await launch({ port: srv.port });
  try {
    const kit = await runAudit(page);
    assert.equal(typeof kit.findability.score, "number");
    assert.ok(kit.findability.score >= 0 && kit.findability.score <= 100);
  } finally { await page.close(); srv.close(); }
});

test("harness: a preload script runs before page script and is observable", async () => {
  const srv = await startServer();
  const page = await launch({ port: srv.port, preload: `window.__PRELOAD_MARKER = 42;` });
  try {
    assert.equal(await page.ev("window.__PRELOAD_MARKER"), 42);
  } finally { await page.close(); srv.close(); }
});
