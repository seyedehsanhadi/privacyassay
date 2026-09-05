import {test} from 'node:test';
import assert from 'node:assert/strict';
import {grabFn,grabVar} from './helpers/extract.mjs';
const core=grabVar('PRIORS')+['paTier','findability','findabilityCross','paMessageMatches','paCrossMessage'].map(grabFn).join('\n');
const {PRIORS,findability,findabilityCross,paCrossMessage}=new Function(core+';return {PRIORS,findability,findabilityCross,paCrossMessage}')();
const observed=(value='value')=>Object.fromEntries(PRIORS.surfaces.filter(s=>!s.optional).map(s=>[s.k,value+'-'+s.k]));
test('all missing and all failed observations cannot obtain a privacy grade',()=>{
  for(const o of [{},Object.fromEntries(PRIORS.surfaces.filter(s=>!s.optional).map(s=>[s.k,'ERR:TypeError']))]){
    const f=findability(o,'other');assert.equal(f.score,0);assert.equal(f.grade,'I');assert.equal(f.complete,false);assert.equal(f.checks.held,0);assert.equal(f.coverage,0);assert.equal(f.upperBound,100);
  }
});
test('a failed repeat never receives variation credit',()=>{
  const o={...observed(),audioRenderClass:'ERR:repeat-incomplete',_noisy:{audioRenderClass:1}};
  const f=findability(o,'other');assert.equal(f.rows.find(r=>r.label==='rendered sound').state,'unknown');assert.equal(f.complete,false);assert.equal(f.score,0);
});
test('cross-site errors are unknown rather than masking or a match',()=>{
  const a=observed();const b={...a,timezone:'ERR:timeout'};
  const f=findabilityCross(a,b,'other');assert.equal(f.complete,false);assert.equal(f.score,0);assert.equal(f.rows.find(r=>r.label==='timezone').state,'unknown');assert.ok(!f.comparedAcrossOrigins.includes('timezone'));assert.ok(!f.changedAcrossOrigins.includes('timezone'));
});
test('cross-site optional controls cannot accidentally be treated as fingerprints',()=>{
  const a={...observed(),webrtcIP:'exposed',storageCarry:'carried: cookie'};
  const f=findabilityCross(a,{...a,webrtcIP:'not-exposed',storageCarry:'not-carried'},'other');assert.deepEqual(f.changedAcrossOrigins,[]);
});
test('companion messages bind source, origin, nonce, version and value shape',()=>{
  const source={},origin='https://companion.example',token='pa12345678';
  const event={source,origin,data:{paToken:token,paVersion:PRIORS.version,paLink:{},paObs:observed()}};
  const check=e=>paCrossMessage(e,origin,token,[source]);assert.equal(check(event),true);
  for(const mutation of [{source:{}},{origin:'https://other.example'},{data:{...event.data,paToken:'stale'}},{data:{...event.data,paVersion:'old'}},{data:{...event.data,paObs:{}}},{data:{...event.data,paObs:{...observed(),cores:{value:8}}}},{data:{...event.data,paObs:{...observed(),cores:Infinity}}}])assert.equal(check({...event,...mutation}),false);
});
const fastDeadline=new Function('setTimeout','clearTimeout',grabFn('paDeadline')+';return paDeadline')((f,ms)=>setTimeout(f,Math.min(ms,20)),clearTimeout);
test('never-settling client hints return an explicit timeout outcome',async()=>{
  const high=new Function('navigator','paDeadline',grabFn('highEntropy')+';return highEntropy')({userAgentData:{getHighEntropyValues:()=>new Promise(()=>{})}},fastDeadline);
  assert.equal((await high()).__paStatus,'ERR:timeout');
});
test('AI timeout results do not mutate when an API responds late',async()=>{
  let finish;const win={LanguageModel:{availability:()=>new Promise(r=>{finish=r})}};
  const collect=new Function('window','paDeadline','cat',grabFn('collectAI')+';return collectAI')(win,fastDeadline,(name,rows)=>({name,rows}));
  const result=await collect(),before=JSON.stringify(result);assert.match(before,/timeout/);finish('available');await new Promise(r=>setTimeout(r,0));assert.equal(JSON.stringify(result),before);assert.equal(result.rows.length,7);
});
test('AI throwing accessors are isolated from other API probes',async()=>{
  const win={Translator:{availability:()=>Promise.resolve('available')}};Object.defineProperty(win,'LanguageModel',{get(){throw new TypeError('injected')}});
  const collect=new Function('window','paDeadline','cat',grabFn('collectAI')+';return collectAI')(win,fastDeadline,(name,rows)=>rows);const rows=await collect();assert.match(rows[0][1][0],/ERR/);assert.equal(rows[1][1][0],'available');
});

test('supported client hints resolving empty remain unknown',async()=>{for(const value of [undefined,null,[],"bad"]){const high=new Function('navigator','paDeadline',grabFn('highEntropy')+';return highEntropy')({userAgentData:{getHighEntropyValues:()=>Promise.resolve(value)}},fastDeadline);assert.equal((await high()).__paStatus,'ERR:empty-client-hints');}});

test('failed repeat collectors do not leave undefined categories behind',async()=>{
  const C={},cat=(name,rows)=>(C[name]={rows});
  const fail=()=>{throw new Error('injected')};
  const repeat=new Function('C','observeVectors','collectGPU','collectFonts','collectCSS','collectAudioSync','collectAudioAsync','paDeadline','cat','speechSynthesis','findability','PRIORS',grabFn('repeatVectors')+';return repeatVectors')(C,()=>({}),fail,fail,fail,fail,async()=>({hash:'ERR'}),fastDeadline,cat,{getVoices:()=>[]},()=>({rows:[]}),{surfaces:[]});
  await repeat();assert.deepEqual(Object.keys(C),[]);
});

test('late WebGPU adapters cannot mutate a completed category',async()=>{
  let finish;const navigator={gpu:{requestAdapter:()=>new Promise(r=>{finish=r})}};
  const collect=new Function('navigator','cat','setTimeout','fnv','fnvParts',grabFn('collectWebGPU')+';return collectWebGPU')(navigator,(name,rows)=>({name,rows}),(f,ms)=>setTimeout(f,Math.min(ms,20)),()=>'',()=> '');
  const result=await collect(),before=JSON.stringify(result);finish({info:{vendor:'late'}});await new Promise(r=>setTimeout(r,0));assert.equal(JSON.stringify(result),before);
});

test('invalid numeric and object outcomes remain unknown',()=>{for(const cores of [NaN,Infinity,{},[],false]){const f=findability({...observed(),cores},'other');assert.equal(f.grade,'I');assert.equal(f.rows.find(r=>r.label==='CPU cores').state,'unknown');}});
test('a single unknown reading uses a singular verdict',()=>{assert.match(findability({...observed(),cores:NaN},'other').verdict,/1 reading is unknown/);});
test('unavailable APIs are not counted as matching fingerprints',()=>{const f=findabilityCross(observed('unsupported'),observed('unsupported'),'other');const a=Object.fromEntries(PRIORS.surfaces.filter(s=>!s.optional).map(s=>[s.k,'unsupported']));const g=findabilityCross(a,a,'other');assert.equal(g.comparedAcrossOrigins.length,0);assert.equal(g.changedAcrossOrigins.length,0);});

test('WebGPU descriptions remain measured when the other identity fields are empty',()=>{const observe=new Function('navigator','window','paRow','paCanvasClass','fnvParts','PA_UACH',grabFn('observeVectors')+';return observeVectors')({gpu:{}},{},(c,n)=>n==='adapter description'?'test GPU':'',()=>'',p=>p.filter(Boolean).join('|'),null);assert.equal(observe().webgpuAdapter,'test GPU');});
