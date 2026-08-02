import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const ROOT = path.resolve(HERE, "..");
const OUT = path.join(HERE, "captures");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(OUT, "browsers.json"), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Each capture makes a throwaway browser profile and deletes it on the way out, but a run that is
// killed leaves it behind holding a few hundred MB. Two hundred and fifty-nine of them once filled
// the disk and took the whole harness down with it. Sweep before starting, never during.
// Killing proc.pid is not enough and neither is killing its tree: the Gecko launchers hand off
// and exit, so the surviving browser is not a descendant of the process we spawned. Its content
// processes keep the profile directory locked, which is how 259 abandoned profiles once filled
// the disk. Match on the profile path instead, which does not depend on ancestry.
function killByProfile(dir) {
  const tag = path.basename(dir);
  if (!tag || tag.length < 8) return;
  try {
    if (process.platform === "win32") {
      spawnSync("powershell", ["-NoProfile", "-Command",
        `Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | ` +
        `Where-Object { $_.CommandLine -like '*${tag}*' } | ` +
        `ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }`],
        { stdio: "ignore", timeout: 20000 });
    } else {
      spawnSync("pkill", ["-9", "-f", tag], { stdio: "ignore", timeout: 20000 });
    }
  } catch {}
}

function sweepOldProfiles() {
  let freed = 0;
  for (const d of fs.readdirSync(os.tmpdir())) {
    if (!/^pa-(post|base|test|gecko|run|time|cross)-/.test(d)) continue;
    const full = path.join(os.tmpdir(), d);
    try {
      if (Date.now() - fs.statSync(full).mtimeMs < 30 * 60 * 1000) continue;
      fs.rmSync(full, { recursive: true, force: true });
      freed++;
    } catch {}
  }
  if (freed) console.log(`swept ${freed} stale browser profiles`);
}

function profileFor(key) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pa-post-"));
  fs.writeFileSync(path.join(d, "user.js"), [
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("extensions.torlauncher.start_tor", false);',
    'user_pref("torbrowser.settings.quickstart.enabled", true);',
    'user_pref("network.proxy.type", 0);',
    'user_pref("network.proxy.allow_hijacking_localhost", false);',
    'user_pref("network.proxy.no_proxies_on", "localhost, 127.0.0.1");',
    'user_pref("network.dns.blockDotOnion", false);',
    'user_pref("toolkit.telemetry.enabled", false);',
    'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
    'user_pref("browser.startup.homepage_override.mstone", "ignore");',
    'user_pref("dom.disable_open_during_load", false);',
    'user_pref("dom.block_multiple_popups", false);',
    'user_pref("dom.popup_allowed_events", "click keydown load");',
    'user_pref("privacy.window.maxInnerWidth", 1280);',
    'user_pref("browser.link.open_newwindow", 2);',
    'user_pref("browser.link.open_newwindow.restriction", 0);',
    'user_pref("app.update.auto", false);',
  ].join("\n"));
  return d;
}

// Tor and Mullvad bundle NoScript, which enforces a CSP that blocks script loading on a plain http
// origin. It fires INTERMITTENTLY on a fresh profile: some launches load the runner and never reach
// script-start, others complete normally. Two captures succeeded with it installed, which is why an
// earlier note wrongly concluded it was harmless; the very next full run lost both browsers to it.
// Intermittent means unusable for a benchmark, so it is moved aside for the capture and restored
// afterwards even on throw. NoScript is not a fingerprinting defense and does not touch
// resistFingerprinting, which is what the score measures, but this must travel with any published
// Tor or Mullvad number.
const NOSCRIPT_ID = "{73a6fe31-595d-460b-a920-fcc0f8843232}.xpi";

function noscriptPaths(key) {
  if (key !== "tor" && key !== "mullvad") return [];
  const dir = path.dirname(MANIFEST[key].path);
  const roots = [dir, path.dirname(dir)];
  const out = [];
  for (const r of roots) {
    for (const rel of [["distribution", "extensions"], ["TorBrowser", "Data", "Browser", "profile.default", "extensions"]]) {
      const p = path.join(r, ...rel, NOSCRIPT_ID);
      if (fs.existsSync(p) || fs.existsSync(p + ".bench-off")) out.push(p);
    }
  }
  return out;
}

function setNoscript(key, enabled) {
  let n = 0;
  for (const p of noscriptPaths(key)) {
    const off = p + ".bench-off";
    try {
      if (!enabled && fs.existsSync(p)) { fs.renameSync(p, off); n++; }
      else if (enabled && fs.existsSync(off)) { fs.renameSync(off, p); n++; }
    } catch {}
  }
  return n;
}

export async function capturePostback(key, opts = {}) {
  sweepOldProfiles();
  const moved = setNoscript(key, false);
  try {
    const r = await captureOnce(key, opts);
    if (moved) r.noscriptDisabled = true;
    return r;
  } finally { setNoscript(key, true); }
}

async function captureOnce(key, { runs = 5, mode = "headful", timeout = 300000, webrtc = false, store = false, tag = "" } = {}) {
  const entry = MANIFEST[key];
  if (!entry || !entry.path) throw new Error("no manifest entry for " + key);


  let received = null;
  let beaconScores = null;
  const hits = [];
  const server = http.createServer((req, res) => {
    const u = req.url.split("?")[0];
    hits.push(u === "/__ping" ? "ping:" + (new URL(req.url, "http://x").searchParams.get("stage") || "?") : req.method + " " + req.url + " host=" + (req.headers.host || ""));
    if (req.method === "POST" && u === "/__result") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try { received = JSON.parse(body); } catch (e) { received = { errors: ["bad json: " + e.message] }; }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{\"ok\":true}");
      });
      return;
    }
    if (u === "/runner.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      fs.createReadStream(path.join(HERE, "runner.html")).pipe(res);
      return;
    }
    if (u === "/runner.js") {
      res.writeHead(200, { "Content-Type": "application/javascript" });
      fs.createReadStream(path.join(HERE, "runner.js")).pipe(res);
      return;
    }
    if (u === "/" || u === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      fs.createReadStream(path.join(ROOT, "index.html")).pipe(res);
      return;
    }
    if (u === "/__ping") {
      const stage = new URL(req.url, "http://x").searchParams.get("stage") || "";
      const m = /^scores-(.+)$/.exec(stage);
      if (m && !received && m[1] !== "none") {
        const scores = m[1].split("_").map(Number).filter((n) => Number.isFinite(n));
        if (scores.length) beaconScores = scores;
      }
      res.writeHead(200, { "Content-Type": "image/gif", "Cache-Control": "no-store" });
      res.end(Buffer.from("R0lGODlhAQABAAAAACw=", "base64"));
      return;
    }
    if (u === "/__headers") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ...req.headers, __order: Object.keys(req.headers) }));
      return;
    }
    res.writeHead(200);
    res.end("");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const url = `http://localhost:${port}/runner.html?as=${key}&mode=${mode}&runs=${runs}` + (webrtc ? "&webrtc=1" : "") + (store ? "&store=1" : "");

  const profile = profileFor(key);
  const args = entry.engine === "gecko"
    ? ["-no-remote", "-profile", profile, url]
    : [`--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-popup-blocking", url];
  const proc = spawn(entry.path, args, { stdio: "ignore" });

  const deadline = Date.now() + timeout;
  while (!received && Date.now() < deadline) await sleep(1000);
  if (!received) await sleep(4000);

  // proc.kill() reaps the launcher only. Gecko keeps a dozen content processes alive, they hold
  // the profile directory open so it cannot be deleted, and both leak on every normal capture:
  // 259 abandoned profiles and 262 stray processes once filled the disk mid-run.
  try { proc.kill(); } catch {}
  killByProfile(profile);
  await sleep(1500);
  for (let i = 0; i < 10 && fs.existsSync(profile); i++) {
    try { fs.rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(300); }
  }
  server.close();

  const recovered = beaconScores
    ? { browser: key, mode, runs: [], scores: beaconScores,
        identical: beaconScores.every((x) => x === beaconScores[0]),
        transportUsed: "postback-beacon",
        errors: ["POST never arrived; scores recovered from the GET beacon, per-run detail lost"] }
    : { browser: key, mode, runs: [], scores: [], identical: false, errors: ["no result posted before timeout"] };
  const out = received || recovered;
  out.version = entry.version;
  out.transport = "postback";
  out.serverHits = hits;
  out.optins = { webrtc: !!webrtc, storage: !!store };
  fs.writeFileSync(path.join(OUT, `${key}-${mode}-postback${tag}.json`), JSON.stringify(out, null, 2));
  return out;
}

if (process.argv[1] && process.argv[1].endsWith("postback.mjs")) {
  const key = process.argv[2];
  const runs = Number(process.argv[3] || 3);
  const webrtc = process.argv.includes("--webrtc"), store = process.argv.includes("--store");
  if (!key) { console.error("usage: node postback.mjs <browserKey> [runs] [--webrtc] [--store]"); process.exit(2); }
  const tag = (webrtc || store) ? ("-" + (webrtc ? "rtc" : "") + (store ? "store" : "")) : "";
  const r = await capturePostback(key, { runs, webrtc, store, tag });
  console.log(key, JSON.stringify(r.scores), r.identical ? "stable" : "varies", r.errors.length ? "errors: " + r.errors.join("; ") : "");
}
