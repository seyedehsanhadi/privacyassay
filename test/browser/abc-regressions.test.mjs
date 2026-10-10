import {describe, test, before, after, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {matchBrace} from '../helpers/extract.mjs';
import {startServer} from '../helpers/server.mjs';
import {launch, runAudit} from '../helpers/browser.mjs';

const src=fs.readFileSync(path.join(process.env.PRIVACYASSAY_TEST_ROOT||path.resolve('.'),'index.html'),'utf8');
const fn=name=>{const p=src.indexOf('function '+name+'('),b=src.indexOf('{',src.indexOf(')',p));return src.slice(p,matchBrace(src,b)+1);};
const capture=`window.__saved=[];const create=URL.createObjectURL;URL.createObjectURL=function(b){if(b.type==='application/json')b.text().then(t=>__saved.push(t));return create.call(URL,b)};const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(!this.download)return click.call(this)};`;
const waitSaved=`for(let i=0;i<100&&!__saved.length;i++)await new Promise(r=>setTimeout(r,20));if(!__saved.length)throw new Error('Save produced no JSON blob');`;

describe('A/B browser regressions',()=>{
  let server,page,baseline;
  before(async()=>{server=await startServer();page=await launch({port:server.port,preload:capture});baseline=await runAudit(page);});
  after(async()=>{if(page)await page.close();if(server)server.close();});
  beforeEach(async()=>{await page.ev(`window.__KIT=${JSON.stringify(baseline)};document.querySelector('[data-pa="calc"]').click();if(document.querySelector('[data-pa="redact"]').getAttribute('aria-checked')==='false')document.querySelector('[data-pa="redact"]').click();true`);});

  test('a changing font lookup stays exposed and incomplete in an actual audit',async()=>{
    await page.ev(`(()=>{const width=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'offsetWidth'),height=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'offsetHeight'),append=document.body.appendChild;let round=0;window.__restoreFonts=()=>{Object.defineProperty(HTMLElement.prototype,'offsetWidth',width);Object.defineProperty(HTMLElement.prototype,'offsetHeight',height);document.body.appendChild=append};document.body.appendChild=function(node){if(node.tagName==='SPAN'&&node.textContent.startsWith('mmMwWLl0O'))node.__fontRound=++round;return append.call(this,node)};Object.defineProperty(HTMLElement.prototype,'offsetWidth',{...width,get:function(){if(!this.__fontRound)return width.get.call(this);const family=this.style.fontFamily;if(family.includes('Arial Black'))return this.__fontRound===1?120:100;if(/^['"]?Arial['"]?,/.test(family))return 120;return 100}});Object.defineProperty(HTMLElement.prototype,'offsetHeight',{...height,get:function(){return this.__fontRound?20:height.get.call(this)}});return true})()`);
    try{
      const report=await runAudit(page),fonts=report.findability.rows.find(r=>r.label==='installed fonts');
      assert.equal(fonts.state,'shown');assert.equal(fonts.comparisonIncomplete,true);
      assert.equal(report.findability.complete,false);assert.equal(report.findability.grade,'I');
      if(report.findabilityCross){assert.equal(report.findabilityCross.complete,false);assert.equal(report.findabilityCross.rows.find(r=>r.label==='installed fonts').state,'shown');}
    }finally{await page.ev('window.__restoreFonts();true');}
  });

  test('redacted saved JSON masks numeric readings and extension identity',async()=>{
    const out=await page.ev(`(async()=>{const k=window.__KIT;k.whoYouAre=[{what:'PrivateExtensionSentinel',kind:'addon'}];k.findability.browser='PrivateFamilySentinel';k.findability.familyKey='PrivateFamilySentinel';k.categories['Browser Identification'].rows=[['PrivateExtensionSentinel',['yes','ok']]];k.categories['Audio & Media Codecs'].rows=[['AudioContext sampleRate','98765']];window.__saved=[];document.querySelector('[data-pa="savefull"]').click();${waitSaved}return JSON.parse(__saved[0])})()`);
    assert.equal(out.summary.redacted,true);assert.equal(out.summary.score,baseline.findability.score);
    assert.ok(!JSON.stringify(out).includes('PrivateExtensionSentinel'));assert.ok(!JSON.stringify(out).includes('PrivateFamilySentinel'));
    assert.equal(out.categories['Audio & Media Codecs'].rows[0][1],'[redacted]');
    const labels=await page.ev(`(async()=>{window.__KIT.categories.WebGPU.rows=[['features (987654)','hash'],['wgslLanguageFeatures (987653)','hash'],['GPUAdapter.limits (987652)','hash'],['features (unreadable)','ERR:TypeError']];window.__saved=[];document.querySelector('[data-pa="savefull"]').click();${waitSaved}return JSON.parse(__saved[0]).categories.WebGPU.rows.map(r=>r[0])})()`);
    assert.deepEqual(labels,['features ([redacted])','wgslLanguageFeatures ([redacted])','GPUAdapter.limits ([redacted])','features (unreadable)']);
  });
  for(const action of ['calc','row','redact','acc'])test('keyboard focus survives '+action+' redraw',async()=>{
    const out=await page.ev(`(()=>{const b=document.querySelector('[data-pa="${action}"]');b.focus();b.click();const a=document.activeElement;return {action:a.getAttribute('data-pa'),id:a.getAttribute('data-id'),beforeId:b.getAttribute('data-id')}})()`);
    assert.equal(out.action,action);assert.equal(out.id,out.beforeId);
  });
  test('redraw keeps the original scan time',async()=>{
    const out=await page.ev(`(()=>{const before=document.getElementById('scanAt').textContent,D=Date;window.Date=class extends D{constructor(...args){super(...(args.length?args:[D.now()+7200000]))}};try{document.querySelector('[data-pa="calc"]').click();return {before,after:document.getElementById('scanAt').textContent}}finally{window.Date=D}})()`);
    assert.equal(out.after,out.before);
  });
  test('incomplete GPU category remains visible as known exposure',async()=>{
    const out=await page.ev(`(()=>{const f=window.__KIT.findability;f.rows=[{group:'gpu',label:'canvas drawing',tier:3,state:'shown',value:'fixture'},{group:'gpu',label:'GPU name',tier:2,state:'unknown',value:'ERR'}];document.querySelector('[data-pa="calc"]').click();return {shown:document.querySelector('[data-pa="tile"][data-filter="shown"]').textContent,strong:document.querySelector('[data-pa="tile"][data-filter="strong"]').textContent,unknown:document.querySelector('[data-pa="tile"][data-filter="unknown"]').textContent}})()`);
    assert.match(out.shown,/1$/);assert.match(out.strong,/1$/);assert.match(out.unknown,/1$/);
  });
  test('an incomplete comparison does not print an empty unmeasured list',async()=>{
    const out=await page.ev(`(()=>{const f=window.__KIT.findability;f.complete=false;f.checks.unknown=0;f.checks.incomplete=1;f.rows[0].comparisonIncomplete=true;document.querySelector('[data-pa="calc"]').click();return document.getElementById('summary').textContent})()`);
    assert.match(out,/Incomplete comparisons:/);assert.doesNotMatch(out,/Not measured:\s*\./);
  });
  test('redacted expanded explanation does not reveal raw bypass values',async()=>{
    const out=await page.ev(`(()=>{window.__KIT.findability.rows=[{group:'hardware',label:'CPU cores',tier:1,state:'shown',value:'8',why:'Hidden on the main read (987654321)VISIBLE), but the frame recovered a value.',bypass:'frame'}];document.querySelector('[data-pa="calc"]').click();document.querySelector('[data-pa="row"][data-id="hardware"]').click();return document.getElementById('summary').textContent})()`);
    assert.ok(!out.includes('987654321'));assert.ok(!out.includes('VISIBLE'));
  });
  for(const point of ['context','readPixels'])test('WebGL '+point+' retains denial versus failure cause',async()=>{
    const code=['fnv','fnvDead','fnvParts','fnvBytes','probe','paErr','present','j','glDone','canvas2dHash','collectGPU'].map(fn).join('\n');
    for(const name of ['SecurityError','TypeError']){
      const out=await page.ev(`(()=>{var cat=(name,rows)=>({name,rows});${code};const holder=${point==='context'?'HTMLCanvasElement':'WebGLRenderingContext'}.prototype,key='${point==='context'?'getContext':'readPixels'}',old=holder[key];holder[key]=function(...args){${point==='context'?'if(!/webgl/.test(args[0]))return old.apply(this,args);':''}throw new DOMException('fixture','${name}')};try{return collectGPU().rows}finally{holder[key]=old}})()`);
      const row=out.find(r=>r[0]===(point==='context'?'WebGL':'WebGL render hash'));
      assert.equal(row?.[1],name==='SecurityError'?'blocked:SecurityError':'ERR:TypeError');
    }
  });
});
