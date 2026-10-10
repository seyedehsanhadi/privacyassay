import {test} from 'node:test';
import assert from 'node:assert/strict';
import {grabVar,grabFn} from './helpers/extract.mjs';
const code=grabVar('PRIORS')+grabVar('PA_STD')+['paTier','paLetterboxed','paIsLB','findability','paRepeatMerge','paIdb'].map(grabFn).join('\n');
const make=()=>new Function(code+';return {findability,paRepeatMerge,paIdb}')();
const {findability,paRepeatMerge}=make();
const merge=(a,b)=>paRepeatMerge(a,b,findability(a,'other'),findability(b,'other'));
for(const [key,hash,label] of [['canvasClass','canvasHash','canvas drawing'],['webglRenderClass','webglHash','3D rendered image'],['audioRenderClass','audioHash','rendered sound']]) {
  test(`repeat: ${label} compares the rendered fingerprint, not its classification label`,()=>{
    const a={[key]:'unique',[hash]:'aa11bb22'},b={[key]:'unique',[hash]:'cc33dd44'};
    const out=merge(a,b);
    assert.equal(out._noisy[key],1);
    assert.equal(findability(out,'other').rows.find(r=>r.label===label).state,'blended');
    assert.equal(merge({...b},{...b})._noisy[key],undefined);
  });
  test(`repeat: missing or failed ${label} hashes never earn variation credit`,()=>{
    for(const value of [undefined,null,'','ERR:timeout','unsupported']) {
      const out=merge({[key]:'unique',[hash]:'aa11bb22'},{[key]:'unique',[hash]:value});
      assert.equal(out._noisy[key],undefined);
      const result=findability(out,'other'),row=result.rows.find(r=>r.label===label);
      assert.equal(row.state,'shown');assert.equal(row.comparisonIncomplete,true);assert.equal(result.complete,false);
    }
  });
}
test('IndexedDB: asynchronous UnknownError remains a failure, not a denial',async()=>{
  const error=new DOMException('transient disk failure','UnknownError');
  const paIdb=new Function('indexedDB',grabFn('paIdb')+';return paIdb')({open(){const request={error};queueMicrotask(()=>request.onerror());return request;}});
  await assert.rejects(paIdb('w','pa123'),e=>e===error);
});

function bindingProbe(implementation) {
  const holder={probe(){return implementation();}};
  return new Function('LT','ltHolder','modalShape','FOREIGN','location','paDeadline',grabFn('lieBattery')+';return lieBattery;')(
    [['Fixture','probe','m']],()=>holder,()=>'',/chrome-extension:\/\/[a-z0-9-]+/,{origin:'http://fixture.test'},
    new Function(grabFn('paDeadline')+';return paDeadline;')());
}
test('native receiver: a fulfilled promise confirms acceptance of the foreign receiver',async()=>{
  const result=await bindingProbe(()=>Promise.resolve(1))();
  assert.equal(result.dirty,1);
  assert.equal(result.hits['accepts a foreign `this` instead of throwing'].length,1);
});
test('native receiver: native asynchronous TypeError is valid, other rejections are not',async()=>{
  assert.equal((await bindingProbe(()=>Promise.reject(new TypeError('illegal invocation')))()).dirty,0);
  const result=await bindingProbe(()=>Promise.reject(new RangeError('wrong failure')))();
  assert.equal(result.dirty,1);
  assert.equal(result.hits['wrong error type for a foreign `this`'].length,1);
});
test('native receiver: asynchronous extension-origin evidence is retained',async()=>{
  const error=new TypeError('illegal invocation');error.stack='TypeError: illegal invocation\n at chrome-extension://abcdefghijklmnop/hook.js:1:1';
  const result=await bindingProbe(()=>Promise.reject(error))();
  assert.deepEqual(result.extensions,['chrome-extension://abcdefghijklmnop']);
});
test('native receiver: unresolved probes are unmeasured and late answers cannot mutate the report',async()=>{
  let finish;const pending=new Promise(resolve=>{finish=resolve;});
  const result=await bindingProbe(()=>pending)();
  assert.deepEqual(result.unmeasured,['Fixture.probe']);
  assert.equal(result.dirty,0);
  const snapshot=JSON.stringify(result);finish(1);await new Promise(r=>setTimeout(r,0));
  assert.equal(JSON.stringify(result),snapshot);
});

test('native receiver: primitive rejection reasons cannot masquerade as native TypeError',async()=>{
  for(const reason of [undefined,null,0,'failure']) assert.equal((await bindingProbe(()=>Promise.reject(reason))()).dirty,1);
});


test('IndexedDB first-party control requires committed write and matching readback',async()=>{
  for(const value of ['pa123','other',undefined]){
    const calls=[];
    const run=new Function('document','PA_SK','paCookieStore','paIdb',grabFn('paStorageReadbackControls')+';return paStorageReadbackControls;')(
      {cookie:''},'pa_partition',()=>Promise.reject(new Error('unavailable')),async(mode,tok)=>{calls.push([mode,tok]);return mode==='w'?1:value;});
    const result=await run('pa123');
    assert.equal(result.indexedDB,value==='pa123'?1:undefined);
    assert.deepEqual(calls,[['w','pa123'],['r','pa123']]);
  }
});


test('storage: an IndexedDB-only policy denial requests the first-party control',()=>{
  const needed=new Function(grabFn('paNeedsStorageControl')+';return paNeedsStorageControl;')();
  assert.equal(needed({wrote:{errors:{indexedDB:'UnknownError'},policyDenials:['indexedDB']}}),true);
  assert.equal(needed({wrote:{errors:{indexedDB:'UnknownError'}}}),false);
  assert.equal(needed({wrote:{errors:{CookieStore:'TypeError'}}}),true);
  assert.equal(needed({wrote:{errors:{'cookie (document.cookie)':'ReadbackError'}}}),true);
  assert.equal(needed(null),false);
});


test('score animation tolerates frame timestamps earlier than its start clock',()=>{
  const PAV={},drawn=[],queued=[];
  const animate=new Function('PAV','performance','matchMedia','cancelAnimationFrame','requestAnimationFrame','paPaintRing',grabFn('paAnimateRing')+';return paAnimateRing;')(
    PAV,{now:()=>1000},()=>({matches:false}),()=>{},cb=>{queued.push(cb);return 1;},()=>drawn.push(PAV.disp));
  animate(18);queued.shift()(980);queued.shift()(2000);
  assert.ok(drawn.every(v=>Number.isInteger(v)&&v>=0&&v<=18),JSON.stringify(drawn));
  assert.equal(drawn.at(-1),18);
});
