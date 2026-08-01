// Chromium over CDP: launch a throwaway profile, run an audit, evaluate in the page.
// Gecko cannot be driven here; Firefox dropped CDP, and those browsers go through the harness.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findBrowser() {
  const env = process.env.PRIVACYASSAY_BROWSER || process.env.CHROME_PATH;
  if (env && fs.existsSync(env)) return env;
  const P = process.platform;
  const cands = P === "win32"
    ? ["C:/Program Files/Google/Chrome/Application/chrome.exe",
       "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
       "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"]
    : P === "darwin"
    ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
       "/Applications/Chromium.app/Contents/MacOS/Chromium"]
    : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium",
       "/usr/bin/chromium-browser", "/snap/bin/chromium"];
  for (const c of cands) if (fs.existsSync(c)) return c;
  throw new Error("No Chrome or Chromium found. Set PRIVACYASSAY_BROWSER.");
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
    }
  });
  await new Promise((res, rej) => {
    ws.addEventListener("open", res);
    ws.addEventListener("error", () => rej(new Error("cdp socket error")));
  });
  return {
    ws,
    send: (method, params = {}) => new Promise((res, rej) => {
      const i = ++id; pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
      setTimeout(() => { if (pending.has(i)) { pending.delete(i); rej(new Error("timeout " + method)); } }, 60000);
    }),
  };
}

export async function launch({ port, preload = null, headful = false } = {}) {
  const binary = findBrowser();
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), "pa-test-"));
  const proc = spawn(binary, [
    ...(headful ? [] : ["--headless=new"]),
    "--remote-debugging-port=0", `--user-data-dir=${udd}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions", "about:blank",
  ], { stdio: "ignore" });

  const portFile = path.join(udd, "DevToolsActivePort");
  let cdpPort = null;
  for (let i = 0; i < 100 && !cdpPort; i++) {
    if (fs.existsSync(portFile)) {
      const l = fs.readFileSync(portFile, "utf8").split("\n");
      if (l[0]) cdpPort = l[0].trim();
    }
    if (!cdpPort) await sleep(150);
  }
  if (!cdpPort) throw new Error("browser did not expose a debugging port");

  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
      target = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
    } catch {}
    if (!target) await sleep(200);
  }
  if (!target) throw new Error("no page target");

  const { ws, send } = await connect(target.webSocketDebuggerUrl);
  await send("Runtime.enable");
  await send("Page.enable");
  if (preload) await send("Page.addScriptToEvaluateOnNewDocument", { source: preload });

  const ev = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (r.exceptionDetails) throw new Error("page error: " + ((r.exceptionDetails.exception || {}).description || r.exceptionDetails.text || ""));
    return r.result.value;
  };

  await send("Page.navigate", { url: `http://127.0.0.1:${port}/index.html` });
  for (let i = 0; i < 100; i++) {
    await sleep(100);
    if (await ev("document.readyState === 'complete'").catch(() => false)) break;
  }

  return {
    ev,
    send,
    close: async () => {
      try { ws.close(); } catch {}
      await new Promise((resolve) => {
        if (proc.exitCode !== null) return resolve();
        proc.once("exit", resolve);
        try { proc.kill(); } catch { resolve(); }
        setTimeout(resolve, 3000);
      });
      for (let i = 0; i < 10; i++) {
        try { fs.rmSync(udd, { recursive: true, force: true }); return; } catch {}
        await sleep(200);
      }
    },
  };
}

export async function runAudit(page, { timeout = 90000 } = {}) {
  await page.ev(`document.getElementById("runBtn").click();"go"`);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await sleep(500);
    if (await page.ev("!!window.__KIT_DONE")) break;
  }
  await sleep(400);
  const raw = await page.ev(`JSON.stringify(window.__KIT || {})`);
  const kit = JSON.parse(raw || "{}");
  if (!kit.findability) throw new Error("audit did not populate __KIT.findability");
  return kit;
}
