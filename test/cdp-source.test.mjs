import {test} from 'node:test';
import assert from 'node:assert/strict';
import {overrideSource} from '../bench/cdp-source.mjs';

test('candidate override resumes paused targets and requires successful responses on both origins',async()=>{
  const savedFetch=globalThis.fetch,savedSocket=globalThis.WebSocket,commands=[];
  let socket,failFulfill=false;
  globalThis.fetch=async()=>({json:async()=>({webSocketDebuggerUrl:'ws://fixture.test/browser'})});
  globalThis.WebSocket=class{
    constructor(){socket=this;queueMicrotask(()=>this.onopen())}
    send(text){
      const message=JSON.parse(text);commands.push(message);
      queueMicrotask(()=>{
        if(message.method==='Target.setAutoAttach'&&!message.sessionId){
          for(const [sessionId,type,waitingForDebugger] of [['welcome','page',false],['ui','app',false],['new-page','page',true]]){
            this.onmessage({data:JSON.stringify({method:'Target.attachedToTarget',params:{sessionId,targetInfo:{type},waitingForDebugger}})});
          }
        }
        const stalled=message.method==='Runtime.runIfWaitingForDebugger'&&message.sessionId!=='new-page';
        const error=stalled?'Runtime unavailable on the first-run page':failFulfill&&message.method==='Fetch.fulfillRequest'?'Fulfillment failed':null;
        this.onmessage({data:JSON.stringify({id:message.id,...(error?{error:{message:error}}:{result:{}})})});
      });
    }
    close(){}
  };
  let override;
  try{
    const urls=[new URL('https://first.test/index.html'),new URL('https://second.test/index.html')];
    override=await overrideSource('http://fixture.test',Buffer.from('<html></html>'),urls);
    assert.deepEqual(commands.filter(c=>c.method==='Runtime.runIfWaitingForDebugger').map(c=>c.sessionId),['new-page']);
    assert.deepEqual(commands.filter(c=>c.method==='Fetch.enable').map(c=>c.sessionId).sort(),['new-page','welcome']);
    assert.deepEqual(override.stats.errors,[]);
    const paused=url=>socket.onmessage({data:JSON.stringify({method:'Fetch.requestPaused',sessionId:'new-page',params:{requestId:url,request:{url},responseStatusCode:200,responseHeaders:[]}})});
    assert.throws(()=>override.verify(),/not applied at https:\/\/first.test/);
    await paused(urls[0].href);assert.throws(()=>override.verify(),/not applied at https:\/\/second.test/);
    await paused('https://second.test/unrelated.html');assert.throws(()=>override.verify(),/not applied at https:\/\/second.test/);
    await paused(urls[1].href);override.verify();
    assert.equal(override.stats.documents,2);assert.deepEqual(override.stats.origins,{'https://first.test':1,'https://second.test':1});
    failFulfill=true;await paused(urls[1].href);
    assert.equal(override.stats.documents,2);assert.throws(()=>override.verify(),/override failed: Fulfillment failed/);
  }finally{override?.close();globalThis.fetch=savedFetch;globalThis.WebSocket=savedSocket;}
});
