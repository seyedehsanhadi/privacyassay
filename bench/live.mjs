// Reproduce the published table against a deployed pair rather than loopback.
//
// postback.mjs cannot do this. It serves index.html from its own server and has the page report
// back over that same connection, so the second origin is always 127.0.0.1 and the numbers carry
// the loopback floor. A deployed copy refuses that channel: its Content-Security-Policy allows
// connect-src 'self' only, and its reply target resolves to its own PA_HOME rather than a local
// harness. Neither is a bug; it is what keeps the shipped file from talking to anything.
//
// So this drives the browser instead of hosting it, and reads window.__KIT out of the page once the
// audit finishes. Chromium is driven over CDP, Gecko over WebDriver BiDi, because Firefox dropped
// CDP. Nothing is served and nothing is posted anywhere.
//
//   node bench/live.mjs                          every browser, opt-ins off
//   PA_BROWSERS=brave,firefox node bench/live.mjs
//   PA_STORE=1 PA_RTC=1 node bench/live.mjs      with both opt-ins
//   PA_URL=https://your-site.example/ node bench/live.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execSync } from "node:child_process";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const OUT = path.join(HERE, "captures");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(OUT, "browsers.json"), "utf8"));
const URL_ = process.env.PA_URL || "https://privacyassay.com/";
const BROWSERS = process.env.PA_BROWSERS ? process.env.PA_BROWSERS.split(",") : Object.keys(MANIFEST);
const RUNS = Number(process.env.PA_RUNS || 2);
const STORE = process.env.PA_STORE === "1";
const RTC = process.env.PA_RTC === "1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The audit runs a whole second-origin comparison before __KIT settles, and a hardened Gecko build
// is slower at it than a stock one. PA_CROSS_MS in the page is 45s, so anything shorter here would
// report "not measurable" for a run the page went on to finish.
const CROSS_BUDGET_MS = 52000;

function profileFor() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pa-live-"));
  fs.writeFileSync(path.join(d, "user.js"), [
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("browser.aboutwelcome.enabled", false);',
    'user_pref("datareporting.policy.firstRunURL", "");',
    'user_pref("extensions.torlauncher.start_tor", false);',
    'user_pref("network.proxy.type", 0);',
    'user_pref("toolkit.telemetry.enabled", false);',
    'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
    'user_pref("browser.startup.homepage_override.mstone", "ignore");',
    'user_pref("dom.disable_open_during_load", false);',
    'user_pref("dom.block_multiple_popups", false);',
    'user_pref("dom.popup_allowed_events", "click keydown load");',
    'user_pref("app.update.auto", false);',
  ].join("\n"));
  return d;
}

// Same reason as postback.mjs: Tor and Mullvad bundle NoScript, it intermittently blocks script
// loading, and it is not a fingerprinting defence. Moved aside for the run and restored on the way
// out, including on throw. This must travel with any published Tor or Mullvad number.
const NOSCRIPT_ID = "{73a6fe31-595d-460b-a920-fcc0f8843232}.xpi";
const noscriptPaths = (key) => {
  if (key !== "tor" && key !== "mullvad") return [];
  const dir = path.dirname(MANIFEST[key].path);
  const out = [];
  for (const r of [dir, path.dirname(dir)])
    for (const rel of [["distribution", "extensions"], ["TorBrowser", "Data", "Browser", "profile.default", "extensions"]]) {
      const q = path.join(r, ...rel, NOSCRIPT_ID);
      if (fs.existsSync(q) || fs.existsSync(q + ".live-off")) out.push(q);
    }
  return out;
};
const setNoscript = (key, on) => {
  let n = 0;
  for (const q of noscriptPaths(key)) {
    const off = q + ".live-off";
    try {
      if (!on && fs.existsSync(q)) { fs.renameSync(q, off); n++; }
      else if (on && fs.existsSync(off)) { fs.renameSync(off, q); n++; }
    } catch {}
  }
  return n;
};

const READ_KIT = `JSON.stringify((function(){
  var K = window.__KIT || {}, F = K.findability || {}, C = K.findabilityCross || null;
  return { score: F.score, grade: F.grade,
    cross: C ? C.score : null,
    changed: C ? (C.changedAcrossOrigins || []).length : null,
    partitioning: !!K.partitioning,
    leaked: K.partitioning ? (K.partitioning.leaked || []).length : null,
    crossFailed: K.crossFailed || null };
})())`;
const OPTINS = (store, rtc) => `(function(){
  var s = document.getElementById("storageOptin"), w = document.getElementById("webrtcOptin");
  if (${store} && s && !s.checked) { s.checked = true; s.dispatchEvent(new Event("change")); }
  if (${rtc} && w && !w.checked) { w.checked = true; w.dispatchEvent(new Event("change")); }
  return "ok";
})()`;

async function runChromium(key) {
  const udd = profileFor();
  const proc = spawn(MANIFEST[key].path,
    ["--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${udd}`, URL_],
    { stdio: "ignore" });
  const portFile = path.join(udd, "DevToolsActivePort");
  let port = null;
  for (let i = 0; i < 160 && !port; i++) {
    if (fs.existsSync(portFile)) { const l = fs.readFileSync(portFile, "utf8").split("\n"); if (l[0]) port = l[0].trim(); }
    if (!port) await sleep(250);
  }
  if (!port) throw new Error("browser did not expose a debugging port");
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page" && t.webSocketDebuggerUrl); } catch {}
    if (!target) await sleep(300);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0; const pend = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const cmd = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await cmd("Runtime.enable");
  const ev = async (x) => (await cmd("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true, userGesture: true }))?.result?.result?.value;
  try {
    let ready = false;
    for (let i = 0; i < 200; i++) { await sleep(300); if (await ev(`document.readyState==="complete"&&!!document.getElementById("runBtn")`)) { ready = true; break; } }
    if (!ready) throw new Error("the page never became ready at " + URL_ + ". Tor reaches a public site only through its own network, which this harness does not bootstrap; every other browser needs plain connectivity.");
    await ev(OPTINS(STORE, RTC));
    await ev(`document.getElementById("runBtn").click();"go"`);
    for (let i = 0; i < 200; i++) { await sleep(1000); if (await ev("!!window.__KIT_DONE")) break; }
    await sleep(CROSS_BUDGET_MS);
    return JSON.parse(await ev(READ_KIT) || "{}");
  } finally {
    try { ws.close(); } catch {}
    try { proc.kill(); } catch {}
    await sleep(1200);
    try { fs.rmSync(udd, { recursive: true, force: true }); } catch {}
  }
}

async function runGecko(key) {
  try { execSync(`taskkill /F /IM ${path.basename(MANIFEST[key].path)} /T`, { stdio: "ignore" }); } catch {}
  await sleep(1500);
  const profile = profileFor();
  const port = 9400 + Math.floor(Math.random() * 300);
  const proc = spawn(MANIFEST[key].path,
    ["-no-remote", "-profile", profile, "--remote-debugging-port=" + port, "--width=1600", "--height=1100", URL_],
    { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (d) => { stderr += d.toString(); });
  proc.stdout.on("data", (d) => { stderr += d.toString(); });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(1000);
    const m = stderr.match(/ws:\/\/[^\s"]+/);
    if (m) wsUrl = /\/session/.test(m[0]) ? m[0] : m[0].replace(/\/$/, "") + "/session";
    else if (i > 8) wsUrl = `ws://127.0.0.1:${port}/session`;
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("BiDi socket refused")); });
  let id = 0; const pend = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error)) : res(m.result); } };
  const cmd = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
    setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error(method + " timed out")); } }, 120000);
  });
  try {
    await cmd("session.new", { capabilities: { alwaysMatch: {} } });
    const tree = await cmd("browsingContext.getTree", {});
    const hit = tree.contexts.find((c) => c.url && c.url.startsWith(new URL(URL_).origin));
    const ctx = (hit || tree.contexts[0]).context;
    // The URL is already open from the command line. Navigating to it again starts a second load and
    // leaves the context holding an empty document that never completes, so do not re-navigate.
    const ev = async (x) => {
      const r = await cmd("script.evaluate", { expression: x, target: { context: ctx }, awaitPromise: true, resultOwnership: "none" });
      if (r.type === "exception") throw new Error(r.exceptionDetails?.text || "page threw");
      return r.result?.value;
    };
    let ready = false;
    for (let i = 0; i < 200; i++) { await sleep(500); if (await ev(`document.readyState==="complete"&&!!document.getElementById("runBtn")`).catch(() => false)) { ready = true; break; } }
    if (!ready) throw new Error("the page never became ready at " + URL_ + ". Tor reaches a public site only through its own network, which this harness does not bootstrap; every other browser needs plain connectivity.");
    await ev(OPTINS(STORE, RTC));
    await ev(`document.getElementById("runBtn").click();"go"`);
    for (let i = 0; i < 200; i++) { await sleep(1000); if (await ev("!!window.__KIT_DONE").catch(() => false)) break; }
    await sleep(CROSS_BUDGET_MS);
    return JSON.parse(await ev(READ_KIT) || "{}");
  } finally {
    try { ws.close(); } catch {}
    try { proc.kill(); } catch {}
    try { execSync(`taskkill /F /IM ${path.basename(MANIFEST[key].path)} /T`, { stdio: "ignore" }); } catch {}
    await sleep(1000);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

const report = [];
for (const key of BROWSERS) {
  const entry = MANIFEST[key];
  if (!entry || !entry.path || !fs.existsSync(entry.path)) { console.log(`skip ${key}: not in captures/browsers.json or not installed`); continue; }
  const moved = setNoscript(key, false);
  const scores = [], crosses = [], errors = [];
  try {
    for (let r = 0; r < RUNS; r++) {
      try {
        const out = entry.engine === "gecko" ? await runGecko(key) : await runChromium(key);
        if (typeof out.score === "number") scores.push(out.score); else errors.push("no score");
        if (typeof out.cross === "number") crosses.push(out.cross);
        else errors.push(out.crossFailed ? String(out.crossFailed).slice(0, 60) : "cross not measurable");
      } catch (e) { errors.push(e.message.slice(0, 80)); }
    }
  } finally { if (moved) setNoscript(key, true); }
  const row = {
    browser: key, url: URL_, optins: { storage: STORE, webrtc: RTC }, runs: RUNS,
    scores, cross: crosses, stable: scores.length > 1 && new Set(scores).size === 1,
    noscriptMovedAside: moved > 0, errors,
  };
  report.push(row);
  console.log(`${key.padEnd(11)} score ${JSON.stringify(scores).padEnd(12)} cross ${JSON.stringify(crosses).padEnd(12)}${errors.length ? "  " + errors[0] : ""}`);
}

const tag = `${STORE ? "-store" : ""}${RTC ? "-rtc" : ""}`;
const file = path.join(OUT, `live${tag}.json`);
// Merge rather than overwrite: running one browser at a time is the normal way to work through a
// long matrix, and a plain write would silently discard every earlier row.
let prior = [];
try { prior = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
const merged = prior.filter((r) => !report.some((n) => n.browser === r.browser)).concat(report);
merged.sort((a, b) => a.browser.localeCompare(b.browser));
fs.writeFileSync(file, JSON.stringify(merged, null, 1));
console.log(`\nwrote ${path.relative(path.dirname(HERE), file)}`);
