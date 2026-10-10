import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safariScript,safariPreload} from './helpers/safari.mjs';
import {startServer} from './helpers/server.mjs';

async function execute(expression){return new Promise(resolve=>new Function(safariScript(expression))(resolve));}
test('Safari script adapter preserves values, awaits promises and exposes runtime failures',async()=>{
  assert.deepEqual(await execute('Promise.resolve({value:42})'),{ok:true,value:{value:42}});
  assert.deepEqual(await execute('const fixture=42;'),{ok:true,value:null});
  assert.deepEqual(await execute('(()=>{throw new Error("fixture")})()'),{ok:false,error:'Error: fixture'});
  assert.throws(()=>safariScript('const ='),SyntaxError);
});
test('Safari preload precedes the actual page script and preserves companion header requests',async()=>{
  const srv=await startServer();let proxy;
  try{
    proxy=await safariPreload(srv.port,'window.__fixture=42;');
    const html=await(await fetch(`http://127.0.0.1:${proxy.port}/index.html`)).text();
    assert.match(html,/<script>window\.__fixture=42;<\/script><script>/);
    assert.ok(html.includes('function paRepeatMerge('));
    const headers=await(await fetch(`http://localhost:${proxy.port}/__headers`)).json();
    assert.equal(headers.host,'localhost:'+proxy.port);
  }finally{if(proxy)await proxy.close();srv.close();}
});
