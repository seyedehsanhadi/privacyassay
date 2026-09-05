// Drives a headful browser through a real run and collects the result over a loopback postback.
// Gecko cannot be driven by CDP, so the browser reports back rather than being queried.
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
// ---- profiles: fresh per capture, swept when a previous run died ----

function profileFor(key) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pa-post-"));
  fs.writeFileSync(path.join(d, "user.js"), [
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("browser.startup.homepage_override.mstone", "ignore");',
  ].join("\n"));
  return d;
}

export async function capturePostback(key, opts = {}) {
  sweepOldProfiles();
  return captureOnce(key, opts);
}
// ---- one capture: serve, launch, wait for the postback ----

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
  fs.writeFileSync(path.join(OUT, `${key}-${mode}-postback-0.9.2${tag}.json`), JSON.stringify(out, null, 2));
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
