import {test} from 'node:test';
import assert from 'node:assert/strict';
import {grabFn} from '../helpers/extract.mjs';
import {startServer} from '../helpers/server.mjs';
import {launch,runAudit} from '../helpers/browser.mjs';

test('constructor probes consume their own rejected promises without hiding mismatch findings',async()=>{
  const server=await startServer(),page=await launch({port:server.port});
  try {
    const result=await page.ev(`(async()=>{
      const errors=[];const listener=e=>errors.push(e.reason.message);
      addEventListener('unhandledrejection',listener);
      const LT=[['Fixture','probe','m']],FOREIGN=/chrome-extension:\\/\\//;
      window.Fixture={probe:function probe(){return Promise.reject(new TypeError('synthetic constructor rejection'));}};
      ${grabFn('ltHolder')}
      ${grabFn('modalShape')}
      ${grabFn('paDeadline')}
      ${grabFn('lieBattery')}
      const findings=await lieBattery();
      await new Promise(r=>setTimeout(r,100));
      removeEventListener('unhandledrejection',listener);delete window.Fixture;
      return {errors,findings};
    })()`);
    assert.equal(result.findings.dirty,1);
    assert.equal(result.findings.hits['constructible (a native method is not)'].length,1);
    assert.deepEqual(result.errors,[]);
  }finally{await page.close();server.close();}
});

test('observed extension origins in native API stacks reach both the leak panel and scored evidence',async()=>{
  const server=await startServer(),page=await launch({port:server.port,preload:`SpeechSynthesis.prototype.getVoices=function getVoices(){const e=new TypeError('synthetic API failure');e.stack='TypeError: synthetic API failure\\n    at chrome-extension://abcdefghijklmnop/hook.js:1:1';throw e;};`});
  try {
    const report=await runAudit(page);
    assert.equal(report.coherence.checks['no extension identifies itself in a thrown stack'],false,'fixture must be observed');
    const row=report.categories['Extension Detection'].rows.find(r=>r[0]==='privacy tool leaks its origin in Error.stack');
    assert.equal(row[1][1],'no');
    assert.equal(report.findability.observed.extEnum,'exposed');
    assert.equal(report.findability.rows.find(r=>r.label==='extensions enumerable').state,'shown');
  }finally{await page.close();server.close();}
});

test('IndexedDB UnknownError stays unknown even when other storage controls succeed',async()=>{
  const server=await startServer(),page=await launch({port:server.port});
  try {
    await runAudit(page);
    const run=(written,read)=>page.ev(`window.__paApplyPartition(${JSON.stringify(written)},${JSON.stringify(read)},'localhost',null);({p:window.__KIT.partitioning,f:window.__KIT.findability})`);
    const uncertain=await run({tok:'pa123',wrote:{ok:{localStorage:1},refused:[],unsupported:[],stalled:['indexedDB'],errors:{indexedDB:'UnknownError'}}},{localStorage:'',indexedDB:''});
    assert.equal(uncertain.f.rows.find(r=>r.label==='storage carried across sites').state,'unknown');
    assert.equal(uncertain.f.complete,false);
    assert.equal(uncertain.p.writeErrors.indexedDB,'UnknownError');
    const isolated=await run({tok:'pa123',wrote:{ok:{indexedDB:1},refused:[],unsupported:[],stalled:[],errors:{}}},{indexedDB:''});
    assert.equal(isolated.f.observed.storageCarry,'not-carried');
    const leaked=await run({tok:'pa123',wrote:{ok:{indexedDB:1},refused:[],unsupported:[],stalled:[],errors:{}}},{indexedDB:'pa123'});
    assert.equal(leaked.f.observed.storageCarry,'carried: indexedDB');
  }finally{await page.close();server.close();}
});


test('IndexedDB explicit third-party policy denial needs successful first-party control and valid readback',async()=>{
  const server=await startServer(),page=await launch({port:server.port});
  try {
    await runAudit(page);
    const written={tok:'pa123',wrote:{ok:{},refused:[],unsupported:[],stalled:['indexedDB'],errors:{indexedDB:'UnknownError'},policyDenials:['indexedDB']}};
    const apply=(w,read,control)=>page.ev('window.__paApplyPartition('+JSON.stringify(w)+','+JSON.stringify(read)+',"localhost",'+JSON.stringify(control)+');({p:window.__KIT.partitioning,f:window.__KIT.findability})');
    for(const [w,read,control] of [[written,{}, {indexedDB:1}],[written,{indexedDB:''},{}],[written,{indexedDB:'pa123'},{indexedDB:1}],[{...written,wrote:{...written.wrote,policyDenials:[]}},{indexedDB:''},{indexedDB:1}]]){
      assert.equal((await apply(w,read,control)).f.rows.find(r=>r.label==='storage carried across sites').state,'unknown');
    }
    const result=await apply(written,{indexedDB:''},{indexedDB:1});
    assert.deepEqual(result.p.unknown,[]);assert.ok(result.p.refusedWrite.includes('indexedDB'));
    assert.equal(result.f.rows.find(r=>r.label==='storage carried across sites').state,'refused');
  }finally{await page.close();server.close();}
});
