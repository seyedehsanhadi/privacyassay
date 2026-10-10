// Real HTTPS site boundaries, all served on loopback. The certificate is test-only;
// trust bypass applies only to this disposable headless profile.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import {launch, runAudit} from '../helpers/browser.mjs';

const source=fs.readFileSync(process.env.PRIVACYASSAY_TEST_ROOT?path.join(process.env.PRIVACYASSAY_TEST_ROOT,'index.html'):new URL('../../index.html',import.meta.url),'utf8');
const tls={key:fs.readFileSync(new URL('../fixtures/sites-test.key',import.meta.url)),cert:fs.readFileSync(new URL('../fixtures/sites-test.crt',import.meta.url))};

async function sites(mode){
  let html;
  const ipSites=process.env.PRIVACYASSAY_SITE_IPS==='1';
  const requests=[];
  const sockets=new Set();
  const track=socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));};
  const handler=(req,res)=>{
    requests.push({host:req.headers.host,url:req.url});
    if(req.url.split('?')[0]==='/__headers'){
      res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(req.headers));return;
    }
    if(req.url.split('?')[0]==='/index.html'||req.url.split('?')[0]==='/'){
      res.writeHead(200,{'Content-Type':'text/html'});res.end(html);return;
    }
    res.writeHead(404);res.end();
  };
  const server=https.createServer(tls,handler);
  server.on('connection',track);
  await new Promise(resolve=>server.listen(0,ipSites?'127.0.0.2':'127.0.0.1',resolve));
  const port=server.address().port;
  let peer;
  if(ipSites){peer=https.createServer(tls,handler);peer.on('connection',track);await new Promise((resolve,reject)=>{peer.once('error',reject);peer.listen(port,'127.0.0.3',resolve)});}
  // Distinct IP sites let Tor keep DNS disabled and use the configured companion route.
  const a='https://'+(ipSites?'127.0.0.2':'site-a.test')+':'+port,b='https://'+(ipSites?'127.0.0.3':'site-b.test')+':'+port;
  html=source.replaceAll('https://privacyassay.com',a).replaceAll('https://privacyassay.github.io',b);
  if(mode!=='native'){
    // Controlled data at the API boundary; the collector, frame, popup handshake,
    // repeated reads and scorer still execute normally on both genuine sites.
    const control=`(function(){var core=${mode==='per-site'?'location.origin==='+JSON.stringify(a)+'?12:16':'12'};
      function install(w){Object.defineProperty(w.Navigator.prototype,'hardwareConcurrency',{configurable:true,get:function(){return ${mode==='per-read'?'core++':'core'}}});}
      install(window);var append=Node.prototype.appendChild;Node.prototype.appendChild=function(el){var v=append.call(this,el);if(el.tagName==='IFRAME'){try{if(el.contentWindow.location.origin===location.origin||el.contentWindow.location.href==='about:blank')install(el.contentWindow)}catch(e){}}return v;};})();`;
    html=html.replace('var PA_COMPANION=',control+'\nvar PA_COMPANION=');
  }
  return {a,b,requests,close:()=>{for(const socket of sockets)socket.destroy();return Promise.all([server,peer].filter(Boolean).map(s=>new Promise(resolve=>s.close(resolve))));}};
}

for(const mode of ['native','same-value','per-site','per-read'])test('two HTTPS sites: '+mode,async t=>{
  const server=await sites(mode);
  let page;
  try{
  page=await launch({url:server.a+'/index.html',extraArgs:[
    '--ignore-certificate-errors','--no-proxy-server',
    '--host-resolver-rules=MAP site-a.test 127.0.0.1, MAP site-b.test 127.0.0.1, MAP stun.l.google.com ~NOTFOUND'
  ]});
    assert.equal(await page.ev('location.origin'),server.a);
    assert.equal(await page.ev('isSecureContext'),true);
    const kit=await runAudit(page);
    if(!await page.ev('!!window.__paObsB'))t.diagnostic(JSON.stringify({crossFailed:kit.crossFailed,requests:server.requests}));
    assert.equal(await page.ev('window.__paObsB&&window.__paObsB._repeatCount'),2,'the companion must repeat its reads');
    assert.ok(kit.findabilityCross,kit.crossFailed||'companion did not answer');
    assert.ok(server.requests.some(r=>r.host===new URL(server.b).host&&/index.html/.test(r.url)),'second site was actually loaded');
    const row=kit.findabilityCross.rows.find(r=>r.label==='CPU cores');
    if(mode!=='native')assert.equal(kit.findabilityCross.comparedAcrossOrigins.includes('CPU cores'),mode!=='per-read');
    if(mode==='native'){
      const a=kit.findability.observed,b=await page.ev('window.__paObsB');
      assert.equal(a._repeatCount,2);assert.equal(b._repeatCount,2);
      const value=o=>String(o._alt&&o._alt.cores||o.cores);
      if(row.variationKind==='between-origins'){
        assert.notEqual(value(a),value(b));assert.ok(!a._noisy.cores&&!b._noisy.cores&&!a._altNoisy.cores&&!b._altNoisy.cores);
        assert.ok(kit.findabilityCross.changedAcrossOrigins.includes('CPU cores'));
      }else if(row.variationKind==='per-read'){
        assert.ok(a._noisy.cores||b._noisy.cores||a._altNoisy.cores||b._altNoisy.cores);
        assert.ok(!kit.findabilityCross.changedAcrossOrigins.includes('CPU cores'));
      }else if(row.variationKind==='assumed-uniform'){
        assert.equal(row.state,'blended');assert.equal(row.mask,'uniform');assert.equal(row.basis,'assumed-uniform');assert.equal(value(a),value(b));
      }else{assert.equal(row.state,'shown');assert.equal(value(a),value(b));}
      t.diagnostic(JSON.stringify({cpuA:value(a),cpuB:value(b),state:row.state,variationKind:row.variationKind,score:kit.findability.score,crossScore:kit.findabilityCross.score}));
    }else if(mode==='per-site'){
      assert.equal(row.state,'blended');assert.equal(row.variationKind,'between-origins');assert.ok(kit.findabilityCross.changedAcrossOrigins.includes('CPU cores'));
    }else if(mode==='per-read'){
      assert.equal(row.state,'blended');assert.equal(row.variationKind,'per-read');assert.ok(!kit.findabilityCross.changedAcrossOrigins.includes('CPU cores'));
    }else{
      assert.equal(row.state,'shown');assert.ok(!kit.findabilityCross.changedAcrossOrigins.includes('CPU cores'));
    }
  }finally{if(page)await page.close();await server.close();}
});
