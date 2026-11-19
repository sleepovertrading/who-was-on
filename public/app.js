(function(){
"use strict";
function blankForm(){return {showId:"",newTitle:"",theatre:"",location:"",date:"",slot:"eve",cast:[],origin:"blank",showText:"",scanId:null,pages:0,seat:"",note:"",msg:"",scanMsg:"",busy:false,dateGuess:"",unsure:false,draftId:null,helpOpen:false,paste:"",pasteMsg:"",dirty:false,nearText:""};}
var S={user:null,shows:new Map(),perfs:new Map(),diary:new Map(),drafts:new Map(),ready:false,fetched:new Set(),ent:new Map(),entAsked:new Set(),q:"",form:blankForm(),auth:{email:"",step:"email",msg:""}};
var STATUSES=[["billed","As billed"],["understudy","Understudy"],["standby","Standby"],["swing","Swing"],["alternate","Alternate"]];
var $view=document.getElementById("view"),$banner=document.getElementById("banner");

/* ---------- helpers ---------- */
function h(tag,attrs){
  var el=document.createElement(tag),i,k;
  if(attrs) for(k in attrs){
    if(k==="text") el.textContent=attrs[k];
    else if(k.slice(0,2)==="on") el.addEventListener(k.slice(2),attrs[k]);
    else if(attrs[k]===true) el.setAttribute(k,"");
    else if(attrs[k]!==false&&attrs[k]!=null) el.setAttribute(k,attrs[k]);
  }
  for(i=2;i<arguments.length;i++){var c=arguments[i]; if(c==null||c===false) continue;
    el.appendChild(typeof c==="string"?document.createTextNode(c):c);}
  return el;
}
function slug(s){return String(s||"").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80);}
function norm(s){return slug(s).replace(/^the-/,"");}
function same(a,b){return String(a||"").trim().toLowerCase()===String(b||"").trim().toLowerCase();}
function perfKey(a,b,c){return a+"_"+b+"_"+c;}
function validDate(d){return /^\d{4}-\d{2}-\d{2}$/.test(d||"");}
function fmtDate(d,opt){if(!validDate(d))return d||"";var p=d.split("-");
  return new Date(+p[0],+p[1]-1,+p[2]).toLocaleDateString(undefined,opt||{weekday:"short",year:"numeric",month:"long",day:"numeric"});}
function slotName(s){return s==="mat"?"Matinee":"Evening";}
function statusName(s){var x=STATUSES.find(function(y){return y[0]===s;});return x?x[1]:"As billed";}
function cleanCast(c){var out=[];(Array.isArray(c)?c:[]).forEach(function(r){
  if(!r)return;var role=String(r.role||"").trim().slice(0,120),p=String(r.performer||"").trim().slice(0,120);
  var st=STATUSES.some(function(x){return x[0]===r.status;})?r.status:"billed";
  if(role||p) out.push({role:role,performer:p,status:st});});return out;}
function banner(t,bad){ if(!t){$banner.classList.add("hide");return;} $banner.textContent=t;$banner.classList.remove("hide");$banner.classList.toggle("bad",!!bad);}
function go(path){location.hash="#/"+path;}
function route(){var parts=location.hash.replace(/^#\/?/,"").split("/");var arg=parts.slice(1).join("/");
  try{arg=decodeURIComponent(arg);}catch(e){} return {kind:parts[0]||"me",arg:arg};}
function hue(s){var n=0;for(var i=0;i<s.length;i++)n=(n*31+s.charCodeAt(i))%360;return n;}
function initials(s){var w=String(s||"").replace(/^the\s+/i,"").split(/\s+/).filter(Boolean);
  return ((w[0]||"?")[0]+(w.length>1?w[w.length-1][0]:"")).toUpperCase();}
/* Each show can carry a look (a display font and two colours) that evokes its title treatment. No logos or artwork are used. */
function styleFor(title){var st=null,n=norm(title);S.shows.forEach(function(v){if(!st&&v.style&&norm(v.title)===n)st=v.style;});return st;}
function lum(hex){var c=[1,3,5].map(function(i){var v=parseInt(hex.slice(i,i+2),16)/255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];}
function contrast(a,b){var x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);}
function inkOn(bg,want){return want&&contrast(bg,want)>=3.2?want:(lum(bg)>0.4?"#111118":"#FFFFFF");}
function useFont(name){
  var id="font-"+slug(name); if(document.getElementById(id)) return;
  document.head.appendChild(h("link",{id:id,rel:"stylesheet",href:"https://fonts.googleapis.com/css2?family="+encodeURIComponent(name).replace(/%20/g,"+")+"&display=swap"}));
}
function tile(title,big){
  var t=h("span",{class:"tile"+(big?" big":""),"aria-hidden":"true",text:initials(title)}),st=styleFor(title);
  if(st){useFont(st.font);t.style.background=st.c1;t.style.color=inkOn(st.c1,st.c2);t.style.fontFamily="'"+st.font+"',var(--font)";t.style.fontWeight="400";t.classList.add("styled");}
  else t.style.setProperty("--h",hue(norm(title)));
  return t;
}
/* The banner at the top of a show's or a night's page, set in that show's look. */
function showBanner(title,eyebrow,titleNode,meta){
  var st=styleFor(title),box=h("div",{class:"showbanner"+(st?" styled":"")},h("div",{class:"eyebrow",text:eyebrow}),h("h1",null,titleNode),meta||null);
  if(st){useFont(st.font);var ink=inkOn(st.c1,st.c2),soft=lum(st.c1)>0.4?"#111118":"#FFFFFF";
    box.style.background=st.c1;box.style.setProperty("--ink",ink);box.style.setProperty("--soft",soft);
    box.querySelector("h1").style.fontFamily="'"+st.font+"',var(--font)";}
  else box.style.setProperty("--h",hue(norm(title)));
  return box;
}
/* Ask the server to look a show up (opening night, theatre, look). The server decides whether a search is really needed. */
function lookUpShow(showId,date){
  var s=S.shows.get(showId); S.looked=S.looked||new Set();
  if(!S.user||!s||S.looked.has(showId)||(s.opened&&s.theatre&&s.style)) return;
  S.looked.add(showId);
  send("POST","/api/shows/"+encodeURIComponent(showId)+"/lookup",{date:date||""}).then(function(r){
    if(!r.show) return; S.shows.set(showId,Object.assign({},S.shows.get(showId)||s,r.show));
    if(r.filled&&r.filled.indexOf("theatre")>=0) S.perfs.forEach(function(p,k){if(p.showId===showId&&!p.theatre)S.perfs.set(k,Object.assign({},p,{theatre:r.show.theatre,location:r.show.location}));});
    if(r.filled&&r.filled.length) banner("Found the "+r.filled.join(" and ")+" for "+r.show.title+".");
    var now=route(); if(now.kind!=="add"&&now.kind!=="sign-in") render();
  }).catch(function(){});
}
function foundBy(s){
  if(!s||!s.factsSource) return null;
  return h("div",{class:"credit"},"Opening night and theatre found by web search. ",h("a",{href:s.factsSource,target:"_blank",rel:"noopener",text:"Source ↗"}));
}
function avatar(name,big){
  var e=S.ent.get("performer:"+String(name).toLowerCase()),cls="avatar"+(big?" big":"");
  if(!e||!e.image) return h("span",{class:cls,"aria-hidden":"true",text:initials(name)});
  var img=h("img",{class:cls,src:e.image,alt:"",loading:"lazy",referrerpolicy:"no-referrer"});
  img.addEventListener("error",function(){img.replaceWith(h("span",{class:cls,"aria-hidden":"true",text:initials(name)}));});
  return img;
}
/* Links out and photos. Matched on the server against Wikidata; search links stand in until (or unless) there's a match. */
function entity(kind,name){
  var key=kind+":"+String(name).toLowerCase();
  if(!S.entAsked.has(key)&&name){S.entAsked.add(key);
    api("/api/entity?kind="+kind+"&name="+encodeURIComponent(name)).then(function(r){
      if(!r.entity) return; S.ent.set(key,r.entity); var now=route();
      if(now.kind===kind) render();
    }).catch(function(){S.entAsked.delete(key);});}
  return S.ent.get(key)||null;
}
function wantPhotos(names){
  var ask=names.filter(function(n){var k="performer:"+n.toLowerCase();if(S.entAsked.has(k))return false;S.entAsked.add(k);return true;}).slice(0,90);
  if(!ask.length) return;
  send("POST","/api/entities",{names:ask}).then(function(r){
    var any=false;(r.entities||[]).forEach(function(e){S.ent.set("performer:"+e.key,e);if(e.image)any=true;});
    // Names with nothing on file yet can be asked for individually later (their own page does a full lookup).
    ask.forEach(function(n){var k="performer:"+n.toLowerCase();if(!S.ent.has(k))S.entAsked.delete(k);});
    if(any) render();
  }).catch(function(){});
}
function out(href,label){return h("a",{class:"chip plain out",href:href,target:"_blank",rel:"noopener",text:label+" ↗"});}
function linksOut(kind,name){
  var e=entity(kind,name),row=h("div",{class:"chips"});
  row.appendChild(e&&e.wikipedia?out(e.wikipedia,"Wikipedia"):out("https://en.wikipedia.org/w/index.php?search="+encodeURIComponent(name),"Search Wikipedia"));
  row.appendChild(e&&e.ibdb?out(e.ibdb,"IBDB"):out("https://duckduckgo.com/?q="+encodeURIComponent('site:ibdb.com "'+name+'"'),"Find on IBDB"));
  return row;
}
function photoCredit(name){
  var e=S.ent.get("performer:"+String(name).toLowerCase());
  if(!e||!e.image) return null;
  return h("div",{class:"credit"},"Photo: ",e.imagePage?h("a",{href:e.imagePage,target:"_blank",rel:"noopener",text:e.imageCredit||"Wikimedia Commons"}):(e.imageCredit||"Wikimedia Commons"));
}
/* Where a night falls in the show's run: "Opening night was August 6, 2015 · you saw it 15 weeks into the run". */
function runContext(showId,date){
  var s=S.shows.get(showId); if(!s||!validDate(s.opened)||!validDate(date)) return null;
  var days=Math.round((Date.parse(date)-Date.parse(s.opened))/86400000),open=fmtDate(s.opened,{month:"long",day:"numeric",year:"numeric"}),t;
  if(days===0) t="This was opening night.";
  else if(days<0) t="A preview, "+plural(-days,"day","days")+" before opening night ("+open+").";
  else{var into=days<14?plural(days,"day","days"):days<365?plural(Math.round(days/7),"week","weeks"):(Math.floor(days/365)===1?"1 year":Math.floor(days/365)+" years")+(Math.round((days%365)/30)?" and "+plural(Math.round((days%365)/30),"month","months"):"");
    t="Opening night was "+open+" · this was "+into+" into the run.";}
  if(validDate(s.closed)&&date===s.closed) t+=" It was also closing night.";
  return h("div",{class:"context",text:t});
}
function openingEditor(s){
  // The page can redraw while someone is typing (links and photos arrive late), so the typed date is kept outside the field.
  S.openVal=S.openVal||{};
  var start=S.openVal[s.id]!==undefined?S.openVal[s.id]:(s.opened||"");
  var keep=function(e){S.openVal[s.id]=e.target.value;};
  var input=h("input",{type:"date",id:"s-opened",value:start,"aria-label":"Opening night",style:"max-width:180px",oninput:keep,onchange:keep});
  var msg=h("span",{class:"muted small",id:"s-opened-msg",role:"status"});
  var box=h("div",{class:"row",style:"align-items:center;gap:8px"},h("span",{class:"lab",text:s.opened?"Opening night":"Know the opening night?"}),input);
  box.appendChild(h("button",{type:"button",class:"btn small",text:"Save",onclick:async function(){
    var val=input.value||S.openVal[s.id]||"";
    if(!S.user){go("sign-in");return;}
    if(!validDate(val)&&!s.opened){msg.textContent="Pick the full date first: month, day and year.";return;}
    msg.textContent="Saving…";
    try{var r=await send("PUT","/api/shows/"+encodeURIComponent(s.id),{opened:val});
      S.shows.set(s.id,Object.assign({},S.shows.get(s.id)||s,r.show));delete S.openVal[s.id];S.editOpen=false;
      banner(r.show.opened?"Opening night saved: "+fmtDate(r.show.opened,{month:"long",day:"numeric",year:"numeric"})+".":"Opening night cleared.");render();}
    catch(e){msg.textContent=e.message;}}}));
  box.appendChild(msg);
  return box;
}
function monthYear(d){return fmtDate(d,{month:"short",year:"numeric"});}
/* "You've been 3 times · first Mar 2016 · last Jun 2024" for any set of your own nights (newest first). */
function historyLine(mine,verb){
  if(!S.user) return null;
  if(!mine.length) return h("div",{class:"yours none",text:"Not on any of your nights yet."});
  var t=verb+" "+(mine.length===1?"once":mine.length===2?"twice":mine.length+" times");
  t+=mine.length===1?" · "+fmtDate(mine[0].date,{month:"long",day:"numeric",year:"numeric"}):" · first "+monthYear(mine[mine.length-1].date)+" · last "+monthYear(mine[0].date);
  return h("div",{class:"yours",text:t});
}
function splitNights(perfs,emptyText,subFn){
  var mine=perfs.filter(function(p){return S.diary.has(p.id);}),others=perfs.filter(function(p){return !S.diary.has(p.id);});
  var parts=[];
  if(mine.length) parts.push(section("Your nights",nightList(mine,"",subFn)));
  if(others.length||!mine.length) parts.push(section(mine.length?"Everyone else's nights":"Nights",nightList(others,emptyText,subFn)));
  return {mine:mine,parts:parts};
}
function linkShow(p){return h("a",{href:"#/show/"+encodeURIComponent(p.showId),text:p.showTitle});}
function linkPerformer(n){return h("a",{href:"#/performer/"+encodeURIComponent(n),text:n});}
function linkTheatre(n){return h("a",{href:"#/theatre/"+encodeURIComponent(n),text:n});}
function allPerfs(filter){return Array.from(S.perfs.values()).filter(filter||function(){return true;})
  .sort(function(a,b){return String(b.date).localeCompare(String(a.date));});}
function plural(n,one,many){return n+" "+(n===1?one:many);}

/* ---------- server ---------- */
async function api(path,opts){
  var res=await fetch(path,Object.assign({credentials:"same-origin"},opts||{}));
  var data=await res.json().catch(function(){return {};});
  if(!res.ok){var e=new Error(data.error||"That didn't work. Try again.");e.status=res.status;throw e;}
  return data;
}
function send(method,path,body){return api(path,{method:method,headers:{"content-type":"application/json"},body:JSON.stringify(body||{})});}
function takeMe(me){S.user=me.user;S.signIn=me.signIn||"code";S.diary=new Map();S.drafts=new Map();
  (me.drafts||[]).forEach(function(d){S.drafts.set(d.id,d);});
  (me.attendance||[]).forEach(function(a){S.diary.set(a.perfId,a);});
  (me.performances||[]).forEach(function(p){S.perfs.set(p.id,p);});}
async function boot(){
  render();
  try{
    var r=await Promise.all([api("/api/shows"),api("/api/performances"),api("/api/me")]);
    r[0].shows.forEach(function(s){S.shows.set(s.id,s);});
    r[1].performances.forEach(function(p){S.perfs.set(p.id,p);});
    takeMe(r[2]);
  }catch(e){banner("The archive couldn't be loaded. Check your connection and reload.",true);}
  S.ready=true; render();
}
/* Pull everything the archive holds for one show, performer or theatre, once per visit. */
function ensure(kind,arg){
  var key=kind+":"+arg.toLowerCase(); if(S.fetched.has(key)||!arg) return; S.fetched.add(key);
  api("/api/performances?"+kind+"="+encodeURIComponent(arg)).then(function(r){
    r.performances.forEach(function(p){S.perfs.set(p.id,p);}); var now=route();
    if(now.kind===kind&&same(now.arg,arg)) render();
  }).catch(function(){S.fetched.delete(key);});
}

/* ---------- shared pieces ---------- */
function statusChip(p){
  if(!p.cast.length) return h("span",{class:"chip plain",text:"Cast not added yet"});
  if(p.verified) return h("span",{class:"chip good",text:"Playbill checked"});
  if(p.source==="opening") return h("span",{class:"chip warn",text:"Opening company"});
  return h("span",{class:"chip warn",text:"Unconfirmed"});
}
/* A night is drawn as a ticket stub: date block, perforation, then the title set in that show's own lettering. */
var MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function showColor(title){var st=styleFor(title);return st?(lum(st.c1)>0.05?st.c1:st.c2):"hsl("+hue(norm(title))+" 70% 52%)";}
function stubDate(date,guess){
  if(validDate(date)){var p=date.split("-");return h("span",{class:"stubdate"},h("span",{class:"m",text:MONTHS[+p[1]-1]}),h("b",{text:String(+p[2])}),h("span",{class:"y",text:p[0]}));}
  var yr=String(guess||"").match(/\b(19|20)\d{2}\b/);
  return h("span",{class:"stubdate unknown"},h("span",{class:"m",text:"Date"}),h("b",{text:"?"}),h("span",{class:"y",text:yr?yr[0]:"needed"}));
}
function stub(href,title,date,guess,sub,right,extra){
  var st=styleFor(title),t=h("span",{class:"t",text:title});
  if(st){useFont(st.font);t.style.fontFamily="'"+st.font+"',var(--font)";t.classList.add("styled");}
  var a=h(href?"a":"div",{class:"stub"+(extra?" "+extra:""),href:href||null},stubDate(date,guess),
    h("span",{class:"main"},t,h("span",{class:"s",text:sub||""})),right?h("span",{class:"when",text:right}):null);
  a.style.setProperty("--c",showColor(title));
  return a;
}
function nightCard(p,sub){
  return stub("#/night/"+encodeURIComponent(p.id),p.showTitle,p.date,"",sub||[p.theatre,p.location].filter(Boolean).join(", "),slotName(p.slot));
}
/* Nights grouped under large year markers. */
function nightsByYear(perfs){
  var box=h("div",{class:"stack"}),yr="",counts={};
  perfs.forEach(function(p){var y=String(p.date).slice(0,4);counts[y]=(counts[y]||0)+1;});
  perfs.forEach(function(p){var y=String(p.date).slice(0,4);
    if(y!==yr){yr=y;box.appendChild(h("div",{class:"yearmark"},h("b",{text:y}),h("span",{text:plural(counts[y],"night","nights")})));}
    box.appendChild(nightCard(p));});
  return box;
}
function ring(done,part,total){
  var c=2*Math.PI*34,f=function(n){return (total?n/total*c:0).toFixed(1)+" "+c.toFixed(1);},
    box=h("span",{class:"ring",role:"img","aria-label":part+" of "+total+" nights have a cast, "+done+" checked against a Playbill"});
  box.innerHTML='<svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="34" class="trk"/>'+(part?'<circle cx="40" cy="40" r="34" class="part" stroke-dasharray="'+f(part)+'"/>':"")+(done?'<circle cx="40" cy="40" r="34" class="done" stroke-dasharray="'+f(done)+'"/>':"")+'</svg>';
  box.appendChild(h("b",{text:total?Math.round(part/total*100)+"%":"0%"}));
  return box;
}
function faces(list,limit){
  var box=h("div",{class:"faces"});
  list.slice(0,limit).forEach(function(e){box.appendChild(h("a",{class:"face",href:"#/performer/"+encodeURIComponent(e.name)},avatar(e.name,true),
    h("b",{text:e.name}),h("span",{text:plural(e.n,"night","nights")})));});
  return box;
}
function nightList(perfs,empty,subFn){
  var box=h("div",{class:"stack"});
  if(!perfs.length) box.appendChild(h("div",{class:"note",text:S.ready?empty:"Loading…"}));
  perfs.forEach(function(p){box.appendChild(nightCard(p,subFn?subFn(p):null));});
  return box;
}
function section(title,body,more){
  return h("section",{class:"stack"},h("div",{class:"sechead"},h("h2",{text:title}),more||null),body);
}
function barList(rows){ // rows: [{label:node, sub, n}]
  var max=Math.max.apply(null,rows.map(function(r){return r.n;}).concat([1])),box=h("div",{class:"card"});
  rows.forEach(function(r){var m=h("i");m.style.width=Math.max(6,Math.round(r.n/max*100))+"%";
    box.appendChild(h("div",{class:"bar-row"},r.icon||null,h("div",{class:"name"},r.label,r.sub?h("div",{text:r.sub}):null),
      h("div",{class:"meter","aria-hidden":"true"},m),h("div",{class:"n",text:String(r.n)})));});
  return box;
}
function tally(perfs){
  var people=new Map(),shows=new Map(),theatres=new Map();
  perfs.forEach(function(p){
    var s=shows.get(p.showId)||{p:p,n:0};s.n++;shows.set(p.showId,s);
    if(p.theatre){var t=theatres.get(p.theatre.toLowerCase())||{name:p.theatre,n:0};t.n++;theatres.set(p.theatre.toLowerCase(),t);}
    cleanCast(p.cast).forEach(function(r){if(!r.performer)return;var k=r.performer.toLowerCase();
      var e=people.get(k)||{name:r.performer,n:0,roles:new Map()};e.n++;
      var rk=r.role+" · "+p.showTitle;e.roles.set(rk,(e.roles.get(rk)||0)+1);people.set(k,e);});
  });
  var byN=function(a,b){return b.n-a.n;};
  return {people:Array.from(people.values()).sort(function(a,b){return b.n-a.n||a.name.localeCompare(b.name);}),
    shows:Array.from(shows.values()).sort(byN),theatres:Array.from(theatres.values()).sort(byN)};
}
function performerRows(list,limit){
  return list.slice(0,limit||list.length).map(function(e){
    return {icon:avatar(e.name),label:linkPerformer(e.name),sub:Array.from(e.roles.keys()).slice(0,3).join("; "),n:e.n};});
}

/* ---------- my shows ---------- */
function understudyRows(mine){
  var rows=[];
  mine.forEach(function(p){cleanCast(p.cast).forEach(function(r){if(r.status!=="billed"&&r.performer) rows.push({p:p,r:r});});});
  return rows;
}
function crossovers(mine){
  var by=new Map();
  mine.forEach(function(p){cleanCast(p.cast).forEach(function(r){if(!r.performer)return;var k=r.performer.toLowerCase();
    var e=by.get(k)||{name:r.performer,parts:new Map(),shows:new Set()};e.parts.set(p.showId+"|"+r.role.toLowerCase(),r.role+" in "+p.showTitle);e.shows.add(p.showId);by.set(k,e);});});
  return Array.from(by.values()).filter(function(e){return e.parts.size>1;})
    .sort(function(a,b){return b.shows.size-a.shows.size||b.parts.size-a.parts.size||a.name.localeCompare(b.name);});
}
function yearChart(mine){
  var counts=new Map();mine.forEach(function(p){var y=String(p.date).slice(0,4);counts.set(y,(counts.get(y)||0)+1);});
  var years=Array.from(counts.keys()).sort(),first=+years[0],last=+years[years.length-1],max=Math.max.apply(null,Array.from(counts.values()));
  var box=h("div",{class:"years",role:"img","aria-label":"Nights per year: "+years.map(function(y){return y+" "+counts.get(y);}).join(", ")});
  var span=last-first+1,step=span>14?Math.ceil(span/14):1;
  for(var y=first;y<=last;y++){var n=counts.get(String(y))||0,bar=h("i");bar.style.height=(n?Math.max(8,Math.round(n/max*100)):2)+"%";if(!n)bar.className="zero";
    box.appendChild(h("div",{class:"yr",title:y+": "+plural(n,"night","nights")},h("b",{text:n?String(n):""}),bar,h("span",{text:(y-first)%step===0||y===last?"’"+String(y).slice(2):""})));}
  return box;
}
function thisWeek(mine){
  var now=new Date(),hits=mine.filter(function(p){if(!validDate(p.date))return false;var d=p.date.split("-");
    if(+d[0]>=now.getFullYear()) return false;
    var then=new Date(now.getFullYear(),+d[1]-1,+d[2]);return Math.abs(then-now)<=3.5*86400000;});
  if(!hits.length) return null;
  var box=h("div",{class:"stack"});
  hits.forEach(function(p){var yrs=now.getFullYear()-(+p.date.slice(0,4));box.appendChild(nightCard(p,plural(yrs,"year","years")+" ago this week"+(p.theatre?" · "+p.theatre:"")));});
  return section("This week in your theatre history",box);
}
function viewMe(){
  var mine=allPerfs(function(p){return S.diary.has(p.id);}),t=tally(mine),wrap=[];
  if(!S.user||!mine.length){
    wrap.push(h("div",{class:"stack"},h("div",{class:"eyebrow",text:"Your theatre history"}),
      h("h1",{text:"Every night you went, and exactly who was on."}),
      h("p",{class:"muted",style:"margin:0;max-width:60ch",text:"Add the date you saw a show and keep the cast from that performance: principals, understudies, swings. Then follow anyone you've seen across every night in the archive."}),
      h("div",{class:"row"},h("a",{class:"btn primary",href:"#/add",text:"Add a night"}),
        S.user||S.signIn==="access"?null:h("a",{class:"btn",href:"#/sign-in",text:"Sign in"}),h("a",{class:"btn ghost",href:"#/archive",text:"Browse the archive"}))));
    wrap.push(h("div",{class:"steps"},
      h("div",{class:"card step"},h("b",{text:"1"}),h("h2",{text:"Log the night"}),h("p",{text:"The show and the date are enough. No date? Save the show and pin the date later."})),
      h("div",{class:"card step"},h("b",{text:"2"}),h("h2",{text:"Fill in who was on"}),h("p",{text:"Scan your Playbill a page at a time, paste a cast list, or start from the closest night on file."})),
      h("div",{class:"card step"},h("b",{text:"3"}),h("h2",{text:"Follow the threads"}),h("p",{text:"Every performer, show and theatre is a page: each time you saw them, and everyone they shared a stage with."}))));
    wrap.push(h("div",{class:"demo","aria-hidden":"true"},stub(null,"Your first night","","","Scan the Playbill or type the show","Evening","tilt")));
    wrap[wrap.length-1].firstChild.style.setProperty("--c","var(--a1)");
    wrap.push(draftsSection());
    var recent=allPerfs().slice(0,5);
    if(recent.length) wrap.push(section("Just logged",nightList(recent,""),h("a",{href:"#/archive",text:"See all"})));
    return wrap;
  }
  wantPhotos(t.people.map(function(e){return e.name;}));
  var subs=understudyRows(mine),cross=crossovers(mine);
  var seenShows=new Set(t.shows.map(function(x){return norm(x.p.showTitle);})),undated=0;
  S.drafts.forEach(function(d){var k=norm(d.showTitle);if(!validDate(d.date)&&!seenShows.has(k)){seenShows.add(k);undated++;}});
  var withCast=mine.filter(function(p){return p.cast.length;}).length,checked=mine.filter(function(p){return p.verified&&p.cast.length;}).length;
  t.shows.filter(function(x){var v=S.shows.get(x.p.showId);return v&&!v.style;}).slice(0,3).forEach(function(x){lookUpShow(x.p.showId,x.p.date);});
  wrap.push(h("div",{class:"sechead",style:"align-items:flex-end"},
    h("div",{class:"stack"},h("div",{class:"eyebrow",text:"My shows"}),h("h1",{text:"You've seen "+plural(t.people.length,"performer","performers")+" across "+plural(mine.length,"night","nights")+"."})),
    h("button",{type:"button",class:"btn small",text:"Share my year",onclick:function(){shareYear(mine);}})));
  wrap.push(h("div",{class:"bento"},
    h("div",{class:"card stat lead"},h("b",{text:String(mine.length)}),h("span",{text:mine.length===1?"night at the theatre":"nights at the theatre"})),
    h("div",{class:"card stat"},h("b",{text:String(seenShows.size)}),h("span",{text:(seenShows.size===1?"show":"shows")+(undated?" · "+undated+" awaiting a date":"")})),
    h("div",{class:"card stat"},h("b",{text:String(t.theatres.length)}),h("span",{text:t.theatres.length===1?"theatre":"theatres"})),
    h("div",{class:"card stat wide ringcard"},ring(checked,withCast,mine.length),h("div",null,h("span",{class:"lab",text:"Casts on file"}),
      h("div",{class:"legend"},h("span",null,h("i",{class:"k part"}),plural(withCast,"night has","nights have")+" a cast"),h("span",null,h("i",{class:"k done"}),checked+" checked against a Playbill")))),
    h("div",{class:"card stat"},h("b",{text:String(subs.length)}),h("span",{text:subs.length===1?"understudy you saw go on":"understudies you saw go on"})),
    h("div",{class:"card stat"},h("b",{text:String(cross.length)}),h("span",{text:cross.length===1?"performer seen in more than one role":"performers seen in more than one role"})),
    h("div",{class:"card stat full"},h("span",{class:"lab",text:"Nights by year"}),yearChart(mine))));
  wrap.push(draftsSection());
  wrap.push(thisWeek(mine));
  if(t.people.length) wrap.push(section("Faces you've seen most",faces(t.people,8)));
  wrap.push(h("div",{class:"grid2"},
    section("Shows you return to",barList(t.shows.slice(0,4).map(function(s){return {icon:tile(s.p.showTitle),label:linkShow(s.p),n:s.n};}))),
    section("Your theatres",barList(t.theatres.slice(0,4).map(function(x){return {label:linkTheatre(x.name),n:x.n};})))));
  if(cross.length){var cb=h("div",{class:"card cast"});
    cross.slice(0,12).forEach(function(e){cb.appendChild(h("div",{class:"castline"},avatar(e.name),
      h("div",{class:"who"},linkPerformer(e.name),h("div",{class:"role",text:Array.from(e.parts.values()).join(" · ")})),
      h("span",{class:"chip plain",text:e.shows.size>1?plural(e.shows.size,"show","shows"):plural(e.parts.size,"role","roles")})));});
    wrap.push(section("Crossovers: seen in more than one role",cb));}
  if(subs.length){var ub=h("div",{class:"card cast"});
    subs.forEach(function(x){ub.appendChild(h("a",{class:"castline linkrow",href:"#/night/"+encodeURIComponent(x.p.id)},avatar(x.r.performer),
      h("div",{class:"who"},h("b",{text:x.r.performer}),h("div",{class:"role",text:x.r.role+" · "+x.p.showTitle+" · "+fmtDate(x.p.date,{month:"short",day:"numeric",year:"numeric"})})),
      h("span",{class:"chip warn plain",text:statusName(x.r.status)})));});
    wrap.push(section("Understudies you saw go on",ub));}
  wrap.push(section("Your nights",nightsByYear(mine)));
  return wrap;
}

/* ---------- archive ---------- */
function viewArchive(){
  var q=S.q.trim().toLowerCase(),perfs=allPerfs(function(p){
    if(!q) return true;
    return p.showTitle.toLowerCase().indexOf(q)>=0||(p.theatre||"").toLowerCase().indexOf(q)>=0||
      p.cast.some(function(c){return c.performer.toLowerCase().indexOf(q)>=0||c.role.toLowerCase().indexOf(q)>=0;});});
  var list=h("div",{id:"archive-list"},nightList(perfs,q?"Nothing in the archive matches that yet.":"No performances logged yet. Add the night you went and it appears here."));
  var search=h("input",{type:"search",id:"a-q",value:S.q,placeholder:"Search a show, performer, role or theatre","aria-label":"Search the archive",
    oninput:function(e){S.q=e.target.value;var keep=document.getElementById("archive-list");var next=viewArchiveList();keep.textContent="";keep.appendChild(next);}});
  var chips=h("div",{class:"chips"});
  Array.from(S.shows.values()).sort(function(a,b){return a.title.localeCompare(b.title);}).forEach(function(s){
    chips.appendChild(h("a",{class:"chip plain",href:"#/show/"+encodeURIComponent(s.id),text:s.title}));});
  return [h("div",{class:"stack"},h("div",{class:"eyebrow",text:"Archive"}),h("h1",{text:"Every performance anyone has logged."})),
    search,section("Shows",chips),section("Performances",list)];
}
function viewArchiveList(){var q=S.q.trim().toLowerCase();return nightList(allPerfs(function(p){
  if(!q) return true;
  return p.showTitle.toLowerCase().indexOf(q)>=0||(p.theatre||"").toLowerCase().indexOf(q)>=0||
    p.cast.some(function(c){return c.performer.toLowerCase().indexOf(q)>=0||c.role.toLowerCase().indexOf(q)>=0;});}),
  q?"Nothing in the archive matches that yet.":"No performances logged yet.");}

/* ---------- one performance ---------- */
function viewNight(id){
  var p=S.perfs.get(id);
  if(!p) return [h("div",{class:"note",text:S.ready?"That performance isn't in the archive.":"Loading…"})];
  var d=S.diary.get(id),cast=h("div",{class:"card cast"});
  wantPhotos(cleanCast(p.cast).map(function(r){return r.performer;}).filter(Boolean));
  cleanCast(p.cast).forEach(function(r){
    var seen=allPerfs(function(x){return S.diary.has(x.id)&&x.cast.some(function(c){return same(c.performer,r.performer);});}).length;
    cast.appendChild(h("div",{class:"castline"},avatar(r.performer),
      h("div",{class:"who"},linkPerformer(r.performer),h("div",{class:"role",text:r.role})),
      r.status!=="billed"?h("span",{class:"chip warn plain",text:statusName(r.status)}):null,
      seen>1?h("span",{class:"chip plain",text:"Seen "+seen+"×"}):null));});
  var acts=h("div",{class:"row"});
  if(d) acts.appendChild(h("span",{class:"chip good",text:"You were there"}));
  else acts.appendChild(h("button",{type:"button",class:"btn primary small",text:"I was there too",onclick:async function(){
    if(!S.user){go("sign-in");return;}
    try{var r=await send("POST","/api/attendance/"+encodeURIComponent(id));S.diary.set(id,r.attendance);render();}catch(e){banner(e.message,true);}}}));
  acts.appendChild(h("button",{type:"button",class:"btn small",text:p.cast.length?"Fix the cast":"Add details",onclick:function(){editPerf(id);}}));
  acts.appendChild(h("button",{type:"button",class:"btn small",text:"Share this night",onclick:function(){shareNight(p);}}));
  if(d) acts.appendChild(h("button",{type:"button",class:"btn small ghost",text:"Remove from my shows",onclick:async function(){
    try{await api("/api/attendance/"+encodeURIComponent(id),{method:"DELETE"});S.diary.delete(id);render();}catch(e){banner(e.message,true);}}}));
  var meta=h("div",{class:"meta"},fmtDate(p.date)+" · "+slotName(p.slot)+(p.theatre?" · ":""));
  if(p.theatre) meta.appendChild(linkTheatre(p.theatre));
  if(p.location) meta.appendChild(document.createTextNode(", "+p.location));
  lookUpShow(p.showId,p.date);
  return [showBanner(p.showTitle,"At this performance",linkShow(p),meta),
    h("div",{class:"row",style:"align-items:center"},statusChip(p),h("span",{class:"muted small",text:plural(p.edits,"edit","edits")}),acts),
    d&&(d.seat||d.note)?h("div",{class:"note",text:[d.seat?"Seat "+d.seat:"",d.note].filter(Boolean).join(" · ")}):null,
    runContext(p.showId,p.date),
    foundBy(S.shows.get(p.showId)),
    p.cast.length?section("Who was on",cast):section("Who was on",h("div",{class:"card stack"},
      h("div",{class:"muted",text:"No cast added yet. The show and the date are enough to log the night; add the cast whenever you like."}),
      h("div",{class:"row"},h("button",{type:"button",class:"btn primary small",text:"Add the cast",onclick:function(){editPerf(id);S.form.helpOpen=true;}})),
      lookItUp(p.showTitle,fmtDate(p.date,{month:"long",year:"numeric"}))))];
}

/* ---------- show, performer, theatre ---------- */
function viewShow(id){
  ensure("show",id);
  var s=S.shows.get(id),perfs=allPerfs(function(p){return p.showId===id;});
  if(!s) return [h("div",{class:"note",text:S.ready?"That show isn't in the archive.":"Loading…"})];
  var roles=new Map();
  perfs.forEach(function(p){cleanCast(p.cast).forEach(function(r){var m=roles.get(r.role)||new Map();var e=m.get(r.performer)||{n:0,mine:0};e.n++;if(S.diary.has(p.id))e.mine++;m.set(r.performer,e);roles.set(r.role,m);});});
  var roleBox=h("div",{class:"card cast"});
  Array.from(roles.entries()).forEach(function(e){
    var names=h("div",{class:"chips"});
    Array.from(e[1].entries()).sort(function(a,b){return b[1].n-a[1].n;}).forEach(function(x){
      names.appendChild(h("a",{class:"chip plain"+(x[1].mine?" seen":""),href:"#/performer/"+encodeURIComponent(x[0]),title:x[1].mine?"You saw them in this role":null,text:x[0]+(x[1].n>1?"  ×"+x[1].n:"")}));});
    roleBox.appendChild(h("div",{class:"castline",style:"align-items:flex-start"},h("div",{class:"who",style:"flex:0 0 34%"},h("div",{style:"font-weight:700",text:e[0]})),names));});
  var meta=h("div",{class:"meta"});
  if(s.theatre) meta.appendChild(linkTheatre(s.theatre));
  meta.appendChild(document.createTextNode([s.location?", "+s.location:"",s.opened?(s.theatre||s.location?" · ":"")+"Opened "+fmtDate(s.opened,{year:"numeric",month:"long",day:"numeric"}):""].join("")));
  var nights=splitNights(perfs,"Nobody has logged a night at this show yet.");
  lookUpShow(id,nights.mine.length?nights.mine[0].date:"");
  return [showBanner(s.title,"Show",document.createTextNode(s.title),meta),
    historyLine(nights.mine,"You've been"),
    foundBy(s),
    S.editOpen?openingEditor(s):(S.user?h("button",{type:"button",class:"linkish small",style:"align-self:flex-start",text:s.opened?"Fix the opening night":"Add the opening night yourself",onclick:function(){S.editOpen=true;render();}}):null),
    h("div",{class:"row",style:"align-items:center"},h("button",{type:"button",class:"btn primary",text:"Add a night at this show",onclick:function(){S.form=blankForm();S.form.showId=id;loadCastForKey();go("add");}}),linksOut("show",s.title)),
    roles.size?section("Who has played each role",roleBox,S.user?h("span",{class:"muted small",text:"Highlighted: you saw them"}):null):null].concat(nights.parts);
}
function viewPerformer(name){
  ensure("performer",name);
  var perfs=allPerfs(function(p){return p.cast.some(function(c){return same(c.performer,name);});});
  var shown=name; perfs.some(function(p){return p.cast.some(function(c){if(same(c.performer,name)){shown=c.performer;return true;}});});
  var roles=new Map(),mates=new Map();
  perfs.forEach(function(p){var mine=S.diary.has(p.id);
    p.cast.forEach(function(c){
      if(same(c.performer,name)){var k=p.showId+"|"+c.role,e=roles.get(k)||{p:p,role:c.role,n:0,mine:0};e.n++;if(mine)e.mine++;roles.set(k,e);}
      else if(mine&&c.performer){var m=mates.get(c.performer.toLowerCase())||{name:c.performer,n:0};m.n++;mates.set(c.performer.toLowerCase(),m);}});});
  var rows=Array.from(roles.values()).sort(function(a,b){return b.n-a.n;}).map(function(e){
    return {icon:tile(e.p.showTitle),label:linkShow(e.p),sub:e.role+(e.mine?" · you saw this "+(e.mine===1?"once":e.mine+" times"):""),n:e.n};});
  var nights=splitNights(perfs,"No performances logged for this performer yet.",function(p){
    var c=p.cast.find(function(x){return same(x.performer,name);});
    return (c?c.role+(c.status!=="billed"?" ("+statusName(c.status).toLowerCase()+")":""):"")+(p.theatre?" · "+p.theatre:"");});
  var mateList=Array.from(mates.values()).sort(function(a,b){return b.n-a.n||a.name.localeCompare(b.name);}).slice(0,12),mateBox=h("div",{class:"chips"});
  mateList.forEach(function(m){mateBox.appendChild(h("a",{class:"chip plain",href:"#/performer/"+encodeURIComponent(m.name),text:m.name+(m.n>1?"  ×"+m.n:"")}));});
  entity("performer",shown);
  return [h("div",{class:"hero"},avatar(shown,true),h("div",null,h("div",{class:"eyebrow",text:"Performer"}),h("h1",{text:shown}),
      h("div",{class:"meta",text:plural(perfs.length,"performance","performances")+" in the archive"}),photoCredit(shown))),
    historyLine(nights.mine,"You've seen them"),
    linksOut("performer",shown),
    rows.length?section("Roles",barList(rows)):null,
    mateList.length?section("Shared a stage with, on your nights",mateBox):null].concat(nights.parts);
}
function viewTheatre(name){
  ensure("theatre",name);
  var perfs=allPerfs(function(p){return same(p.theatre,name);}),t=tally(perfs);
  var shown=perfs.length?perfs[0].theatre:name,loc=(perfs.find(function(p){return p.location;})||{}).location||"";
  var shows=h("div",{class:"chips"});
  Array.from(S.shows.values()).filter(function(s){return same(s.theatre,name);}).forEach(function(s){
    shows.appendChild(h("a",{class:"chip plain",href:"#/show/"+encodeURIComponent(s.id),text:s.title}));});
  wantPhotos(t.people.slice(0,8).map(function(e){return e.name;}));
  var nights=splitNights(perfs,"No performances logged at this theatre yet.");
  return [h("div",{class:"hero"},h("div",null,h("div",{class:"eyebrow",text:"Theatre"}),h("h1",{text:shown}),
      h("div",{class:"meta",text:[loc,plural(perfs.length,"performance","performances")+" logged"].filter(Boolean).join(" · ")}))),
    historyLine(nights.mine,"You've been here"),
    linksOut("theatre",shown),
    shows.childNodes.length?section("Shows here",shows):null,
    t.people.length?section("On this stage",barList(performerRows(t.people,8))):null].concat(nights.parts);
}

/* ---------- share images ---------- */
function drawCard(lines){ // lines: {eyebrow,title,sub,rows:[{left,right,tag}],stats:[{n,label}],foot}
  var W=1080,H=1350,c=document.createElement("canvas");c.width=W;c.height=H;var x=c.getContext("2d");
  var F=function(w,s){return w+" "+s+"px 'Plus Jakarta Sans',system-ui,sans-serif";};
  x.fillStyle="#0B0B10";x.fillRect(0,0,W,H);
  var g=x.createRadialGradient(W*0.85,-80,0,W*0.85,-80,900);g.addColorStop(0,"rgba(255,122,89,.34)");g.addColorStop(1,"rgba(255,122,89,0)");x.fillStyle=g;x.fillRect(0,0,W,H);
  var fit=function(t,max,w,size){x.font=F(w,size);while(x.measureText(t).width>max&&size>24){size-=2;x.font=F(w,size);}return size;};
  var clip=function(t,max){if(x.measureText(t).width<=max)return t;while(t.length>1&&x.measureText(t+"…").width>max)t=t.slice(0,-1);return t+"…";};
  var y=120,P=80;
  x.fillStyle="#9C9CAE";x.font=F(700,26);x.fillText(String(lines.eyebrow||"").toUpperCase().split("").join("\u200A"),P,y);
  y+=28;var ts=fit(lines.title,W-2*P,800,96);y+=ts;x.fillStyle="#F3F3F7";x.fillText(lines.title,P,y);
  if(lines.sub){y+=58;x.fillStyle="#9C9CAE";x.font=F(500,32);x.fillText(clip(lines.sub,W-2*P),P,y);}
  y+=64;
  if(lines.stats){var w=(W-2*P-2*24)/3;lines.stats.slice(0,3).forEach(function(s,i){var bx=P+i*(w+24);
      x.fillStyle="#14141B";x.beginPath();x.roundRect(bx,y,w,190,28);x.fill();
      x.fillStyle="#F3F3F7";x.font=F(800,84);x.fillText(String(s.n),bx+28,y+104);
      x.fillStyle="#9C9CAE";x.font=F(500,26);x.fillText(clip(s.label,w-56),bx+28,y+152);});y+=190+56;}
  var rows=lines.rows||[],room=H-170-y,rh=Math.min(74,Math.max(46,Math.floor(room/Math.max(rows.length,1)))),maxRows=Math.floor(room/rh);
  var shown=rows.slice(0,rows.length>maxRows?maxRows-1:maxRows),fs=Math.round(rh*0.46);
  shown.forEach(function(r){
    x.strokeStyle="rgba(255,255,255,.10)";x.lineWidth=2;x.beginPath();x.moveTo(P,y);x.lineTo(W-P,y);x.stroke();
    var by=y+rh*0.66;x.textAlign="right";x.font=F(700,fs);x.fillStyle=r.tag?"#FFC466":"#F3F3F7";
    var right=clip(r.right+(r.tag?"  · "+r.tag:""),W*0.56);x.fillText(right,W-P,by);
    x.textAlign="left";x.font=F(500,fs);x.fillStyle="#9C9CAE";x.fillText(clip(r.left,W-2*P-x.measureText(right).width-80),P,by);y+=rh;});
  if(rows.length>shown.length){x.fillStyle="#6C6C7E";x.font=F(500,26);x.fillText("+ "+(rows.length-shown.length)+" more",P,y+rh*0.66);}
  var ag=x.createLinearGradient(P,0,P+260,0);ag.addColorStop(0,"#FF7A59");ag.addColorStop(1,"#FFB84D");
  x.fillStyle=ag;x.beginPath();x.arc(P+12,H-88,12,0,Math.PI*2);x.fill();
  x.fillStyle="#F3F3F7";x.font=F(800,36);x.fillText("Who Was On",P+40,H-76);
  if(lines.foot){x.textAlign="right";x.fillStyle="#6C6C7E";x.font=F(500,26);x.fillText(lines.foot,W-P,H-78);x.textAlign="left";}
  return c;
}
async function shareCard(lines,filename){
  try{if(document.fonts&&document.fonts.load) await document.fonts.load("800 96px 'Plus Jakarta Sans'");}catch(e){}
  var canvas=drawCard(lines);
  canvas.toBlob(async function(blob){
    if(!blob){banner("The image couldn't be made in this browser.",true);return;}
    var file=new File([blob],filename,{type:"image/png"});
    try{if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:lines.title});return;}}
    catch(e){if(e&&e.name==="AbortError")return;}
    var a=h("a",{href:URL.createObjectURL(blob),download:filename});document.body.appendChild(a);a.click();a.remove();
    banner("Image saved to your downloads.");
  },"image/png");
}
function shareNight(p){
  shareCard({eyebrow:"At this performance",title:p.showTitle,sub:[fmtDate(p.date),slotName(p.slot),p.theatre].filter(Boolean).join(" · "),
    rows:cleanCast(p.cast).map(function(r){return {left:r.role,right:r.performer,tag:r.status!=="billed"?statusName(r.status):""};}),
    foot:S.diary.has(p.id)?"I was there":""},"who-was-on-"+p.id+".png");
}
function shareYear(mine){
  var year=String(mine[0].date).slice(0,4),these=mine.filter(function(p){return String(p.date).slice(0,4)===year;}),t=tally(these);
  shareCard({eyebrow:"My year at the theatre",title:year,sub:these.length===mine.length?"":plural(mine.length,"night","nights")+" logged all-time",
    stats:[{n:these.length,label:these.length===1?"night":"nights"},{n:t.shows.length,label:t.shows.length===1?"show":"shows"},{n:t.people.length,label:"performers seen"}],
    rows:these.slice().reverse().map(function(p){return {left:fmtDate(p.date,{month:"short",day:"numeric"}),right:p.showTitle,tag:""};})},"who-was-on-"+year+".png");
}

/* ---------- sign in ---------- */
function renderAccount(){
  var a=document.getElementById("account"); a.textContent="";
  if(S.user){a.appendChild(h("span",{class:"who",text:S.user.email}));
    if(S.signIn==="access") a.appendChild(h("a",{class:"linkish",href:"/cdn-cgi/access/logout",text:"Sign out"}));
    else a.appendChild(h("button",{type:"button",class:"linkish",text:"Sign out",onclick:async function(){
      try{await send("POST","/api/auth/logout");}catch(e){} S.user=null;S.diary=new Map();render();}}));}
  else if(S.signIn!=="access") a.appendChild(h("a",{href:"#/sign-in",class:"linkish",text:"Sign in"}));
}
function viewSignIn(){
  var A=S.auth,say=function(t){A.msg=t;var m=document.getElementById("auth-msg");if(m)m.textContent=t;};
  if(S.user) return [h("div",{class:"panel"},h("h2",{text:"You're signed in"}),h("p",{class:"muted",style:"margin:0",text:S.user.email}),
    h("div",null,h("a",{class:"btn primary",href:"#/add",text:"Add a night"})))];
  if(S.signIn==="access") return [h("div",{class:"note bad",text:"Your sign-in has expired. Reload the page to sign in again."})];
  if(A.step==="email") return [h("form",{class:"panel",style:"max-width:460px",onsubmit:async function(e){e.preventDefault();say("Sending…");
      try{var r=await send("POST","/api/auth/request",{email:A.email});A.step="code";A.msg=r.devCode?"Development mode: your code is "+r.devCode:"";render();}
      catch(err){say(err.message);}}},
    h("h2",{text:"Sign in"}),h("p",{class:"muted",style:"margin:0",text:"No password. We email you a six-digit code. New here? The same step creates your account."}),
    h("div",{class:"field"},h("label",{for:"a-email",text:"Email"}),
      h("input",{type:"text",inputmode:"email",autocomplete:"email",id:"a-email",value:A.email,oninput:function(e){A.email=e.target.value;}})),
    h("div",{class:"row",style:"align-items:center"},h("button",{type:"submit",class:"btn primary",text:"Email me a code"}),h("span",{class:"muted small",id:"auth-msg",role:"status",text:A.msg})))];
  var code="";
  return [h("form",{class:"panel",style:"max-width:460px",onsubmit:async function(e){e.preventDefault();say("Checking…");
      try{await send("POST","/api/auth/verify",{email:A.email,code:code});takeMe(await api("/api/me"));S.auth={email:"",step:"email",msg:""};
        if(S.form.showId) go("add"); else go(""); render();}
      catch(err){say(err.message);}}},
    h("h2",{text:"Enter your code"}),h("p",{class:"muted",style:"margin:0",text:"Sent to "+A.email+". It works for 10 minutes."}),
    h("div",{class:"field",style:"max-width:200px"},h("label",{for:"a-code",text:"Six-digit code"}),
      h("input",{type:"text",inputmode:"numeric",autocomplete:"one-time-code",id:"a-code",oninput:function(e){code=e.target.value;}})),
    h("div",{class:"row",style:"align-items:center"},h("button",{type:"submit",class:"btn primary",text:"Sign in"}),
      h("button",{type:"button",class:"btn ghost",text:"Use a different email",onclick:function(){A.step="email";A.msg="";render();}}),
      h("span",{class:"muted small",id:"auth-msg",role:"status",text:A.msg})))];
}

/* ---------- add a night ---------- */
function nearestNight(showId,date){
  var best=null,bd=Infinity,t=Date.parse(date);
  S.perfs.forEach(function(p){if(p.showId!==showId||!validDate(p.date)||!p.cast.length)return;var d=Math.abs(Date.parse(p.date)-t);if(d<bd){bd=d;best=p;}});
  return best?{p:best,days:Math.round(bd/86400000)}:null;
}
function loadCastForKey(){
  var f=S.form,show=S.shows.get(f.showId),p=(f.showId&&validDate(f.date))?S.perfs.get(perfKey(f.showId,f.date,f.slot)):null;
  if(p){f.theatre=p.theatre||"";f.location=p.location||"";f.cast=cleanCast(p.cast);f.origin="archive";}
  else if(show){
    f.theatre=show.theatre||"";f.location=show.location||"";
    var company=show.company||[],near=validDate(f.date)?nearestNight(f.showId,f.date):null;
    var fromOpening=show.opened&&validDate(f.date)?Math.abs(Date.parse(f.date)-Date.parse(show.opened))/86400000:Infinity;
    // The closest night anyone has logged is a better guess than opening night, unless opening night is closer.
    if(near&&(near.days<=fromOpening||!company.length)){
      // An understudy who went on that night probably wasn't on yours: put the usual performer back where one is known.
      f.cast=cleanCast(near.p.cast).map(function(r){
        if(r.status==="billed") return r;
        var usual=company.find(function(c){return same(c.role,r.role);});
        return usual?{role:r.role,performer:usual.performer,status:"billed"}:r;});
      f.origin="nearby";f.nearText=fmtDate(near.p.date,{month:"long",day:"numeric",year:"numeric"});
      if(near.p.theatre){f.theatre=near.p.theatre;f.location=near.p.location||f.location;}}
    else if(company.length){f.cast=cleanCast(company);f.origin=(show.opened&&show.opened===f.date)?"opening":"baseline";}
    else{f.cast=[];f.origin="blank";}}
  else{f.cast=[];f.origin="blank";}
  f.scanId=null;f.pages=0;f.dirty=false;
  f.theatreAuto=!!f.theatre;
  // A guessed cast is only a suggestion: it isn't saved unless the person chooses to use it.
  f.suggest=null;
  if(f.origin==="nearby"||f.origin==="baseline"||f.origin==="opening"){f.suggest={cast:f.cast,origin:f.origin};f.cast=[];f.origin="blank";}
}
/* Pull every logged night for the chosen show, so the starting cast can come from the closest one. */
function formEnsure(id){
  var key="show:"+String(id).toLowerCase(); if(!id||id==="__new"||S.fetched.has(key)) return; S.fetched.add(key);
  api("/api/performances?show="+encodeURIComponent(id)).then(function(r){
    r.performances.forEach(function(p){S.perfs.set(p.id,p);}); var f=S.form;
    if(route().kind==="add"&&f.showId===id&&!f.dirty&&!f.pages&&!f.cast.length&&f.origin!=="draft"){var th=f.theatre,lo=f.location;loadCastForKey();if(f.origin!=="nearby"&&f.origin!=="archive"){f.theatre=th;f.location=lo;}renderCastRows();}
  }).catch(function(){S.fetched.delete(key);});
}
function originText(){
  var f=S.form;
  if(f.scanId) return "Filled from your Playbill scan. Check every name before you save.";
  if(f.pages) return "Filled from what you scanned or pasted. Check every name before you save.";
  if(f.origin==="draft") return "Picked up from your unfinished night. Check it, then save.";
  if(f.origin==="archive") return "Someone already logged this performance. Fix anything that's wrong, or save as is.";
  if(f.origin==="opening") return "This is opening night, so the opening company is filled in.";
  if(f.origin==="suggested") return "Starting point only. Change anyone who was different on your night, or remove rows you're not sure of.";
  if(f.origin==="nearby") return "Starting point only: this is the cast logged for "+f.nearText+", the closest night on file. Change anyone who was different on your night.";
  if(f.origin==="baseline") return "Starting point only: this is the opening-night company. Change anyone who was different on your night.";
  return "Optional. The show and date are enough to save the night. Add the cast now, or come back to it.";
}
function renderCastRows(){
  var box=document.getElementById("castrows"); if(!box)return; box.textContent="";
  S.form.cast.forEach(function(r,i){
    var sel=h("select",{id:"c-status-"+i,"aria-label":"How they appeared",onchange:function(e){r.status=e.target.value;S.form.dirty=true;}});
    STATUSES.forEach(function(s){sel.appendChild(h("option",{value:s[0],text:s[1]}));}); sel.value=r.status;
    box.appendChild(h("div",{class:"castrow"},
      h("input",{type:"text",id:"c-role-"+i,value:r.role,placeholder:"Role","aria-label":"Role",oninput:function(e){r.role=e.target.value;S.form.dirty=true;}}),
      h("input",{type:"text",id:"c-perf-"+i,value:r.performer,placeholder:"Performer","aria-label":"Performer",oninput:function(e){r.performer=e.target.value;S.form.dirty=true;}}),
      sel,h("button",{class:"x",type:"button","aria-label":"Remove this row",text:"×",onclick:function(){S.form.cast.splice(i,1);S.form.dirty=true;renderCastRows();}})));
  });
  var o=document.getElementById("origin"); if(o) o.textContent=originText();
  var sg=document.getElementById("suggest"); if(sg){sg.textContent="";var su=S.form.suggest;
    if(su&&!S.form.cast.length){
      var names=su.cast.slice(0,4).map(function(r){return r.performer;}).join(", ")+(su.cast.length>4?" and "+(su.cast.length-4)+" more":"");
      var why=su.origin==="opening"?"This is opening night, so this is the opening company":su.origin==="nearby"?"From the closest night on file ("+S.form.nearText+")":"The opening-night company";
      sg.appendChild(h("div",{class:"scanbox"},h("div",{style:"flex:1 1 260px"},h("div",{style:"font-weight:700",text:"Suggested cast"}),h("div",{class:"muted small",text:why+": "+names+"."})),
        h("button",{type:"button",class:"btn small",text:"Use as a starting point",onclick:function(){S.form.cast=cleanCast(su.cast);S.form.origin=su.origin==="opening"?"opening":"suggested";renderCastRows();}})));}}
  [["f-theatre","theatre"],["f-location","location"]].forEach(function(x){var n=document.getElementById(x[0]); if(n&&document.activeElement!==n) n.value=S.form[x[1]];});
}
/* Type a show. Matches from the archive appear underneath; anything else is added as a new show. */
function resolveShow(txt){
  var f=S.form,t=String(txt||"").trim(),hit="";
  if(t) S.shows.forEach(function(v,k){if(norm(v.title)===norm(t))hit=k;});
  var next=hit||(t?"__new":""),changed=next!==f.showId||(next==="__new"&&f.newTitle!==t);
  f.showId=next; f.newTitle=hit?"":t;
  return changed;
}
function showMatches(txt){
  var t=norm(txt); if(!t) return [];
  return Array.from(S.shows.values()).filter(function(s){var n=norm(s.title);return n!==t&&(n.indexOf(t)===0||n.indexOf("-"+t)>=0);})
    .sort(function(a,b){return a.title.localeCompare(b.title);}).slice(0,6);
}
function showPicker(){
  var f=S.form,box=h("div",{class:"picker"}),list=h("div",{class:"matches",id:"show-matches"}),hint=h("div",{class:"muted small",id:"show-hint"});
  function choose(s){f.showText=s.title;f.showId=s.id;f.newTitle="";loadCastForKey();render();var d=document.getElementById("f-date");if(d&&!f.date)d.focus();}
  function paint(){
    list.textContent="";showMatches(f.showText).forEach(function(s){
      list.appendChild(h("button",{type:"button",class:"match",onpointerdown:function(e){e.preventDefault();choose(s);},onclick:function(){choose(s);}},tile(s.title),h("span",null,h("b",{text:s.title}),s.theatre?h("span",{class:"muted small",text:"  "+s.theatre}):null)));});
    var known=S.shows.get(f.showId);
    hint.textContent=known?"In the archive"+(known.theatre?" · "+known.theatre:""):f.showId==="__new"?"New to the archive. It will be added when you save.":"";
  }
  var input=h("input",{type:"text",id:"f-show",value:f.showText,autocomplete:"off",placeholder:"Start typing a show",
    oninput:function(e){f.showText=e.target.value;if(resolveShow(f.showText)){if(f.showId&&f.showId!=="__new")loadCastForKey();
        else{ // a different, unknown show: drop anything that was filled in from the previous one
          f.suggest=null;if(f.theatreAuto){f.theatre="";f.location="";f.theatreAuto=false;}if(!f.dirty&&!f.pages)f.cast=[];}
        renderCastRows();}paint();},
    onblur:function(e){if(e.relatedTarget&&e.relatedTarget.classList&&e.relatedTarget.classList.contains("match"))return;
      // Redraw a moment later, so a button being pressed right now still gets its click, and keep the cursor where it landed.
      setTimeout(function(){if(route().kind!=="add")return;var id=(document.activeElement||{}).id;if(id==="f-show")return;render();
        var n=id&&document.getElementById(id);if(n&&n!==document.activeElement)n.focus();},250);}});
  box.appendChild(input);box.appendChild(list);box.appendChild(hint);paint();
  return box;
}
function viewAdd(){
  var f=S.form,isNew=f.showId==="__new",rekey=function(){if(!isNew&&!f.dirty&&!f.pages&&f.origin!=="draft"&&(f.origin==="archive"||!f.cast.length)){loadCastForKey();renderCastRows();}};
  formEnsure(f.showId);
  if(!f.showText) f.showText=isNew?f.newTitle:(S.shows.get(f.showId)||{}).title||"";
  var sel=showPicker();

  var title=isNew?f.newTitle.trim():(S.shows.get(f.showId)||{}).title||"";
  var when=validDate(f.date)?fmtDate(f.date,{month:"long",year:"numeric"}):f.dateGuess.trim();
  var help=h("details",{class:"help",open:f.helpOpen,ontoggle:function(e){f.helpOpen=e.target.open;}},
    h("summary",{text:"No Playbill? Look it up, then paste the cast"}),
    h("div",{class:"helpbody"},title?lookItUp(title,when):h("div",{class:"muted small",text:"Type a show first and the research links appear here."}),
    h("div",{class:"field"},h("label",{for:"f-paste",text:"Paste a cast list you found"}),
      h("textarea",{id:"f-paste",rows:"4",placeholder:"Copy the cast from IBDB, Wikipedia or Playbill and paste it here",oninput:function(e){f.paste=e.target.value;}},f.paste)),
    h("div",{class:"row",style:"align-items:center"},
      h("button",{type:"button",class:"btn small",disabled:f.busy,text:f.busy?"Reading…":"Fill in from this text",onclick:runPaste}),
      h("span",{class:"muted small",role:"status",text:f.pasteMsg||"Looked-up casts stay marked Unconfirmed: they show who was scheduled, not who went on."}))));


  var panel=h("form",{class:"panel",novalidate:true,onsubmit:function(e){e.preventDefault();save();}},
    h("div",{class:"scanbox"},
      h("input",{type:"file",id:"f-scan",accept:"image/*",multiple:true,class:"hide",onchange:function(e){if(e.target.files&&e.target.files.length)runScan(Array.from(e.target.files));e.target.value="";}}),
      h("button",{type:"button",class:"btn primary",id:"scan-btn",disabled:f.busy,text:f.busy?"Reading this page…":f.pages?"Scan another page":"Scan a Playbill",onclick:function(){
        if(!S.user){f.scanMsg="Sign in first to scan a Playbill.";render();return;} document.getElementById("f-scan").click();}}),
      h("span",{class:"muted small",id:"scan-msg",style:"flex:1 1 240px",text:f.scanMsg||"Fastest way in: scan the cast list one page at a time, then the understudy slip. Each page adds to the list. A screenshot of a cast list works too. Photos are read once and not stored."})),
    h("div",{class:"row"},
      h("div",{class:"field",style:"flex:2 1 260px"},h("label",{for:"f-show",text:"Show"}),sel),
      h("div",{class:"field"},h("label",{for:"f-date",text:"Date you went"}),h("input",{type:"date",id:"f-date",value:f.date,onchange:function(e){f.date=e.target.value;rekey();render();}}),
        f.unsure?h("input",{type:"text",id:"f-guess",value:f.dateGuess,placeholder:"Roughly when? e.g. spring 2016","aria-label":"Roughly when",oninput:function(e){f.dateGuess=e.target.value;},onchange:function(){render();}})
          :h("button",{type:"button",class:"linkish small",style:"align-self:flex-start",text:"Don't know the date? Save it without one",onclick:function(){f.unsure=true;render();var n=document.getElementById("f-guess");if(n)n.focus();}})),
      h("div",{class:"field",style:"flex:0 0 auto"},h("span",{class:"lab",text:"Performance"}),
        h("div",{class:"seg"},
          h("input",{type:"radio",name:"slot",id:"f-mat",value:"mat",checked:f.slot==="mat",onchange:function(){f.slot="mat";rekey();}}),h("label",{for:"f-mat",text:"Matinee"}),
          h("input",{type:"radio",name:"slot",id:"f-eve",value:"eve",checked:f.slot==="eve",onchange:function(){f.slot="eve";rekey();}}),h("label",{for:"f-eve",text:"Evening"})))),
    h("div",{class:"row"},
      h("div",{class:"field"},h("label",{for:"f-theatre",text:"Theatre (optional)"}),h("input",{type:"text",id:"f-theatre",value:f.theatre,placeholder:"Leave blank if you don't remember",oninput:function(e){f.theatre=e.target.value;f.theatreAuto=false;}})),
      h("div",{class:"field"},h("label",{for:"f-location",text:"Location (optional)"}),h("input",{type:"text",id:"f-location",value:f.location,placeholder:"New York, NY",oninput:function(e){f.location=e.target.value;}}))),
    help,
    h("div",{class:"stack",style:"gap:8px"},h("h2",{text:"Who was on"}),h("div",{class:"muted small",id:"origin",text:originText()})),
    h("div",{id:"suggest"}),
    h("div",{class:"castgrid",id:"castrows"}),
    h("div",null,h("button",{type:"button",class:"btn small",text:"Add a role",onclick:function(){f.cast.push({role:"",performer:"",status:"billed"});f.dirty=true;renderCastRows();var n=document.getElementById("c-role-"+(f.cast.length-1));if(n)n.focus();}})),
    h("div",{class:"row"},
      h("div",{class:"field",style:"flex:0 1 160px"},h("label",{for:"f-seat",text:"Seat (optional)"}),h("input",{type:"text",id:"f-seat",value:f.seat,oninput:function(e){f.seat=e.target.value;}})),
      h("div",{class:"field",style:"flex:3 1 260px"},h("label",{for:"f-note",text:"Note to yourself (optional)"}),h("input",{type:"text",id:"f-note",value:f.note,oninput:function(e){f.note=e.target.value;}}))),
    h("div",{class:"row",style:"align-items:center"},
      h("button",{type:"submit",class:"btn primary",id:"save-btn",text:!S.user?"Sign in to save":f.unsure&&!validDate(f.date)?"I saw it. Save without a date":"I was there. Save it"}),
      S.user?h("button",{type:"button",class:"btn",id:"later-btn",text:"Save for later",title:"Keep what you have and finish it when you know more",onclick:saveLater}):null,
      h("span",{class:"muted small",id:"save-msg",role:"status",text:f.msg})));
  return [h("div",{class:"stack"},h("div",{class:"eyebrow",text:"Add a night"}),h("h1",{text:"Which performance did you see?"})),panel];
}
function shrink(file){return new Promise(function(resolve){
  var img=new Image(),url=URL.createObjectURL(file);
  img.onload=function(){var k=Math.min(1,1800/Math.max(img.width,img.height)),c=document.createElement("canvas");
    c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);c.getContext("2d").drawImage(img,0,0,c.width,c.height);
    URL.revokeObjectURL(url);c.toBlob(function(b){resolve(b||file);},"image/jpeg",0.85);};
  img.onerror=function(){URL.revokeObjectURL(url);resolve(file);};img.src=url;});}
async function runScan(files){
  var f=S.form; f.busy=true; f.scanMsg=""; render();
  try{
    var fd=new FormData(),blobs=await Promise.all(files.slice(0,4).map(shrink));
    blobs.forEach(function(b,i){fd.append("images",b,"page"+i+".jpg");});
    var out=await api("/api/scan",{method:"POST",body:fd});
    applyScan(out.result||{},out.scanId,"Page");
    if(out.result&&out.result.cast&&out.result.cast.length&&!out.result.printed) f.scanMsg+=" This looks like a screenshot, so the night stays marked Unconfirmed.";
  }catch(e){f.scanMsg=e.message;}
  f.busy=false; render();
}
/* Each scan is one page. The first page replaces a pre-filled starting cast; later pages add to what's there. */
async function runPaste(){
  var f=S.form; if(!S.user){f.pasteMsg="Sign in first to use this.";render();return;}
  if(f.paste.trim().length<10){f.pasteMsg="Paste the cast list first.";render();return;}
  f.busy=true; f.pasteMsg=""; render();
  try{
    var out=await send("POST","/api/parse",{text:f.paste,date:f.date,dateGuess:f.dateGuess});
    applyScan(out.result||{},null,"Pasted list"); f.pasteMsg=f.scanMsg; f.scanMsg=""; f.paste="";
  }catch(e){f.pasteMsg=e.message;}
  f.busy=false; render();
}
function applyScan(o,scanId,label){
  var f=S.form,cast=cleanCast(o.cast).filter(function(r){return r.role&&r.performer;}),title=String(o.show||"").trim();
  var first=f.pages===0;
  if(title&&(first||!f.showId)){var hit=null;S.shows.forEach(function(v,k){if(norm(v.title)===norm(title))hit=k;});
    if(hit){f.showId=hit;f.showText=S.shows.get(hit).title;f.theatre=S.shows.get(hit).theatre||"";f.location=S.shows.get(hit).location||"";}
    else{f.showId="__new";f.newTitle=title.slice(0,120);f.showText=f.newTitle;}}
  if(o.theatre&&(first||!f.theatre)) f.theatre=String(o.theatre).slice(0,120);
  if(o.location&&(first||!f.location)) f.location=String(o.location).slice(0,120);
  if(validDate(o.date)&&(first||!f.date)) f.date=o.date;
  if((o.slot==="mat"||o.slot==="eve")&&first) f.slot=o.slot;
  if(!cast.length){f.scanMsg="No cast was readable on that page. Try again straight-on, or scan the next page.";return;}
  var typed=f.cast.some(function(r){return r.role||r.performer;});
  if(first&&!f.dirty&&(f.origin==="baseline"||f.origin==="opening"||f.origin==="nearby"||!typed)) f.cast=[];
  var added=0,changed=0;
  cast.forEach(function(r){
    r.scanned=true;
    var i=f.cast.findIndex(function(x){return same(x.role,r.role);});
    if(i<0){f.cast.push(r);added++;return;}
    var old=f.cast[i];
    // A cast page scanned after the understudy slip must not undo the slip.
    if(old.scanned&&old.status!=="billed"&&r.status==="billed") return;
    if(!same(old.performer,r.performer)||old.status!==r.status) changed++;
    r.role=old.role; f.cast[i]=r;
  });
  f.pages++; if(scanId) f.scanId=scanId;
  f.scanMsg=(label==="Page"?"Page "+f.pages:label)+": "+plural(added,"role","roles")+" added"+(changed?", "+changed+" updated":"")+". "+plural(f.cast.length,"role","roles")+" so far. Scan the next page or the understudy slip, or save.";
}
async function save(){
  var f=S.form,msg=function(t){f.msg=t;var m=document.getElementById("save-msg");if(m)m.textContent=t;};
  if(!S.user){go("sign-in");return;}
  resolveShow(f.showText);
  if(!f.showId) return msg("Type the show first.");
  var dateEl=document.getElementById("f-date");
  if(dateEl&&dateEl.validity&&dateEl.validity.badInput) return msg("Finish the date: it needs the month, day and year. Not sure? Use “Not sure of the date?” and save for later.");
  if(!validDate(f.date)){
    if(f.unsure) return saveLater();
    f.unsure=true;render();return msg("No date yet? Press save again to keep the show without one, and pin the date later.");}
  var cast=cleanCast(f.cast).filter(function(r){return r.role&&r.performer;});
  var btn=document.getElementById("save-btn"); if(btn)btn.disabled=true; msg("Saving…");
  try{
    var r=await send("PUT","/api/performances",{showId:f.showId==="__new"?null:f.showId,newTitle:f.newTitle,theatre:f.theatre,location:f.location,
      date:f.date,slot:f.slot,cast:cast,scanId:f.scanId,seat:f.seat,note:f.note});
    S.perfs.set(r.performance.id,r.performance);
    if(r.attendance) S.diary.set(r.performance.id,r.attendance);
    if(!S.shows.has(r.performance.showId)){try{(await api("/api/shows")).shows.forEach(function(s){S.shows.set(s.id,s);});}catch(e){}}
    if(f.draftId){var did=f.draftId;S.drafts.delete(did);api("/api/drafts/"+did,{method:"DELETE"}).catch(function(){});}
    S.form=blankForm(); go("night/"+encodeURIComponent(r.performance.id));
  }catch(e){ if(btn)btn.disabled=false; if(e.status===401){S.user=null;go("sign-in");return;} msg(e.message); }
}
/* ---------- unfinished nights ---------- */
async function saveLater(){
  var f=S.form,msg=function(t){f.msg=t;var m=document.getElementById("save-msg");if(m)m.textContent=t;};
  resolveShow(f.showText);
  if(!f.showId) return msg("Type the show first. That's all an unfinished night needs.");
  var keepCast=true; // rows are only there if the person typed, scanned, pasted or accepted them
  try{
    var r=await send("PUT","/api/drafts",{id:f.draftId,showId:f.showId==="__new"?null:f.showId,showTitle:f.newTitle,theatre:f.theatre,location:f.location,
      date:f.date,dateGuess:f.dateGuess,slot:f.slot,cast:keepCast?cleanCast(f.cast):[],seat:f.seat,note:f.note});
    S.drafts.set(r.draft.id,r.draft); S.form=blankForm();
    if(r.draft.showId&&!S.shows.has(r.draft.showId)){try{(await api("/api/shows")).shows.forEach(function(v){S.shows.set(v.id,v);});}catch(e){}}
    banner(validDate(r.draft.date)?"Saved to finish later.":r.draft.showTitle+" is on your list. Pin the date whenever you find it.");
    go("draft/"+r.draft.id);
  }catch(e){ if(e.status===401){S.user=null;go("sign-in");return;} msg(e.message); }
}
function draftWhen(d){return validDate(d.date)?fmtDate(d.date,{month:"short",day:"numeric",year:"numeric"}):(d.dateGuess||"Date unknown");}
function draftNeeds(d){var n=[];if(!validDate(d.date))n.push("a date");if(!d.cast.length)n.push("a cast");return n.length?"Needs "+n.join(" and "):"Ready to finish";}
function draftsSection(){
  if(!S.drafts.size) return null;
  var box=h("div",{class:"stack"});
  var nodate=0;
  S.drafts.forEach(function(d){if(!validDate(d.date))nodate++;
    box.appendChild(stub("#/draft/"+d.id,d.showTitle,d.date,d.dateGuess,draftNeeds(d)+(d.theatre?" · "+d.theatre:""),validDate(d.date)?"Unfinished":(d.dateGuess||"Pin the date"),"draft"));});
  return section(nodate===S.drafts.size?"Needs a date":nodate?"Needs a date or a cast":"Needs finishing",box,h("span",{class:"muted small",text:"Only you can see these"}));
}
function lookItUp(title,when){
  var e=entity("show",title),q=function(t){return "https://duckduckgo.com/?q="+encodeURIComponent(t);},links=h("div",{class:"chips"});
  links.appendChild(e&&e.ibdb?out(e.ibdb,"IBDB: casts and replacements"):out(q('site:ibdb.com "'+title+'"'),"Find it on IBDB"));
  links.appendChild(e&&e.wikipedia?out(e.wikipedia,"Wikipedia"):out("https://en.wikipedia.org/w/index.php?search="+encodeURIComponent(title+" Broadway"),"Search Wikipedia"));
  links.appendChild(out(q('site:playbill.com "'+title+'" Broadway cast'),"Playbill"));
  links.appendChild(out(q('"'+title+'" Broadway cast '+(when||"")),"Web search"+(when?" for "+when:"")));
  return h("div",{class:"stack",style:"gap:10px"},links,
    h("ul",{class:"tips"},
      h("li",{text:"Not sure of the date? Search your email for the ticket confirmation (Telecharge, Ticketmaster, TodayTix, TKTS)."}),
      h("li",{text:"Check your photos from that trip, your calendar, or your card statement."}),
      h("li",{text:"Copy the cast list you find, come back, and paste it in. A screenshot works with Scan a Playbill."})));
}
function resumeDraft(d){
  S.form=Object.assign(blankForm(),{showId:d.showId||"__new",newTitle:d.showId?"":d.showTitle,date:d.date||"",dateGuess:d.dateGuess||"",unsure:!validDate(d.date)&&!!d.dateGuess,
    slot:d.slot,seat:d.seat||"",note:d.note||"",draftId:d.id,helpOpen:!d.cast.length});
  if(d.cast.length){S.form.cast=cleanCast(d.cast);S.form.origin="draft";S.form.dirty=true;S.form.theatre=d.theatre||"";S.form.location=d.location||"";}
  else{loadCastForKey();if(d.theatre)S.form.theatre=d.theatre;if(d.location)S.form.location=d.location;}
  go("add");
}
/* Turn "I saw it, not sure when" into a real night as soon as the date turns up. */
function pinDate(d){
  var show=d.showId?S.shows.get(d.showId):null,long={month:"long",day:"numeric",year:"numeric"};
  if(show) lookUpShow(d.showId,"");
  S.pin=S.pin||{}; var st=S.pin[d.id]||(S.pin[d.id]={date:"",slot:d.slot||"eve"});
  var run=show&&validDate(show.opened)?"Opening night was "+fmtDate(show.opened,long)+(validDate(show.closed)?" and it closed "+fmtDate(show.closed,long):"")+(show.theatre?", at "+show.theatre:"")+". Previews run a few weeks before opening.":
    "Once the show's run is known, its opening and closing dates appear here to narrow it down.";
  var keep=function(e){st.date=e.target.value;},msg=h("span",{class:"muted small",role:"status"});
  var input=h("input",{type:"date",id:"pin-date",value:st.date,"aria-label":"The date you went",style:"max-width:190px",max:show&&validDate(show.closed)?show.closed:null,oninput:keep,onchange:keep});
  var seg=h("div",{class:"seg"},
    h("input",{type:"radio",name:"pinslot",id:"pin-mat",checked:st.slot==="mat",onchange:function(){st.slot="mat";}}),h("label",{for:"pin-mat",text:"Matinee"}),
    h("input",{type:"radio",name:"pinslot",id:"pin-eve",checked:st.slot==="eve",onchange:function(){st.slot="eve";}}),h("label",{for:"pin-eve",text:"Evening"}));
  var btn=h("button",{type:"button",class:"btn primary small",text:"Pin the date",onclick:async function(){
    var val=input.value||st.date;
    if(!validDate(val)){msg.textContent="Pick the full date first: month, day and year.";return;}
    btn.disabled=true;msg.textContent="Saving…";
    try{
      var r=await send("PUT","/api/performances",{showId:d.showId||null,newTitle:d.showId?"":d.showTitle,theatre:d.theatre,location:d.location,date:val,slot:st.slot,
        cast:cleanCast(d.cast).filter(function(x){return x.role&&x.performer;}),seat:d.seat,note:d.note});
      S.perfs.set(r.performance.id,r.performance); if(r.attendance) S.diary.set(r.performance.id,r.attendance);
      S.drafts.delete(d.id);delete S.pin[d.id];api("/api/drafts/"+d.id,{method:"DELETE"}).catch(function(){});
      banner("Date pinned. It's a night now.");go("night/"+encodeURIComponent(r.performance.id));
    }catch(e){btn.disabled=false;if(e.status===401){S.user=null;go("sign-in");return;}msg.textContent=e.message;}}});
  return section("Pin the date",h("div",{class:"card stack"},h("div",{class:"context",text:run}),h("div",{class:"row",style:"align-items:center"},input,seg,btn,msg)));
}
function viewDraft(id){
  var d=S.drafts.get(id);
  if(!d) return [h("div",{class:"note",text:S.ready?"That unfinished night isn't here any more.":"Loading…"})];
  var when=validDate(d.date)?fmtDate(d.date,{month:"long",year:"numeric"}):d.dateGuess,parts=[
    showBanner(d.showTitle,(validDate(d.date)?"Unfinished night":"Seen, date still needed")+" · only you can see this",document.createTextNode(d.showTitle),
      h("div",{class:"meta",text:[validDate(d.date)?fmtDate(d.date)+" · "+slotName(d.slot):(d.dateGuess||"Date unknown"),d.theatre].filter(Boolean).join(" · ")})),
    h("div",{class:"row",style:"align-items:center"},h("span",{class:"chip warn",text:draftNeeds(d)}),
      h("button",{type:"button",class:"btn primary small",text:"Finish this night",onclick:function(){resumeDraft(d);}}),
      h("button",{type:"button",class:"btn small ghost",text:"Delete",onclick:async function(){
        try{await api("/api/drafts/"+d.id,{method:"DELETE"});S.drafts.delete(d.id);go("");}catch(e){banner(e.message,true);}}})),
    d.note?h("div",{class:"note",text:d.note}):null,
    validDate(d.date)?null:pinDate(d),
    section("Look it up",h("div",{class:"card"},lookItUp(d.showTitle,when)))];
  if(d.cast.length){var cast=h("div",{class:"card cast"});
    cleanCast(d.cast).forEach(function(r){cast.appendChild(h("div",{class:"castline"},avatar(r.performer),h("div",{class:"who"},linkPerformer(r.performer),h("div",{class:"role",text:r.role})),
      r.status!=="billed"?h("span",{class:"chip warn plain",text:statusName(r.status)}):null));});
    parts.push(section("Cast so far",cast));}
  return parts;
}
function editPerf(id){
  var p=S.perfs.get(id); if(!p)return; var d=S.diary.get(id)||{};
  S.form=Object.assign(blankForm(),{showId:p.showId,theatre:p.theatre||"",location:p.location||"",date:p.date,slot:p.slot,cast:cleanCast(p.cast),origin:"archive",seat:d.seat||"",note:d.note||""});
  go("add");
}

/* ---------- router ---------- */
function render(){
  var r=route(),nav={me:"me",archive:"archive",add:"add"}[r.kind];
  ["me","archive","add"].forEach(function(n){var a=document.getElementById("nav-"+n);if(n===nav)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current");});
  renderAccount();
  var parts=r.kind==="archive"?viewArchive():r.kind==="add"?viewAdd():r.kind==="sign-in"?viewSignIn():r.kind==="night"?viewNight(r.arg):
    r.kind==="draft"?viewDraft(r.arg):r.kind==="show"?viewShow(r.arg):r.kind==="performer"?viewPerformer(r.arg):r.kind==="theatre"?viewTheatre(r.arg):viewMe();
  var latest=S.user?allPerfs(function(p){return S.diary.has(p.id);})[0]:null;
  document.documentElement.style.setProperty("--glow",latest?showColor(latest.showTitle):"#FF7A59");
  $view.textContent=""; parts.forEach(function(n){if(n)$view.appendChild(n);});
  if(r.kind==="add") renderCastRows();
}
window.addEventListener("hashchange",function(){window.scrollTo(0,0);banner("");render();});
boot();
})();
