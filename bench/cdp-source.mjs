// Serve a candidate HTML response at the real test origins inside this disposable
// browser only. This preserves HTTPS/site partition keys without publishing a build.
export async function overrideSource(base, source, urls) {
  const version=await(await fetch(base+'/json/version')).json();
  const ws=new WebSocket(version.webSocketDebuggerUrl), pending=new Map(), setup=[];
  const stats={documents:0,errors:[]};let id=0;
  await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('source override connection timed out')),10000);ws.onopen=()=>{clearTimeout(t);res();};ws.onerror=()=>{clearTimeout(t);rej(new Error('source override connection failed'));};});
  const cmd=(method,params={},sessionId)=>new Promise((res,rej)=>{
    const n=++id,timer=setTimeout(()=>{pending.delete(n);rej(new Error(method+' timed out'));},15000);
    pending.set(n,{res,rej,timer});ws.send(JSON.stringify({id:n,method,params,sessionId}));
  });
  const attach={autoAttach:true,waitForDebuggerOnStart:true,flatten:true};
  ws.onmessage=async event=>{
    const m=JSON.parse(event.data),p=pending.get(m.id);
    if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.rej(new Error(m.error.message)):p.res(m.result);return;}
    try{
      if(m.method==='Target.attachedToTarget'){
        const session=m.params.sessionId;
        const job=(async()=>{
          try{
            if(['page','iframe'].includes(m.params.targetInfo.type)){
              await cmd('Fetch.enable',{patterns:[{resourceType:'Document',requestStage:'Response'}]},session);
              await cmd('Target.setAutoAttach',attach,session);
            }
          }finally{await cmd('Runtime.runIfWaitingForDebugger',{},session);}
        })();setup.push(job);await job;
      }else if(m.method==='Fetch.requestPaused'){
        const p=m.params,u=new URL(p.request.url);
        const match=urls.some(url=>u.origin===url.origin&&(u.pathname===url.pathname||u.pathname==='/'&&url.pathname==='/index.html'));
        if(match&&p.responseStatusCode===200){
          const headers=(p.responseHeaders||[]).filter(h=>!/^(content-length|content-encoding|etag)$/i.test(h.name));
          await cmd('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:200,responseHeaders:headers,body:source.toString('base64')},m.sessionId);stats.documents++;
        }else await cmd('Fetch.continueRequest',{requestId:p.requestId},m.sessionId);
      }
    }catch(e){stats.errors.push(e.message);}
  };
  await cmd('Target.setAutoAttach',attach);await Promise.all(setup);
  return {stats,close(){ws.close();for(const p of pending.values()){clearTimeout(p.timer);p.rej(new Error('source override closed'));}pending.clear();}};
}
