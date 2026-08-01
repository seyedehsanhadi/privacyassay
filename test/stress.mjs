// Repeated audits in one page: re-entrant Run clicks, viewport extremes, and a server that 404s
// every helper. Guards resource exhaustion, mainly the WebGL context ceiling near sixteen.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { startServer } from "./helpers/server.mjs";
import { launch, runAudit } from "./helpers/browser.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const ROOT = path.resolve(HERE, "..");
const results = [];
const record = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };

const RERUN = `
(async function(){
  var out = [];
  for (var i = 0; i < ARG_N; i++) {
    window.__KIT_DONE = false;
    document.getElementById("runBtn").click();
    var t0 = Date.now();
    while (!window.__KIT_DONE && Date.now() - t0 < 60000) await new Promise(function(r){ setTimeout(r, 250); });
    var K = window.__KIT || {};
    out.push({
      i: i, done: !!window.__KIT_DONE,
      score: K.findability ? K.findability.score : null,
      rows: K.findability ? K.findability.rows.length : 0,
      nodes: document.getElementsByTagName("*").length,
      iframes: document.querySelectorAll("iframe").length,
      canvases: document.querySelectorAll("canvas").length,
    });
    await new Promise(function(r){ setTimeout(r, 400); });
  }
  return JSON.stringify(out);
})()`;

// ---- 1. Repeated runs in ONE page. observeVectors now runs twice per audit (the per-read-noise
// fix), and each call builds a WebGL context and an AudioContext. Browsers cap live WebGL contexts
// near 16, so an audit re-run in the same tab is exactly where a context leak would surface.
async function repeatedRuns(port, n) {
  const page = await launch({ port });
  try {
    const raw = await page.ev(RERUN.replace("ARG_N", String(n)));
    const runs = JSON.parse(raw);
    const scores = runs.map((r) => r.score);
    const allDone = runs.every((r) => r.done);
    const stable = scores.every((s) => s === scores[0] && s !== null);
    record(`${n} audits in one page all complete`, allDone, `done=${runs.filter((r) => r.done).length}/${n}`);
    record(`${n} audits in one page give a stable score`, stable, `scores=${scores.join(",")}`);
    const first = runs[0], last = runs[n - 1];
    const nodeGrowth = last.nodes - first.nodes;
    const canvasGrowth = last.canvases - first.canvases;
    record("DOM does not grow unbounded across re-runs", nodeGrowth <= 40, `nodes ${first.nodes} -> ${last.nodes} (+${nodeGrowth})`);
    record("canvases are not leaked across re-runs", canvasGrowth <= 4, `canvases ${first.canvases} -> ${last.canvases} (+${canvasGrowth})`);

    // Iframe teardown is ASYNCHRONOUS and this check was wrong twice before it was right. Counting
    // immediately after the audit reported a leak that did not exist; counting once after a fixed
    // 5s delay still caught a frame mid-teardown. Measured over ten runs the settled count reads
    // 1,1,1,0,0,0,1,0,0,0 and ends at zero, so nothing accumulates. The property worth asserting is
    // that teardown COMPLETES, so poll for quiescence instead of sampling one arbitrary instant.
    let settled = -1;
    for (let i = 0; i < 20; i++) {
      settled = await page.ev(`document.querySelectorAll("iframe").length`);
      if (settled === 0) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    record("every iframe is eventually torn down (polled to quiescence)", settled === 0,
      `iframes=${settled} after polling, peak during runs=${Math.max(...runs.map((r) => r.iframes))}`);
    record("row count is identical on every re-run", runs.every((r) => r.rows === first.rows), `rows=${runs.map((r) => r.rows).join(",")}`);
  } finally { await page.close(); }
}

// ---- 2. Re-entrancy: hammer Run without waiting. The staleness guard (window.__KIT === runK) is
// supposed to make a superseded run discard its own results rather than overwrite a newer one.
async function reentrant(port) {
  const page = await launch({ port });
  try {
    await page.ev(`(function(){var b=document.getElementById("runBtn");for(var i=0;i<6;i++)b.click();return 1;})()`);
    const ok = await page.ev(`(async function(){var t0=Date.now();while(!window.__KIT_DONE&&Date.now()-t0<90000)await new Promise(function(r){setTimeout(r,250);});
      var K=window.__KIT||{};return JSON.stringify({done:!!window.__KIT_DONE,score:K.findability?K.findability.score:null,rows:K.findability?K.findability.rows.length:0});})()`);
    const r = JSON.parse(ok);
    record("six rapid Run clicks still produce exactly one coherent result", r.done && r.score !== null && r.rows > 0, JSON.stringify(r));
  } finally { await page.close(); }
}

// ---- 3. Viewport extremes. The letterbox grid and every layout probe read geometry; a tiny or huge
// window is where an off-by-one or a divide-by-zero would appear.
async function viewports(port) {
  for (const [w, h, label] of [[400, 300, "tiny 400x300"], [3840, 2160, "large 3840x2160"]]) {
    const page = await launch({ port });
    try {
      await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      const kit = await runAudit(page, { timeout: 90000 });
      const F = kit.findability;
      const sane = Number.isInteger(F.score) && F.score >= 0 && F.score <= 100 && F.rows.length > 20;
      record(`viewport ${label} produces a sane score`, sane, `score=${F.score} rows=${F.rows.length}`);
    } catch (e) {
      record(`viewport ${label} produces a sane score`, false, e.message);
    } finally { await page.close(); }
  }
}

// ---- 4. A server with none of the helper endpoints. The shipped serve.py answers /__headers and
// the storage-partition probes; a plain static host answers neither, and the tool must degrade
// rather than credit itself for readings it could not take.
async function bareServer() {
  const server = http.createServer((req, res) => {
    const u = req.url.split("?")[0];
    if (u === "/" || u === "/index.html") { res.writeHead(200, { "Content-Type": "text/html" }); fs.createReadStream(path.join(ROOT, "index.html")).pipe(res); return; }
    res.writeHead(404); res.end("not found");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const page = await launch({ port });
  try {
    const kit = await runAudit(page, { timeout: 90000 });
    const F = kit.findability;
    record("bare static server (no /__headers, 404 everything) still scores", Number.isInteger(F.score) && F.rows.length > 20, `score=${F.score} rows=${F.rows.length}`);
  } catch (e) {
    record("bare static server (no /__headers, 404 everything) still scores", false, e.message);
  } finally { await page.close(); server.close(); }
}

// ---- 5. Console errors during a normal run. Anything thrown and swallowed still shows here.
async function consoleClean(port) {
  const page = await launch({ port, preload: `window.__ERRS=[];addEventListener("error",function(e){window.__ERRS.push(String(e.message));});addEventListener("unhandledrejection",function(e){window.__ERRS.push("rejection: "+String(e.reason&&e.reason.message||e.reason));});` });
  try {
    await runAudit(page, { timeout: 90000 });
    const errs = JSON.parse(await page.ev(`JSON.stringify(window.__ERRS)`));
    record("a clean run raises no uncaught error or rejection", errs.length === 0, errs.slice(0, 3).join(" | ") || "none");
  } finally { await page.close(); }
}

const srv = await startServer();
try {
  const n = Number(process.argv[2] || 6);
  await repeatedRuns(srv.port, n);
  await reentrant(srv.port);
  await viewports(srv.port);
  await consoleClean(srv.port);
  await bareServer();
} finally { srv.close(); }

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} stress checks passed`);
if (failed.length) { console.log("FAILURES:"); failed.forEach((f) => console.log(`   ${f.name}: ${f.detail}`)); process.exitCode = 1; }
