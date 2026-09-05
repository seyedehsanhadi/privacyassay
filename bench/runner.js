// Runs inside the browser: sets the opt-ins, clicks Run, waits for the audit and the cross-site
// probe, then posts the result back to the harness.

var s=document.getElementById("s"),host=document.getElementById("host");
var RUNS=+((location.search.match(/runs=(\d+)/)||[])[1]||1);
var NAME=((location.search.match(/as=([a-z0-9_-]+)/i)||[])[1]||"unknown");
var MODE=((location.search.match(/mode=([a-z]+)/i)||[])[1]||"headful");
var WANT_RTC=/[?&]webrtc=1/.test(location.search),WANT_STORE=/[?&]store=1/.test(location.search);
var TRANSPORT="popup";
var results=[],runIndex=0,win=null,frame=null,clicked=false,posted=false,t0=0,crossWait=0;

function say(m){s.innerHTML=m;}
function ping(stage){try{new Image().src="/__ping?stage="+encodeURIComponent(stage)+"&t="+Date.now();}catch(e){}}

ping("script-start");

function openTool(){
  clicked=false;crossWait=0;t0=Date.now();
  var url="/index.html?n="+runIndex+"_"+Date.now();
  win=null;
  try{win=window.open(url,"pa_run_"+runIndex,"width=1280,height=900,left=40,top=40");}catch(e){win=null;}
  if(win){TRANSPORT="popup";ping("popup-opened");say("run "+(runIndex+1)+"/"+RUNS+" in a top-level window ...");setTimeout(tick,1500);return;}
  TRANSPORT="iframe";ping("popup-refused-using-iframe");
  say("popup refused, using a same-origin frame (RFP reports the top window for screen values)");
  host.innerHTML="";
  frame=document.createElement("iframe");
  frame.src=url;
  frame.addEventListener("load",function(){win=frame.contentWindow;setTimeout(tick,1500);});
  host.appendChild(frame);
}

function tick(){
  var el=Date.now()-t0;
  if(!win||(win.closed===true)){post("tool window closed before finishing");return;}
  try{
    var d=win.document;
    if(!clicked&&d&&d.getElementById("runBtn")){
      // The two opt-ins are off by default, so a capture that wants them has to tick the boxes
      // in the tool window before pressing Run. They add the WebRTC and storage categories to
      // the denominator, which is why an opt-in run is not comparable to a default one.
      [["webrtcOptin",WANT_RTC],["storageOptin",WANT_STORE]].forEach(function(pair){
        var c=d.getElementById(pair[0]);
        if(c&&!!c.checked!==!!pair[1]){c.checked=!!pair[1];try{c.dispatchEvent(new win.Event("change"));}catch(e){}}
      });
      ping("optins-"+["webrtcOptin","storageOptin"].map(function(id){
        var c=d.getElementById(id);return id.replace("Optin","")+(c&&c.checked?"=on":"=off");}).join("_"));
      d.getElementById("runBtn").click();clicked=true;ping("clicked-run");
      say("run "+(runIndex+1)+"/"+RUNS+" running ...");
    }
    if(clicked&&win.__KIT_DONE&&win.__KIT&&win.__KIT.findability){
      ping("audit-done");
      if(!crossWait){crossWait=Date.now();ping("waiting-cross");}
      var cx=win.__KIT.findabilityCross, gaveUp=Date.now()-crossWait>75000;
      var sd=win.__paStoreDiag;
      var stOk=!WANT_STORE||!!win.__KIT.partitioning||!!(sd&&sd.timedOut);
      if((cx&&stOk)||gaveUp){ping(cx?(stOk?"cross-ready":"cross-ready-store-late"):"cross-timeout");setTimeout(collect,800);return;}
      setTimeout(tick,1000);return;
    }
  }catch(e){post("cannot reach the tool window: "+e.message);return;}
  if(el>150000){post("timed out after 150s (clicked="+clicked+")");return;}
  setTimeout(tick,1000);
}

// Capture what the tool actually WRITES OUT, not just what it holds in memory. The export path
// has its own history of defects (an inverted schema field, hashes surviving redaction, a
// fingerprint in the filename), and none of them are visible in __KIT.
function grabExports(){
  var out={summary:null,full:null,summaryName:null,fullName:null,redactOn:null,errors:[]};
  try{
    var d=win.document;
    var box=d.getElementById("redactOptin");
    out.redactOn=box?!!box.checked:null;
    // paSave and PAV are not on window (the tool's script is wrapped), so drive the real Save
    // buttons and intercept the Blob the download is built from. This exercises the path a user
    // actually takes rather than a function reached from the outside.
    var grabbed=[],origCreate=win.URL.createObjectURL,origRevoke=win.URL.revokeObjectURL;
    win.URL.createObjectURL=function(b){grabbed.push(b);return origCreate.call(win.URL,b);};
    win.URL.revokeObjectURL=function(){};
    var names=[];
    var origAppend=d.body.appendChild.bind(d.body);
    d.body.appendChild=function(el){if(el&&el.tagName==="A"&&el.download)names.push(el.download);return origAppend(el);};
    ["savesum","savefull"].forEach(function(k){
      var b=d.querySelector('[data-pa="'+k+'"]');
      if(!b){out.errors.push("no button "+k);return;}
      try{b.click();}catch(e){out.errors.push(k+": "+e.message);}
    });
    d.body.appendChild=origAppend;
    win.URL.createObjectURL=origCreate;win.URL.revokeObjectURL=origRevoke;
    out.summaryName=names[0]||null;out.fullName=names[1]||null;
    if(!grabbed.length){out.errors.push("no blob captured");return out;}
    // Blob.text() is async; the caller waits for out.pending to settle.
    out.pending=Promise.all(grabbed.map(function(b){return b.text();})).then(function(txt){
      txt.forEach(function(t,i){
        var o=null;try{o=JSON.parse(t);}catch(e){out.errors.push("parse "+i+": "+e.message);return;}
        if(o&&o.schema==="privacyassay-summary/1.1")out.summary=o;else out.full=o;
      });
      delete out.pending;
    });
  }catch(e){out.errors.push("grab: "+e.message);}
  return out;
}

function collect(){
  var K=win.__KIT||{},F=K.findability||{},C=K.findabilityCross||null;
  var ex=(runIndex===0)?grabExports():null;
  if(ex&&ex.pending){ex.pending.then(function(){finishCollect(ex);});return;}
  finishCollect(ex);
}

function finishCollect(ex){
  var K=win.__KIT||{},F=K.findability||{},C=K.findabilityCross||null;
  results.push({version:K.version,complete:F.complete,coverage:F.coverage,exports:ex,score:F.score,grade:F.grade,
    cross:C?C.score:null,crossGrade:C?C.grade:null,
    changedAcrossOrigins:C?(C.changedAcrossOrigins||[]):null,
    crossFailed:K.crossFailed||null,crossSkipped:!!K.crossSkippedRandomizer,
    rows:(F.rows||[]).map(function(r){return [r.label,r.state,r.tier];}),
    stableHash:K.stableHash||null,crossBrowser:K.crossBrowser||null,
    partitioning:K.partitioning||null,storeDiag:win.__paStoreDiag||null,
    categories:K.categories||null,userAgent:win.navigator.userAgent});
  ping("collected-"+F.score);
  try{if(TRANSPORT==="popup")win.close();else host.innerHTML="";}catch(e){}
  runIndex++;
  if(runIndex<RUNS){say("run "+runIndex+" done, next ...");setTimeout(openTool,1200);}
  else post(null);
}

function post(fatal){
  if(posted)return;posted=true;
  var scores=results.filter(function(r){return r.complete;}).map(function(r){return r.score;});
  var body={browser:NAME,mode:MODE,transportUsed:TRANSPORT,runs:results,scores:scores,
    identical:scores.length>0&&scores.every(function(x){return x===scores[0];}),
    errors:fatal?[fatal]:[]};
  say(fatal?("<b>failed:</b> "+fatal):("<b>done.</b> scores "+scores.join(", ")));
  ping("posting-"+(fatal?"fatal":"ok"));
  ping("scores-"+(scores.join("_")||"none"));
  try{var x=new XMLHttpRequest();x.open("POST","/__result",true);
    x.setRequestHeader("Content-Type","text/plain");x.send(JSON.stringify(body));}catch(e){ping("xhr-failed");}
  try{if(navigator.sendBeacon){navigator.sendBeacon("/__result",new Blob([JSON.stringify(body)],{type:"text/plain"}));}}catch(e){}
}

openTool();
