import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {grabFn,grabVar} from './helpers/extract.mjs';
const doc=fs.readFileSync(new URL('../METHODOLOGY.md',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../methodology.html',import.meta.url),'utf8');
const {PRIORS,findability}=new Function(grabVar('PRIORS')+grabFn('paTier')+grabFn('findability')+';return {PRIORS,findability}')();
test('methodology: public documents identify the current version and incomplete state',()=>{
  for(const text of [doc,html]){assert.ok(text.includes(PRIORS.version));assert.match(text,/incomplete/i);assert.match(text,/lower bound/i);assert.match(text,/not comparable/i);}
});
test('methodology: every scored reading and its weight are documented',()=>{
  for(const surface of PRIORS.surfaces)assert.ok(doc.includes(surface.label+' ('+surface.tier+')'),surface.label);
  const groups={};for(const s of PRIORS.surfaces)groups[s.group]=Math.max(groups[s.group]||0,s.tier);
  assert.equal(Object.keys(groups).length,13);assert.equal(Object.values(groups).reduce((a,b)=>a+b,0),30);
});
test('methodology: complete formula and grade bands agree with observed combinations',()=>{
  const band=n=>n>=90?'A':n>=75?'B':n>=60?'C':n>=40?'D':'F';
  for(let n=0;n<=PRIORS.surfaces.length;n++){
    const o=Object.fromEntries(PRIORS.surfaces.map((s,i)=>[s.k,i<n?'unsupported':'value-'+s.k]));
    const f=findability(o,'other');assert.equal(f.complete,true);assert.equal(f.score,Math.round(100*f.earnedWeight/f.totalWeight));assert.equal(f.grade,band(f.score));assert.equal(f.upperBound,f.score);
  }
});
test('methodology: missing measurements remain in the denominator with no credit',()=>{
  const o=Object.fromEntries(PRIORS.surfaces.filter(s=>!s.optional).map(s=>[s.k,'unsupported']));
  const full=findability(o,'other');delete o.cores;const partial=findability(o,'other');
  assert.equal(partial.totalWeight,full.totalWeight);assert.ok(partial.score<full.score);assert.equal(partial.grade,'I');assert.equal(partial.upperBound,100);assert.equal(partial.checks.unknown,1);
});
test('methodology: scope and context are explicit',()=>{
  for(const text of [doc,html])for(const re of [/top-level/i,/AI/i,/network/i,/unknown/i,/WebRTC/,/storage/i])assert.match(text,re);
  assert.match(doc,/answer within forty-five seconds/);
  assert.match(doc,/no protection credit/);
});
