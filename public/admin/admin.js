(function(){
"use strict";
const $=(s,r=document)=>r.querySelector(s);
// All dynamic text goes through textContent / createTextNode, so customer input can never become markup.
function h(tag,props,...kids){const e=document.createElement(tag);for(const k in (props||{})){const v=props[k];if(v==null||v===false)continue;if(k==="class")e.className=v;else if(k.slice(0,2)==="on")e.addEventListener(k.slice(2),v);else if(k==="value")e.value=v;else e.setAttribute(k,v===true?"":v);}kids.flat().forEach(c=>{if(c!=null&&c!==false)e.append(c.nodeType?c:document.createTextNode(String(c)));});return e;}
const fmt=n=>"₪"+Math.round(Number(n)||0).toLocaleString("he-IL");
const pad=n=>String(n).padStart(2,"0");
const ymd=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const today=()=>ymd(new Date());
const toMin=t=>{const p=String(t).split(":");return (+p[0])*60+(+p[1]||0);};
const heDate=s=>{const d=new Date(s+"T12:00");return isNaN(d)?s:d.toLocaleDateString("he-IL",{weekday:"short",day:"numeric",month:"numeric"});};
const PHONE=/^0\d{1,2}-?\d{7}$/, TIME=/^([01]\d|2[0-3]):[0-5]\d$/;
const STATUS={new:"ממתין לאישור",ok:"מאושר",chair:"בכיסא",done:"הסתיים",no:"לא הגיע",cancel:"בוטל"};
const FLOW=["new","ok","chair","done"];
const METHODS=["מזומן","ביט","אשראי"];
const SECTIONS=[["services","שירותים"],["about","על המספרה"],["prices","מחירון"],["faq","שאלות נפוצות"]];
const TABS=[["dash","לוח בקרה"],["appts","תורים"],["board","לוח היום"],["clients","לקוחות ותשלומים"],["prices","שירותים ומחירים"],["revs","המלצות"],["site","ניהול האתר"],["sec","אבטחה"]];

let A=[],S=null,LOG=[],tab="dash",q="",boardDate=today();
async function api(path,opt){try{const r=await fetch(path,opt);let d=null;try{d=await r.json();}catch(e){}return {ok:r.ok,status:r.status,d:d||{}};}catch(e){return {ok:false,status:0,d:{}};}}
const post=(path,body)=>api(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
let toastT;function toast(t){const e=$("#toast");e.textContent=t;e.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{e.hidden=true;},3200);}

/* ---------- sign-in ---------- */
function showLogin(msg){$("#app").hidden=true;$("#login").hidden=false;$("#lg-err").textContent=msg||"";$("#lg-pw").focus();}
$("#lg-form").addEventListener("submit",async e=>{
  e.preventDefault();
  const pw=$("#lg-pw").value,err=$("#lg-err");
  if(!pw){err.textContent="נא להקליד את סיסמת המנהל.";return;}
  const r=await post("/api/admin/login",{password:pw});
  $("#lg-pw").value="";
  if(r.ok){err.textContent="";load();return;}
  err.textContent=r.status===429?"יותר מדי ניסיונות כושלים. הכניסה נעולה ל־15 דקות.":r.status===401?"הסיסמה שגויה.":r.status===503?"מערכת הניהול עוד לא הוגדרה: חסרים סיסמת מנהל או מסד נתונים ב־Cloudflare.":"הכניסה נכשלה. נסו שוב.";
});
$("#logout").addEventListener("click",async()=>{await post("/api/admin/logout",{});showLogin();});

/* ---------- data ---------- */
async function load(){
  const r=await api("/api/admin/data");
  if(r.status===401)return showLogin();
  if(r.status===503)return showLogin("מערכת הניהול עוד לא הוגדרה: חסרים סיסמת מנהל או מסד נתונים ב־Cloudflare.");
  if(!r.ok)return showLogin("לא הצלחנו לטעון את הנתונים. נסו לרענן את העמוד.");
  A=r.d.appts.map(a=>Object.assign({},a,{paid:a.paid_amount!=null?{amount:a.paid_amount,method:a.paid_method,date:a.paid_date||""}:null}));
  S=r.d.settings;LOG=r.d.log||[];
  $("#login").hidden=true;$("#app").hidden=false;render();
}
// Sends one change to the server, then reloads everything so the screen always shows what is really saved.
async function act(body,okMsg){
  const r=await post("/api/admin/act",body);
  if(r.status===401){showLogin("פג תוקף הכניסה. נא להיכנס שוב.");return false;}
  if(!r.ok){toast(r.status===422?"הנתונים לא תקינים, ולכן לא נשמרו.":r.status===404?"הרשומה כבר לא קיימת.":"הפעולה נכשלה. נסו שוב.");if(r.status===404)load();return false;}
  await load();if(okMsg)toast(okMsg);return true;
}
const saveSettings=(what,okMsg)=>act({op:"settings",settings:S,what},okMsg||"נשמר ועודכן באתר.");
const setStatus=(a,st)=>act({op:"apptStatus",id:a.id,status:st});

/* ---------- shared pieces ---------- */
const VIEWS={};
function render(){
  $("#tabs").replaceChildren(...TABS.map(([id,name])=>h("button",{role:"tab",type:"button","aria-selected":String(tab===id),onclick:()=>{tab=id;render();}},name+(id==="appts"?" ("+A.filter(a=>a.status==="new").length+")":""))));
  $("#view").replaceChildren(VIEWS[tab]());
}
const active=a=>a.status!=="cancel"&&a.status!=="no";
const byTime=(a,b)=>(a.date+a.time).localeCompare(b.date+b.time);
function armBtn(label,fn){const b=h("button",{class:"mini del",type:"button"},label);let armed=false,t;b.addEventListener("click",()=>{if(armed){clearTimeout(t);fn();return;}armed=true;b.textContent="ללחוץ שוב לאישור";t=setTimeout(()=>{armed=false;b.textContent=label;},3000);});return b;}
const tiles=list=>h("div",{class:"tiles"},list.map(([a,b])=>h("div",{class:"tile"},h("span",null,a),h("strong",null,b))));

VIEWS.dash=function(){
  const t=today(),mon=t.slice(0,7);
  const todays=A.filter(a=>a.date===t&&active(a)).sort(byTime);
  const colors={new:"var(--info)",ok:"var(--warn)",chair:"var(--brass)",done:"var(--good)",no:"#8b8478",cancel:"#b8b0a2"};
  const max=Math.max(1,...Object.keys(STATUS).map(k=>A.filter(a=>a.status===k).length));
  return h("div",null,
    tiles([["תורים היום",todays.length],["ממתינים לאישור",A.filter(a=>a.status==="new").length],["הכנסות החודש",fmt(A.reduce((s,a)=>s+(a.paid&&a.paid.date.slice(0,7)===mon?a.paid.amount:0),0))],["ממתין לתשלום",fmt(A.reduce((s,a)=>s+(a.status==="done"&&!a.paid?a.price:0),0))]]),
    h("div",{class:"sec2"},
      h("div",{class:"box"},h("h3",null,"התורים של היום"),todays.length?h("ul",{class:"log"},todays.map(a=>h("li",null,h("time",null,a.time),h("span",null,a.name+" · "+a.svc),h("span",{class:"pill "+(a.status==="done"?"on":"plan"),style:"margin:0"},STATUS[a.status])))):h("p",{class:"empty"},"אין תורים להיום.")),
      h("div",{class:"box"},h("h3",null,"תורים לפי סטטוס"),h("div",{class:"bars"},Object.keys(STATUS).map(k=>{const n=A.filter(a=>a.status===k).length;return h("div",{class:"bar-row"},h("span",null,STATUS[k]),h("div",null,h("i",{style:"width:"+(n/max*100)+"%;background:"+colors[k]})),h("b",null,n));})))));
};
VIEWS.appts=function(){
  const rows=A.filter(a=>!q||(a.name+a.phone+a.svc).includes(q)).sort((a,b)=>byTime(b,a));
  return h("div",{class:"box"},
    h("div",{class:"toolbar"},h("input",{id:"ap-q",type:"search",placeholder:"חיפוש לפי שם, טלפון או שירות",value:q,"aria-label":"חיפוש תורים",oninput:e=>{q=e.target.value.trim();const pos=e.target.selectionStart;render();const n=$("#ap-q");n.focus();try{n.setSelectionRange(pos,pos);}catch(x){}}})),
    rows.length?h("div",{class:"tbl"},h("table",null,
      h("thead",null,h("tr",null,["תאריך","שעה","לקוח","טלפון","שירות","מחיר","סטטוס","פעולות"].map(t=>h("th",{scope:"col"},t)))),
      h("tbody",null,rows.map(a=>{
        const sel=h("select",{id:"st-"+a.id,class:"s-"+a.status,"aria-label":"סטטוס התור של "+a.name,onchange:e=>setStatus(a,e.target.value)},Object.keys(STATUS).map(k=>h("option",{value:k},STATUS[k])));sel.value=a.status;
        return h("tr",null,h("td",{class:"num"},heDate(a.date)),h("td",{class:"num"},a.time),h("td",null,h("b",null,a.name),a.note&&h("small",{style:"display:block;color:var(--muted)"},a.note)),h("td",{class:"num"},h("a",{class:"ltr",href:"tel:"+a.phone.replace(/\D/g,"")},a.phone)),h("td",null,a.svc),h("td",{class:"num"},fmt(a.price)),h("td",null,sel),
          h("td",null,h("div",{class:"acts"},a.status==="new"&&h("button",{class:"mini",type:"button",onclick:()=>setStatus(a,"ok")},"אישור התור"),armBtn("מחיקה",()=>act({op:"apptDelete",id:a.id},"התור נמחק.")))));
      })))):h("p",{class:"empty"},q?"לא נמצאו תורים שמתאימים לחיפוש.":"עדיין אין תורים. תור שייקבע באתר יופיע כאן."));
};
VIEWS.board=function(){
  const day=A.filter(a=>a.date===boardDate).sort(byTime),cols=["new","ok","chair","done","no"];
  return h("div",{class:"box"},h("h3",null,"לוח היום"),
    h("div",{class:"toolbar"},h("div",{class:"f",style:"margin:0"},h("label",{for:"bd-date"},"תאריך"),h("input",{id:"bd-date",type:"date",value:boardDate,onchange:e=>{boardDate=e.target.value||today();render();}})),h("button",{class:"mini",type:"button",onclick:()=>{boardDate=today();render();}},"היום")),
    h("div",{class:"kan"},cols.map(st=>{const list=day.filter(a=>a.status===st),i=FLOW.indexOf(st);
      return h("div",{class:"col"},h("h4",null,STATUS[st],h("span",null,list.length)),list.map(a=>h("div",{class:"pj"},h("b",null,a.time+" · "+a.name),h("small",null,a.svc+" · "+fmt(a.price)),h("div",{class:"acts"},
        i>0&&h("button",{class:"mini",type:"button","aria-label":"החזרת "+a.name+" ל"+STATUS[FLOW[i-1]],onclick:()=>setStatus(a,FLOW[i-1])},"→ חזרה"),
        i>=0&&i<3&&h("button",{class:"mini",type:"button","aria-label":"העברת "+a.name+" ל"+STATUS[FLOW[i+1]],onclick:()=>setStatus(a,FLOW[i+1])},STATUS[FLOW[i+1]]+" ←"),
        st==="ok"&&h("button",{class:"mini del",type:"button",onclick:()=>setStatus(a,"no")},"לא הגיע"),
        st==="no"&&h("button",{class:"mini",type:"button",onclick:()=>setStatus(a,"ok")},"החזרה למאושר")))));
    })),
    !day.length&&h("p",{class:"empty"},"אין תורים בתאריך הזה."));
};
VIEWS.clients=function(){
  const unpaid=A.filter(a=>a.status==="done"&&!a.paid).sort(byTime),map=new Map();
  A.forEach(a=>{const c=map.get(a.phone)||{name:a.name,phone:a.phone,visits:0,paid:0,last:"",next:""};
    if(a.status==="done"){c.visits++;if(a.date>c.last)c.last=a.date;}if(a.paid)c.paid+=a.paid.amount;
    if(active(a)&&a.status!=="done"&&a.date>=today()&&(!c.next||a.date+a.time<c.next))c.next=a.date+a.time;map.set(a.phone,c);});
  const C=[...map.values()].sort((a,b)=>b.paid-a.paid);
  return h("div",null,
    tiles([["לקוחות",C.length],["ביקורים שהסתיימו",A.filter(a=>a.status==="done").length],["שולם עד היום",fmt(A.reduce((s,a)=>s+(a.paid?a.paid.amount:0),0))],["ממתין לתשלום",fmt(unpaid.reduce((s,a)=>s+a.price,0))]]),
    h("div",{class:"box"},h("h3",null,"תורים שהסתיימו וממתינים לתשלום"),unpaid.length?h("div",{class:"tbl"},h("table",null,
      h("thead",null,h("tr",null,["תאריך","לקוח","שירות","מחיר","רישום תשלום"].map(t=>h("th",{scope:"col"},t)))),
      h("tbody",null,unpaid.map(a=>{
        const amt=h("input",{id:"pay-"+a.id,type:"number",min:1,max:5000,value:a.price,"aria-label":"סכום ששילם "+a.name});
        const how=h("select",{id:"how-"+a.id,"aria-label":"אמצעי התשלום של "+a.name},METHODS.map(n=>h("option",{value:n},n)));
        return h("tr",null,h("td",{class:"num"},heDate(a.date)+" "+a.time),h("td",null,h("b",null,a.name)),h("td",null,a.svc),h("td",{class:"num"},fmt(a.price)),
          h("td",null,h("div",{class:"payf"},amt,how,h("button",{class:"mini",type:"button",onclick:()=>{const v=Math.round(+amt.value);if(!(v>0)||v>5000){amt.focus();amt.style.borderColor="var(--bad)";return;}
            act({op:"apptPay",id:a.id,amount:v,method:how.value},"התשלום נרשם.");}},"רישום"))));
      })))):h("p",{class:"empty"},"אין תשלומים פתוחים.")),
    h("div",{class:"box"},h("h3",null,"לקוחות"),C.length?h("div",{class:"tbl"},h("table",null,
      h("thead",null,h("tr",null,["לקוח","טלפון","ביקורים","ביקור אחרון","התור הבא","שולם סך הכול"].map(t=>h("th",{scope:"col"},t)))),
      h("tbody",null,C.map(c=>h("tr",null,h("td",null,h("b",null,c.name)),h("td",{class:"num"},h("a",{class:"ltr",href:"tel:"+c.phone.replace(/\D/g,"")},c.phone)),h("td",{class:"num"},c.visits),h("td",{class:"num"},c.last?heDate(c.last):"—"),h("td",{class:"num"},c.next?heDate(c.next.slice(0,10))+" "+c.next.slice(10):"—"),h("td",{class:"num"},fmt(c.paid))))))):h("p",{class:"empty"},"עדיין אין לקוחות. הם יופיעו כאן אחרי התור הראשון.")),
    h("p",{class:"empty",style:"padding-top:0"},"כאן רושמים תשלומים שהתקבלו במספרה. האתר לא מחייב כרטיסי אשראי."));
};
VIEWS.prices=function(){
  const f=(id,label,val,type,max,step)=>h("div",{class:"f"},h("label",{for:id},label),h("input",{id,type:type||"text",value:val,maxlength:60,min:type==="number"?0:null,max:max||null,step:step||null}));
  const card=s=>{const msg=h("span",{class:"err",role:"alert"});
    return h("form",{class:"box",onsubmit:e=>{e.preventDefault();const name=$("#sn-"+s.id).value.trim(),price=+$("#sp-"+s.id).value,min=+$("#sm-"+s.id).value;
        if(!name||!(price>=0)||price>5000||!(min>=30)||min>240||min%30){msg.textContent="נא להזין שם, מחיר עד 5,000 ומשך בכפולות של 30 דקות.";return;}
        s.name=name.slice(0,60);s.desc=$("#sd-"+s.id).value.trim().slice(0,60);s.price=Math.round(price);s.min=min;saveSettings("השירות "+s.name);}},
      h("h3",null,s.name),f("sn-"+s.id,"שם השירות",s.name),f("sd-"+s.id,"תיאור קצר",s.desc),f("sp-"+s.id,"מחיר (₪, כולל מע״מ)",s.price,"number",5000),f("sm-"+s.id,"משך בדקות (30, 60, 90...)",s.min,"number",240,30),
      h("div",{class:"acts"},h("button",{class:"btn btn-main btn-sm",type:"submit"},"שמירה"),S.services.length>1&&armBtn("מחיקת השירות",()=>{S.services=S.services.filter(x=>x!==s);saveSettings("נמחק השירות "+s.name,"השירות נמחק.");}))," ",msg);};
  return h("div",null,h("p",{class:"empty",style:"padding-top:0"},"שינוי כאן מעדכן את המחירון ואת טופס קביעת התור באתר תוך כדקה. תורים שכבר נקבעו שומרים את המחיר המקורי."),
    h("div",{class:"ed"},S.services.map(card)),
    S.services.length<12&&h("button",{class:"btn btn-ghost btn-sm",type:"button",onclick:()=>{S.services.push({id:"s"+Date.now().toString(36),name:"שירות חדש",desc:"",price:50,min:30});saveSettings("נוסף שירות חדש","השירות נוסף. אפשר לערוך אותו עכשיו.");}},"הוספת שירות"));
};
VIEWS.revs=function(){
  const msg=h("p",{class:"err",role:"alert"});
  const form=h("form",{class:"box",onsubmit:e=>{e.preventDefault();const name=$("#rv-name").value.trim(),biz=$("#rv-biz").value.trim(),text=$("#rv-text").value.trim();
      if(name.length<2||text.length<10){msg.textContent="נא למלא שם לקוח והמלצה של 10 תווים לפחות.";return;}
      if(!$("#rv-ok").checked){msg.textContent="צריך לאשר שההמלצה אמיתית ושהלקוח הסכים לפרסום.";return;}
      if(S.reviews.length>=12){msg.textContent="אפשר להציג עד 12 המלצות. נא למחוק אחת לפני שמוסיפים.";return;}
      S.reviews.push({id:"r"+Date.now().toString(36),name:name.slice(0,60),biz:biz.slice(0,60),text:text.slice(0,400)});saveSettings("נוספה המלצה מאת "+name,"ההמלצה פורסמה באתר.");}},
    h("h3",null,"הוספת המלצה"),
    h("div",{class:"ed",style:"grid-template-columns:1fr 1fr"},h("div",{class:"f"},h("label",{for:"rv-name"},"שם הלקוח"),h("input",{id:"rv-name",maxlength:60})),h("div",{class:"f"},h("label",{for:"rv-biz"},"פרט נוסף, למשל ״לקוח קבוע״ (לא חובה)"),h("input",{id:"rv-biz",maxlength:60}))),
    h("div",{class:"f"},h("label",{for:"rv-text"},"מה הלקוח כתב"),h("textarea",{id:"rv-text",rows:3,maxlength:400})),
    h("label",{class:"chk",style:"margin-bottom:10px"},h("input",{type:"checkbox",id:"rv-ok"}),"זו המלצה אמיתית, והלקוח אישר לפרסם אותה"),
    msg,h("button",{class:"btn btn-main btn-sm",type:"submit"},"פרסום באתר"));
  const list=h("div",{class:"box"},h("h3",null,"המלצות שמופיעות באתר"),S.reviews.length?h("ul",{class:"log",style:"max-height:none"},S.reviews.map(r=>h("li",{style:"justify-content:space-between"},h("span",null,h("b",null,r.name+(r.biz?" · "+r.biz:"")),h("br"),r.text),armBtn("מחיקה",()=>{S.reviews=S.reviews.filter(x=>x!==r);saveSettings("נמחקה המלצה מאת "+r.name,"ההמלצה נמחקה.");})))):h("p",{class:"empty"},"עדיין אין המלצות. החלק ״לקוחות מספרים״ יופיע באתר אחרי שתתווסף ההמלצה הראשונה."));
  return h("div",null,form,list);
};
VIEWS.site=function(){
  const st=S.site,msg=h("span",{class:"err",role:"alert"});
  const strip=h("textarea",{id:"st-strip",rows:2,maxlength:90});strip.value=st.strip;
  const sub=h("textarea",{id:"st-sub",rows:3,maxlength:240});sub.value=st.sub;
  const tf=(id,label,val)=>h("div",{class:"f"},h("label",{for:id},label),h("input",{id,type:"time",value:val,step:1800}));
  const boxes=SECTIONS.map(([id,name])=>{const c=h("input",{type:"checkbox",id:"sh-"+id});c.checked=!(st.hide&&st.hide[id]);return h("label",{class:"chk"},c,name);});
  const bad=t=>{msg.textContent=t;};
  return h("form",{class:"box",onsubmit:e=>{e.preventDefault();
      const phone=$("#st-phone").value.trim(),addr=$("#st-addr").value.trim(),v=["wkO","wkC","frO","frC"].map(k=>$("#st-"+k).value.slice(0,5));
      if(!strip.value.trim()||!sub.value.trim()||!addr)return bad("הטקסטים והכתובת לא יכולים להיות ריקים.");
      if(!PHONE.test(phone))return bad("מספר הטלפון לא תקין. דוגמה: 050-1234567");
      if(!v.every(x=>TIME.test(x)&&toMin(x)%30===0)||toMin(v[0])>=toMin(v[1])||toMin(v[2])>=toMin(v[3]))return bad("שעות הפתיחה צריכות להיות בחצאי שעות, ושעת הסגירה אחרי שעת הפתיחה.");
      const hide={};SECTIONS.forEach(([id])=>{hide[id]=!$("#sh-"+id).checked;});
      S.site={strip:strip.value.trim(),sub:sub.value.trim(),phone,addr:addr.slice(0,120),wkO:v[0],wkC:v[1],frO:v[2],frC:v[3],hide};
      saveSettings("פרטי המספרה ותוכן האתר");}},
    h("h3",null,"תוכן ופרטי המספרה"),
    h("div",{class:"f"},h("label",{for:"st-strip"},"הפס בראש האתר"),strip),
    h("div",{class:"f"},h("label",{for:"st-sub"},"הטקסט מתחת לכותרת הראשית"),sub),
    h("div",{class:"ed",style:"grid-template-columns:1fr 2fr"},h("div",{class:"f"},h("label",{for:"st-phone"},"טלפון"),h("input",{id:"st-phone",type:"tel",maxlength:12,dir:"ltr",value:st.phone})),h("div",{class:"f"},h("label",{for:"st-addr"},"כתובת"),h("input",{id:"st-addr",maxlength:120,value:st.addr}))),
    h("div",{class:"ed",style:"grid-template-columns:repeat(4,1fr)"},tf("st-wkO","א׳ עד ה׳: פתיחה",st.wkO),tf("st-wkC","א׳ עד ה׳: סגירה",st.wkC),tf("st-frO","שישי: פתיחה",st.frO),tf("st-frC","שישי: סגירה",st.frC)),
    h("fieldset",null,h("legend",{class:"lbl",style:"margin-bottom:8px"},"חלקים שמוצגים באתר"),boxes),
    h("p",{class:"empty",style:"padding:0 0 12px"},"שעות הפתיחה קובעות אילו שעות מוצעות בקביעת התור. מחירים עורכים בלשונית ״שירותים ומחירים״."),
    h("button",{class:"btn btn-main btn-sm",type:"submit"},"שמירה")," ",msg);
};
VIEWS.sec=function(){
  const on=["כניסה בסיסמה שנשמרת רק כסוד ב־Cloudflare, עם נעילה ל־15 דקות אחרי 5 ניסיונות כושלים","עוגיית כניסה חתומה (HttpOnly, Secure, SameSite=Strict) שתקפה 8 שעות","כל פעולה נבדקת בשרת: מקור הבקשה, הרשאה ותקינות הנתונים","השרת בודק שוב שהשעה פנויה לפני שתור נשמר, כך שאין שני תורים על אותה שעה","הגבלת קצב ושדה מלכודת נגד בוטים בטופס קביעת התור","HTTPS בלבד (HSTS), חסימת הטמעה באתרים אחרים ומדיניות CSP שמריצה רק קוד מהאתר","כל קלט מוצג כטקסט בלבד, ושאילתות מסד הנתונים עם פרמטרים בלבד","מחיקה דורשת לחיצה כפולה, וכל פעולה נרשמת ביומן"];
  const plan=["אימות דו־שלבי למערכת הניהול (למשל Cloudflare Access)","משתמש נפרד לכל ספר, עם הרשאות","תזכורת אוטומטית ללקוח לפני התור (SMS או וואטסאפ)","Turnstile לטופס, נגד בוטים מתקדמים","עמוד מדיניות פרטיות","בדיקת נגישות של יועץ מורשה"];
  const li=(t,c,l)=>h("li",null,h("span",{class:"pill "+c},l),h("span",null,t));
  return h("div",null,h("div",{class:"sec2"},
    h("div",{class:"box"},h("h3",null,"מה כבר מאובטח"),h("ul",{class:"cl"},on.map(t=>li(t,"on","פעיל")))),
    h("div",{class:"box"},h("h3",null,"כדאי להוסיף בהמשך"),h("ul",{class:"cl"},plan.map(t=>li(t,"plan","מומלץ"))))),
    h("div",{class:"box"},h("h3",null,"יומן פעולות"),LOG.length?h("ul",{class:"log"},LOG.map(x=>h("li",null,h("time",null,new Date(x.ts).toLocaleString("he-IL",{dateStyle:"short",timeStyle:"short"})),h("span",null,x.msg)))):h("p",{class:"empty"},"עדיין לא בוצעו פעולות.")));
};

load();
})();
