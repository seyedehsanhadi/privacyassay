// Native SafariDriver on macOS; Windows WebKit results cannot establish Safari compatibility.
import http from 'node:http';
import {spawn} from 'node:child_process';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export function safariScript(expression) {
  let body;
  // Compile only: do not evaluate page expressions in Node or retry a runtime failure.
  try { new Function('return ('+expression+');'); body='return ('+expression+');'; }
  catch(e) { if(!(e instanceof SyntaxError))throw e;new Function(expression);body=expression; }
  return 'const done=arguments[arguments.length-1];Promise.resolve().then(()=>{'+body+'}).then(value=>done({ok:true,value:value===undefined?null:value}),error=>done({ok:false,error:String(error)}));';
}

export async function safariPreload(port,preload) {
  // SafariDriver has no document-start hook. Inject the fixture before the first page script,
  // through a loopback proxy, while serving the original collector and companion unchanged.
  const sockets=new Set(),servers=[];
  const handler=async(req,res)=>{
    try {
      const upstream=await new Promise((resolve,reject)=>{
        const r=http.get({hostname:'127.0.0.1',port,path:req.url,headers:req.headers},response=>{
          let body='';response.setEncoding('utf8');response.on('data',d=>{body+=d});
          response.on('end',()=>resolve({body,status:response.statusCode,type:response.headers['content-type']}));response.on('error',reject);
        });r.on('error',reject);r.setTimeout(10000,()=>r.destroy(new Error('Safari fixture upstream timed out')));
      });
      let body=upstream.body;
      if(upstream.type?.includes('text/html'))body=body.replace('<script>','<script>'+preload+'</script><script>');
      res.writeHead(upstream.status,{'Content-Type':upstream.type||'text/plain'});res.end(body);
    }catch(e){res.writeHead(502);res.end(String(e));}
  };
  const add=()=>{const s=http.createServer(handler);s.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});servers.push(s);return s;};
  const server=add();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const proxyPort=server.address().port;
  const server6=add();
  await new Promise(resolve=>{server6.once('error',resolve);server6.listen(proxyPort,'::1',resolve);});
  return {port:proxyPort,close:()=>{for(const s of sockets)s.destroy();return Promise.all(servers.map(s=>new Promise(resolve=>s.close(resolve))));}};
}

export async function launchSafari({port,url,preload}={}) {
  if(process.platform!=='darwin')throw new Error('Native Safari requires a macOS host. Use the Safari CI job.');
  if(preload&&url)throw new Error('Safari preload fixtures require a loopback test server.');
  let proxy,proc,session,endpoint;
  const request=async(method,route,body)=>{
    const r=await fetch(endpoint+route,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(70000)});
    const result=await r.json();
    if(!r.ok||result.value?.error)throw new Error('SafariDriver '+route+': '+JSON.stringify(result.value));
    return result.value;
  };
  const close=async()=>{
    if(session)try{await request('DELETE','/session/'+session)}catch{}
    if(proc){try{proc.kill()}catch{}proc.stdout.destroy();proc.stderr.destroy();proc.unref();}
    if(proxy)await proxy.close();
  };
  try {
    if(preload){proxy=await safariPreload(port,preload);port=proxy.port;}
    const reserve=http.createServer();
    await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
    const driverPort=reserve.address().port;
    await new Promise(resolve=>reserve.close(resolve));
    endpoint='http://127.0.0.1:'+driverPort;
    proc=spawn('/usr/bin/safaridriver',['-p',String(driverPort)],{stdio:['ignore','pipe','pipe']});
    let output='';proc.stdout.on('data',d=>{output=(output+d).slice(-4000)});proc.stderr.on('data',d=>{output=(output+d).slice(-4000)});proc.on('error',e=>{output+=e.message});
    let ready=false;
    for(const deadline=Date.now()+30000;Date.now()<deadline;){
      if(proc.exitCode!==null)throw new Error('SafariDriver exited: '+output);
      try{const r=await fetch(endpoint+'/status',{signal:AbortSignal.timeout(1000)});if(r.ok){ready=true;break;}}catch{}
      await sleep(200);
    }
    if(!ready)throw new Error('SafariDriver unavailable: '+output);
    const created=await request('POST','/session',{capabilities:{alwaysMatch:{browserName:'safari'}}});
    session=created.sessionId;
    console.log('Native Safari: '+JSON.stringify(created.capabilities));
    const command=(route,body)=>request('POST','/session/'+session+route,body);
    await command('/timeouts',{script:60000,pageLoad:60000});
    await command('/url',{url:url||`http://127.0.0.1:${port}/index.html`});
    const ev=async expression=>{
      const r=await command('/execute/async',{script:safariScript(expression),args:[]});
      if(!r?.ok)throw new Error('page error: '+r?.error);
      return r.value;
    };
    if(!await ev('!!document.getElementById("runBtn")'))throw new Error('Audit page unavailable: '+await ev('location.href'));
    const clickRun=async()=>{
      const el=await command('/element',{using:'css selector',value:'#runBtn'});
      await command('/element/'+el['element-6066-11e4-a52e-4f735466cecf']+'/click',{});
    };
    return {ev,clickRun,close,capabilities:created.capabilities};
  }catch(e){await close();throw e;}
}
