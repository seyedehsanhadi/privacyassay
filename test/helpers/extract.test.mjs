import { test } from "node:test";
import assert from "node:assert/strict";
import { SRC, grabVar, grabFn, matchBrace } from "./extract.mjs";

test("extract: SRC is the index.html source", () => {
  assert.ok(SRC.includes("function findability"), "index.html should contain findability");
});

test("extract: a regex literal holding braces or quotes does not unbalance the matcher", () => {
  const src = `function sample(){ var re = /[{]"'/; if (/a{2}/.test("}")) { return "}"; } return re; }`;
  assert.equal(matchBrace(src, src.indexOf("{")), src.length - 1);
});

test("extract: grabVar and grabFn return runnable source", () => {
  const { PRIORS, findability } = new Function(grabVar("PRIORS") + grabFn("paTier") + grabFn("paLetterboxed") + grabFn("paIsLB") + grabFn("findability") + "return {PRIORS, findability};")();
  assert.ok(Array.isArray(PRIORS.surfaces) && PRIORS.surfaces.length > 0);
  assert.equal(typeof findability, "function");
});

test("extract: a missing name fails loudly rather than returning junk", () => {
  assert.throws(() => grabFn("thisFunctionDoesNotExist"), /no 'function thisFunctionDoesNotExist'/);
});
