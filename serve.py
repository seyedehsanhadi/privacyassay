# Local dev server for the three checks that need a real origin: header echo, two-origin
# cross-site, supercookies. Loopback only, no directory listings, warns before binding wider.
import base64, json, os, sys
from collections import defaultdict
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

HITS = defaultdict(int)


class Handler(SimpleHTTPRequestHandler):
    def _json(self, obj, cache="no-store"):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", cache)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/__res":
            q = parse_qs(u.query)
            key = (q.get("k") or [""])[0]
            kind = (q.get("t") or ["bin"])[0]
            if key in HITS or len(HITS) < 4096:
                HITS[key] += 1
            GIF = base64.b64decode("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7")
            body, ctype = {
                "img": (GIF, "image/gif"),
                "js":  (b"/*pa*/", "application/javascript"),
                "css": (b"#pa-probe{color:#010203}", "text/css"),
                "doc": (b"<!doctype html><title>pa</title>", "text/html"),
            }.get(kind, (b"x" * 64, "application/octet-stream"))
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", "public, max-age=600")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if u.path == "/__ctr":
            key = (parse_qs(u.query).get("k") or [""])[0]
            return self._json({"n": HITS.get(key, 0)})
        if u.path == "/__headers":
            data = {k: v for k, v in self.headers.items()}
            data["__order"] = list(self.headers.keys())
            return self._json(data)
        return super().do_GET()

    def list_directory(self, path):
        self.send_error(403, "Directory listing is disabled")
        return None

    def log_message(self, *args):
        pass


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    host = sys.argv[2] if len(sys.argv) > 2 else "127.0.0.1"
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    if host not in ("127.0.0.1", "::1", "localhost"):
        print("WARNING: binding %s serves this whole folder to your network, not just to you." % host)
        print("         Use the default 127.0.0.1 unless you really mean to expose it.")
    print("Privacyassay: http://localhost:%d/  and  http://127.0.0.1:%d/  (Ctrl+C to stop)" % (port, port))
    try:
        ThreadingHTTPServer((host, port), Handler).serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
