// Render the social card without overwriting the historical README screenshot.
import fs from "node:fs";
import { launch } from "../test/helpers/browser.mjs";
import { startServer } from "../test/helpers/server.mjs";

const srv = await startServer();
let page;
try {
  page = await launch({ port: srv.port });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
  await page.send("Page.navigate", { url: new URL("../og-card.svg", import.meta.url).href });
  for (let i = 0; i < 30; i++) {
    if (await page.ev("document.documentElement.tagName.toLowerCase() === 'svg'")) break;
    await new Promise(r => setTimeout(r, 100));
  }
  const shot = await page.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(new URL("../og-card.png", import.meta.url), Buffer.from(shot.data, "base64"));
  console.log("Rendered og-card.png");
} finally { if (page) await page.close(); srv.close(); }
