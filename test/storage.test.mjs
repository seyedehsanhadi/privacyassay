import {test} from 'node:test';
import assert from 'node:assert/strict';
import {grabFn} from './helpers/extract.mjs';

function storageProbe({denial, cookie='', silent=false, protocol='https:', cookieStore, fetchResult}={}) {
  let jar=cookie;
  const document={
    get cookie(){return jar;},set cookie(v){if(!silent)jar=v.split(';')[0];},
    createElement:()=>({style:{}}),head:{appendChild:e=>e.onerror(),removeChild(){}},
    body:{appendChild:e=>e.onerror(),removeChild(){}},
  };
  const window={cookieStore};
  if(denial)Object.defineProperty(window,'localStorage',{get(){throw Object.assign(new Error('denied'),{name:denial});}});
  const run=new Function('document','window','navigator','location','PA_SK','PA_STORE_JOB_MS','Image','XMLHttpRequest','fetch','cookieStore',
    grabFn('paCookieStore')+'\n'+grabFn('paStoreEach')+';return paStoreEach;')(document,window,{}, {protocol},'pa_partition',50,
      function(){this.style={};},function(){throw new Error('no server');},async()=>{if(fetchResult)return fetchResult;throw new Error('no server');},cookieStore);
  return run;
}

test('storage: denied getters are refused, unexpected errors remain unknown',async()=>{
  for(const name of ['SecurityError','NotAllowedError','TypeError','QuotaExceededError']){
    const w=await storageProbe({denial:name})('w','pa123');
    assert.ok((/Security|NotAllowed/.test(name)?w.refused:w.stalled).includes('localStorage'));
  }
});
test('storage: an HTTP success without a valid counter is not a cache measurement',async()=>{
  for(const value of [{},{n:'1'},{n:0}])assert.ok((await storageProbe({fetchResult:{ok:true,json:async()=>value}})('w','pa123')).unsupported.includes('HTTP cache'));
  assert.equal((await storageProbe({fetchResult:{ok:true,json:async()=>({n:1})}})('w','pa123')).ok['HTTP cache'],1);
});
test('storage: silently rejected secure cookies are measured refusals; insecure failures are unknown',async()=>{
  const name='cookie (document.cookie)';
  assert.ok((await storageProbe({silent:true})('w','pa123')).refused.includes(name));
  assert.ok((await storageProbe({silent:true,protocol:'http:'})('w','pa123')).stalled.includes(name));
  assert.equal((await storageProbe()('w','pa123')).ok[name],1);
});
test('storage: cookie controls match the exact cookie name and complete token',async()=>{
  const name='cookie (document.cookie)';
  for(const cookie of ['other=pa123','other_pa_partition=pa123','pa_partition=pa123suffix']){
    const w=await storageProbe({cookie,silent:true})('w','pa123');assert.ok(w.refused.includes(name));
  }
  assert.equal((await storageProbe({cookie:'other_pa_partition=pa123'})('r','pa123'))[name],'');
  assert.equal((await storageProbe({cookie:'x=1; pa_partition=pa123; y=2'})('r','pa123'))[name],'pa123');
});
test('storage: CookieStore success requires a matching readback',async()=>{
  const cookieStore={set:async()=>{},get:async()=>null};
  assert.ok((await storageProbe({cookieStore})('w','pa123')).refused.includes('CookieStore'));
  cookieStore.get=async()=>({value:'pa123'});
  assert.equal((await storageProbe({cookieStore})('w','pa123')).ok.CookieStore,1);
});
test('storage: IndexedDB denial preserves its error and aborted transactions settle',async()=>{
  const denial=Object.assign(new Error('denied'),{name:'SecurityError'});
  const make=indexedDB=>new Function('indexedDB',grabFn('paIdb')+';return paIdb;')(indexedDB);
  await assert.rejects(make({open(){throw denial;}})('w','pa123'),e=>e===denial);
  let closed=false;const tx={objectStore:()=>({put(){}})};
  const req={result:{transaction:()=>tx,close(){closed=true;}}};
  const result=make({open(){queueMicrotask(()=>{req.onsuccess();tx.onabort();});return req;}})('w','pa123');
  await assert.rejects(result,/transaction aborted/);assert.equal(closed,true);
});
