import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const cli=process.env.PRIVACYASSAY_TEST_ROOT?path.join(process.env.PRIVACYASSAY_TEST_ROOT,'bin/privacyassay.mjs'):fileURLToPath(new URL('../../bin/privacyassay.mjs',import.meta.url));
const run=(args,entry=cli)=>new Promise((resolve,reject)=>{
  const started=Date.now(),child=spawn(process.execPath,[entry,...args],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);
  child.on('error',reject);child.on('exit',code=>resolve({code,out,err,elapsed:Date.now()-started}));
});

test('CLI rejects invalid arguments and missing browser before reporting a score',async()=>{
  for(const args of [['--min-score='],['--runs=1.9'],['--browser='],['--browser='+fileURLToPath(new URL('../../index.html',import.meta.url))],['--browser=missing-privacyassay-browser.exe'],['--browser='+fileURLToPath(new URL('../../',import.meta.url))]]){
    const r=await run(args);assert.equal(r.code,2,r.err);assert.equal(r.out,'');
  }
});
test('CLI total timeout includes browser startup and produces no partial score',async()=>{
  const r=await run(['--quiet','--no-cross','--timeout=1']);
  assert.equal(r.code,2,r.err);assert.equal(r.out,'');assert.match(r.err,/timeout/);assert.ok(r.elapsed<10000,'startup exceeded the test wall-clock bound');
});
test('CLI full report preserves the measured second-site result',async()=>{
  const r=await run(['--quiet','--full']);assert.equal(r.code,0,r.err);
  const o=JSON.parse(r.out);assert.ok(o.findabilityCross);assert.ok(o.crossSite);
  assert.equal(o.crossSite.score,o.findabilityCross.score);assert.equal(o.crossSite.complete,o.findabilityCross.complete);
  assert.equal(o.version,o.findability.version);assert.equal(o.crossSiteNote,null);
});

test('CLI waits for delayed audit controls after navigation',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pa-cli-ready-'));
  try{
    fs.mkdirSync(path.join(root,'bin'));
    const entry=path.join(root,'bin/privacyassay.mjs');fs.copyFileSync(cli,entry);
    // A readiness fixture, not a fingerprint measurement: the control appears after load.
    fs.writeFileSync(path.join(root,'index.html'),`<!doctype html><script>
      window.__KIT={version:'readiness-fixture',findability:{score:77,grade:'I',complete:false}};
      setTimeout(()=>{const button=document.createElement('button');button.id='runBtn';
        button.onclick=()=>{window.__KIT_DONE=true};document.body.append(button)},6000);
    </script><body></body>`);
    const result=await run(['--quiet','--no-cross','--timeout=30000'],entry);
    assert.equal(result.code,0,result.err);const report=JSON.parse(result.out);
    assert.equal(report.version,'readiness-fixture');assert.equal(report.score,77);
    assert.ok(result.elapsed>=6000,'the CLI did not wait for its control');
  }finally{
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));
    fs.rmSync(root,{recursive:true,force:true});
  }
});
