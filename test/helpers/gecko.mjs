// The installed Gecko browser and its bundled privacy extensions stay intact.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function value(remote) {
  if(remote.type==='undefined')return undefined;
  if(remote.type==='null')return null;
  if(remote.type==='object'||remote.type==='map')return Object.fromEntries((remote.value||[]).map(([k,v])=>[typeof k==='string'?k:value(k),value(v)]));
  if(remote.type==='array'||remote.type==='set')return (remote.value||[]).map(value);
  if(remote.type==='number')return Number(remote.value);
  return remote.value;
}

export async function launchGecko({port, url, preload}={}) {
  const binary=process.env.PRIVACYASSAY_BROWSER;
  if(!binary||!fs.existsSync(binary))throw new Error('Set PRIVACYASSAY_BROWSER to an installed Gecko browser.');
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'pa-test-gecko-'));
  fs.writeFileSync(path.join(profile,'user.js'),[
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("browser.aboutwelcome.enabled", false);',
    'user_pref("datareporting.policy.firstRunURL", "");',
    'user_pref("browser.startup.homepage_override.mstone", "ignore");',
    'user_pref("torbrowser.settings.quickstart.enabled", true);',
    'user_pref("browser.security_level.security_slider", 4);',
    // Only fixture hosts bypass the Tor proxy; no global networking changes.
    'user_pref("network.dns.localDomains", "site-a.test,site-b.test,stun.l.google.com");',
    'user_pref("network.proxy.no_proxies_on", "127.0.0.1,127.0.0.2,127.0.0.3,localhost,site-a.test,site-b.test,stun.l.google.com");',
  ].join('\n'));
  const proc=spawn(binary,['-headless','-no-remote','-profile',profile,'--remote-debugging-port=0','about:blank'],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  let output='', socket, next=0;
  const pending=new Map();
  proc.stdout.on('data',d=>{output=(output+d).slice(-4000)});
  proc.stderr.on('data',d=>{output=(output+d).slice(-4000)});
  proc.on('error',e=>{output+=e.message});
  const close=async()=>{
    for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('browser closed'));}pending.clear();
    if(socket&&socket.readyState===WebSocket.OPEN)await new Promise(resolve=>{
      const timer=setTimeout(resolve,1000);
      socket.addEventListener('close',()=>{clearTimeout(timer);resolve()},{once:true});
      try{socket.close()}catch{clearTimeout(timer);resolve()}
    });
    if(process.platform==='win32'){
      const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
      spawnSync('powershell',['-NoProfile','-Command',`Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq ${quote(path.basename(binary))} -and $_.CommandLine -and $_.CommandLine.Contains(${quote(profile)}) } | ForEach-Object { & taskkill /F /PID $_.ProcessId /T | Out-Null }`],{stdio:'ignore',timeout:20000,windowsHide:true});
    }
    try{proc.kill()}catch{}
    // Browser helper processes can inherit these pipes after the owned browser has exited.
    proc.stdout.destroy();proc.stderr.destroy();proc.unref();
    for(let i=0;i<10;i++){try{fs.rmSync(profile,{recursive:true,force:true});break}catch{}await sleep(200)}
  };
  try {
    let endpoint;
    for(const deadline=Date.now()+60000;Date.now()<deadline;){
      endpoint=output.match(/ws:\/\/[^\s"]+/)?.[0];
      if(endpoint)break;
      if(proc.exitCode!==null)throw new Error('Gecko exited before BiDi: '+output);
      await sleep(200);
    }
    if(!endpoint)throw new Error('No Gecko BiDi endpoint: '+output);
    socket=new WebSocket(endpoint.replace(/\/$/,'').replace(/\/session$/,'')+'/session');
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('BiDi connection timed out')),10000);
      socket.onopen=()=>{clearTimeout(timer);resolve()};
      socket.onerror=()=>{clearTimeout(timer);reject(new Error('BiDi connection failed'))};
    });
    socket.onmessage=e=>{
      const m=JSON.parse(e.data),p=pending.get(m.id);if(!p)return;
      pending.delete(m.id);clearTimeout(p.timer);
      m.error?p.reject(new Error(m.error+': '+m.message)):p.resolve(m.result);
    };
    const send=(method,params={})=>new Promise((resolve,reject)=>{
      const id=++next;
      const timer=setTimeout(()=>{pending.delete(id);reject(new Error(method+' timed out'))},60000);
      pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
    });
    // Trust applies only to this disposable session and its self-signed HTTPS fixtures.
    const session=await send('session.new',{capabilities:{alwaysMatch:{acceptInsecureCerts:true}}});
    const context=(await send('browsingContext.getTree')).contexts[0].context;
    if(preload)await send('script.addPreloadScript',{functionDeclaration:'()=>{'+preload+'}'});
    const ev=async expression=>{
      const r=await send('script.evaluate',{expression,target:{context},awaitPromise:true,resultOwnership:'none',userActivation:true});
      if(r.type==='exception')throw new Error('page error: '+r.exceptionDetails?.text);
      return value(r.result);
    };
    await send('browsingContext.navigate',{context,url:url||`http://127.0.0.1:${port}/index.html`,wait:'complete'});
    if(!await ev('!!document.getElementById("runBtn")'))throw new Error('Audit page unavailable: '+await ev('location.href'));
    const clickRun=async()=>{
      const p=await ev('(()=>{const r=document.getElementById("runBtn").getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()');
      await send('input.performActions',{context,actions:[{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',origin:'viewport',x:p.x,y:p.y,duration:0},{type:'pointerDown',button:0},{type:'pointerUp',button:0}]}]});
    };
    return {ev,send,close,clickRun,capabilities:session.capabilities};
  }catch(e){await close();throw e;}
}
