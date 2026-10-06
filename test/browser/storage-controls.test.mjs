import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer} from '../helpers/server.mjs';
import {launch,runAudit} from '../helpers/browser.mjs';

test('disabled worker and push APIs do not identify a Goanna browser',async()=>{
  const server=await startServer(),page=await launch({port:server.port,preload:'delete Navigator.prototype.serviceWorker; delete window.PushManager;'});
  try{
    assert.equal(await page.ev('!("serviceWorker" in navigator)&&!("PushManager" in window)'),true);
    const result=await runAudit(page);
    assert.equal(/Goanna|Pale Moon/.test(JSON.stringify(result.whoYouAre)),false);
  }finally{await page.close();server.close();}
});

test('storage: generic CookieStore errors require a positive control and a valid empty readback',async()=>{
  const server=await startServer(),page=await launch({port:server.port});
  try{
    await runAudit(page);
    const written={tok:'pa123',wrote:{ok:{},refused:[],unsupported:[],stalled:['CookieStore'],errors:{CookieStore:'TypeError'}}};
    const apply=async(read,control)=>page.ev(`window.__paApplyPartition(${JSON.stringify(written)},${JSON.stringify(read)},'localhost',${JSON.stringify(control)});({row:window.__KIT.findability.rows.find(r=>r.label==='storage carried across sites'),category:window.__KIT.categories['How findable you are'].rows})`);
    const ok={CookieStore:1};
    for(const [read,control] of [[{},ok],[{CookieStore:null},ok],[{CookieStore:''},null],[{CookieStore:''},0],[{CookieStore:''},1],[{CookieStore:''},{CookieStore:0}],[{CookieStore:'pa123'},ok]]){
      const result=await apply(read,control);assert.equal(result.row.state,'unknown');
      assert.ok(result.category.some(r=>r[0].includes('ERR:storage-incomplete')));
      assert.ok(!result.category.some(r=>r[0].includes('no supercookie carried')));
    }
    const result=await apply({CookieStore:''},ok);assert.equal(result.row.state,'refused');
    assert.ok(result.category.some(r=>r[0]==='cross-browser identity'));
    assert.ok(result.category.some(r=>r[0].includes('no supercookie carried')));
    assert.ok(!result.category.some(r=>r[0].includes('ERR:storage-incomplete')));
    assert.equal(await page.ev("window.__KIT.partitioning.cookieControl"),true);
  }finally{await page.close();server.close();}
});

test('storage: a silent cookie readback failure needs a first-party control before it counts as refused',async()=>{
  const server=await startServer(),page=await launch({port:server.port});
  try{
    await runAudit(page);
    const k='cookie (document.cookie)';
    const apply=async(written,read,control)=>page.ev(`window.__paApplyPartition(${JSON.stringify(written)},${JSON.stringify(read)},'localhost',${JSON.stringify(control)});({row:window.__KIT.findability.rows.find(r=>r.label==='storage carried across sites'),p:window.__KIT.partitioning})`);
    const carried=await apply({tok:'pa123',wrote:{ok:{[k]:1},refused:[],unsupported:[],stalled:[],errors:{}}},{[k]:'pa123'},null);
    assert.equal(carried.row.state,'shown');assert.deepEqual(carried.p.leaked,[k]);
    const silent={tok:'pa123',wrote:{ok:{},refused:[],unsupported:[],stalled:[k],errors:{[k]:'ReadbackError'}}};
    for(const control of [null,{},{[k]:0},{CookieStore:1}]){
      const broken=await apply(silent,{[k]:''},control);
      assert.equal(broken.row.state,'unknown');assert.ok(broken.p.unknown.includes(k));assert.ok(!broken.p.refusedWrite.includes(k));
    }
    const missingRead=await apply(silent,{},{[k]:1});assert.equal(missingRead.row.state,'unknown');
    const refused=await apply(silent,{[k]:''},{[k]:1});
    assert.equal(refused.row.state,'refused');assert.ok(refused.p.refusedWrite.includes(k));assert.deepEqual(refused.p.cookieReadbackControls,{[k]:1});
  }finally{await page.close();server.close();}
});

test('script blocking leaves a visible explanation and an unavailable Run button',async()=>{
  const server=await startServer(),page=await launch({port:server.port});
  try{
    assert.equal(await page.ev('document.getElementById("runBtn").disabled'),false);
    await page.send('Emulation.setScriptExecutionDisabled',{value:true});await page.send('Page.reload');
    for(let i=0;i<50;i++){if(await page.ev('document.readyState==="complete"&&!!document.getElementById("scriptStatus")'))break;await new Promise(r=>setTimeout(r,100));}
    const state=await page.ev('({disabled:document.getElementById("runBtn").disabled,notice:document.getElementById("scriptStatus").getBoundingClientRect().height,collectors:!!window.__collectors})');
    assert.equal(state.disabled,true);assert.ok(state.notice>0);assert.equal(state.collectors,false);
  }finally{await page.close();server.close();}
});
