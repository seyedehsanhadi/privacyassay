// Tests the harness, not the tool. If launch or the preload hook is broken, every browser test
// below it passes for the wrong reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "./server.mjs";
import { launch, runAudit, sweepStaleProfiles, launchArgs } from "./browser.mjs";

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

// A run killed externally leaves its browser holding the profile directory, and nothing reaped it:
// 29 orphans older than the current run accumulated in one session and starved it, turning a
// 15 minute browser suite into 100 minutes before it wedged. The close path is clean, so this
// guards only the wreckage of a previous run. Age is the liveness signal, and killing by profile
// tag before removing is the part the bench sweep was missing.
test("harness: a stale profile from a dead run is swept, a fresh one is left alone", async () => {
  const { default: fs } = await import("node:fs");
  const { default: os } = await import("node:os");
  const { default: path } = await import("node:path");

  const stale = fs.mkdtempSync(path.join(os.tmpdir(), "pa-test-STALE"));
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), "pa-test-FRESH"));
  const old = Date.now() - 2 * 60 * 60 * 1000;
  fs.utimesSync(stale, new Date(old), new Date(old));
  try {
    const freed = sweepStaleProfiles();
    assert.ok(freed >= 1, "a two hour old profile must be swept");
    assert.equal(fs.existsSync(stale), false, "the stale profile survived the sweep");
    assert.equal(fs.existsSync(fresh), true, "a fresh profile must never be swept; a live run owns it");
  } finally {
    for (const d of [stale, fresh]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
  }
});

test("launch: a hosted runner gets the flags Chrome needs to start there", () => {
  const ci = launchArgs("/tmp/p", false, { CI: "true" });
  assert.ok(ci.includes("--no-sandbox"), "Chrome on a hosted runner never reaches the debugging port without this");
  assert.ok(ci.includes("--disable-dev-shm-usage"), "a container's /dev/shm is too small for the default");
  const local = launchArgs("/tmp/p", false, {});
  assert.ok(!local.includes("--no-sandbox"), "a local run keeps the sandbox on");
  for (const a of ["--headless=new", "--remote-debugging-port=0", "--user-data-dir=/tmp/p"])
    assert.ok(local.includes(a), `${a} is required for the harness to drive the browser`);
  assert.ok(!launchArgs("/tmp/p", true, {}).includes("--headless=new"), "headful means a real window");
});
