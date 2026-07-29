import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SRC = fs.readFileSync(path.join(HERE, "..", "..", "index.html"), "utf8");

// Regex literals must be skipped, not scanned: a pattern like /[{]/ or /'/ would
// otherwise unbalance the brace count and silently mis-slice the extracted source.
const REGEX_OK_AFTER = "(,=:[!&|?{};+-*%~^<>";
const REGEX_OK_KEYWORD = /(?:^|[^\w$])(?:return|typeof|instanceof|in|of|new|delete|void|case|yield|await|do|else)$/;

export function matchBrace(s, i) {
  const open = s[i], close = open === "{" ? "}" : ")";
  let depth = 0, prev = "";
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'" || c === "`") { i = skipStr(s, i, c); prev = "x"; continue; }
    if (c === "/" && s[i + 1] === "/") { const nl = s.indexOf("\n", i); i = nl < 0 ? s.length : nl; continue; }
    if (c === "/" && s[i + 1] === "*") { i = s.indexOf("*/", i) + 1; continue; }
    if (c === "/" && (prev === "" || REGEX_OK_AFTER.includes(prev) || REGEX_OK_KEYWORD.test(s.slice(Math.max(0, i - 12), i).trimEnd()))) {
      i = skipRegex(s, i); prev = "x"; continue;
    }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return i; }
    if (!/\s/.test(c)) prev = c;
  }
  throw new Error("unbalanced " + open);
}
function skipStr(s, i, q) { for (i++; i < s.length; i++) { if (s[i] === "\\") { i++; continue; } if (s[i] === q) return i; } return i; }
function skipRegex(s, i) {
  for (i++; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") { i++; continue; }
    if (c === "[") { for (i++; i < s.length && s[i] !== "]"; i++) if (s[i] === "\\") i++; continue; }
    if (c === "/" || c === "\n") return i;
  }
  return i;
}
export function grabVar(name) { const p = SRC.indexOf("var " + name + "="); if (p < 0) throw new Error("grabVar: no 'var " + name + "=' in index.html (renamed or removed?)"); const b = SRC.indexOf("{", p); return SRC.slice(p, matchBrace(SRC, b) + 1) + ";"; }
export function grabFn(name) { const p = SRC.indexOf("function " + name); if (p < 0) throw new Error("grabFn: no 'function " + name + "' in index.html (renamed or removed?)"); const b = SRC.indexOf("{", SRC.indexOf(")", p)); return SRC.slice(p, matchBrace(SRC, b) + 1); }
