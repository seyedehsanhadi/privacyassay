// The two opt-ins each add a category to the denominator, so a reading that is off must be
// absent from the total rather than counted as hidden.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../helpers/server.mjs";
import { launch } from "../helpers/browser.mjs";

// Both opt-ins add a category to the denominator, so a reading that is measured but never reaches
// findability makes the headline score too high. That is exactly what happened to storage: the
// supercookie probe finishes after findability has already run, so a run where cookies provably
// carried across origins scored 3 single-site while the cross-site score, which recomputes from
// the updated observations, scored 2 on the same readings.
async function runWith(port, { webrtc = false, storage = false } = {}) {
  const page = await launch({ port });
  try {
    await page.ev(`(function(){
      [["webrtcOptin",${webrtc}],["storageOptin",${storage}]].forEach(function(p){
        var c=document.getElementById(p[0]);
        if(c&&c.checked!==p[1]){c.checked=p[1];c.dispatchEvent(new Event("change"));}
      });return 1;})()`);
    const state = await page.ev(`JSON.stringify([document.getElementById("webrtcOptin").checked,document.getElementById("storageOptin").checked])`);
    assert.deepEqual(JSON.parse(state), [webrtc, storage], "the opt-in boxes did not take, so this run proves nothing");
    await page.ev(`document.getElementById("runBtn").click();"go"`);
    for (let i = 0; i < 90; i++) { if (await page.ev("!!window.__KIT_DONE")) break; await new Promise((r) => setTimeout(r, 1000)); }
    await new Promise((r) => setTimeout(r, 9000));
    return JSON.parse(await page.ev(`JSON.stringify((function(){
      var K=window.__KIT||{},F=K.findability||{},X=K.findabilityCross||null,P=K.partitioning||null;
      var has=function(l){return (F.rows||[]).some(function(r){return r.label===l;});};
      return {done:!!window.__KIT_DONE,score:F.score,rows:(F.rows||[]).length,
        crossRows:X?(X.rows||[]).length:null,crossScore:X?X.score:null,
        webrtcRow:has("WebRTC IP leak"),storageRow:has("storage carried across sites"),
        partTested:P?P.tested:null,carried:F.observed?String(F.observed.storageCarry||""):""};
    })())`));
  } finally { await page.close(); }
}

test("opt-ins: a measured reading always reaches the score that is displayed", async () => {
  const srv = await startServer();
  try {
    const base = await runWith(srv.port, {});
    assert.equal(base.done, true);
    assert.equal(base.webrtcRow, false, "WebRTC must not be scored when its box is unticked");
    assert.equal(base.storageRow, false, "storage must not be scored when its box is unticked");

    const rtc = await runWith(srv.port, { webrtc: true });
    assert.equal(rtc.webrtcRow, true, "ticking WebRTC must add its reading to the score");
    assert.equal(rtc.rows, base.rows + 1, `expected one more scored reading, got ${base.rows} -> ${rtc.rows}`);

    const store = await runWith(srv.port, { storage: true });
    if (store.partTested > 0) {
      assert.equal(store.storageRow, true,
        `the supercookie probe tested ${store.partTested} mechanisms and found ${JSON.stringify(store.carried)}, so the reading must be scored`);
      assert.equal(store.rows, base.rows + 1, `expected one more scored reading, got ${base.rows} -> ${store.rows}`);
      assert.equal(store.rows, store.crossRows,
        "the single-site and cross-site scores must be computed over the same readings");
      assert.ok(store.crossScore === null || store.score <= store.crossScore + 1,
        `single-site ${store.score} must not sit above cross-site ${store.crossScore} on the same readings`);
    }
  } finally { srv.close(); }
});

// Tor and Mullvad block the pop-up the supercookie test needs to read state back from a second
// origin. The cross-site test quietly falls back to an iframe, so nothing looked wrong: the
// reading just never appeared and a user who ticked the box was told nothing at all.
test("opt-ins: a supercookie test that cannot run says so instead of vanishing", async () => {
  const srv = await startServer();
  const page = await launch({ port: srv.port, preload: `window.open=function(){return null;};` });
  try {
    await page.ev(`(function(){var c=document.getElementById("storageOptin");c.checked=true;c.dispatchEvent(new Event("change"));return 1;})()`);
    await page.ev(`document.getElementById("runBtn").click();"go"`);
    for (let i = 0; i < 90; i++) { if (await page.ev("!!window.__KIT_DONE")) break; await new Promise((r) => setTimeout(r, 1000)); }
    await new Promise((r) => setTimeout(r, 6000));
    const out = JSON.parse(await page.ev(`JSON.stringify({
      blocked: String(window.__paStoreBlocked||""),
      onScreen: (document.body.innerText||"").indexOf("Supercookie test did not run") >= 0,
      storageScored: !!(window.__KIT&&window.__KIT.findability&&(window.__KIT.findability.rows||[])
        .some(function(r){return r.label==="storage carried across sites";})),
      score: window.__KIT&&window.__KIT.findability ? window.__KIT.findability.score : null
    })`));
    assert.match(out.blocked, /pop-up/i, "the blocked reason must be recorded");
    assert.equal(out.onScreen, true, "the report must tell the user the test they opted into did not run");
    assert.equal(out.storageScored, false, "a test that never ran must not be scored either way");
    assert.ok(Number.isFinite(out.score), "the audit must still produce a score");
  } finally { await page.close(); srv.close(); }
});

test("opt-ins: both on scores over both extra categories at once", async () => {
  const srv = await startServer();
  try {
    const base = await runWith(srv.port, {});
    const both = await runWith(srv.port, { webrtc: true, storage: true });
    assert.equal(both.webrtcRow, true, "WebRTC must be scored");
    if (both.partTested > 0) {
      assert.equal(both.storageRow, true, "storage must be scored");
      assert.equal(both.rows, base.rows + 2, `expected two more scored readings, got ${base.rows} -> ${both.rows}`);
    }
    assert.ok(Number.isFinite(both.score) && both.score >= 0 && both.score <= 100, `score out of range: ${both.score}`);
  } finally { srv.close(); }
});
