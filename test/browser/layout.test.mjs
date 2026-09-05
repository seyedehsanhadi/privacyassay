// What the rendered page must show: no overlap at any width, the working panel collapsed, the
// ring drawing the score it is labelled with, and no frame left behind by an earlier run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../helpers/server.mjs";
import { launch, runAudit } from "../helpers/browser.mjs";

// The sticky bar is assembled by moving the brand out of the start card and animating it into
// place. Two things went wrong at once: every block in the bar was flex:0 0 auto and the bar
// only wrapped below 640px, so between roughly 700 and 1100 nothing could shrink or move to a
// second row; and the brand's transform was cleared on transitionend, which does not fire when
// the measured offset is zero, leaving it translated across the opt-in chips.
const WIDTHS = [1440, 1180, 1000, 900, 780, 680, 520, 400];
// ---- layout at every width ----

test("layout: the brand never overlaps the controls in the sticky bar, at any width", async () => {
  const srv = await startServer();
  const page = await launch({ port: srv.port });
  try {
    await runAudit(page);
    const bad = [];
    for (const width of WIDTHS) {
      await page.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
      await new Promise((r) => setTimeout(r, 220));
      const box = JSON.parse(await page.ev(`JSON.stringify((function(){
        var brand=document.getElementById('paBrand'),row=document.querySelector('.pa-top-in');
        if(!brand||!row)return {missing:true};
        var rb=brand.getBoundingClientRect(),worst=0,who="";
        ['paChecks','paCtrls','paTag'].forEach(function(id){
          var el=document.getElementById(id);
          if(!el||!el.offsetParent)return;
          var r=el.getBoundingClientRect();
          var x=Math.max(0,Math.min(rb.right,r.right)-Math.max(rb.left,r.left));
          var y=Math.max(0,Math.min(rb.bottom,r.bottom)-Math.max(rb.top,r.top));
          if(x*y>worst){worst=x*y;who=id;}
        });
        return {overlap:Math.round(worst),who:who,transform:brand.style.transform||"",
          overflow:Math.round(row.scrollWidth-row.clientWidth)};
      })())`));
      if (box.missing) { bad.push(`${width}px: the bar was never populated`); continue; }
      if (box.overlap > 4) bad.push(`${width}px: brand overlaps #${box.who} by ${box.overlap}px²`);
      if (box.transform) bad.push(`${width}px: brand kept a leftover transform "${box.transform}"`);
      if (box.overflow > 2) bad.push(`${width}px: the bar overflows its own row by ${box.overflow}px`);
    }
    assert.deepEqual(bad, []);
  } finally { await page.close(); srv.close(); }
});

test("layout: the score working is collapsed by default and its summary carries the arithmetic", async () => {
  const srv = await startServer();
  const page = await launch({ port: srv.port });
  try {
    const kit = await runAudit(page);
    const shut = JSON.parse(await page.ev(`JSON.stringify({
      present: !!document.querySelector('.pa-calc'),
      open: !!document.querySelector('.pa-calc.on'),
      body: !!document.querySelector('.pa-calc-in'),
      summary: (document.querySelector('.pa-calc > button')||{}).innerText || ""
    })`));
    assert.equal(shut.present, true, "the working panel must be rendered");
    assert.equal(shut.open, false, "it must start collapsed");
    assert.equal(shut.body, false, "nothing inside it should be in the DOM until it is opened");
    const F = kit.findability;
    assert.ok(shut.summary.includes(String(F.totalWeight)) && shut.summary.includes(String(F.score)),
      `the collapsed row must show the sum, got ${JSON.stringify(shut.summary)}`);

    await page.ev(`document.querySelector('.pa-calc > button').click(); "ok"`);
    await new Promise((r) => setTimeout(r, 300));
    const text = await page.ev(`(document.querySelector('.pa-calc-in')||{}).innerText||""`);
    assert.match(text, /share of a category you hide/i, "the rule must be stated");
    assert.match(text, /\d+ × \d+\/\d+ = [\d.]+/, "a worked example with real numbers must be present");
    assert.ok(text.includes(String(F.score)), "the panel must end at the score it explains");
  } finally { await page.close(); srv.close(); }
});
// ---- what a run must not leave behind, and what the ring must show ----

// Raising the cross-site budget from 15s to 45s made the fallback iframe outlive the run that
// created it, so six rapid runs left several stacked in the DOM. The frames are tagged and a new
// run clears any left by a previous one; without that, the leak scales with the timeout.
test("cross-site frames from an earlier run never survive into a later one", async () => {
  const srv = await startServer();
  const page = await launch({ port: srv.port });
  try {
    const counts = [];
    for (let i = 0; i < 3; i++) {
      await page.ev(`document.getElementById("runBtn").click();"go"`);
      await new Promise((r) => setTimeout(r, 2500));
      counts.push(Number(await page.ev(`document.querySelectorAll('iframe[data-pa-x]').length`)));
    }
    assert.ok(Math.max(...counts) <= 1,
      `a run must never leave a previous run's cross-site frame behind, saw ${counts.join(", ")}`);
  } finally { await page.close(); srv.close(); }
});

// paRing draws the score's digits and its arc inside the ring SVG, so the ring carries its own
// copy of the number. The render emits it as PAV.disp whenever PAV.lastScore !== score, and
// paAnimateRing had two exits -- score unchanged, and prefers-reduced-motion -- that returned
// without repainting. A storage-partition result arriving after the first render rescores into
// exactly that state, so the ring froze at the pre-rescore number while every other figure on the
// page showed the new one. Reduced motion is emulated here because it makes the unpainted exit
// unconditional; without it the race only shows on some runs.
const RING = `(function(){
  var K=window.__KIT,svg=document.querySelector('#pa-view svg[role=img]');
  if(!K||!svg)return JSON.stringify({missing:true});
  var arc=[].slice.call(svg.querySelectorAll('rect[transform]'));
  var lit=arc.filter(function(r){return (r.getAttribute('style')||'').indexOf('--ring-track')<0;}).length;
  var s=K.findability.score;
  return JSON.stringify({score:s,lit:lit,want:Math.round(31*(s/100))+1,
    label:svg.getAttribute('aria-label')||""});
})()`;

// The real trigger: __paApplyPartition is what a late storage result calls. Held on the first
// call and carried on the second, so the score is guaranteed to move between the two reads.
const partition = (leaked) => `(function(){
  var names={"localStorage":1,"IndexedDB":1},back=${leaked} ? {"localStorage":"T","IndexedDB":"T"} : {"localStorage":"","IndexedDB":""};
  window.__paApplyPartition({tok:"T",origin:location.origin,
    wrote:{ok:names,refused:[],unsupported:[]}},back);
  return "ok";})()`;

test("the ring draws the score it is labelled with, animation or not", async () => {
  const srv = await startServer();
  const page = await launch({ port: srv.port });
  try {
    await page.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    const kit = await runAudit(page);
    const first = JSON.parse(await page.ev(RING));
    assert.equal(first.missing, undefined, "the ring must be rendered");
    assert.equal(first.score, kit.findability.score);
    assert.equal(first.lit, first.want, `the ring must draw ${first.score} straight after the audit`);

    const seen = [];
    for (const leaked of [false, true]) {
      await page.ev(partition(leaked));
      await new Promise((r) => setTimeout(r, 400));
      const r = JSON.parse(await page.ev(RING));
      assert.equal(r.lit, r.want,
        `after a rescore the ring must redraw ${r.score}, not the number it last held`);
      assert.match(r.label, new RegExp(`score ${r.score} out of 100`),
        "the accessible label and the drawn ring must agree");
      seen.push(r.score);
    }
    assert.notEqual(seen[0], seen[1],
      `the two partition results must move the score, otherwise this proves nothing (both ${seen[0]})`);
  } finally { await page.close(); srv.close(); }
});

test("rerun clears previous report and companion state immediately",async()=>{const srv=await startServer();const page=await launch({port:srv.port,preload:'window.__popupNames=[];window.open=function(url,name){window.__popupNames.push(name);return null;};'});try{await runAudit(page);const cleared=await page.ev('window.__paObsB={old:true};document.getElementById("runBtn").click();window.__KIT===null&&window.__paObsB===null&&window.__paApplyCross===null&&window.__paApplyPartition===null');assert.equal(cleared,true);const names=await page.ev("window.__popupNames");assert.equal(names.length,2);assert.notEqual(names[0],names[1],"an old popup cleanup must not close the new run’s window");}finally{await page.close();srv.close();}});
