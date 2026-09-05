import fs from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {grabFn} from './helpers/extract.mjs';

test('canvas stability and variability report observations without claiming protection',()=>{
  for(const changing of [false,true]){
    let read=0;
    const document={createElement:()=>({getContext:()=>({fillRect(){},fillText(){},getImageData(){return {data:new Uint8Array([changing?++read:7,0,0,255])}}})})};
    const collect=new Function('document','window','present','cat',grabFn('collectLeaks2026')+';return collectLeaks2026;')(document,{},v=>v!=null,(name,rows)=>rows);
    const [value,status]=collect()[0][1];
    assert.equal(status,'mid');
    assert.match(value, changing ? /resistance to averaging not tested/ : /protection and cross-session linkability not determined/);
  }
});

test('entry page declares encoding early and explains its coverage without running JavaScript',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.ok(Buffer.byteLength(html.slice(0,html.indexOf('<meta charset="utf-8">')+22))<1024);
  assert.match(html,/<h2>Browser privacy test coverage<\/h2>/);
  assert.match(html,/Unknown or failed readings receive no protection credit/);
  assert.match(html,/AI API availability does not reveal whether Firefox AI features/);
});

test('public methodology is linked, self-canonical, discoverable and included in the package',()=>{
  const read = path => fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.match(read('index.html'),/href="methodology.html"/);
  assert.match(read('methodology.html'),/<link rel="canonical" href="https:\/\/privacyassay.com\/methodology.html">/);
  assert.match(read('sitemap.xml'),/<loc>https:\/\/privacyassay.com\/methodology.html<\/loc>/);
  assert.ok(JSON.parse(read('package.json')).files.includes('methodology.html'));
  assert.match(read('.github/workflows/sync-companion.yml'),/cp index.html methodology.html METHODOLOGY.md companion\//);
});
