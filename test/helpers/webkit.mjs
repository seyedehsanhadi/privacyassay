// Windows WebKit checks engine compatibility; it does not represent Safari privacy defaults.
import {createRequire} from 'node:module';

export async function launchWebKit({port,url,preload}={}) {
  const {webkit}=createRequire(import.meta.url)('playwright');
  const browser=await webkit.launch({headless:true});
  try {
    const fixture=!!url&&/^https:\/\/127\.0\.0\.[23]:\d+\//.test(url);
    const context=await browser.newContext({ignoreHTTPSErrors:fixture});
    if(preload)await context.addInitScript(preload);
    const page=await context.newPage();
    await page.goto(url||`http://127.0.0.1:${port}/index.html`);
    return {
      ev:expression=>page.evaluate(expression),
      clickRun:()=>page.locator('#runBtn').click(),
      close:()=>browser.close(),
    };
  }catch(e){await browser.close();throw e;}
}
