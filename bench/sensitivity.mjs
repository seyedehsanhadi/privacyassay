// Does the methodology's ranking survive its own arbitrary choices?
// The weights are stated as judgment, not measured rarity, and the category-collapse rule
// (only the heaviest reading in a category counts) is a modelling decision. If the ordering
// flips under plausible alternatives, the model is fragile regardless of the arithmetic.
// Pure computation over the captured reading states. No browser is launched.
import fs from "node:fs";
import path from "node:path";
import { grabVar } from "../test/helpers/extract.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const OUT = path.join(HERE, "captures");
const { PRIORS } = new Function(grabVar("PRIORS") + "return {PRIORS};")();
const meta = {};
for (const s of PRIORS.surfaces) meta[s.label] = { group: s.group, tier: s.tier || 2, optional: !!s.optional };

const ORDER = ["mullvad", "tor", "librewolf", "brave", "firefox", "chrome", "edge"];
const browsers = {};
for (const k of ORDER) {
  const f = path.join(OUT, `${k}-headful-postback.json`);
  if (!fs.existsSync(f)) continue;
  const run = (JSON.parse(fs.readFileSync(f, "utf8")).runs || [])[0];
  if (!run) continue;
  browsers[k] = run.rows.filter(([l]) => meta[l]).map(([label, state]) => ({ label, state, ...meta[label] }));
}

// score(rows, weightOf, collapse) -> 0..100
function score(rows, weightOf, collapse) {
  // "share" is the shipped rule: a category is worth its heaviest reading and pays out the
  // fraction of its own weight that is hidden. "max" is the rule that shipped before it, kept
  // here so the tables can show what changing the aggregation does.
  if (collapse === "share" || collapse === "max") {
    const gt = {}, gs = {}, gsum = {}, ghid = {};
    for (const r of rows) {
      const w = weightOf(r);
      gt[r.group] = Math.max(gt[r.group] || 0, w);
      gsum[r.group] = (gsum[r.group] || 0) + w;
      if (r.state === "shown") gs[r.group] = Math.max(gs[r.group] || 0, w);
      else ghid[r.group] = (ghid[r.group] || 0) + w;
    }
    let tot = 0, hid = 0;
    for (const g of Object.keys(gt)) {
      tot += gt[g];
      hid += collapse === "share" ? gt[g] * ((ghid[g] || 0) / (gsum[g] || 1)) : gt[g] - (gs[g] || 0);
    }
    return tot ? Math.round((100 * hid) / tot) : 100;
  }
  // sum: every reading counts on its own, no category collapse
  let tot = 0, hid = 0;
  for (const r of rows) { const w = weightOf(r); tot += w; if (r.state !== "shown") hid += w; }
  return tot ? Math.round((100 * hid) / tot) : 100;
}

const SCHEMES = [
  ["as shipped (tiers 3/2/1, category share)", (r) => r.tier, "share"],
  ["previous rule (category max, heaviest only)", (r) => r.tier, "max"],
  ["all readings weighted equally", () => 1, "share"],
  ["tiers INVERTED (weak=3, strong=1)", (r) => ({ 3: 1, 2: 2, 1: 3 })[r.tier], "share"],
  ["tiers squared (9/4/1)", (r) => r.tier * r.tier, "share"],
  ["as shipped tiers, but SUM all readings (no collapse)", (r) => r.tier, "sum"],
  ["all equal AND sum all readings", () => 1, "sum"],
];

const rank = (scores) => Object.entries(scores).sort((a, b) => b[1] - a[1]).map(([k]) => k);
const shipped = {};
for (const k of Object.keys(browsers)) shipped[k] = score(browsers[k], (r) => r.tier, "share");
const shippedRank = rank(shipped);

console.log("SCHEME SENSITIVITY — does the ordering survive a different weighting?\n");
const pad = (s, n) => String(s) + " ".repeat(Math.max(0, n - String(s).length));
console.log(pad("scheme", 48) + Object.keys(browsers).map((k) => pad(k.slice(0, 7), 8)).join("") + "  order preserved?");
for (const [name, w, collapse] of SCHEMES) {
  const sc = {};
  for (const k of Object.keys(browsers)) sc[k] = score(browsers[k], w, collapse);
  const r = rank(sc);
  // compare ordering by score-value ties tolerated: check no pair inverts
  let inverted = [];
  for (let i = 0; i < shippedRank.length; i++)
    for (let j = i + 1; j < shippedRank.length; j++) {
      const a = shippedRank[i], b = shippedRank[j];
      if (shipped[a] > shipped[b] && sc[a] < sc[b]) inverted.push(`${a}<${b}`);
    }
  console.log(pad(name, 48) + Object.keys(browsers).map((k) => pad(sc[k], 8)).join("") + "  " + (inverted.length ? "INVERTED " + inverted.join(" ") : "yes"));
}

// Jackknife: drop each category in turn, does the ordering hold?
console.log("\nJACKKNIFE — drop one category at a time (shipped weights, category max)\n");
const groups = [...new Set(Object.values(meta).map((m) => m.group))];
let jackFlips = 0;
for (const drop of groups) {
  const sc = {};
  for (const k of Object.keys(browsers)) sc[k] = score(browsers[k].filter((r) => r.group !== drop), (r) => r.tier, "share");
  let inverted = [];
  for (let i = 0; i < shippedRank.length; i++)
    for (let j = i + 1; j < shippedRank.length; j++) {
      const a = shippedRank[i], b = shippedRank[j];
      if (shipped[a] > shipped[b] && sc[a] < sc[b]) inverted.push(`${a}<${b}`);
    }
  if (inverted.length) jackFlips++;
  console.log(pad("without " + drop, 48) + Object.keys(browsers).map((k) => pad(sc[k], 8)).join("") + "  " + (inverted.length ? "INVERTED " + inverted.join(" ") : "yes"));
}

// Floor and ceiling reachability
console.log("\nFLOOR AND CEILING");
const allShownRows = browsers.chrome ? browsers.chrome.map((r) => ({ ...r, state: "shown" })) : [];
const allHiddenRows = browsers.chrome ? browsers.chrome.map((r) => ({ ...r, state: "blended" })) : [];
console.log(`  every reading shown  -> ${score(allShownRows, (r) => r.tier, "share")}   (floor should be 0)`);
console.log(`  every reading hidden -> ${score(allHiddenRows, (r) => r.tier, "share")}   (ceiling should be 100)`);

// Monotonicity: flipping any single shown reading to blended must not lower the score
console.log("\nMONOTONICITY — flip one shown reading to blended, score must not fall");
let monoViolations = 0, monoTested = 0;
for (const k of Object.keys(browsers)) {
  const base = score(browsers[k], (r) => r.tier, "share");
  for (let i = 0; i < browsers[k].length; i++) {
    if (browsers[k][i].state !== "shown") continue;
    const copy = browsers[k].map((r, j) => (j === i ? { ...r, state: "blended" } : r));
    const s2 = score(copy, (r) => r.tier, "share");
    monoTested++;
    if (s2 < base) { monoViolations++; console.log(`  VIOLATION ${k} hiding ${browsers[k][i].label}: ${base} -> ${s2}`); }
  }
}
console.log(`  ${monoTested} single-reading flips tested, ${monoViolations} violations`);

console.log(`\nSUMMARY: ${SCHEMES.length - 1} alternative weightings tested, jackknife over ${groups.length} categories (${jackFlips} orderings flipped), ${monoTested} monotonicity flips (${monoViolations} violations)`);
