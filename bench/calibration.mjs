// Is the scoring fair? Are the penalties and rewards proportionate to how much each reading
// actually identifies someone? Pure computation over the captured reading states in baseline/.
// No browser is launched. Every table printed here is reproducible with `node bench/calibration.mjs`.
import fs from "node:fs";
import path from "node:path";
import { grabVar } from "../test/helpers/extract.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const OUT = path.join(HERE, "captures");
const { PRIORS } = new Function(grabVar("PRIORS") + "return {PRIORS};")();

const BROWSERS = ["tor", "mullvad", "librewolf", "firefox", "brave", "chrome", "edge"];
const NAME = { tor: "Tor", mullvad: "Mullvad", librewolf: "LibreWolf", firefox: "Firefox", brave: "Brave", chrome: "Chrome", edge: "Edge" };

const META = {};
for (const s of PRIORS.surfaces) META[s.label] = { k: s.k, group: s.group, tier: s.tier || 2, optional: !!s.optional };

// Captured states, one row per reading per browser.
const STATE = {};
for (const b of BROWSERS) {
  const j = JSON.parse(fs.readFileSync(path.join(OUT, `${b}-headful-postback.json`), "utf8"));
  const run = (j.runs || []).find((r) => r && r.rows) || null;
  if (!run) throw new Error(`no captured rows for ${b}`);
  STATE[b] = Object.fromEntries(run.rows.map((r) => [r[0], r[1]]));
}
const LABELS = PRIORS.surfaces.filter((s) => !s.optional).map((s) => s.label)
  .filter((l) => BROWSERS.every((b) => STATE[b][l] !== undefined));

// ---- the shipped model, reimplemented here so a table can be recomputed under any variation ----
function score(states, { weightOf = (l) => META[l].tier, collapse = true } = {}) {
  const weight = {}, sum = {}, hid = {};
  for (const l of LABELS) {
    const g = META[l].group, w = weightOf(l);
    weight[g] = Math.max(weight[g] || 0, w);
    sum[g] = (sum[g] || 0) + w;
    if (states[l] !== "shown") hid[g] = (hid[g] || 0) + w;
  }
  let t = 0, h = 0;
  for (const g of Object.keys(weight)) {
    // collapse=true is the shipped rule: category worth its heaviest reading, paying the share
    // of itself that is hidden. collapse=false drops the category weighting entirely.
    t += collapse ? weight[g] : sum[g];
    h += collapse ? weight[g] * ((hid[g] || 0) / (sum[g] || 1)) : (hid[g] || 0);
  }
  return t > 0 ? Math.round((100 * h) / t) : 100;
}

const pad = (v, n) => String(v).padEnd(n);
const lpad = (v, n) => String(v).padStart(n);
function table(title, head, rows) {
  console.log(`\n### ${title}\n`);
  const w = head.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i]).length)));
  console.log(head.map((h, i) => (i === 0 ? pad(h, w[i]) : lpad(h, w[i]))).join("  "));
  console.log(w.map((n) => "-".repeat(n)).join("  "));
  for (const r of rows) console.log(r.map((c, i) => (i === 0 ? pad(c, w[i]) : lpad(c, w[i]))).join("  "));
}

console.log("# Calibration: are the penalties and rewards proportionate?");
console.log(`\n${LABELS.length} non-optional readings, ${BROWSERS.length} browsers, states from baseline/*-headful-postback.json.`);

// =====================================================================================
// TEST 1 - what each browser actually scores, and what it could score
// =====================================================================================
const base = {};
for (const b of BROWSERS) base[b] = score(STATE[b]);

const t1 = BROWSERS.map((b) => {
  const st = STATE[b];
  const nShown = LABELS.filter((l) => st[l] === "shown").length;
  const nBlend = LABELS.filter((l) => st[l] === "blended").length;
  const nRef = LABELS.filter((l) => st[l] === "refused").length;
  // Ceiling: everything this browser shows, hidden instead.
  const allHidden = Object.fromEntries(LABELS.map((l) => [l, "blended"]));
  // Floor: everything shown.
  const allShown = Object.fromEntries(LABELS.map((l) => [l, "shown"]));
  return [NAME[b], base[b], nShown, nBlend, nRef, score(allShown), score(allHidden),
    `${Math.round((100 * (nBlend + nRef)) / LABELS.length)}%`];
});
table("1. Where each browser sits", ["browser", "score", "shown", "blended", "refused", "floor", "ceiling", "readings hidden"], t1);
console.log("\nThe score is a WEIGHTED share, so it does not track the raw count of hidden readings.");
console.log("Any gap between the two columns is the weighting and the category rule doing their work.");

// =====================================================================================
// TEST 2 - per-reading marginal impact: what does protecting ONE more reading buy?
// =====================================================================================
const impact = {};
for (const l of LABELS) {
  impact[l] = {};
  for (const b of BROWSERS) {
    if (STATE[b][l] !== "shown") { impact[l][b] = null; continue; }
    const alt = { ...STATE[b], [l]: "blended" };
    impact[l][b] = score(alt) - base[b];
  }
}
const t2 = LABELS.map((l) => {
  const vals = BROWSERS.map((b) => (impact[l][b] === null ? "-" : `+${impact[l][b]}`));
  const nums = BROWSERS.map((b) => impact[l][b]).filter((v) => v !== null);
  const max = nums.length ? Math.max(...nums) : 0;
  return [l, META[l].tier, ...vals, max];
}).sort((a, b) => b[b.length - 1] - a[a.length - 1]);
table("2. Marginal reward: points gained if this ONE reading became blended",
  ["reading", "tier", ...BROWSERS.map((b) => NAME[b]), "best"], t2);
console.log("\n'-' means the browser already hides it, so there is nothing to gain.");
console.log("A tier-3 reading worth +0 everywhere is a reading the category rule has made inert.");

// =====================================================================================
// TEST 3 - the category rule's core assumption, tested against real data
// =====================================================================================
const groups = {};
for (const l of LABELS) (groups[META[l].group] = groups[META[l].group] || []).push(l);
const t3 = Object.keys(groups).filter((g) => groups[g].length > 1).map((g) => {
  const ls = groups[g];
  let split = 0;
  const splitOn = [];
  for (const b of BROWSERS) {
    const anyShown = ls.some((l) => STATE[b][l] === "shown");
    const anyHidden = ls.some((l) => STATE[b][l] !== "shown");
    if (anyShown && anyHidden) { split++; splitOn.push(NAME[b]); }
  }
  const discarded = ls.reduce((a, l) => a + META[l].tier, 0) - Math.max(...ls.map((l) => META[l].tier));
  return [g, ls.length, Math.max(...ls.map((l) => META[l].tier)), discarded,
    `${split}/${BROWSERS.length}`, splitOn.join(" ") || "none"];
}).sort((a, b) => b[3] - a[3]);
table("3. Does a category behave like ONE cause? (the rule assumes yes)",
  ["category", "readings", "counted", "discarded weight", "browsers split", "which"], t3);
console.log("\n'Split' = at least one reading shown AND at least one hidden, so the readings did NOT");
console.log("move together. Every split browser is a case where max() threw away real information.");

// =====================================================================================
// TEST 4 - against published per-attribute entropy
// =====================================================================================
// Approximate bits from the fingerprinting literature (Eckersley 2010 Panopticlick;
// Laperdrix 2016 AmIUnique; Gomez-Boix 2018 real-traffic; Fifield 2015 font metrics).
// Populations differ between studies, so these are order-of-magnitude, not exact.
// A reading with no published figure is marked null and excluded from the correlation.
const BITS = {
  "canvas drawing": 5.7, "GPU name": 4.0, "3D rendered image": 4.5, "GPU feature list": 3.0,
  "GPU limits": 3.0, "WebGPU adapter": null, "WebGPU limits": null,
  "window size": 4.0, "installed fonts": 8.4, "text metrics": 7.6, "font measurement": 7.6,
  "element geometry (subpixel)": 3.5, "SVG text metrics": null, "MathML render size": null,
  "taskbar size": 2.0, "screen size": 4.8, "display scaling": 2.0, "colour depth": 0.6,
  "installed voices": null, "media codecs": null,
  "rendered sound": 1.5, "sound sample rate": 0.5,
  "device details (client hints)": 3.0, "touch points": 1.0, "platform": 1.5,
  "CPU cores": 2.3, "device memory": 1.5,
  "language": 2.0, "timezone": 3.0,
};
const withBits = LABELS.filter((l) => BITS[l] != null);
const t4 = withBits.map((l) => {
  const b = BITS[l], t = META[l].tier;
  // What tier would the published bits imply, on equal-count thirds of the range?
  return [l, t, b];
}).sort((a, b) => b[2] - a[2]);
const sorted = [...withBits].sort((a, b) => BITS[b] - BITS[a]);
const third = Math.ceil(sorted.length / 3);
const impliedTier = {};
sorted.forEach((l, i) => { impliedTier[l] = i < third ? 3 : i < 2 * third ? 2 : 1; });
table("4. Our tier against published per-attribute entropy",
  ["reading", "our tier", "bits", "tier implied by bits", "agree?"],
  t4.map(([l, t, b]) => [l, t, b.toFixed(1), impliedTier[l], t === impliedTier[l] ? "yes" : (t > impliedTier[l] ? "we over-weight" : "we under-weight")]));

const agree = withBits.filter((l) => META[l].tier === impliedTier[l]).length;
const over = withBits.filter((l) => META[l].tier > impliedTier[l]).length;
const under = withBits.filter((l) => META[l].tier < impliedTier[l]).length;
console.log(`\n${agree} of ${withBits.length} agree, ${over} over-weighted, ${under} under-weighted.`);
console.log(`${LABELS.length - withBits.length} readings have no published figure at all and are excluded.`);

// Spearman rank correlation between our tier and published bits.
function rank(arr) {
  const idx = arr.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
  const r = new Array(arr.length);
  for (let i = 0; i < idx.length;) {
    let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}
const rt = rank(withBits.map((l) => META[l].tier));
const rb = rank(withBits.map((l) => BITS[l]));
const n = withBits.length;
const d2 = rt.reduce((a, v, i) => a + (v - rb[i]) ** 2, 0);
const rho = 1 - (6 * d2) / (n * (n * n - 1));
console.log(`Spearman rank correlation between our tiers and published bits: ${rho.toFixed(2)}`);

// =====================================================================================
// TEST 5 - an entropy-based score, side by side with ours
// =====================================================================================
const totalBits = withBits.reduce((a, l) => a + BITS[l], 0);
const t5 = BROWSERS.map((b) => {
  const hidBits = withBits.filter((l) => STATE[b][l] !== "shown").reduce((a, l) => a + BITS[l], 0);
  const bitsScore = Math.round((100 * hidBits) / totalBits);
  const exposedBits = totalBits - hidBits;
  return [NAME[b], base[b], bitsScore, bitsScore - base[b], exposedBits.toFixed(1),
    (2 ** exposedBits >= 1e6 ? ">1M" : Math.round(2 ** exposedBits).toLocaleString("en-US"))];
});
table("5. Our score against a bits-hidden score over the same readings",
  ["browser", "our score", "bits-hidden %", "delta", "bits still exposed", "1 in N share it"], t5);
console.log("\n'1 in N' assumes the exposed attributes are independent, which overstates it; treat it as");
console.log("an upper bound on distinctiveness, not a population estimate. We have no population.");

// =====================================================================================
// TEST 6 - is the ordering the same under every scheme?
// =====================================================================================
const SCHEMES = {
  "shipped (3/2/1, category share)": {},
  "all readings equal": { weightOf: () => 1 },
  "tiers inverted (weak=3)": { weightOf: (l) => 4 - META[l].tier },
  "tiers squared (9/4/1)": { weightOf: (l) => META[l].tier ** 2 },
  "no category weighting (flat sum)": { collapse: false },
  "equal + no category weighting": { weightOf: () => 1, collapse: false },
  "published bits as weights": { weightOf: (l) => BITS[l] ?? META[l].tier },
  "bits, no category weighting": { weightOf: (l) => BITS[l] ?? META[l].tier, collapse: false },
};
const order = (m) => BROWSERS.slice().sort((a, b) => m[b] - m[a]).map((b) => NAME[b]).join(" > ");
const shippedOrder = order(base);
const t6 = Object.entries(SCHEMES).map(([nm, opt]) => {
  const m = Object.fromEntries(BROWSERS.map((b) => [b, score(STATE[b], opt)]));
  return [nm, ...BROWSERS.map((b) => m[b]), order(m) === shippedOrder ? "same" : "CHANGED"];
});
table("6. Every weighting we can defend, and the ordering it gives",
  ["scheme", ...BROWSERS.map((b) => NAME[b]), "ordering"], t6);
console.log(`\nShipped ordering: ${shippedOrder}`);

// =====================================================================================
// TEST 7 - is the grade band fair for the range the model can actually produce?
// =====================================================================================
const bandOf = (n) => (n >= 90 ? "A" : n >= 75 ? "B" : n >= 60 ? "C" : n >= 40 ? "D" : "F");
// Reachable ceiling: a browser that hides everything a real family is documented to hide.
const credited = new Set();
for (const f of Object.keys(PRIORS.browsers)) for (const k of Object.keys(PRIORS.browsers[f].implies || {})) credited.add(k);
const MASKABLE = new Set(["canvasClass", "webglRenderClass", "audioRenderClass", "screenClass", "innerSize", "availFrame", "speechVoices", "fontSet"]);
const bestCase = Object.fromEntries(LABELS.map((l) => {
  const k = META[l].k;
  return [l, credited.has(k) || MASKABLE.has(k) ? "blended" : "shown"];
}));
const reachable = score(bestCase);
const t7 = [
  ["A", "90-100", "unreachable", "no browser refuses what it would take"],
  ["B", "75-89", "unreachable", "same"],
  ["C", "60-74", `Tor ${base.tor}, Mullvad ${base.mullvad}`, "the whole top of the observed field"],
  ["D", "40-59", "empty", "nothing measured lands here"],
  ["F", "0-39", `LibreWolf ${base.librewolf}, Firefox ${base.firefox}, Brave/Chrome/Edge 0`, "5 of 7 browsers"],
];
table("7. Grade bands against what the model can actually produce", ["grade", "range", "who is here", "note"], t7);
console.log(`\nA browser that ANSWERS every reading but blends everything the catalog can credit scores ${reachable} (${bandOf(reachable)}).`);
console.log(`Going above that requires REFUSING readings outright. Tor's ${base.tor} is ${reachable} plus the readings it refuses.`);
console.log(`Observed range: ${Math.min(...Object.values(base))} to ${Math.max(...Object.values(base))} of a nominal 0-100, and two of five grades are empty.`);

// =====================================================================================
// TEST 8 - severity: does the score move in proportion to what a browser actually does?
// =====================================================================================
const t8 = BROWSERS.map((b) => {
  const st = STATE[b];
  const hidCount = LABELS.filter((l) => st[l] !== "shown").length;
  const hidTierSum = LABELS.filter((l) => st[l] !== "shown").reduce((a, l) => a + META[l].tier, 0);
  const tierTotal = LABELS.reduce((a, l) => a + META[l].tier, 0);
  return [NAME[b], base[b], `${hidCount}/${LABELS.length}`,
    Math.round((100 * hidCount) / LABELS.length), Math.round((100 * hidTierSum) / tierTotal),
    base[b] - Math.round((100 * hidTierSum) / tierTotal)];
});
table("8. Score against unweighted and weighted counts of what is hidden",
  ["browser", "score", "hidden", "count %", "tier-sum %", "score - tier-sum %"], t8);
console.log("\nThe last column is what the category rule costs each browser. A large negative number");
console.log("means the rule is discarding protection that browser actually provides.");

// =====================================================================================
// TEST 9 - which readings carry the whole result
// =====================================================================================
const t9 = LABELS.map((l) => {
  let swing = 0;
  for (const b of BROWSERS) {
    const flipped = { ...STATE[b], [l]: STATE[b][l] === "shown" ? "blended" : "shown" };
    swing += Math.abs(score(flipped) - base[b]);
  }
  return [l, META[l].group, META[l].tier, swing, BROWSERS.filter((b) => STATE[b][l] === "shown").length];
}).sort((a, b) => b[3] - a[3]);
table("9. Total swing if one reading flipped state, summed over all seven browsers",
  ["reading", "category", "tier", "total swing", "browsers showing it"], t9);
const inert = t9.filter((r) => r[3] === 0);
console.log(`\n${inert.length} of ${LABELS.length} readings cannot move any score in this field:`);
console.log(inert.map((r) => `${r[0]} (tier ${r[2]})`).join(", ") || "none");
