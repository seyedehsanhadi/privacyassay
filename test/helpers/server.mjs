// Serves the repo on loopback for the browser tests, answering both localhost and 127.0.0.1 so
// the two-origin cross-site probe has a second origin to talk to.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.join(HERE, "..", "..", "index.html");

export async function startServer() {
  const handler = (req, res) => {
    const u = req.url.split("?")[0];
    if (u === "/" || u === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      fs.createReadStream(INDEX).pipe(res);
      return;
    }
    if (u === "/__headers") {
      const d = { ...req.headers, __order: Object.keys(req.headers) };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(d));
      return;
    }
    res.writeHead(200);
    res.end("");
  };
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  // Which address "localhost" resolves to is the resolver's choice. On a machine that answers ::1
  // first, a server bound only to 127.0.0.1 refuses the companion origin and the cross-site probe
  // reads as not measurable. bin/privacyassay.mjs already guards this; the harness now matches.
  let server6 = http.createServer(handler);
  await new Promise((r) => { server6.once("error", () => { server6 = null; r(); }); server6.listen(port, "::1", r); });
  return { port, close: () => { server.close(); if (server6) try { server6.close(); } catch {} } };
}
