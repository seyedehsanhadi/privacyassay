// Opt-in public deployment check; ordinary local tests do not contact these hosts.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {launch,runAudit} from '../helpers/browser.mjs';

const urls=['https://privacyassay.com/index.html','https://privacyassay.github.io/index.html'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const expected=hash(fs.readFileSync(new URL('../../index.html',import.meta.url)));
const version=JSON.parse(fs.readFileSync(new URL('../../package.json',import.meta.url))).version;
async function parity(){
  for(const url of urls){
    const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(10000)});
    assert.equal(response.status,200,url);assert.equal(hash(Buffer.from(await response.arrayBuffer())),expected,url);
  }
}

test('public pair: native Safari audit and actual redacted exports',{
  skip:process.env.PRIVACYASSAY_HOSTED!=='1',timeout:600000
},async t=>{
  assert.equal(process.env.PRIVACYASSAY_ENGINE,'safari');assert.equal(process.platform,'darwin');
  // A main-branch push and the static deployments can finish in either order.
  for(const deadline=Date.now()+240000;;){
    try{await parity();break;}catch(error){if(Date.now()>=deadline)throw error;}
    await new Promise(resolve=>setTimeout(resolve,3000));
  }
  for(let run=1;run<=2;run++){
    let page;
    try{
      page=await launch({url:'https://privacyassay.com/'});
      assert.equal(await page.ev('location.origin'),'https://privacyassay.com');
      assert.equal(await page.ev('isSecureContext'),true);
      assert.equal(await page.ev('document.getElementById("storageOptin").checked'),false);
      assert.equal(await page.ev('document.getElementById("webrtcOptin").checked'),false);
      assert.ok(fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8').includes('var PA_COMPANION="https://privacyassay.github.io/index.html";'));
      const report=await runAudit(page,{timeout:120000});
      assert.equal(await page.ev('window.__KIT_DONE'),true);assert.equal(report.version,version);
      assert.equal(await page.ev('window.__paObsB&&window.__paObsB._repeatCount'),2);
      assert.equal(await page.ev('window.__paStoreDiag.fromPop'),true);
      assert.ok(report.findabilityCross,report.crossFailed||'Public companion did not answer');
      assert.equal(report.findability.complete,true);assert.equal(report.findabilityCross.complete,true);
      const exports=await page.ev(`(async()=>{const saved={},blobs=[],create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;
        try{URL.createObjectURL=function(blob){blobs.push(blob);return create.call(URL,blob)};HTMLAnchorElement.prototype.click=function(){if(!this.download)return click.call(this)};
          for(const kind of ['savesum','savefull']){document.querySelector('[data-pa="'+kind+'"]').click();const blob=blobs.pop();if(!blob)throw new Error('Missing saved export');saved[kind]=JSON.parse(await blob.text())}
        }finally{URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click}return saved})()`);
      assert.equal(exports.savesum.schema,'privacyassay-summary/1.1');assert.equal(exports.savefull.schema,'privacyassay-full/1.1');
      assert.equal(exports.savesum.version,version);assert.equal(exports.savesum.browser,'[redacted]');
      assert.equal(exports.savefull.summary.redacted,true);assert.equal(exports.savefull.findability.browser,'[redacted]');
      assert.equal(exports.savefull.summary.browser,'[redacted]');assert.equal(exports.savefull.fingerprint,'[redacted]');
      assert.equal(exports.savesum.score,report.findability.score);assert.equal(exports.savesum.complete,report.findability.complete);
      assert.equal(exports.savesum.crossSite.score,report.findabilityCross.score);
      assert.equal(exports.savesum.crossSite.complete,report.findabilityCross.complete);
      t.diagnostic(JSON.stringify({run,version,sha256:expected,score:report.findability.score,cross:report.findabilityCross.score,
        complete:report.findability.complete,crossComplete:report.findabilityCross.complete}));
    }finally{if(page)await page.close();}
    await parity();
  }
});
