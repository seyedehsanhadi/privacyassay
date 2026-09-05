// Generate the social card; historical browser charts are preserved separately.
import fs from "node:fs";
import { grabVar } from "../test/helpers/extract.mjs";
const PRIORS = new Function(grabVar("PRIORS") + ";return PRIORS;")();
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
