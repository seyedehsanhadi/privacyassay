// Capture code-generated assets and a real redacted example using the test harness.
import fs from "node:fs";
import { launch, runAudit } from "../test/helpers/browser.mjs";
import { startServer } from "../test/helpers/server.mjs";

const srv = await startServer();
let page;
try {
  page = await launch({ port: srv.port });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  const kit = await runAudit(page);
  if (!kit.findability || !kit.version) throw new Error("example audit did not finish");
  for (let i = 0; i < 55; i++) {
    if (await page.ev("!!(window.__KIT.findabilityCross || window.__KIT.crossFailed && window.__KIT.crossFailed !== 'measuring')")) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  if (!await page.ev('document.getElementById("redactOptin").checked')) throw new Error("example must be redacted");
  let shot = await page.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(new URL("../screenshot.png", import.meta.url), Buffer.from(shot.data, "base64"));
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
  await page.send("Page.navigate", { url: new URL("../og-card.svg", import.meta.url).href });
  for (let i = 0; i < 30; i++) {
    if (await page.ev("document.documentElement.tagName.toLowerCase() === 'svg'")) break;
    await new Promise(r => setTimeout(r, 100));
  }
  shot = await page.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(new URL("../og-card.png", import.meta.url), Buffer.from(shot.data, "base64"));
  console.log(`Rendered assets for ${kit.version}`);
} finally { if (page) await page.close(); srv.close(); }
