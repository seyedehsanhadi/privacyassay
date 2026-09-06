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
import { spawn, execFileSync } from "node:child_process";
import {createHash} from 'node:crypto';
import {overrideSource} from './cdp-source.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const OUT = path.join(HERE, "captures");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(OUT, "browsers.json"), "utf8"));
const URL_ = process.env.PA_URL || "https://privacyassay.com/";
const BROWSERS = process.env.PA_BROWSERS ? process.env.PA_BROWSERS.split(",") : Object.keys(MANIFEST);
const RUNS = Number(process.env.PA_RUNS || 2);
const STORE = process.env.PA_STORE === "1";
const RTC = process.env.PA_RTC === "1";
const BLOCK_3PC = process.env.PA_BLOCK_3PC === "1";
const SOURCE=process.env.PA_SOURCE?fs.readFileSync(process.env.PA_SOURCE):null;
const HEADLESS=process.env.PA_HEADLESS==='1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The audit runs a whole second-origin comparison before __KIT settles, and a hardened Gecko build
// is slower at it than a stock one. PA_CROSS_MS in the page is 45s, so anything shorter here would
// report "not measurable" for a run the page went on to finish.
const CROSS_BUDGET_MS = 52000;
const AUDIT_BUDGET_MS = Number(process.env.PA_AUDIT_MS || 120000);

function profileFor() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pa-live-"));
  fs.writeFileSync(path.join(d, "user.js"), [
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("browser.aboutwelcome.enabled", false);',
    'user_pref("datareporting.policy.firstRunURL", "");',
    'user_pref("browser.startup.homepage_override.mstone", "ignore");',
  ].join("\n"));
  return d;
}

function stopBrowser(proc,binary,profile){
  if(process.platform==="win32"){
    const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
    try{execFileSync("powershell",["-NoProfile","-Command", "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq "+quote(path.basename(binary))+" -and $_.CommandLine -and $_.CommandLine.Contains("+quote(profile)+") } | ForEach-Object { & taskkill /F /PID $_.ProcessId /T | Out-Null }"],{stdio:"ignore",timeout:20000});}catch{}
  }
  try{proc.kill();}catch{}
}

const READ_KIT = `(async function(){
  var exports={},blobs=[],create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;
  try {
    URL.createObjectURL=function(blob){blobs.push(blob);return create.call(URL,blob);};
    HTMLAnchorElement.prototype.click=function(){if(!this.download)return click.call(this);};
    for(var kind of ["savesum","savefull"]){var button=document.querySelector('[data-pa="'+kind+'"]');if(button){button.click();var blob=blobs.pop();if(blob)exports[kind]=JSON.parse(await blob.text());}}
  } finally {URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click;}
  var K = window.__KIT || {}, F = K.findability || {}, C = K.findabilityCross || null;
  return JSON.stringify({ capturedAt:new Date().toISOString(), userAgent:navigator.userAgent, exports:exports, unknown: (F.rows||[]).filter(function(r){return r.state==="unknown";}).map(function(r){return {label:r.label,value:r.value};}), page: location.href, status: document.getElementById("stat")&&document.getElementById("stat").textContent, version: K.version, complete: F.complete, coverage: F.coverage, score: F.score, grade: F.grade, crossComplete: C ? C.complete : false,
    cross: C ? C.score : null,
    changed: C ? (C.changedAcrossOrigins || []).length : null,
    partitioning: K.partitioning || null,
    storeDiag: window.__paStoreDiag || null,
    crossFailed: K.crossFailed || null });
})()`;
const OPTINS = (store, rtc) => `(function(){
  var s = document.getElementById("storageOptin"), w = document.getElementById("webrtcOptin");
  if (${store} && s && !s.checked) { s.checked = true; s.dispatchEvent(new Event("change")); }
  if (${rtc} && w && !w.checked) { w.checked = true; w.dispatchEvent(new Event("change")); }
  return "ok";
})()`;
async function waitForCross(ev){
  for(const deadline=Date.now()+2*CROSS_BUDGET_MS;Date.now()<deadline;){
    if(await ev('(function(){var k=window.__KIT;return !!(k&&!k.crossMeasuring&&!document.getElementById("runBtn").disabled&&(k.findabilityCross||k.crossFailed&&k.crossFailed!=="measuring"));})()'))return;
    await sleep(500);
  }
}

async function runChromium(key) {
  const udd = profileFor();
  if(key==="vivaldi"){fs.mkdirSync(path.join(udd,"Default"));fs.writeFileSync(path.join(udd,"Default","Preferences"),JSON.stringify({vivaldi:{startup:{has_seen_welcome_page:true}}}));}
  const proc = spawn(MANIFEST[key].path,
    [...(HEADLESS?["--headless=new"]:[]),"--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0",...(BLOCK_3PC?["--test-third-party-cookie-phaseout"]:[]), `--user-data-dir=${udd}`, URL_],
    { stdio: "ignore" });
  let ws, override;
  try {
  const portFile = path.join(udd, "DevToolsActivePort");
  let port = null;
  for (let i = 0; i < 160 && !port; i++) {
    try { const l=fs.readFileSync(portFile,"utf8").split("\n");if(/^\d+$/.test(l[0]))port=l[0].trim(); } catch(e) { if(!["ENOENT","EBUSY","EACCES"].includes(e.code))throw e; }
    if (!port) await sleep(250);
  }
  if (!port) throw new Error("browser did not expose a debugging port");
  if(SOURCE){const companion=/var PA_COMPANION="([^"]+)"/.exec(SOURCE.toString());if(!companion)throw new Error('candidate companion URL missing');override=await overrideSource(`http://127.0.0.1:${port}`,SOURCE,[new URL(URL_),new URL(companion[1])]);}
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page" && t.url.startsWith(new URL(URL_).origin) && t.webSocketDebuggerUrl); } catch {}
    if (!target) await sleep(300);
  }
  if (!target) target=await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(URL_)}`,{method:"PUT"})).json();
  if (!target?.webSocketDebuggerUrl) throw new Error("no page target");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { const timer=setTimeout(()=>rej(new Error("CDP connection timed out")),10000); ws.onopen=()=>{clearTimeout(timer);res();}; ws.onerror=()=>{clearTimeout(timer);rej(new Error("CDP connection failed"));}; });
  let id = 0; const pend = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (pend.has(m.id)) { const p=pend.get(m.id);clearTimeout(p.timer);pend.delete(m.id);m.error?p.rej(new Error(m.error.message)):p.res(m); } };
  const cmd = (method, params = {}) => new Promise((res,rej) => { const i = ++id; const timer=setTimeout(()=>{pend.delete(i);rej(new Error(method+" timed out"));},15000);pend.set(i,{res,rej,timer}); ws.send(JSON.stringify({ id: i, method, params })); });
  await cmd("Runtime.enable");
  const browserVersion=(await cmd('Browser.getVersion')).result;
  if(SOURCE)await cmd('Page.navigate',{url:URL_});
  const ev = async (x) => (await cmd("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true, userGesture: true }))?.result?.result?.value;
    let ready = false;
    for (let deadline=Date.now()+60000; Date.now()<deadline;) { await sleep(300); if (await ev(`document.readyState==="complete"&&!!document.getElementById("runBtn")`)) { ready = true; break; } }
    if (!ready) throw new Error("the page never became ready at " + URL_ + ". Tor reaches a public site only through its own network, which this harness does not bootstrap; every other browser needs plain connectivity.");
    await ev(OPTINS(STORE, RTC));
    await ev(`document.getElementById("runBtn").click();"go"`);
    let done = false;
    for (let deadline=Date.now()+AUDIT_BUDGET_MS; Date.now()<deadline;) { await sleep(1000); if (await ev("!!window.__KIT_DONE")) { done = true; break; } }
    if (!done) throw new Error("audit did not finish: " + String(await ev(`location.href+" | "+(document.getElementById("stat")&&document.getElementById("stat").textContent)`).catch(() => "page unavailable")));
    await waitForCross(ev);
    const out=JSON.parse(await ev(READ_KIT) || "{}");out.browserVersion=browserVersion;if(override)out.sourceOverride=override.stats;
    if(process.env.PA_SCREENSHOT){const shot=(await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).result;fs.writeFileSync(`${process.env.PA_SCREENSHOT}-${key}.png`,Buffer.from(shot.data,'base64'));}
    return out;
  } finally {
    try { ws.close(); } catch {}
    try { override?.close(); } catch {}
    stopBrowser(proc,MANIFEST[key].path,udd);
    await sleep(1200);
    try { fs.rmSync(udd, { recursive: true, force: true }); } catch {}
  }
}

async function runGecko(key) {
  if(SOURCE)throw new Error('candidate response override is Chromium-only; use loopback for Gecko candidate checks');
  const profile = profileFor();
  const proc = spawn(MANIFEST[key].path,
    [...(HEADLESS?["-headless"]:[]),"-no-remote", "-profile", profile, "--remote-debugging-port=0", "--width=1600", "--height=1100", URL_],
    { stdio: ["ignore", "pipe", "pipe"] });
  let ws;
  try {
  let stderr = "";
  proc.stderr.on("data", (d) => { stderr += d.toString(); });
  proc.stdout.on("data", (d) => { stderr += d.toString(); });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(1000);
    const m = stderr.match(/ws:\/\/[^\s"]+/);
    if (m) wsUrl = /\/session/.test(m[0]) ? m[0] : m[0].replace(/\/$/, "") + "/session";
  }
  if (!wsUrl) throw new Error("Firefox did not announce a BiDi endpoint: " + stderr.slice(-350));
  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("BiDi socket refused: " + stderr.slice(-350))); });
  let id = 0; const pend = new Map(), logs = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const { res, rej, timer } = pend.get(m.id); pend.delete(m.id);clearTimeout(timer); m.error ? rej(new Error(m.error+": "+(m.message||""))) : res(m.result); } else if(m.method==="log.entryAdded") logs.push(m.params?.text||m.params?.entry?.text); };
  const cmd = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
    pend.get(i).timer=setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error(method + " timed out")); } }, 10000);
  });
    const session=await cmd("session.new", { capabilities: { alwaysMatch: {} } });
    await cmd("session.subscribe", { events: ["log.entryAdded"] });
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
    for (let deadline=Date.now()+90000; Date.now()<deadline;) { await sleep(500); if (await ev(`document.readyState==="complete"&&!!document.getElementById("runBtn")`).catch(() => false)) { ready = true; break; } }
    if (!ready) throw new Error("the page never became ready at " + URL_ + ". Tor reaches a public site only through its own network, which this harness does not bootstrap; every other browser needs plain connectivity.");
    await ev(OPTINS(STORE, RTC));
    const pt = JSON.parse(await ev(`JSON.stringify((function(){var r=document.getElementById("runBtn").getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})())`));
    await cmd("input.performActions", { context: ctx, actions: [{ type: "pointer", id: "mouse", parameters: { pointerType: "mouse" }, actions: [{ type: "pointerMove", x: pt.x, y: pt.y, duration: 0, origin: "viewport" }, { type: "pointerDown", button: 0 }, { type: "pointerUp", button: 0 }] }] });
    let done = false;
    for (let deadline=Date.now()+AUDIT_BUDGET_MS; Date.now()<deadline;) { await sleep(1000); if (await ev("!!window.__KIT_DONE").catch(() => false)) { done = true; break; } }
    if (!done) throw new Error("audit did not finish: " + String(await ev(`location.href+" | "+(document.getElementById("stat")&&document.getElementById("stat").textContent)+" | collectors="+(!!window.__collectors)+" paIsRand="+(typeof window.paIsRand)+" class="+document.body.className`).catch(() => "page unavailable")) + (logs.length ? " | " + logs.slice(-3).join(" | ") : ""));
    await waitForCross(ev);
    const out=JSON.parse(await ev(READ_KIT) || "{}");out.browserVersion=session.capabilities;return out;
  } finally {
    try { ws.close(); } catch {}
    stopBrowser(proc,MANIFEST[key].path,profile);
    await sleep(1000);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

const report = [];
for (const key of BROWSERS) {
  const entry = MANIFEST[key];
  if (!entry || !entry.path || !fs.existsSync(entry.path)) { console.log(`skip ${key}: not in captures/browsers.json or not installed`); continue; }

  const scores = [], crosses = [], errors = [], samples = [];
  for (let r = 0; r < RUNS; r++) {
      try {
        const out = entry.engine === "gecko" ? await runGecko(key) : await runChromium(key);
        samples.push(out);
        if(out.version!=="0.9.2")throw new Error("methodology mismatch or audit did not complete: "+String(out.version));
        if (out.complete && typeof out.score === "number") scores.push(out.score); else errors.push("incomplete measurement");
        if (out.crossComplete && typeof out.cross === "number") crosses.push(out.cross);
        else errors.push(out.crossFailed ? String(out.crossFailed).slice(0, 60) : "cross not measurable");
      } catch (e) { errors.push(e.message.slice(0, 400)); }
    }
  const row = {
    browser: key, url: URL_, capturedAt:new Date().toISOString(), os:os.type()+" "+os.release(), headless:HEADLESS, optins: { storage: STORE, webrtc: RTC }, blockThirdPartyCookies:BLOCK_3PC, runs: RUNS,
    scores, cross: crosses, stable: scores.length > 1 && new Set(scores).size === 1,
    version: "0.9.2", source:SOURCE?{context:'public origins with candidate HTML responses; not deployed',sha256:createHash('sha256').update(SOURCE).digest('hex')}:null, profile: "fresh automation profile; bundled extensions unchanged", samples, errors,
  };
  report.push(row);
  console.log(`${key.padEnd(11)} score ${JSON.stringify(scores).padEnd(12)} cross ${JSON.stringify(crosses).padEnd(12)}${errors.length ? "  " + errors[0] : ""}`);
}

const tag = `${SOURCE?"-candidate":""}${HEADLESS?"-headless":""}${new URL(URL_).hostname==="127.0.0.1"||new URL(URL_).hostname==="localhost"?"-local":""}${STORE ? "-store" : ""}${RTC ? "-rtc" : ""}${BLOCK_3PC?"-3pc":""}`;
const file = path.join(OUT, `live-0.9.2${tag}.json`);
// Merge rather than overwrite: running one browser at a time is the normal way to work through a
// long matrix, and a plain write would silently discard every earlier row.
let prior = [];
try { prior = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
const merged = prior.filter((r) => !report.some((n) => n.browser === r.browser)).concat(report);
merged.sort((a, b) => a.browser.localeCompare(b.browser));
fs.writeFileSync(file, JSON.stringify(merged, null, 1));
console.log(`\nwrote ${path.relative(path.dirname(HERE), file)}`);
