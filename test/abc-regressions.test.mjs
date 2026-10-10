import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {matchBrace} from './helpers/extract.mjs';
const root=process.env.PRIVACYASSAY_TEST_ROOT||path.resolve('.');
const src=fs.readFileSync(path.join(root,'index.html'),'utf8');
const fn=(name,source=src)=>{const p=source.indexOf('function '+name+'(');assert.ok(p>=0,name);const b=source.indexOf('{',source.indexOf(')',p));return source.slice(p,matchBrace(source,b)+1);};
const variable=name=>{const p=src.indexOf('var '+name+'='),b=src.indexOf('{',p);return src.slice(p,matchBrace(src,b)+1)+';';};
const core=variable('PRIORS')+variable('PA_STD')+['paTier','paLetterboxed','paIsLB','findability','findabilityCross','paRepeatMerge','paRedactVal','paWebgpuVectors','fnv','fnvDead','fnvParts'].map(n=>fn(n)).join('\n');
const M=new Function(core+';return {PRIORS,findability,findabilityCross,paRepeatMerge,paRedactVal,paWebgpuVectors}')();
const all=()=>Object.fromEntries(M.PRIORS.surfaces.filter(s=>!s.optional).flatMap(s=>[[s.k,'fixture-exposed'],...(s.hashKey?[[s.hashKey,'aabb1122']]:[])]));
const cpu=F=>F.rows.find(r=>r.label==='CPU cores');
const repeat=(a,b)=>M.paRepeatMerge(a,b,M.findability(a,'other'),M.findability(b,'other'));
test('explicit local companion pair replies to its configured home without contacting the public default',()=>{
 const routes=new Function('location','PA_HOME','PA_COMPANION',['otherOrigin','paIsLocalPage','paBackOrigin','paCompanion'].map(n=>fn(n)).join('\n')+';return {back:paBackOrigin(),companion:paCompanion()};');
 const home='https://127.0.0.2:8443/',peer='https://127.0.0.3:8443/index.html';
 assert.equal(routes(new URL(peer),home,peer).back,new URL(home).origin);
 assert.equal(routes(new URL('https://127.0.0.3:8443/'),'https://privacyassay.com/','https://privacyassay.github.io/index.html').back,'');
 assert.equal(routes(new URL('http://localhost:8443/'),home,peer).back,'http://127.0.0.1:8443');
 assert.equal(routes(new URL(home),home,peer).companion.origin,new URL(peer).origin);
 assert.equal(routes(new URL('https://privacyassay.github.io/index.html'),'https://privacyassay.com/','https://privacyassay.github.io/index.html').back,'https://privacyassay.com');
});
for(const reverse of [false,true])test('repeat retains a frame exposure when the other read fails, order '+reverse,()=>{
 const a={...all(),cores:'blocked:NotAllowedError',_alt:{cores:'12'}},b={...all(),cores:'blocked:NotAllowedError',_alt:{}};
 const out=M.findability(repeat(...(reverse?[b,a]:[a,b])),'other');assert.equal(cpu(out).state,'shown');assert.equal(cpu(out).value,'12');assert.equal(out.score,0);
});
for(const reverse of [false,true])test('cross-site uniformity cannot hide one-sided frame exposure, order '+reverse,()=>{
 const a={...all(),cores:'4',_alt:{cores:'12'}},b={...all(),cores:'4',_alt:{}};
 const out=M.findabilityCross(...(reverse?[b,a]:[a,b]),'firefox-rfp');assert.equal(cpu(out).state,'shown');assert.equal(out.score,0);assert.ok(!out.uniformAcrossOrigins.includes('CPU cores'));
});
test('stable frame values distinguish same value from two-site variation',()=>{
 const a={...all(),cores:'blocked',_alt:{cores:'12'}};
 assert.equal(cpu(M.findabilityCross(a,{...all(),cores:'blocked',_alt:{cores:'12'}},'other')).state,'shown');
 assert.equal(cpu(M.findabilityCross(a,{...all(),cores:'blocked',_alt:{cores:'16'}},'other')).state,'blended');
});
test('an incomplete frame repeat cannot prove origin-specific variation',()=>{
 const a=repeat({...all(),cores:'blocked',_alt:{cores:'12'}},{...all(),cores:'blocked',_alt:{}});
 const b=repeat({...all(),cores:'blocked',_alt:{cores:'16'}},{...all(),cores:'blocked',_alt:{cores:'16'}});
 assert.equal(cpu(M.findabilityCross(a,b,'other')).state,'shown');
});
test('a recovered canvas hash survives a failed alternate repeat',()=>{
 const a={...all(),canvasClass:'uniform-masked',canvasHash:'blocked',_alt:{canvasClass:'aabb1122'}},b={...all(),canvasClass:'uniform-masked',canvasHash:'blocked',_alt:{}};
 assert.equal(M.findability(repeat(a,b),'other').rows.find(r=>r.label==='canvas drawing').state,'shown');
});
test('redaction masks every numeric reading while retaining diagnostic status',()=>{
 for(const v of ['48000','24','-120','1.25','60 Hz','0.8 ms'])assert.equal(M.paRedactVal('raw reading',v),'[redacted]',v);
 for(const v of ['true','unsupported','blocked:SecurityError','ERR:TypeError'])assert.equal(M.paRedactVal('raw reading',v),v);
});
test('known exposure remains in exposure filters when its category is incomplete',()=>{
 const groups=new Function('paTierMap','PAGRP',fn('paGroupsFrom')+';return paGroupsFrom')(()=>({'canvas drawing':3,'GPU name':2}),{gpu:'Canvas & GPU'});
 const g=groups({rows:[{group:'gpu',label:'canvas drawing',tier:3,state:'shown',value:'x'},{group:'gpu',label:'GPU name',tier:2,state:'unknown',value:'ERR'}]})[0];
 assert.equal(g.state,'shown');assert.equal(g.unknownCount,1);assert.equal(g.exposedLabel,'1 exposed, 1 not measured');
});
test('WebGPU feature identity is scored independently of adapter limits',()=>{
 const s=M.PRIORS.surfaces.find(s=>s.k==='webgpuFeatures');assert.ok(s);
 const value=M.paWebgpuVectors([['wgslLanguageFeatures (1)','cafefeed'],['features (1)','aabb1122'],['adapter vendor',['GPU','mid']]]);
 assert.equal(value.features,'aabb1122');
 const out=M.findability({...all(),webgpuFeatures:value.features},'other');assert.equal(out.rows.find(r=>r.label===s.label).state,'shown');
});
const cli=fs.readFileSync(path.join(root,'bin/privacyassay.mjs'),'utf8');
const val=argv=>new Function('argv',cli.slice(cli.indexOf('const val ='),cli.indexOf('if (flag('))+';return val')(argv);
test('CLI rejects an empty score threshold and fractional run count',()=>{
 const proc={stderr:{write(){}},exit(code){throw new Error('exit '+code);}};
 for(const [argv,name,opt] of [[['--min-score='],'--min-score',{min:0}],[['--runs','1.9'],'--runs',{min:1,integer:true}]]){
 const num=new Function('val','process',fn('num',cli)+';return num')(val(argv),proc);assert.throws(()=>num(name,null,opt),/exit 2/);
 }
});
test('CLI rejects an explicit missing browser instead of selecting another',()=>{
 const select=new Function('val','process','fs',fn('findBrowser',cli)+';return findBrowser')((n,d)=>n==='--browser'?'missing.exe':d,{platform:'win32',env:{}},{existsSync:p=>p.includes('chrome.exe')});
 assert.throws(()=>select(),/browser/i);
});

for(const reverse of [false,true])test('known exposure survives failed comparison, order '+reverse,()=>{
 const a={...all(),cores:'16'},b={...all(),cores:'ERR:timeout'};
 for(const out of [M.findability(repeat(...(reverse?[b,a]:[a,b])),'other'),M.findabilityCross(...(reverse?[b,a]:[a,b]),'other')]){
  assert.equal(cpu(out).state,'shown');assert.equal(cpu(out).value,'16');assert.equal(cpu(out).comparisonIncomplete,true);
  assert.equal(out.score,0);assert.equal(out.complete,false);assert.equal(out.grade,'I');assert.equal(out.checks.incomplete,1);assert.equal(out.checks.unknown,0);assert.equal(out.checks.held,0);assert.equal(out.coverage,100);assert.ok(out.comparisonCoverage<100);assert.ok(out.upperBound>out.score);
 }
});
test('WebGPU feature read failures remain diagnostic failures, empty feature sets are valid',()=>{
 assert.equal(M.paWebgpuVectors([['wgslLanguageFeatures (1)','cafefeed'],['features (unreadable)','ERR:TypeError']]).features,'ERR:TypeError');
 assert.equal(M.paWebgpuVectors([['features (0)','811c9dc5']]).features,'811c9dc5');
});

test('adapter getter failure cannot hide identity recovered through the legacy method',()=>{
 const v=M.paWebgpuVectors([['adapter info','blocked:SecurityError'],['adapter vendor','GPU_VENDOR'],['adapter description','GPU_DESC']]);
 assert.match(v.adapter,/^[a-f0-9]{8}$/);
 assert.equal(M.paWebgpuVectors([['adapter info','ERR:TypeError'],['adapter vendor','(empty)']]).adapter,'ERR:TypeError');
});
test('redaction cannot publish an extension name disguised as an error class',()=>{
 assert.equal(M.paRedactVal('collector error','ERR:PrivateExtensionError'),'[redacted]');
});

test('variation earns credit only when main and alternate paths both vary',()=>{
 const noisy=repeat({...all(),cores:'12',_alt:{cores:'12'}},{...all(),cores:'16',_alt:{cores:'16'}});
 assert.equal(cpu(M.findability(noisy,'other')).state,'blended');assert.equal(cpu(M.findability(noisy,'other')).variationKind,'per-read');
 const recovered=repeat({...all(),cores:'12',_alt:{cores:'20'}},{...all(),cores:'16',_alt:{cores:'20'}});
 assert.equal(cpu(M.findability(recovered,'other')).state,'shown');
 const stable=repeat({...all(),cores:'12',_alt:{cores:'16'}},{...all(),cores:'12',_alt:{cores:'20'}});
 assert.equal(cpu(M.findability(stable,'other')).state,'shown');
});

test('per-read variation on either origin stays separate from stable per-site variation',()=>{
 const varied=repeat({...all(),cores:'12',_alt:{cores:'12'}},{...all(),cores:'16',_alt:{cores:'16'}});
 const stable=repeat({...all(),cores:'20',_alt:{cores:'20'}},{...all(),cores:'20',_alt:{cores:'20'}});
 for(const [a,b] of [[varied,stable],[stable,varied]]){
 const out=M.findabilityCross(a,b,'other');assert.equal(cpu(out).state,'blended');assert.equal(cpu(out).variationKind,'per-read');assert.ok(!out.changedAcrossOrigins.includes('CPU cores'));assert.equal(out.complete,true);
 }
});

test('stable recovered values over a blocked main API remain complete',()=>{
 const a=repeat({...all(),cores:'blocked',_alt:{cores:'12'}},{...all(),cores:'blocked',_alt:{cores:'12'}});
 const b=repeat({...all(),cores:'blocked',_alt:{cores:'16'}},{...all(),cores:'blocked',_alt:{cores:'16'}});
 assert.equal(cpu(M.findability(a,'other')).comparisonIncomplete,false);
 const cross=M.findabilityCross(a,b,'other');assert.equal(cross.complete,true);assert.equal(cpu(cross).variationKind,'between-origins');
});
for(const reverse of [false,true])test('equal exposed values stay comparable when the recovered route changes, order '+reverse,()=>{
 const a={...all(),cores:'blocked',_alt:{cores:'12'}},b={...all(),cores:'12'};
 for(const out of [M.findability(repeat(...(reverse?[b,a]:[a,b])),'other'),M.findabilityCross(...(reverse?[b,a]:[a,b]),'other')]){
  assert.equal(cpu(out).state,'shown');assert.equal(cpu(out).value,'12');assert.equal(cpu(out).comparisonIncomplete,false);
 }
});
test('different exposed routes cannot establish origin-specific or per-read variation',()=>{
 const a={...all(),cores:'blocked',_alt:{cores:'12'}},b={...all(),cores:'16'};
 for(const out of [M.findability(repeat(a,b),'other'),M.findabilityCross(a,b,'other')]){
  assert.equal(cpu(out).state,'shown');assert.equal(cpu(out).comparisonIncomplete,true);assert.equal(out.score,0);
 }
});
test('a failed legacy adapter read supersedes an earlier denial when no identity was recovered',()=>{
 assert.equal(M.paWebgpuVectors([['adapter info','blocked:SecurityError'],['adapter info','ERR:TypeError'],['adapter vendor','(empty)']]).adapter,'ERR:TypeError');
});
test('equal exposure on main and alternate routes retains cross-site bypass provenance in both orders',()=>{
 const a={...all(),cores:'blocked',_alt:{cores:'12'}},b={...all(),cores:'12'};
 for(const [x,y] of [[a,b],[b,a]])assert.equal(cpu(M.findabilityCross(x,y,'other')).bypass,'frame');
});
test('route recovery with equal values can still establish stable origin-specific variation',()=>{
 const a=repeat({...all(),cores:'blocked',_alt:{cores:'12'}},{...all(),cores:'12'});
 const b=repeat({...all(),cores:'blocked',_alt:{cores:'16'}},{...all(),cores:'16'});
 for(const [x,y] of [[a,b],[b,a]]){const out=M.findabilityCross(x,y,'other');assert.equal(cpu(out).variationKind,'between-origins');assert.equal(out.complete,true);}
});
