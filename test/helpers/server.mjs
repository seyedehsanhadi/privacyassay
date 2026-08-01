// Serves the repo on loopback for the browser tests, answering both localhost and 127.0.0.1 so
// the two-origin cross-site probe has a second origin to talk to.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.join(HERE, "..", "..", "index.html");

export async function startServer() {
  const server = http.createServer((req, res) => {
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
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { port: server.address().port, close: () => server.close() };
}
