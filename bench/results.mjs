// Publish only aggregate measurements; raw browser exports stay local.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const root=new URL('../',import.meta.url);
const version=JSON.parse(fs.readFileSync(new URL('package.json',root))).version;
const names={tor:'Tor Browser',mullvad:'Mullvad Browser',librewolf:'LibreWolf',brave:'Brave',firefox:'Firefox',vivaldi:'Vivaldi',chrome:'Chrome',edge:'Edge'};
const settings=['default','store','rtc','both'];
const directory=process.argv[2];
assert.ok(directory,'Provide a directory containing fresh browser-setting captures and versions.json');
const versions=JSON.parse(fs.readFileSync(path.join(directory,'versions.json')));
const sha256=createHash('sha256').update(fs.readFileSync(new URL('index.html',root))).digest('hex');
const rows=[];
const dates=[];
for(const [browser,name] of Object.entries(names)){
  assert.ok(typeof versions[browser]==='string'&&versions[browser],`Missing release version: ${browser}`);
  const measurements={};
  for(const setting of settings){
    const capture=JSON.parse(fs.readFileSync(path.join(directory,`${browser}-${setting}.json`)));
    assert.equal(capture.length,1);
    const row=capture[0];
    assert.equal(row.browser,browser);assert.equal(row.version,version);
    assert.equal(row.url,'https://privacyassay.com/');assert.equal(row.headless,true);
    assert.match(row.os,/^Windows_NT 10\.0\./);assert.equal(row.blockThirdPartyCookies,false);
    assert.equal(row.profile,'fresh automation profile; bundled extensions unchanged');
    assert.equal(row.source,null);assert.equal(row.runs,2);
    assert.equal(row.deployedSourceSha256,sha256);
    assert.deepEqual(row.optins,{storage:setting==='store'||setting==='both',webrtc:setting==='rtc'||setting==='both'});
    const complete=row.errors.length===0&&row.samples.length===2&&row.scores.length===2&&row.cross.length===2;
    for(const score of [...row.scores,...row.cross])assert.ok(Number.isInteger(score)&&score>=0&&score<=100);
    for(const sample of row.samples){
      dates.push(sample.capturedAt);
      assert.equal(sample.version,version);assert.equal(sample.page,row.url);
      if(complete){assert.equal(sample.complete,true);assert.equal(sample.crossComplete,true);}
    }
    if(complete){assert.deepEqual(row.scores,row.samples.map(s=>s.score));assert.deepEqual(row.cross,row.samples.map(s=>s.cross));}
    measurements[setting]={complete,attempts:row.runs,completed:row.samples.filter(s=>s.complete&&s.crossComplete).length,
      errors:row.errors.length,single:complete?row.scores:[],cross:complete?row.cross:[]};
  }
  rows.push({browser,name,version:versions[browser],...(versions.engines?.[browser]?{engineVersion:versions.engines[browser]}:{}),measurements});
}
assert.ok(dates.length,'No completed browser measurements');
const data={methodology:version,sha256,platform:'Windows 11',headless:true,runsPerSetting:2,
  capturedFrom:dates.sort()[0],capturedTo:dates.at(-1),rows};
fs.writeFileSync(new URL(`bench/results-${version}.json`,root),JSON.stringify(data,null,2)+'\n');

const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const range=a=>Math.min(...a)===Math.max(...a)?String(a[0]):`${Math.min(...a)}–${Math.max(...a)}`;
const shown=rows.map(row=>({...row,baseline:row.measurements.default.cross,
  all:settings.every(setting=>row.measurements[setting].complete)
    ?settings.flatMap(setting=>row.measurements[setting].cross):[]}))
  .sort((a,b)=>(b.baseline.length?mean(b.baseline):-1)-(a.baseline.length?mean(a.baseline):-1));
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
for(const dark of [false,true]){
  const fg=dark?'#ecf2fa':'#101112',muted=dark?'#a5b5c9':'#57687f',grid=dark?'#263449':'#e6ebf2',blue=dark?'#74a9ff':'#2563eb';
  const height=shown.length*37+81,bottom=shown.length*37+39,x=v=>132+v*5.6;
  const svg=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 756 ${height}" width="756" height="${height}" role="img" aria-label="Privacyassay ${version} headless browser measurements; higher means more checked readings hidden">`,
    '<style>text{font-family:ui-sans-serif,system-ui,"Segoe UI",sans-serif}.n{font-family:ui-monospace,Menlo,Consolas,monospace}</style>'];
  for(let v=0;v<=100;v+=20)svg.push(`<line x1="${x(v)}" y1="33" x2="${x(v)}" y2="${bottom}" stroke="${grid}"/><text x="${x(v)}" y="25" fill="${muted}" font-size="12" text-anchor="middle" class="n">${v}</text>`);
  shown.forEach((row,i)=>{
    const y=56+i*37;
    svg.push(`<text x="118" y="${y+4.5}" fill="${fg}" font-size="14" text-anchor="end">${escape(row.name)}</text>`);
    if(!row.baseline.length){svg.push(`<text x="144" y="${y+4.5}" fill="${muted}" font-size="13">Incomplete</text>`);return;}
    const value=mean(row.baseline),low=row.all.length?Math.min(...row.all):value,high=row.all.length?Math.max(...row.all):value;
    if(value>0)svg.push(`<rect x="132" y="${y-10}" width="${value*5.6}" height="20" rx="3" fill="${blue}"/>`);
    if(high>low)svg.push(`<path d="M${x(low)},${y-5}v10 M${x(low)},${y}H${x(high)} M${x(high)},${y-5}v10" stroke="${blue}" stroke-width="1.6" fill="none"/>`);
    svg.push(`<text x="${x(high)+12}" y="${y+4.5}" fill="${muted}" font-size="13" class="n">${row.all.length?range(row.all):`${range(row.baseline)}; range incomplete`}</text>`);
  });
  svg.push(`<text x="132" y="${height-15}" fill="${muted}" font-size="11">v${version} · Bar: two-run mean, opt-ins off. Whisker: all four settings, only when complete. Headless.</text></svg>`);
  fs.writeFileSync(new URL(`chart-${dark?'dark':'light'}.svg`,root),svg.join('\n')+'\n');
}
console.log(shown.map(row=>`| ${row.name} | ${row.version} | ${row.baseline.length?range(row.baseline):'—'} | ${row.all.length?range(row.all):'—'} | ${row.measurements.default.single.length?range(row.measurements.default.single):'—'} |`).join('\n'));
