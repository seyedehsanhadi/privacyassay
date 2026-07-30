#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const INDEX = path.join(ROOT, "index.html");

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
// --min-score=40 and a bare trailing --min-score both used to fall through to the default,
// which for the CI gate is null, so the build passed with no gate and no warning.
const val = (n, d) => {
  const eq = argv.find((a) => a.startsWith(n + "="));
  if (eq) return eq.slice(n.length + 1);
  const i = argv.indexOf(n);
  if (i < 0) return d;
  const next = argv[i + 1];
  if (next === undefined || next.startsWith("--")) {
    process.stderr.write(`${n} needs a value\n`);
    process.exit(2);
  }
  return next;
};

if (flag("--help") || flag("-h")) {
  process.stdout.write(`privacyassay - run the fingerprint benchmark headless, print the score as JSON.

Usage: privacyassay [options]
  --help, -h      show this help
  --min-score N   exit 1 if the score is below N (CI gate)
  --full          print the full report instead of the summary
  --webrtc        include the WebRTC public-IP test (opens one STUN request; off by default)
  --headful       run with a visible window (default: headless)
  --browser PATH  Chrome/Chromium/Brave/Edge binary (or set PRIVACYASSAY_BROWSER)
  --runs N        run N times and report the median score (default 1; farbling browsers like Brave vary run to run)
  --timeout MS    max run time per run (default 90000)
  --no-cross      skip the two-origin cross-site comparison
  --cross-timeout MS  how long to wait for the second origin (default 25000)
  --quiet         suppress progress on stderr

By default the tool runs entirely on your machine and makes no external request.
With --webrtc it opens one STUN request to a public server to detect the IP leak.
`);
  process.exit(0);
}

// A mistyped number must stop the run, never coerce to NaN: `--min-score abc` would
// otherwise make every comparison false and let a CI gate pass silently.
function num(name, dflt, { min = -Infinity, integer = false } = {}) {
  const raw = val(name, dflt);
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min) {
    process.stderr.write(`${name} needs a number${min > -Infinity ? ` >= ${min}` : ""}, got "${raw}"\n`);
    process.exit(2);
  }
  return integer ? Math.floor(n) : n;
}

const MIN = num("--min-score", null, { min: 0 });
const FULL = flag("--full");
const HEADFUL = flag("--headful");
const WEBRTC = flag("--webrtc");
const QUIET = flag("--quiet");
const TIMEOUT = num("--timeout", "90000", { min: 1 });
const NOCROSS = flag("--no-cross");
const CROSS_TIMEOUT = num("--cross-timeout", "25000", { min: 1 });
const RUNS = num("--runs", "1", { min: 1, integer: true });
const log = (m) => { if (!QUIET) process.stderr.write(m + "\n"); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findBrowser() {
  const env = val("--browser", process.env.PRIVACYASSAY_BROWSER || process.env.CHROME_PATH);
  if (env && fs.existsSync(env)) return env;
  const P = process.platform;
  const cands = P === "win32"
    ? ["C:/Program Files/Google/Chrome/Application/chrome.exe",
       "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
       "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
       "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"]
    : P === "darwin"
    ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
       "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
       "/Applications/Chromium.app/Contents/MacOS/Chromium"]
    : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium",
       "/usr/bin/chromium-browser", "/usr/bin/brave-browser", "/snap/bin/chromium"];
  for (const c of cands) if (fs.existsSync(c)) return c;
  throw new Error("No Chrome/Chromium/Brave/Edge found. Pass --browser PATH or set PRIVACYASSAY_BROWSER.");
}

async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0; const pending = new Map();
  ws.addEventListener("message", (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  });
  await new Promise((r, j) => { ws.addEventListener("open", r); ws.addEventListener("error", () => j(new Error("cdp socket error"))); });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
    setTimeout(() => { if (pending.has(i)) { pending.delete(i); rej(new Error("timeout " + method)); } }, 60000);
  });
  return { ws, send };
}

// One audit against the shared server. Fresh browser + throwaway profile each time so runs are independent (a farbling browser re-seeds per launch).
async function runOnce(browser, port) {
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), "pa-run-"));
  const args = [
    ...(HEADFUL ? [] : ["--headless=new"]),
    "--remote-debugging-port=0", `--user-data-dir=${udd}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions",
    `http://127.0.0.1:${port}/index.html`,
  ];
  const proc = spawn(browser, args, { stdio: "ignore" });
  try {
    const portFile = path.join(udd, "DevToolsActivePort");
    let cdpPort = null;
    for (let i = 0; i < 100; i++) { if (fs.existsSync(portFile)) { const l = fs.readFileSync(portFile, "utf8").split("\n"); if (l[0]) { cdpPort = l[0].trim(); break; } } await sleep(150); }
    if (!cdpPort) throw new Error("browser did not expose a debugging port");

    let target = null;
    for (let i = 0; i < 60; i++) { try { const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json(); target = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl); if (target) break; } catch {} await sleep(200); }
    if (!target) throw new Error("no page target");

    const { ws, send } = await cdp(target.webSocketDebuggerUrl);
    try {
      await send("Runtime.enable"); await send("Page.enable");
      const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true }); if (r.exceptionDetails) throw new Error("page error: " + (r.exceptionDetails.text || "")); return r.result.value; };

      const deadline = Date.now() + TIMEOUT;
      await sleep(1200);
      if (WEBRTC) await ev(`(function(){var w=document.getElementById("webrtcOptin");if(w){w.checked=true;w.dispatchEvent(new Event("change"));}return 1;})()`);
      await ev(`document.getElementById("runBtn").click();"go"`);
      while (Date.now() < deadline) { await sleep(1000); if (await ev("!!window.__KIT_DONE")) break; }
      await sleep(600);

      // The page starts the two-origin comparison itself once the audit finishes, and gives up
      // after fifteen seconds. Wait for either the result or the page's own failure message; a
      // wait that ends with neither is reported as not measurable, never as a zero.
      if (!NOCROSS) {
        const crossDeadline = Date.now() + CROSS_TIMEOUT;
        while (Date.now() < crossDeadline) {
          if (await ev("!!(window.__KIT&&(window.__KIT.findabilityCross||window.__KIT.crossFailed&&window.__KIT.crossFailed!=='measuring'))")) break;
          await sleep(500);
        }
      }

      const data = await ev(`(function(){var K=window.__KIT||{},F=K.findability||{},Fc=K.findabilityCross||null;
        return JSON.stringify({version:K.version||null,userAgent:navigator.userAgent,
          score:F.score,grade:F.grade,verdict:F.verdict||null,strongest:F.strongest||null,
          exposedStrong:F.exposedStrong||[],shownCount:F.shownCount,readingsTotal:(F.checks&&F.checks.total)||null,
          crossSite:(function(){try{
            if(!Fc)return null;
            // Same arithmetic as the in-page paCrossData, computed here rather than called, so the
            // two producers cannot drift and the CLI does not depend on a render helper being global.
            var total=(Fc.rows||[]).length||(Fc.checks&&Fc.checks.total)||0;
            var anon=(Fc.changedAcrossOrigins||[]).length;
            return {score:Fc.score,grade:Fc.grade,signalsChanged:anon,signalsCompared:total,
              recognizedOnSecondSite:anon<Math.max(3,Math.round(total*0.2))};
          }catch(e){return null;}})(),
          crossSiteNote:(K.crossFailed&&K.crossFailed!=="measuring")?String(K.crossFailed):null,
          randomizer:(function(){try{return typeof paIsRand==="function"?!!paIsRand(K):false;}catch(e){return false;}})(),
          full:${FULL ? "true" : "false"}?{findability:F,fingerprint:K.fingerprint,stableHash:K.stableHash,crossBrowser:K.crossBrowser,coherence:K.coherence,categories:K.categories}:null});})()`);
      const parsed = JSON.parse(data || "{}");
      if (parsed.score == null) throw new Error("audit produced no score");
      return parsed;
    } finally { try { ws.close(); } catch {} }
  } finally {
    try { proc.kill(); } catch {}
    try { fs.rmSync(udd, { recursive: true, force: true }); } catch {}
  }
}

async function main() {
  if (!fs.existsSync(INDEX)) throw new Error("index.html not found next to bin/ (expected " + INDEX + ")");
  const browser = findBrowser();

  const handler = (req, res) => {
    const u = req.url.split("?")[0];
    if (u === "/" || u === "/index.html") { res.writeHead(200, { "Content-Type": "text/html" }); fs.createReadStream(INDEX).pipe(res); return; }
    if (u === "/__headers") { const d = { ...req.headers, __order: Object.keys(req.headers) }; res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(d)); return; }
    res.writeHead(200); res.end("");
  };
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  // The two-origin test compares 127.0.0.1 against localhost. Which address "localhost" resolves
  // to is the resolver's choice, and on a machine that answers ::1 first a server bound only to
  // 127.0.0.1 refuses the companion and the result reads as not measurable. Binding the same
  // handler on ::1 as well covers both answers. Failure here is not fatal: a host without IPv6
  // resolves localhost to 127.0.0.1, which is already served.
  let server6 = null;
  if (!NOCROSS) {
    server6 = http.createServer(handler);
    await new Promise((r) => { server6.once("error", () => { server6 = null; r(); }); server6.listen(port, "::1", r); });
  }

  log("launching " + path.basename(browser) + (HEADFUL ? " (headful)" : " (headless)") + (RUNS > 1 ? ` x${RUNS}` : ""));
  const results = [];
  try {
    for (let i = 0; i < RUNS; i++) {
      log("running audit..." + (WEBRTC ? " (WebRTC test on)" : "") + (RUNS > 1 ? ` [${i + 1}/${RUNS}]` : ""));
      results.push(await runOnce(browser, port));
    }
  } finally { server.close(); if (server6) try { server6.close(); } catch {} }

  // Median score: sort and take the middle run (odd N -> exact median; even N -> lower-middle). Reporting a whole run keeps every field internally consistent.
  results.sort((a, b) => a.score - b.score);
  const med = results[Math.floor((results.length - 1) / 2)];
  const scores = results.map((r) => r.score);

  const out = FULL ? med.full : {
    schema: "privacyassay-summary/1.0", tool: "privacyassay", version: med.version,
    userAgent: med.userAgent, score: med.score, grade: med.grade, verdict: med.verdict,
    strongest: med.strongest, exposedStrong: med.exposedStrong,
    shownCount: med.shownCount, readingsTotal: med.readingsTotal,
    randomizer: !!med.randomizer, crossSite: med.crossSite || null,
    ...(med.crossSite ? {} : { crossSiteNote: med.crossSiteNote || (NOCROSS ? "skipped (--no-cross)" : "not measurable") }),
    ...(RUNS > 1 ? { runs: RUNS, runScores: scores } : {}),
    note: (RUNS > 1 ? `Median of ${RUNS} runs (scores ${scores.join(", ")}). ` : "") + "Run entirely on-device. Method: METHODOLOGY.md.",
  };
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  log(`score ${med.score}/${med.grade}` + (RUNS > 1 ? ` (median of ${scores.join(", ")})` : ""));

  if (MIN != null && med.score < MIN) { log(`FAIL: ${med.score} < ${MIN}`); process.exit(1); }
  process.exit(0);
}

main().catch((e) => { process.stderr.write("privacyassay: " + e.message + "\n"); process.exit(2); });
