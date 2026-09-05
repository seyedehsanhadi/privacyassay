// Generate the published weight charts from the same catalog as the scorer.
import fs from "node:fs";
import { grabVar } from "../test/helpers/extract.mjs";

const { PRIORS, PAGRP } = new Function(grabVar("PRIORS") + grabVar("PAGRP") + ";return {PRIORS,PAGRP}")();
const groups = new Map();
for (const s of PRIORS.surfaces) {
  const g = groups.get(s.group) || { id: s.group, weight: 0, count: 0, optional: !!s.optional };
  g.weight = Math.max(g.weight, s.tier); g.count++;
  groups.set(s.group, g);
}
const rows = [...groups.values()].sort((a, b) => b.weight - a.weight);
const total = rows.reduce((n, g) => n + g.weight, 0);
const base = rows.filter(g => !g.optional).reduce((n, g) => n + g.weight, 0);
const esc = s => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
for (const theme of ["light", "dark"]) {
  const dark = theme === "dark", ink = dark ? "#eef3ff" : "#172339", muted = dark ? "#a9b9d1" : "#536680";
  const accent = dark ? "#78adff" : "#2563eb", optional = dark ? "#e6b754" : "#96640d";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="690" viewBox="0 0 800 690" role="img" aria-labelledby="title desc">
<title id="title">Privacyassay ${PRIORS.version}: scoring weights</title>
<desc id="desc">${PRIORS.surfaces.length} readings in ${rows.length} categories. Base category weights sum to ${base}; all categories sum to ${total}. Judgment-based weights, not browser rankings or measured entropy.</desc>
<style>text{font-family:system-ui,sans-serif}</style>
<rect width="800" height="690" rx="16" fill="${dark ? "#0d1420" : "#ffffff"}"/>
<text x="28" y="42" fill="${ink}" font-size="25" font-weight="700">What contributes to the score</text>
<text x="28" y="72" fill="${muted}" font-size="16">${esc(PRIORS.version)} · ${PRIORS.surfaces.length} readings · category weight = its heaviest reading</text>
${[1, 2, 3].map(w => `<text x="${240 + w * 130}" y="105" fill="${muted}" font-size="14" text-anchor="middle">${w}</text>`).join("\n")}
${rows.map((g, i) => {
  const y = 120 + i * 36, color = g.optional ? optional : accent;
  return `<g data-group="${g.id}" data-weight="${g.weight}" data-readings="${g.count}"><text x="28" y="${y + 19}" fill="${ink}" font-size="17">${esc(PAGRP[g.id])}</text><rect x="240" y="${y}" width="${g.weight * 130}" height="25" rx="4" fill="${color}"/><text x="${252 + g.weight * 130}" y="${y + 19}" fill="${muted}" font-size="15">${g.weight} · ${g.count} reading${g.count === 1 ? "" : "s"}</text></g>`;
}).join("\n")}
<text x="28" y="618" fill="${optional}" font-size="15">Gold: WebRTC/storage opt-ins; extension evidence counts only when detected.</text>
<text x="28" y="645" fill="${muted}" font-size="15">Base denominator ${base}; maximum ${total}. Unknown readings earn no protection credit.</text>
<text x="28" y="671" fill="${muted}" font-size="15">These weights express judgment. They are not tracking probabilities.</text>
</svg>
`;
  const target = new URL(`../chart-${theme}.svg`, import.meta.url);
  if (process.argv.includes("--check")) {
    if (fs.readFileSync(target, "utf8") !== svg) throw new Error(`chart-${theme}.svg is stale; run node bench/figures.mjs`);
  } else fs.writeFileSync(target, svg);
}
const card = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="Privacyassay: browser fingerprint exposure">
<rect width="1200" height="630" fill="#0d1420"/>
<g font-family="system-ui,sans-serif">
<text x="80" y="150" fill="#ffffff" font-size="68" font-weight="700">Privacy<tspan fill="#78adff">assay</tspan></text>
<text x="80" y="270" fill="#ffffff" font-size="42" font-weight="600">See what your browser exposes.</text>
<text x="80" y="335" fill="#b3c2d8" font-size="28">Fingerprint measurements. Clear limits. Open source.</text>
<text x="80" y="385" fill="#b3c2d8" font-size="26">Runs in your browser. Your fingerprint is not uploaded.</text>
<path d="M80 470H1120" stroke="#30405a"/>
<text x="80" y="535" fill="#78adff" font-size="25">privacyassay.com</text>
<text x="1120" y="535" text-anchor="end" fill="#b3c2d8" font-size="23">${PRIORS.version} · Apache-2.0</text>
</g></svg>
`;
const cardPath = new URL("../og-card.svg", import.meta.url);
if (process.argv.includes("--check")) {
  if (fs.readFileSync(cardPath, "utf8") !== card) throw new Error("og-card.svg is stale");
} else fs.writeFileSync(cardPath, card);
