import fs from 'node:fs';
import assert from 'node:assert/strict';
import {grabVar} from '../test/helpers/extract.mjs';
const {surfaces}=new Function(grabVar('PRIORS')+';return PRIORS;')();
const catalog=new Map(surfaces.map(s=>[s.label,s]));
let checked=0;
for(const file of process.argv.slice(2))for(const browser of JSON.parse(fs.readFileSync(file,'utf8')))for(const sample of browser.samples||[]){
  const summary=sample.exports?.savesum,full=sample.exports?.savefull;if(!summary||!full)continue;
  assert.equal(summary.schema,'privacyassay-summary/1.1');assert.equal(full.schema,'privacyassay-full/1.1');
  const rows=full.findability.rows,unknown=rows.filter(r=>r.state==='unknown').length;
  const groups=new Map();
  for(const row of rows){const s=catalog.get(row.label);assert.ok(s,row.label);assert.ok(['shown','refused','blended','unknown'].includes(row.state));
    const g=groups.get(s.group)||{weight:0,total:0,hidden:0,unknown:0};g.weight=Math.max(g.weight,s.tier);g.total+=s.tier;
    if(['refused','blended'].includes(row.state))g.hidden+=s.tier;if(row.state==='unknown')g.unknown+=s.tier;groups.set(s.group,g);
  }
  const gs=[...groups.values()],total=gs.reduce((n,g)=>n+g.weight,0);
  const score=Math.round(100*gs.reduce((n,g)=>n+g.weight*g.hidden/g.total,0)/total);
  const upperBound=Math.round(100*gs.reduce((n,g)=>n+g.weight*(g.hidden+g.unknown)/g.total,0)/total);
  assert.equal(summary.score,score);assert.equal(summary.upperBound,upperBound);
  assert.equal(summary.coverage,Math.round(100*(rows.length-unknown)/rows.length));assert.equal(summary.counts.unknown,unknown);
  assert.equal(summary.counts.readingsTotal,rows.length);assert.equal(summary.complete,unknown===0&&rows.length>0);
  assert.equal(summary.grade,summary.complete?(score>=90?'A':score>=75?'B':score>=60?'C':score>=40?'D':'F'):'I');
  for(const k of ['score','grade','complete','coverage','upperBound']){assert.equal(full.summary[k],summary[k]);assert.equal(full.findability[k],summary[k]);}
  if(sample.sourceOverride){assert.equal(sample.sourceOverride.errors.length,0);assert.ok(sample.sourceOverride.documents>=2);}
  checked++;
}
assert.ok(checked,'No actual JSON exports found');console.log(`Verified ${checked} actual summary/full export pairs; arithmetic, completeness, grades and consistency match.`);
