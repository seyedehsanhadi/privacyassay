// Every browser against every opt-in setting. The two opt-ins change the DENOMINATOR (they add
// the Network and Storage categories), so a score under one setting is not comparable to a score
// under another. Running all four is the only way to know the real spread a visitor can see, and
// to catch a bug that only appears when a category is present.
import fs from "node:fs";
import path from "node:path";
import { capturePostback } from "./postback.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const OUT = path.join(HERE, "captures");
const BROWSERS = process.env.PA_BROWSERS
  ? process.env.PA_BROWSERS.split(",")
  : ["chrome", "edge", "brave", "firefox", "librewolf", "mullvad", "tor"];
const SCEN = [
  { tag: "", webrtc: false, store: false, name: "both off" },
  { tag: "-rtc", webrtc: true, store: false, name: "webrtc on" },
  { tag: "-store", webrtc: false, store: true, name: "storage on" },
  { tag: "-rtcstore", webrtc: true, store: true, name: "both on" },
];
const RUNS = Number(process.env.PA_RUNS || 3);

const report = [];
for (const b of BROWSERS) {
  for (const s of SCEN) {
    const t0 = Date.now();
    let r;
    try { r = await capturePostback(b, { runs: RUNS, webrtc: s.webrtc, store: s.store, tag: s.tag }); }
    catch (e) { r = { scores: [], runs: [], errors: ["threw: " + e.message], serverHits: [] }; }
    const runs = r.runs || [];
    const scores = (r.scores && r.scores.length) ? r.scores : runs.filter((x) => x.complete).map((x) => x.score);
    const rows = runs.length && runs[0].rows ? runs[0].rows.length : null;
    const hits = r.serverHits || [];
    const rec = {
      browser: b, scenario: s.name, tag: s.tag, secs: Math.round((Date.now() - t0) / 1000),
      scores, min: scores.length ? Math.min(...scores) : null, max: scores.length ? Math.max(...scores) : null,
      stable: scores.length ? scores.every((x) => x === scores[0]) : null,
      rows,
      cross: runs.map((x) => x.crossGrade!=="I"?x.cross:null),
      crossFailed: runs.map((x) => (x.crossFailed ? String(x.crossFailed).slice(0, 46) : null)).filter(Boolean),
      changed: runs.map((x) => (x.changedAcrossOrigins || []).length),
      errors: r.errors || [],
      optinPing: (hits.find((h) => h.startsWith("ping:optins-")) || "").replace("ping:optins-", "") || null,
      sawWebrtcRow: null, sawStorageRow: null,
    };
    const first = runs.find((x) => x && x.rows);
    if (first) {
      const byLabel = Object.fromEntries(first.rows.map((x) => [x[0], x[1]]));
      rec.sawWebrtcRow = byLabel["WebRTC IP leak"] || "(absent)";
      rec.sawStorageRow = byLabel["storage carried across sites"] || "(absent)";
      rec.states = first.rows.reduce((a, x) => (a[x[1]] = (a[x[1]] || 0) + 1, a), {});
    }
    report.push(rec);
    console.log(`${b.padEnd(10)} ${s.name.padEnd(11)} scores=${JSON.stringify(scores).padEnd(14)} rows=${rows} ` +
      `optins=${rec.optinPing || "-"} rtc=${rec.sawWebrtcRow} store=${rec.sawStorageRow} ` +
      `${rec.errors.length ? "ERRORS: " + rec.errors.join("; ") : ""}`);
  }
}
fs.writeFileSync(path.join(OUT, "matrix-0.9.2.json"), JSON.stringify(report, null, 2));
console.log("\nwrote captures/matrix-0.9.2.json  (" + report.length + " captures)");
