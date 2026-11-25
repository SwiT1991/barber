(function(){
"use strict";
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
// All dynamic text goes through textContent / createTextNode, so nothing typed by a visitor or an admin can become markup.
function h(tag,props,...kids){const e=document.createElement(tag);for(const k in (props||{})){const v=props[k];if(v==null||v===false)continue;if(k==="class")e.className=v;else if(k.slice(0,2)==="on")e.addEventListener(k.slice(2),v);else if(k==="value")e.value=v;else e.setAttribute(k,v===true?"":v);}kids.flat().forEach(c=>{if(c!=null&&c!==false)e.append(c.nodeType?c:document.createTextNode(String(c)));});return e;}
const fmt=n=>"₪"+Math.round(Number(n)||0).toLocaleString("he-IL");
const pad=n=>String(n).padStart(2,"0");
const ymd=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const addDays=n=>{const d=new Date();d.setDate(d.getDate()+n);return ymd(d);};
const today=()=>ymd(new Date());
const toMin=t=>{const p=String(t).split(":");return (+p[0])*60+(+p[1]||0);};
const heDate=s=>{const d=new Date(s+"T12:00");return isNaN(d)?s:d.toLocaleDateString("he-IL",{weekday:"short",day:"numeric",month:"numeric"});};
const PHONE=/^0\d{1,2}-?\d{7}$/;
async function api(path,opt){try{const r=await fetch(path,opt);let d=null;try{d=await r.json();}catch(e){}return {ok:r.ok,status:r.status,d:d||{}};}catch(e){return {ok:false,status:0,d:{}};}}

/* ---------- content: shown at once from these defaults, then replaced by what the admin saved ---------- */
let S={
  services:[
    {id:"cut",name:"תספורת גברים",desc:"כולל שטיפה ועיצוב",price:70,min:30},
    {id:"combo",name:"תספורת + זקן",desc:"החבילה המבוקשת",price:100,min:60},
    {id:"beard",name:"עיצוב זקן",desc:"קווים, אורך ושמן זקן",price:40,min:30},
    {id:"razor",name:"גילוח בתער",desc:"מגבת חמה וסכין חד־פעמית",price:60,min:30},
    {id:"kid",name:"תספורת ילדים",desc:"עד גיל 12",price:50,min:30},
    {id:"groom",name:"חבילת חתן",desc:"תספורת, זקן, גילוח וטיפוח פנים",price:250,min:90}
  ],
  site:{strip:"קובעים תור אונליין ונכנסים ישר לכיסא",sub:"מספרת גברים שכונתית: תספורות, עיצוב זקן וגילוח בתער. קובעים תור בדקה, מגיעים בזמן ויוצאים מסודרים.",phone:"050-0000000",addr:"הכתובת תתעדכן כאן",wkO:"09:00",wkC:"20:00",frO:"08:00",frC:"14:00",hide:{}},
  reviews:[]
};
const SECTIONS=["services","about","prices","faq"];
function openNow(){const n=new Date(),wd=n.getDay(),m=n.getHours()*60+n.getMinutes();if(wd===6)return false;const o=wd===5?[S.site.frO,S.site.frC]:[S.site.wkO,S.site.wkC];return m>=toMin(o[0])&&m<toMin(o[1]);}
function applySite(){
  const st=S.site;
  $("#strip-t").textContent=st.strip;$("#hero-sub").textContent=st.sub;$("#addr-t").textContent=st.addr;
  $("#hours-t").textContent="ראשון עד חמישי "+st.wkO+" עד "+st.wkC+" · שישי "+st.frO+" עד "+st.frC+" · שבת סגור";
  $$("[data-phone]").forEach(a=>{a.textContent=st.phone;a.href="tel:"+st.phone.replace(/\D/g,"");});
  $("#hours-dl").replaceChildren(...[["ראשון עד חמישי",st.wkO+" עד "+st.wkC],["שישי",st.frO+" עד "+st.frC],["שבת","סגור"]].map(([a,b])=>h("div",null,h("dt",null,a),h("dd",null,b))));
  const o=openNow();$("#open-chip").classList.toggle("closed",!o);$("#open-t").textContent=o?"פתוח עכשיו":"סגור עכשיו, אפשר לקבוע תור באתר";
  SECTIONS.forEach(id=>{const off=!!(st.hide&&st.hide[id]);$("#"+id).hidden=off;$$('#main-nav a[href="#'+id+'"]').forEach(a=>a.hidden=off);});
}
function renderMenu(){
  $("#menu").replaceChildren(...S.services.map(s=>h("div",{class:"mi"},
    h("div",{class:"top"},h("h3",null,s.name),h("span",{class:"dots","aria-hidden":"true"}),h("span",{class:"pr"},fmt(s.price))),
    h("p",null,(s.desc?s.desc+" · ":"")+"כ־"+s.min+" דקות"),
    h("a",{class:"btn btn-ghost btn-sm",href:"#book","aria-label":"קביעת תור ל"+s.name,onclick:()=>{$("#b-svc").value=s.id;pickTime=null;loadSlots();}},"לקביעת תור"))));
  const sel=$("#b-svc"),cur=sel.value;
  sel.replaceChildren(...S.services.map(s=>h("option",{value:s.id},s.name+" · "+fmt(s.price))));
  if(S.services.some(s=>s.id===cur))sel.value=cur;
}
function renderReviews(){
  $("#reviews").hidden=!S.reviews.length;
  $("#rev-grid").replaceChildren(...S.reviews.map(r=>h("article",{class:"card rev"},h("blockquote",null,"״"+r.text+"״"),h("footer",null,h("b",null,r.name),r.biz&&h("span",null,r.biz)))));
}

/* ---------- booking: free slots come from the server, and the server checks again when the appointment is sent ---------- */
let pickTime=null,slots=[],slotState="loading",seq=0;
const curSvc=()=>S.services.find(s=>s.id===$("#b-svc").value)||S.services[0];
async function loadSlots(){
  const d=$("#b-date").value,svc=curSvc(),my=++seq,box=$("#slots");
  if(!svc||!d){slots=[];slotState="empty";drawSlots();return false;}
  box.setAttribute("aria-busy","true");
  const r=await api("/api/slots?date="+encodeURIComponent(d)+"&min="+svc.min);
  if(my!==seq)return false;
  box.removeAttribute("aria-busy");
  slots=r.ok&&Array.isArray(r.d.slots)?r.d.slots:[];
  slotState=!r.ok?"error":r.d.closed?"closed":"ok";
  drawSlots();
  return slots.some(x=>x.free);
}
function drawSlots(){
  const d=$("#b-date").value,svc=curSvc(),msg=$("#slots-msg");
  if(pickTime&&!slots.some(x=>x.t===pickTime&&x.free))pickTime=null;
  $("#slots").replaceChildren(...slots.map(x=>h("button",{type:"button",class:"slot",disabled:!x.free,"aria-pressed":String(pickTime===x.t),"aria-label":x.t+(x.free?"":" תפוס"),onclick:()=>{pickTime=x.t;drawSlots();}},x.t)));
  msg.hidden=slots.some(x=>x.free);
  if(!msg.hidden)msg.textContent=slotState==="error"?"לא הצלחנו לטעון את השעות הפנויות. אפשר לרענן את העמוד או להתקשר אלינו.":slotState==="closed"?"המספרה סגורה ביום הזה. נא לבחור תאריך אחר.":"אין שעות פנויות ביום הזה. נא לבחור תאריך אחר.";
  $("#b-sum").textContent=pickTime&&svc?svc.name+" · "+heDate(d)+" בשעה "+pickTime+" · "+fmt(svc.price)+" · כ־"+svc.min+" דקות":"עוד לא נבחרה שעה.";
}
// Opens on the first day in the coming week that still has a free slot.
async function initDate(){const i=$("#b-date");i.min=today();i.max=addDays(30);for(let d=0;d<7;d++){i.value=addDays(d);if(await loadSlots())return;if(slotState==="error")return;}i.value=today();loadSlots();}
$("#b-date").addEventListener("change",()=>{pickTime=null;loadSlots();});
$("#b-svc").addEventListener("change",()=>{loadSlots();});
let sending=false;
$("#book-form").addEventListener("submit",async e=>{
  e.preventDefault();
  if(sending)return;
  const name=$("#b-name").value.trim(),phone=$("#b-phone").value.trim(),err=$("#b-err"),d=$("#b-date").value,svc=curSvc(),done=$("#b-done"),btn=e.target.querySelector("[type=submit]");
  done.hidden=true;
  if(!svc||!d||d<today()||d>addDays(30)){err.textContent="נא לבחור תאריך בחודש הקרוב.";$("#b-date").focus();return;}
  if(!pickTime){err.textContent="נא לבחור שעה פנויה.";return;}
  if(name.length<2){err.textContent="נא למלא שם מלא.";$("#b-name").focus();return;}
  if(!PHONE.test(phone)){err.textContent="מספר הטלפון לא תקין. דוגמה: 050-1234567";$("#b-phone").focus();return;}
  if(!$("#b-ok").checked){err.textContent="צריך לאשר שניצור איתך קשר בנוגע לתור.";$("#b-ok").focus();return;}
  err.textContent="";sending=true;btn.disabled=true;
  const t=pickTime;
  const r=await api("/api/book",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({svc:svc.id,date:d,time:t,name,phone,note:$("#b-note").value.trim(),consent:true,web:$("#b-web").value})});
  sending=false;btn.disabled=false;
  if(r.ok){
    $("#b-name").value="";$("#b-phone").value="";$("#b-note").value="";$("#b-ok").checked=false;pickTime=null;loadSlots();
    done.hidden=false;done.textContent="תודה, "+name+". התור ל"+heDate(d)+" בשעה "+t+" התקבל. ניצור איתך קשר אם יהיה שינוי.";
    return;
  }
  if(r.status===409){pickTime=null;await loadSlots();err.textContent="השעה הזאת נתפסה בינתיים. נא לבחור שעה אחרת.";return;}
  err.textContent=r.status===429?"נשלחו יותר מדי בקשות. נא לנסות שוב בעוד כמה דקות.":r.status===422?"אחד הפרטים לא תקין. נא לבדוק ולנסות שוב.":"לא הצלחנו לקבוע את התור. אפשר לנסות שוב או להתקשר אלינו.";
});

/* ---------- accessibility statement view ---------- */
function route(){const n=location.hash==="#negishut";$("#statement").hidden=!n;$("#site").hidden=n;if(n)scrollTo(0,0);if(location.hash==="#top")$("#top").focus({preventScroll:true});}

/* ---------- accessibility menu ---------- */
const AK="tomer-barbershop-a11y",SIZES=[100,115,130,150];let A={size:0,contrast:false,links:false,font:false,still:false};
try{Object.assign(A,JSON.parse(localStorage.getItem(AK)||"{}"));}catch(e){}
function applyA(){const r=document.documentElement;r.style.fontSize=SIZES[A.size]?SIZES[A.size]+"%":"";$("#a-size-v").textContent=(SIZES[A.size]||100)+"%";
  ["contrast","links","font","still"].forEach(k=>{r.classList.toggle("a11y-"+k,!!A[k]);$('[data-a="'+k+'"]').setAttribute("aria-pressed",String(!!A[k]));});
  try{localStorage.setItem(AK,JSON.stringify(A));}catch(e){}}
function toggleA(open){const p=$("#a11y-panel"),b=$("#a11y-btn");p.hidden=!open;b.setAttribute("aria-expanded",String(open));if(open)$("#a-size").focus();else b.focus();}
$("#a11y-btn").addEventListener("click",()=>toggleA($("#a11y-panel").hidden));
$("#a-size").addEventListener("click",()=>{A.size=(A.size+1)%SIZES.length;applyA();});
$$("[data-a]").forEach(b=>b.addEventListener("click",()=>{A[b.dataset.a]=!A[b.dataset.a];applyA();}));
$("#a-reset").addEventListener("click",()=>{A={size:0,contrast:false,links:false,font:false,still:false};applyA();});
$("#a11y-panel a").addEventListener("click",()=>{$("#a11y-panel").hidden=true;$("#a11y-btn").setAttribute("aria-expanded","false");});
addEventListener("keydown",e=>{if(e.key!=="Escape")return;if(!$("#a11y-panel").hidden)toggleA(false);else if($("#main-nav").classList.contains("open"))menu(false,true);});
function menu(open,focus){$("#main-nav").classList.toggle("open",open);$("#menu-btn").setAttribute("aria-expanded",String(open));if(focus)$("#menu-btn").focus();}
$("#menu-btn").addEventListener("click",()=>menu(!$("#main-nav").classList.contains("open")));
$$("#main-nav a").forEach(a=>a.addEventListener("click",()=>menu(false)));

/* ---------- start ---------- */
$("#yr").textContent=new Date().getFullYear();
applyA();applySite();renderMenu();renderReviews();
addEventListener("hashchange",route);route();
(async()=>{
  const r=await api("/api/site");
  if(r.ok&&Array.isArray(r.d.services)&&r.d.services.length&&r.d.site){S={services:r.d.services,site:r.d.site,reviews:Array.isArray(r.d.reviews)?r.d.reviews:[]};applySite();renderMenu();renderReviews();}
  initDate();
})();
})();
