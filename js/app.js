"use strict";
const db=supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const S={bm:new Set(),user:null,langs:[],lang:null,ses:null,items:[],idx:0,shown:false};
const DAY=864e5,today=()=>new Date().toLocaleDateString("en-CA"),iso=(d=0)=>new Date(Date.now()+d*DAY).toISOString();
const norm=s=>String(s||"").trim().toLowerCase().replace(/\s+/g," ");
function toast(m){const t=$("#toast");t.textContent=m;t.classList.remove("hidden");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.add("hidden"),2600)}
async function q(p){const r=await p;if(r.error){toast("Lỗi: "+r.error.message);throw r.error}return r.data}
function speak(text,rate=S.rate||1){try{const u=new SpeechSynthesisUtterance(text);u.lang=S.lang?.code==="en"?"en-US":"zh-CN";u.rate=rate;speechSynthesis.cancel();speechSynthesis.speak(u)}catch(e){toast("Trình duyệt không hỗ trợ đọc.")}}

/* ---- Auth ---- */
async function creds(fn){$("#authErr").textContent="";const r=await fn($("#email").value.trim(),$("#pass").value);if(r.error)$("#authErr").textContent=r.error.message;return r}
$("#authForm").onsubmit=async e=>{e.preventDefault();const r=await creds((email,password)=>db.auth.signInWithPassword({email,password}));if(!r.error)boot()};
$("#regBtn").onclick=async()=>{const r=await creds((email,password)=>db.auth.signUp({email,password}));if(!r.error){r.data.session?boot():$("#authErr").textContent="Kiểm tra email để xác nhận tài khoản."}};
$("#forgotBtn").onclick=async()=>{const e=$("#email").value.trim();if(!e)return;const r=await db.auth.resetPasswordForEmail(e,{redirectTo:location.href});$("#authErr").textContent=r.error?r.error.message:"Đã gửi email đặt lại mật khẩu."};
$("#logout").onclick=async()=>{await db.auth.signOut();location.reload()};
async function boot(){const{data}=await db.auth.getSession();if(!data.session){$("#authView").classList.remove("hidden");$("#appView").classList.add("hidden");return}
  S.user=data.session.user;$("#authView").classList.add("hidden");$("#appView").classList.remove("hidden");
  S.langs=await q(db.from("languages").select("*").order("code",{ascending:false}));S.lang=S.langs[0];await loadBm();go("home")}
document.querySelectorAll("nav [data-p]").forEach(b=>b.onclick=()=>go(b.dataset.p));
function go(p){clearInterval(S.tm);S.tm=0;document.querySelectorAll("nav [data-p]").forEach(b=>b.classList.toggle("on",b.dataset.p===p));({home,vocab,quiz:quizPage,study:studyMenu,wrong,history:hist,data:dataPage,stats})[p]().catch(()=>{})}
const langSel=()=>`<select id="lang">${S.langs.map(l=>`<option value="${l.id}" ${l.id===S.lang?.id?"selected":""}>${l.flag} ${esc(l.name)}</option>`).join("")}</select>`;
const setLang=()=>{const el=$("#lang");if(el)el.onchange=()=>{S.lang=S.langs.find(l=>l.id===el.value)}};

/* ---- Thống kê / streak ---- */
async function streaks(){const d=await q(db.from("daily_study_logs").select("study_date,questions_completed").eq("user_id",S.user.id).gt("questions_completed",0));
  const set=new Set(d.map(x=>x.study_date));let cur=0,c=new Date();if(!set.has(today()))c=new Date(Date.now()-DAY);
  while(set.has(c.toLocaleDateString("en-CA"))){cur++;c=new Date(c-DAY)}
  const ds=[...set].sort();let best=0,run=0,prev=null;for(const x of ds){run=prev&&new Date(x)-new Date(prev)===DAY?run+1:1;best=Math.max(best,run);prev=x}return{cur,best}}
async function todayCount(){const d=await q(db.from("daily_study_logs").select("questions_completed").eq("user_id",S.user.id).eq("study_date",today()));return d.reduce((a,x)=>a+x.questions_completed,0)}

/* ---- Home ---- */
async function home(){const m=$("#main");m.innerHTML="<p class=muted>Đang tải…</p>";
  const[ses,st,n,gcs]=await Promise.all([q(db.from("learning_sessions").select("*,languages(flag,name)").eq("user_id",S.user.id).eq("status","IN_PROGRESS").order("last_activity_at",{ascending:false}).limit(3)),streaks(),todayCount(),gc()]);
  const goal=+localStorage.goal||20,pct=Math.min(100,n/goal*100);
  m.innerHTML=`<h1>Xin chào 👋</h1><div class="grid"><div class="card stat"><small class=muted>🔥 Streak</small><b>${st.cur} ngày</b><small class=muted>Dài nhất: ${st.best}</small></div>
  <div class="card stat"><small class=muted>🎯 Hôm nay</small><b>${n} / ${goal}</b><div class="bar"><i style="width:${pct}%"></i></div><small class=muted>Mục tiêu: <select id="goal" style="width:auto;padding:2px">${[10,20,30,50,100].map(v=>`<option ${v===goal?"selected":""}>${v}</option>`).join("")}</select> câu/ngày</small></div></div>
  <div class="card"><h3>▶ Tiếp tục học</h3>${ses.length?ses.map(s=>`<div class="row" style="margin-bottom:10px"><div>${s.languages.flag} ${esc(s.level||"Tất cả")} · ${esc(s.mode)}<div class="bar"><i style="width:${s.current_index/s.total_items*100}%"></i></div><small class=muted>${s.current_index} / ${s.total_items}</small></div><button class="btn pri" data-r="${s.id}" style="flex:0">Tiếp tục</button></div>`).join(""):"<p class=muted>Chưa có bài học đang học.</p>"}</div>
  <div class="card"><h3>📚 Từ vựng của tôi</h3><div class="grid">${[["new","🆕 Mới"],["g0","😵 Chưa nhớ"],["g1","🙂 Nhớ"],["g2","🔥 Thuộc"]].map(([t,l],i)=>`<button class="btn" data-vt="${t}">${l}<br><b style="font-size:22px">${gcs[i]}</b></button>`).join("")}</div></div>
  <div class="card"><button class="btn pri" id="goStudy">Bắt đầu học mới (ưu tiên: đến hạn → câu sai → bài mới)</button></div>`;
  $("#goal").onchange=e=>{localStorage.goal=e.target.value;home()};$("#goStudy").onclick=()=>go("study");m.querySelectorAll("[data-vt]").forEach(b=>b.onclick=()=>{S.vf.tab=b.dataset.vt;S.vf.page=0;go("vocab")});
  m.querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>resume(b.dataset.r))}

/* ---- Tạo / tiếp tục session ---- */
const isFlash=m=>String(m).startsWith("flashcard");
const lb=()=>S.lang?.code==="en"?{f:"Anh",pin:"phiên âm"}:{f:"Trung",pin:"pinyin"};
/* Lấy danh sách level thật từ DB (RPC user_levels, dự phòng: quét cột level) */
async function levels(){const r=await db.rpc("user_levels",{p_language:S.lang.id});let a;
  if(!r.error)a=r.data.map(x=>x.level);else{const set=new Set();for(let f=0;f<20000;f+=1000){const d=await q(db.from("lessons").select("level").eq("user_id",S.user.id).eq("language_id",S.lang.id).range(f,f+999));d.forEach(x=>x.level&&set.add(x.level));if(d.length<1000)break}a=[...set]}
  return a.sort((x,y)=>x.localeCompare(y,undefined,{numeric:true}))}
async function studyMenu(){const m=$("#main"),L=lb(),lv=await levels();
  m.innerHTML=`<h1>Học</h1><div class="card"><div class="row">${langSel()}<select id="lvl"><option value="">Tất cả level</option>${lv.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("")}</select>
  <select id="mode"><option value="flashcard">Flashcard: ${L.f} → Việt</option><option value="flashcard-vi">Flashcard: Việt → ${L.f}</option><option value="zh-vi">Gõ: ${L.f} → Việt</option><option value="vi-zh">Gõ: Việt → ${L.f}</option></select>
  <select id="src"><option value="smart">Thông minh (đến hạn → sai → mới)</option><option value="seq">Theo thứ tự bài</option></select>
  <select id="shf"><option value="0">Giữ thứ tự</option><option value="1">Xáo trộn</option></select><select id="cnt">${[10,20,30,50,100].map(v=>`<option ${v===20?"selected":""}>${v}</option>`).join("")}</select></div>${lv.length?"":"<p class=muted>Chưa có dữ liệu cho ngôn ngữ này. Vào mục Dữ liệu để nạp Excel.</p>"}<br><button class="btn pri" id="start">Bắt đầu</button></div>`;
  $("#lang").onchange=e=>{S.lang=S.langs.find(l=>l.id===e.target.value);studyMenu()};
  $("#start").onclick=()=>startSession({level:$("#lvl").value,mode:$("#mode").value,count:+$("#cnt").value,seq:$("#src").value==="seq",shuffle:$("#shf").value==="1"})}
async function buildQueue(level,count,seq){const uid=S.user.id,lid=S.lang.id,now=iso(),ids=[];
  const add=a=>a.forEach(x=>{if(ids.length<count&&!ids.includes(x))ids.push(x)});
  if(seq){let l=db.from("lessons").select("id").eq("user_id",uid).eq("language_id",lid).order("no").limit(count);if(level)l=l.eq("level",level);return(await q(l)).map(x=>x.id)}
  const lf=qq=>{qq=qq.eq("lessons.language_id",lid);return level?qq.eq("lessons.level",level):qq};
  add((await q(lf(db.from("user_progress").select("lesson_id,lessons!inner(id)").eq("user_id",uid).lte("next_review",now).order("next_review").limit(count)))).map(x=>x.lesson_id));
  if(ids.length<count)add((await q(lf(db.from("wrong_answers").select("lesson_id,lessons!inner(id)").eq("user_id",uid).order("last_wrong",{ascending:false}).limit(count)))).map(x=>x.lesson_id));
  if(ids.length<count){let l=db.from("lessons").select("id,user_progress(id)").eq("user_id",uid).eq("language_id",lid).order("no").limit(1000);if(level)l=l.eq("level",level);add((await q(l)).filter(x=>!x.user_progress.length).map(x=>x.id))}
  return ids}
async function startSession({level,mode,count,ids,seq,shuffle}){ids=ids||await buildQueue(level,count,seq);if(shuffle)ids=[...ids].sort(()=>Math.random()-.5);if(!ids.length){toast("Chưa có bài phù hợp. Hãy nạp dữ liệu ở mục Dữ liệu.");return}
  const s=(await q(db.from("learning_sessions").insert({user_id:S.user.id,language_id:S.lang.id,mode,level:level||null,total_items:ids.length}).select().single()));
  await q(db.from("learning_session_items").insert(ids.map((id,i)=>({session_id:s.id,user_id:S.user.id,lesson_id:id,question_index:i}))));resume(s.id)}
async function resume(id){S.ses=await q(db.from("learning_sessions").select("*").eq("id",id).single());
  S.lang=S.langs.find(l=>l.id===S.ses.language_id)||S.lang;
  const it=await q(db.from("learning_session_items").select("*,lessons(*)").eq("session_id",id).order("question_index"));S.items=it;
  S.prog={};S.wr={};S.q=Promise.resolve();const lids=it.map(x=>x.lesson_id);
  for(let i=0;i<lids.length;i+=100){const c=lids.slice(i,i+100),[a,b]=await Promise.all([q(db.from("user_progress").select("*").eq("user_id",S.user.id).in("lesson_id",c)),q(db.from("wrong_answers").select("*").eq("user_id",S.user.id).in("lesson_id",c))]);a.forEach(x=>S.prog[x.lesson_id]=x);b.forEach(x=>S.wr[x.lesson_id]=x)}
  S.day=await q(db.from("daily_study_logs").select("*").eq("user_id",S.user.id).eq("study_date",today()).eq("language_id",S.ses.language_id).maybeSingle());
  if(!S.qcfg)S.pool=null;S.deadline=S.qcfg?.t?Date.now()+S.qcfg.t*1000:0;S.qcfg=null;const first=it.findIndex(x=>!x.is_answered);S.idx=Math.max(0,Math.min(S.ses.current_index,first<0?it.length:first));card()}

/* ---- Màn hình học ---- */
const endOrFirst=()=>{const f=S.items.findIndex(x=>!x.is_answered);if(f>=0){toast("Còn câu chưa đánh giá");S.idx=f;card()}else finish()};
function nav(d){const i=S.idx+d;if(i<0)return;if(i>=S.items.length)return endOrFirst();S.idx=i;card()}
function card(){if(S.idx>=S.items.length)return endOrFirst();S.flip=false;S.pin=localStorage.pin!=="0";if(S.ses.mode.startsWith("quiz"))return quizCard();if(isFlash(S.ses.mode))return flash();
  const m=$("#main"),it=S.items[S.idx],l=it.lessons,mode=S.ses.mode,prompt=mode==="vi-zh"?l.tieng_viet:l.tieng_trung;S.shown=false;
  m.innerHTML=`<div class="row"><b>${S.idx+1} / ${S.items.length}</b><div class="bar"><i style="width:${S.idx/S.items.length*100}%"></i></div><button class="btn" id="exit" style="flex:0">Thoát</button></div>
  <div class="card center"><div class="big">${esc(prompt)}</div><button class="btn" id="say">🔊</button><div id="ans" class="hidden"></div><div id="act" style="margin-top:14px"></div></div>`;
  $("#say").onclick=()=>speak(l.tieng_trung);$("#exit").onclick=()=>go("home");
  const ans=$("#ans"),act=$("#act"),reveal=()=>{ans.classList.remove("hidden");ans.innerHTML=`<p><b>${esc(l.pinyin||"")}</b></p><p>${esc(mode==="vi-zh"?l.tieng_trung:l.tieng_viet)}</p><p class=muted>${esc(l.giai_thich||"")}</p>`};
  act.innerHTML=`<input id="inp" placeholder="Nhập đáp án rồi Enter" autocomplete="off"><br><br><button class="btn pri" id="chk">Kiểm tra</button>`;const inp=$("#inp");inp.focus();
  const check=()=>{if(S.shown){answer(S.ok,inp.value);return}const target=mode==="vi-zh"?l.tieng_trung:l.tieng_viet;
    S.ok=norm(inp.value)===norm(target)||(mode==="vi-zh"&&norm(inp.value)===norm(l.pinyin));S.shown=true;inp.className=S.ok?"pass":"fail";inp.readOnly=true;reveal();$("#chk").textContent="Tiếp"};
  $("#chk").onclick=check;inp.onkeydown=e=>{if(e.key==="Enter")check()}}
/* Flashcard: ← → chuyển câu, Space lật, 1/2/3 đánh giá; pinyin/phiên âm bật-tắt được */
function flash(){const it=S.items[S.idx],l=it.lessons,vi=S.ses.mode==="flashcard-vi",L=lb();
  const P=S.prog[it.lesson_id],SL={NEW:"🆕 Mới",LEARNING:"📖 Đang học",REVIEW:"🔄 Ôn tập",MASTERED:"🔥 Đã thuộc"},g=gr(it);
  const badge=`<span class="pill">${SL[P?.status||"NEW"]}</span>${P?.next_review?` <small class=muted>ôn lại ${new Date(P.next_review).toLocaleDateString("vi-VN")}</small>`:""}`;
  const zh=`<div class="big">${esc(l.tieng_trung)}</div>${S.pin&&l.pinyin?`<p><b>${esc(l.pinyin)}</b></p>`:""}`,v=`<div class="big">${esc(l.tieng_viet)}</div>`;
  $("#main").innerHTML=`<div class="row"><b>${S.idx+1} / ${S.items.length}</b><div class="bar"><i style="width:${S.idx/S.items.length*100}%"></i></div><button class="btn" id="bm" style="flex:0">${S.bm.has(it.lesson_id)?"⭐":"☆"}</button><button class="btn ${localStorage.auto==="1"?"pri":""}" id="auto" style="flex:0">🔈 Tự đọc</button><button class="btn" id="pin" style="flex:0">${S.pin?"Ẩn":"Hiện"} ${L.pin}</button><button class="btn" id="exit" style="flex:0">Thoát</button></div>
  <p class="muted" style="margin:4px 0">${tallyText()}</p><div class="card center" id="fc" style="cursor:pointer;min-height:240px"><div style="text-align:left">${badge}</div>${S.flip?(vi?zh:v)+`<p class=muted>${esc(l.giai_thich||"")}</p>`:(vi?v:zh)}${g!==null?`<p><b>Phiên này: ${["😵 Chưa nhớ","🙂 Nhớ","🔥 Thuộc"][g]}</b></p>`:""}</div>
  <div class="row"><button class="btn" id="prev">← Trước</button><button class="btn pri" id="flip">Lật (Space)</button><button class="btn" id="nxt">Sau →</button><button class="btn" id="say">🔊</button></div>
  ${S.flip&&!it.is_answered?`<br><div class="row"><button class="btn bad" data-g="0">😵 Chưa nhớ (1)</button><button class="btn" data-g="1">🙂 Nhớ (2)</button><button class="btn pri" data-g="2">🔥 Thuộc (3)</button></div>`:""}`;
  $("#exit").onclick=()=>go("home");$("#say").onclick=()=>speak(l.tieng_trung);$("#prev").onclick=()=>nav(-1);$("#nxt").onclick=()=>nav(1);
  $("#flip").onclick=$("#fc").onclick=flip;$("#bm").onclick=()=>{toggleBm(it.lesson_id);flash()};$("#auto").onclick=()=>{localStorage.auto=localStorage.auto==="1"?"0":"1";flash()};$("#pin").onclick=()=>{S.pin=!S.pin;localStorage.pin=S.pin?"1":"0";flash()};
  document.querySelectorAll("[data-g]").forEach(b=>b.onclick=()=>grade(+b.dataset.g));
  if(localStorage.auto==="1"&&(vi===S.flip))speak(l.tieng_trung)}
const flip=()=>{S.flip=!S.flip;flash()};
const grade=g=>answer(g>0,GR[g],g===2);
/* Trả lời: cập nhật bộ nhớ + chuyển câu NGAY, ghi Supabase ở nền (hàng đợi tuần tự, các bảng ghi song song) */
const chk=r=>{if(r.error)throw r.error};
const save=fn=>{S.q=(S.q||Promise.resolve()).then(fn).catch(e=>toast("Lỗi lưu: "+(e.message||e)))};
const GR=["chua-nho","nho","thuoc"],gr=x=>!x.is_answered?null:x.answer==="thuoc"?2:x.is_correct?1:0;
const tallyText=()=>{const c=[0,0,0];S.items.forEach(x=>{const g=gr(x);if(g!==null)c[g]++});return`😵 Chưa nhớ ${c[0]} · 🙂 Nhớ ${c[1]} · 🔥 Thuộc ${c[2]}`};
function answer(ok,text,mastered=false){const it=S.items[S.idx],s=S.ses,now=iso(),uid=S.user.id;if(it.is_answered){S.idx++;card();return}
  it.is_answered=true;it.is_correct=ok;it.answer=text;it.attempt_count++;
  s.current_index=S.idx+1;s.completed_items=S.items.filter(x=>x.is_answered).length;s.correct_count+=ok?1:0;s.wrong_count+=ok?0:1;
  const g=text==="thuoc"?2:text==="nho"?1:text==="chua-nho"?0:ok?1:0,p=nextProg(it.lesson_id,ok,mastered,g),w=nextWrong(it.lesson_id,ok),d=nextDay(ok),oc=t=>({onConflict:t});
  save(async()=>{const r=await Promise.all([
    db.from("learning_session_items").update({is_answered:true,is_correct:ok,answer:text,attempt_count:it.attempt_count,answered_at:now}).eq("id",it.id),
    db.from("learning_sessions").update({current_index:s.current_index,completed_items:s.completed_items,correct_count:s.correct_count,wrong_count:s.wrong_count,last_activity_at:now}).eq("id",s.id),
    db.from("user_progress").upsert(p,oc("user_id,lesson_id")),
    d&&db.from("daily_study_logs").upsert(d,oc("user_id,study_date,language_id")),
    w&&(w.op==="up"?db.from("wrong_answers").upsert(w.n,oc("user_id,lesson_id")):db.from("wrong_answers").delete().eq("user_id",uid).eq("lesson_id",w.lid))].filter(Boolean));r.forEach(chk)});
  S.idx++;card()}
/* SRS: NEW→LEARNING(2d)→REVIEW(4d)→REVIEW(7d)→MASTERED(30d); sai → LEARNING, 1 ngày */
function nextProg(lid,ok,mastered,g){const p=S.prog[lid]||{status:"NEW",correct_count:0,wrong_count:0};let st,days;
  if(!ok){st="LEARNING";days=1}else if(mastered){st="MASTERED";days=30}else if(p.status==="NEW"){st="LEARNING";days=2}else if(p.status==="LEARNING"){st="REVIEW";days=4}else if(p.status==="REVIEW"){st=p.correct_count>=3?"MASTERED":"REVIEW";days=st==="MASTERED"?30:7}else{st="MASTERED";days=30}
  return S.prog[lid]={user_id:S.user.id,lesson_id:lid,status:st,correct_count:p.correct_count+(ok?1:0),wrong_count:p.wrong_count+(ok?0:1),last_grade:g,last_studied:iso(),next_review:iso(days),updated_at:iso()}}
function nextWrong(lid,ok){const w=S.wr[lid],uid=S.user.id;
  if(!ok){const n={user_id:uid,lesson_id:lid,wrong_count:(w?.wrong_count||0)+1,correct_count:w?.correct_count||0,last_wrong:iso(),updated_at:iso()};S.wr[lid]=n;return{op:"up",n}}
  if(!w)return null;if(w.correct_count+1>=3){delete S.wr[lid];return{op:"del",lid}} // đúng 3 lần → gỡ khỏi danh sách sai
  const n={...w,correct_count:w.correct_count+1,updated_at:iso()};S.wr[lid]=n;return{op:"up",n}}
function nextDay(ok,min=0){const r=S.day&&S.day.study_date===today()?S.day:{};
  return S.day={user_id:S.user.id,study_date:today(),language_id:S.ses.language_id,questions_completed:(r.questions_completed||0)+(ok===null?0:1),correct_count:(r.correct_count||0)+(ok?1:0),wrong_count:(r.wrong_count||0)+(ok===false?1:0),study_minutes:(r.study_minutes||0)+min,updated_at:iso()}}
async function finish(){clearInterval(S.tm);S.tm=0;const s=S.ses,acc=Math.round(s.correct_count/s.total_items*100),min=Math.max(1,Math.round((Date.now()-new Date(s.started_at))/6e4));
  await S.q;await q(db.from("learning_sessions").update({status:"COMPLETED",completed_at:iso(),completed_items:s.total_items,accuracy:acc}).eq("id",s.id));await q(db.from("daily_study_logs").upsert(nextDay(null,min),{onConflict:"user_id,study_date,language_id"}));const st=await streaks();
  $("#main").innerHTML=`<div class="card center"><div class="big">🎉 HOÀN THÀNH!</div><h2>${s.total_items} / ${s.total_items} câu</h2><p>Accuracy: ${acc}% · ${min} phút</p><p>${tallyText()}</p><p>🔥 Streak: ${st.cur} ngày</p><div class="row"><button class="btn bad" id="w">Ôn câu sai</button><button class="btn pri" id="h">Về Home</button></div></div>`;
  $("#w").onclick=()=>go("wrong");$("#h").onclick=()=>go("home")}
document.addEventListener("keydown",e=>{const it=S.items[S.idx];if(!it||!$("#say")||["INPUT","SELECT","TEXTAREA"].includes(document.activeElement.tagName))return;const f=isFlash(S.ses.mode);
  if(f&&e.key==="ArrowRight"){e.preventDefault();nav(1)}else if(f&&e.key==="ArrowLeft"){e.preventDefault();nav(-1)}
  else if(e.key===" "){e.preventDefault();f?flip():$("#say").click()}
  else if(f&&S.flip&&!it.is_answered&&"123".includes(e.key))grade(+e.key-1);else if(S.ses.mode.startsWith("quiz")&&"1234".includes(e.key))document.querySelector(`[data-o="${e.key-1}"]`)?.click()});

/* ---- Từ vựng: xem & ôn theo nhóm Mới / Chưa nhớ / Nhớ / Thuộc ---- */
S.vf={tab:"all",level:"",q:"",page:0};let V=[];
const TABS=[["all","Tất cả"],["bm","⭐ Đã đánh dấu"],["new","🆕 Mới"],["g0","😵 Chưa nhớ"],["g1","🙂 Nhớ"],["g2","🔥 Thuộc"]],PS=30;
const PST={NEW:"🆕 Mới",LEARNING:"📖 Đang học",REVIEW:"🔄 Ôn tập",MASTERED:"🔥 Đã thuộc"};
/* Đếm từng nhóm cho ngôn ngữ hiện tại: [mới, chưa nhớ, nhớ, thuộc] */
async function gc(){const uid=S.user.id,lid=S.lang.id,c=async f=>(await f(db.from("user_progress").select("id,lessons!inner(id)",{count:"exact",head:true}).eq("user_id",uid).eq("lessons.language_id",lid))).count||0;
  const tot=(await db.from("lessons").select("id",{count:"exact",head:true}).eq("user_id",uid).eq("language_id",lid)).count||0;
  const[all,g0,g1,g2]=await Promise.all([c(x=>x),c(x=>x.eq("last_grade",0)),c(x=>x.eq("last_grade",1).neq("status","MASTERED")),c(x=>x.or("last_grade.eq.2,status.eq.MASTERED"))]);return[Math.max(0,tot-all),g0,g1,g2]}
async function vocabRows(size=PS){const f=S.vf,uid=S.user.id,lid=S.lang.id,a=f.page*size,b=a+size-1,t=f.q.replace(/[,()%*\\]/g," ").trim(),cols=`tieng_trung.ilike.%${t}%,pinyin.ilike.%${t}%,tieng_viet.ilike.%${t}%`;
  if(f.tab==="bm"){let x=db.from("study_bookmarks").select("*,lessons!inner(*)",{count:"exact"}).eq("user_id",uid).eq("lessons.language_id",lid);
    if(f.level)x=x.eq("lessons.level",f.level);if(t)x=x.or(cols,{referencedTable:"lessons"});
    const r=await x.order("created_at",{ascending:false}).range(a,b);if(r.error)throw r.error;const ids=r.data.map(z=>z.lesson_id),pm={};
    if(ids.length)(await q(db.from("user_progress").select("*").eq("user_id",uid).in("lesson_id",ids))).forEach(z=>pm[z.lesson_id]=z);
    return{rows:r.data.map(z=>({l:z.lessons,p:pm[z.lesson_id]})),count:r.count}}
  if(f.tab[0]==="g"){const g=+f.tab[1];let x=db.from("user_progress").select("*,lessons!inner(*)",{count:"exact"}).eq("user_id",uid).eq("lessons.language_id",lid);
    x=g===2?x.or("last_grade.eq.2,status.eq.MASTERED"):g===1?x.eq("last_grade",1).neq("status","MASTERED"):x.eq("last_grade",0);
    if(f.level)x=x.eq("lessons.level",f.level);if(t)x=x.or(cols,{referencedTable:"lessons"});
    const r=await x.order("updated_at",{ascending:false}).range(a,b);if(r.error)throw r.error;return{rows:r.data.map(z=>({l:z.lessons,p:z})),count:r.count}}
  let x=db.from("lessons").select("*,user_progress(status,last_grade,next_review)",{count:"exact"}).eq("user_id",uid).eq("language_id",lid);
  if(f.tab==="new")x=x.is("user_progress",null);if(f.level)x=x.eq("level",f.level);if(t)x=x.or(cols);
  const r=await x.order("no").range(a,b);if(r.error)throw r.error;return{rows:r.data.map(z=>({l:z,p:z.user_progress[0]})),count:r.count}}
async function vocab(){const m=$("#main"),f=S.vf,lv=await levels();
  m.innerHTML=`<h1>Từ vựng</h1><div class="card"><div class="row">${langSel()}<select id="vlv"><option value="">Tất cả level</option>${lv.map(x=>`<option ${x===f.level?"selected":""}>${esc(x)}</option>`).join("")}</select><input id="vq" placeholder="Tìm chữ Hán, pinyin, nghĩa…" value="${esc(f.q)}"></div></div>
  <div class="tabs">${TABS.map(([k,l])=>`<button class="btn ${k===f.tab?"pri":""}" data-tab="${k}">${l}</button>`).join("")}</div>
  <div class="row" style="margin-bottom:10px"><select id="vm"><option value="flashcard">Ôn flashcard: → Việt</option><option value="flashcard-vi">Ôn flashcard: Việt →</option></select><button class="btn pri" id="vgo">▶ Ôn nhóm này (tối đa 50)</button></div><div id="vlist"></div>`;
  $("#lang").onchange=e=>{S.lang=S.langs.find(l=>l.id===e.target.value);f.level="";f.page=0;vocab()};
  $("#vlv").onchange=e=>{f.level=e.target.value;f.page=0;vlist()};let t;$("#vq").oninput=e=>{clearTimeout(t);t=setTimeout(()=>{f.q=e.target.value;f.page=0;vlist()},300)};
  m.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{f.tab=b.dataset.tab;f.page=0;vocab()});
  $("#vgo").onclick=async()=>{const r=await vocabRows(50);const ids=r.rows.map(x=>x.l.id);if(!ids.length)return toast("Nhóm này đang trống.");startSession({mode:$("#vm").value,ids,level:f.level||null})};
  $("#vlist").onclick=async e=>{const b=e.target.closest("button");if(!b)return;
    if(b.dataset.bm){toggleBm(V[+b.dataset.bm].l.id);return vlist()}
    if(b.dataset.say)return speak(V[+b.dataset.say].l.tieng_trung);
    if(b.dataset.set){const[i,g]=b.dataset.set.split(":").map(Number),l=V[i].l,pr=V[i].p||{};
      const d=[1,4,30][g],st=["LEARNING","REVIEW","MASTERED"][g];
      try{await q(db.from("user_progress").upsert({user_id:S.user.id,lesson_id:l.id,status:st,last_grade:g,last_studied:iso(),next_review:iso(d),updated_at:iso()},{onConflict:"user_id,lesson_id"}));toast("Đã cập nhật");vlist()}catch(e){}}
    if(b.dataset.pg){f.page=Math.max(0,f.page+ +b.dataset.pg);vlist()}};
  vlist()}
async function vlist(){const f=S.vf,el=$("#vlist");el.innerHTML="<p class=muted>Đang tải…</p>";
  try{const{rows,count}=await vocabRows();V=rows;
    el.innerHTML=(rows.length?rows.map((r,i)=>`<div class="card" style="display:flex;gap:10px;align-items:center;padding:12px"><div style="flex:1;min-width:0"><b style="font-size:20px">${esc(r.l.tieng_trung)}</b> <span class="muted">${esc(r.l.pinyin||"")}</span><br>${esc(r.l.tieng_viet)}<br><small class="muted">${esc(r.l.level||"")} · ${PST[r.p?.status||"NEW"]}${r.p?.next_review?" · ôn "+new Date(r.p.next_review).toLocaleDateString("vi-VN"):""}</small></div><button class="btn" data-say="${i}">🔊</button><button class="btn" data-bm="${i}">${S.bm.has(r.l.id)?"⭐":"☆"}</button><button class="btn" data-set="${i}:0" title="Chưa nhớ">😵</button><button class="btn" data-set="${i}:1" title="Nhớ">🙂</button><button class="btn" data-set="${i}:2" title="Thuộc">🔥</button></div>`).join(""):"<div class=card>Không có từ nào trong nhóm này.</div>")
    +`<div class="row center"><button class="btn" data-pg="-1" ${f.page?"":"disabled"}>‹ Trước</button><span class="muted">${count?f.page*PS+1:0}–${Math.min(count,(f.page+1)*PS)} / ${count}</span><button class="btn" data-pg="1" ${(f.page+1)*PS>=count?"disabled":""}>Sau ›</button></div>`
  }catch(e){el.innerHTML=`<div class="card err">Lỗi: ${esc(e.message||e)}</div>`}}

/* ---- Bookmark ---- */
async function loadBm(){S.bm=new Set();for(let f=0;f<10000;f+=1000){const d=await q(db.from("study_bookmarks").select("lesson_id").eq("user_id",S.user.id).range(f,f+999));d.forEach(x=>S.bm.add(x.lesson_id));if(d.length<1000)break}}
function toggleBm(lid){const on=!S.bm.has(lid),uid=S.user.id;on?S.bm.add(lid):S.bm.delete(lid);
  save(async()=>chk(await(on?db.from("study_bookmarks").upsert({user_id:uid,lesson_id:lid},{onConflict:"user_id,lesson_id"}):db.from("study_bookmarks").delete().eq("user_id",uid).eq("lesson_id",lid))))}
/* ---- Quiz & Luyện nghe (timer tính cho cả bài) ---- */
const shuf=a=>[...a].sort(()=>Math.random()-.5);
async function quizPage(){const L=lb(),lv=await levels(),o=(a,f)=>a.map(v=>`<option value="${v[0]}">${f(v)}</option>`).join("");
  $("#main").innerHTML=`<h1>Quiz</h1><div class="card"><div class="row">${langSel()}<select id="ql"><option value="">Tất cả level</option>${lv.map(x=>`<option>${esc(x)}</option>`).join("")}</select>
  <select id="qt"><option value="zh-vi">${L.f} → Việt</option><option value="vi-zh">Việt → ${L.f}</option><option value="py-zh">${L.pin} → ${L.f}</option><option value="listen">🎧 Luyện nghe → chọn nghĩa</option></select>
  <select id="qn">${[10,20,30,50,100].map(v=>`<option>${v}</option>`).join("")}</select>
  <select id="qm"><option value="0">⏱ Không giới hạn</option><option value="30">⏱ 30 giây</option><option value="60">⏱ 60 giây</option><option value="120">⏱ 120 giây</option><option value="300">⏱ 300 giây</option></select>
  <select id="qr"><option value="99">Nghe lại: ∞</option><option value="1">Nghe lại: 1 lần</option><option value="2">Nghe lại: 2 lần</option><option value="3">Nghe lại: 3 lần</option></select>
  <select id="qs"><option value="1">Tốc độ 1x</option><option value="0.75">0.75x</option><option value="1.25">1.25x</option><option value="1.5">1.5x</option></select></div><br><button class="btn pri" id="qgo">Bắt đầu</button></div>`;
  $("#lang").onchange=e=>{S.lang=S.langs.find(l=>l.id===e.target.value);quizPage()};
  $("#qgo").onclick=async()=>{const lv=$("#ql").value,t=$("#qt").value;let l=db.from("lessons").select("*").eq("user_id",S.user.id).eq("language_id",S.lang.id).limit(1000);if(lv)l=l.eq("level",lv);
    let pool=await q(l);if(t==="py-zh")pool=pool.filter(x=>x.pinyin);if(pool.length<4)return toast("Cần ít nhất 4 từ để làm quiz.");
    S.pool=pool;S.rep=+$("#qr").value;S.rate=+$("#qs").value;S.qcfg={t:+$("#qm").value};
    startSession({mode:"quiz-"+t,level:lv||null,ids:shuf(pool).slice(0,+$("#qn").value).map(x=>x.id)})}}
async function quizCard(){if(!S.pool)S.pool=await q(db.from("lessons").select("*").eq("user_id",S.user.id).eq("language_id",S.ses.language_id).limit(300));
  const it=S.items[S.idx],l=it.lessons,t=S.ses.mode.slice(5),n=S.items.length,ans=l[t==="zh-vi"||t==="listen"?"tieng_viet":"tieng_trung"],fld=t==="zh-vi"||t==="listen"?"tieng_viet":"tieng_trung";
  const seen=new Set([ans]),opts=[l];for(const x of shuf(S.pool)){if(opts.length>=4)break;if(x[fld]&&!seen.has(x[fld])){seen.add(x[fld]);opts.push(x)}}
  const O=shuf(opts);S.rp=S.rep||99;S.lock=0;
  const pr=t==="zh-vi"?`<div class="big">${esc(l.tieng_trung)}</div>${S.pin&&l.pinyin?`<p><b>${esc(l.pinyin)}</b></p>`:""}`:t==="vi-zh"?`<div class="big">${esc(l.tieng_viet)}</div>`:t==="py-zh"?`<div class="big">${esc(l.pinyin)}</div>`:`<div class="big">🎧</div>`;
  $("#main").innerHTML=`<div class="row"><b>${S.idx+1} / ${n}</b><b id="tm" style="flex:0"></b><div class="bar"><i style="width:${S.idx/n*100}%"></i></div><button class="btn" id="bm" style="flex:0">${S.bm.has(it.lesson_id)?"⭐":"☆"}</button><button class="btn" id="exit" style="flex:0">Thoát</button></div>
  <div class="card center">${pr}<button class="btn" id="say"></button></div>${O.map((x,i)=>`<button class="btn opt" data-o="${i}">${i+1}. ${esc(x[fld])}</button>`).join("")}`;
  const say=$("#say"),lab=()=>say.textContent=t==="listen"?`🔊 Nghe lại (${S.rp>90?"∞":S.rp})`:"🔊";lab();
  say.onclick=()=>{if(t==="listen"){if(S.rp<=0)return;S.rp--;lab()}speak(l.tieng_trung)};if(t==="listen")speak(l.tieng_trung);
  $("#exit").onclick=()=>go("home");$("#bm").onclick=()=>{toggleBm(it.lesson_id);$("#bm").textContent=S.bm.has(it.lesson_id)?"⭐":"☆"};
  document.querySelectorAll("[data-o]").forEach(b=>b.onclick=()=>{if(S.lock)return;S.lock=1;const pick=O[+b.dataset.o],ok=pick[fld]===ans;
    b.classList.add(ok?"ok":"no");if(!ok)document.querySelectorAll("[data-o]").forEach((x,i)=>{if(O[i][fld]===ans)x.classList.add("ok")});setTimeout(()=>answer(ok,pick[fld]),ok?450:1100)});
  if(S.deadline&&!S.tm){const tick=()=>{const left=S.deadline-Date.now();if(left<=0){clearInterval(S.tm);S.tm=0;toast("⏱ Hết giờ!");finish();return}const e=$("#tm");if(e)e.textContent=`⏱ ${Math.floor(left/6e4)}:${String(Math.ceil(left%6e4/1e3)%60).padStart(2,"0")}`};S.tm=setInterval(tick,500);tick()}}
/* Vuốt trái/phải để chuyển thẻ flashcard trên điện thoại */
let tx=0,ty=0;document.addEventListener("touchstart",e=>{tx=e.touches[0].clientX;ty=e.touches[0].clientY},{passive:true});
document.addEventListener("touchend",e=>{if(!$("#fc")||!S.items[S.idx])return;const dx=e.changedTouches[0].clientX-tx,dy=e.changedTouches[0].clientY-ty;if(Math.abs(dx)>60&&Math.abs(dy)<50)nav(dx<0?1:-1)},{passive:true});

/* ---- Câu sai ---- */
async function wrong(){const m=$("#main"),d=await q(db.from("wrong_answers").select("*,lessons(*)").eq("user_id",S.user.id).order("last_wrong",{ascending:false}).limit(200));
  m.innerHTML=`<h1>❌ Câu sai</h1>${d.length?`<button class="btn pri" id="rv">Ôn ngay ${Math.min(d.length,20)} câu</button><br><br>`:"<div class=card>Không có câu sai. 🎉</div>"}${d.map(w=>`<div class="card"><b style="font-size:20px">${esc(w.lessons.tieng_trung)}</b> ${esc(w.lessons.tieng_viet)}<br><small class=muted>Sai ${w.wrong_count} · Đúng ${w.correct_count}</small></div>`).join("")}`;
  if(d.length)$("#rv").onclick=()=>{S.lang=S.langs.find(l=>l.id===d[0].lessons.language_id)||S.lang;startSession({mode:"zh-vi",ids:d.slice(0,20).map(x=>x.lesson_id)})}}

/* ---- Lịch sử ---- */
async function hist(){const d=await q(db.from("learning_sessions").select("*,languages(flag,name)").eq("user_id",S.user.id).order("started_at",{ascending:false}).limit(100));
  $("#main").innerHTML=`<h1>Lịch sử học</h1><div class="card wrap"><table><tr><th>Ngày</th><th>Ngôn ngữ</th><th>Level</th><th>Mode</th><th>Câu</th><th>Đúng</th><th>Sai</th><th>Acc</th><th>Trạng thái</th></tr>${d.map(s=>`<tr><td>${new Date(s.started_at).toLocaleDateString("vi-VN")}</td><td>${s.languages?.flag||""}</td><td>${esc(s.level||"—")}</td><td>${esc(s.mode)}</td><td>${s.completed_items}/${s.total_items}</td><td>${s.correct_count}</td><td>${s.wrong_count}</td><td>${s.status==="COMPLETED"?s.accuracy+"%":"—"}</td><td>${s.status==="COMPLETED"?"Hoàn thành":`<a href="#" data-r="${s.id}">Tiếp tục</a>`}</td></tr>`).join("")||"<tr><td colspan=9>Chưa có dữ liệu.</td></tr>"}</table></div>`;
  document.querySelectorAll("[data-r]").forEach(a=>a.onclick=e=>{e.preventDefault();resume(a.dataset.r)})}

/* ---- Dữ liệu: import / export Excel ---- */
const HEAD=["No","Level","Tieng Trung","Pinyin","Tieng Viet","giai thich"];let parsed=[];
async function dataPage(){const c=await q(db.from("lessons").select("id",{count:"exact",head:true}).eq("user_id",S.user.id).eq("language_id",S.lang.id).then(r=>r)).catch(()=>null);
  const{count}=await db.from("lessons").select("id",{count:"exact",head:true}).eq("user_id",S.user.id).eq("language_id",S.lang.id);
  $("#main").innerHTML=`<h1>Dữ liệu</h1><div class="card"><div class="row">${langSel()}<input type="file" id="file" accept=".xlsx,.xls"></div><p class=muted>Hiện có ${count||0} bài. Cột: ${HEAD.join(" | ")}</p><div id="prev"></div></div><div class="card row"><button class="btn" id="demo">Load Demo</button><button class="btn" id="exp">Export Excel</button><button class="btn bad" id="delAll">Xóa tất cả</button></div>`;
  setLang();$("#file").onchange=readFile;$("#demo").onclick=()=>insertRows([["1","HSK1","你好","nǐ hǎo","Xin chào","Cách chào hỏi"],["2","HSK1","谢谢","xiè xie","Cảm ơn","Dùng để cảm ơn"],["3","HSK1","再见","zài jiàn","Tạm biệt",""],["4","HSK2","工作","gōng zuò","Công việc",""],["5","HSK2","学习","xué xí","Học tập",""]].map(toRow),"APPEND");
  $("#exp").onclick=exportXlsx;$("#delAll").onclick=async()=>{if(!confirm("Xóa TOÀN BỘ bài học của ngôn ngữ này?"))return;await q(db.from("lessons").delete().eq("user_id",S.user.id).eq("language_id",S.lang.id));toast("Đã xóa");dataPage()}}
const toRow=r=>({no:parseInt(r[0])||null,level:String(r[1]||"").trim(),tieng_trung:String(r[2]||"").trim(),pinyin:String(r[3]||"").trim(),tieng_viet:String(r[4]||"").trim(),giai_thich:String(r[5]||"").trim()});
async function readFile(e){const f=e.target.files[0];if(!f)return;const wb=XLSX.read(await f.arrayBuffer());const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:""});
  const h=(rows[0]||[]).map(x=>norm(x)),miss=HEAD.filter(x=>!h.includes(norm(x)));const p=$("#prev");
  if(miss.length){p.innerHTML=`<p class=err>Thiếu cột: ${esc(miss.join(", "))}</p>`;return}
  const ix=HEAD.map(x=>h.indexOf(norm(x))),ok=[],errs=[];
  rows.slice(1).forEach((r,i)=>{if(r.every(c=>String(c).trim()===""))return;const row=toRow(ix.map(k=>r[k])),e=[];
    if(!row.no)e.push("No không hợp lệ");if(!row.level)e.push("thiếu Level");if(!row.tieng_trung)e.push("thiếu Tieng Trung");if(!row.tieng_viet)e.push("thiếu Tieng Viet");
    e.length?errs.push(`Dòng ${i+2}: ${e.join(", ")}`):ok.push(row)});
  parsed=ok;p.innerHTML=`<p>✔ ${ok.length} dòng hợp lệ · ✖ ${errs.length} dòng lỗi (sẽ bỏ qua)</p>${errs.slice(0,20).map(x=>`<div class=err>${esc(x)}</div>`).join("")}<div class="wrap"><table>${ok.slice(0,5).map(r=>`<tr><td>${r.no}</td><td>${esc(r.level)}</td><td>${esc(r.tieng_trung)}</td><td>${esc(r.tieng_viet)}</td></tr>`).join("")}</table></div>
  <div class="row"><button class="btn pri" id="ap">Import (Append)</button><button class="btn bad" id="rp">Import (Replace)</button></div>`;
  $("#ap").onclick=()=>insertRows(parsed,"APPEND");$("#rp").onclick=()=>{if(confirm("REPLACE sẽ xóa toàn bộ bài học ngôn ngữ này trước khi nhập. Tiếp tục?"))insertRows(parsed,"REPLACE")}}
async function insertRows(rows,mode){try{if(mode==="REPLACE")await q(db.from("lessons").delete().eq("user_id",S.user.id).eq("language_id",S.lang.id));
  const data=rows.map(r=>({...r,user_id:S.user.id,language_id:S.lang.id}));for(let i=0;i<data.length;i+=500)await q(db.from("lessons").insert(data.slice(i,i+500)));toast(`Đã import ${rows.length} bài`);dataPage()}catch(e){}}
async function exportXlsx(){const out=[];for(let f=0;;f+=1000){const d=await q(db.from("lessons").select("*").eq("user_id",S.user.id).eq("language_id",S.lang.id).order("no").range(f,f+999));out.push(...d);if(d.length<1000)break}
  if(!out.length)return toast("Chưa có dữ liệu.");const ws=XLSX.utils.json_to_sheet(out.map(r=>({No:r.no,Level:r.level,"Tieng Trung":r.tieng_trung,Pinyin:r.pinyin,"Tieng Viet":r.tieng_viet,"giai thich":r.giai_thich})));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Data");XLSX.writeFile(wb,`Language_Learning_${today().replaceAll("-","")}.xlsx`)}

/* ---- Thống kê (tính từ dữ liệu thật) ---- */
async function stats(){const uid=S.user.id,cnt=async(t,f)=>(await f(db.from(t).select("id",{count:"exact",head:true}).eq("user_id",uid))).count||0;
  const[total,learned,master,wr,logs,st,lrn,rev]=await Promise.all([cnt("lessons",x=>x),cnt("user_progress",x=>x),cnt("user_progress",x=>x.eq("status","MASTERED")),cnt("wrong_answers",x=>x),q(db.from("daily_study_logs").select("correct_count,wrong_count,study_minutes").eq("user_id",uid)),streaks(),cnt("user_progress",x=>x.eq("status","LEARNING")),cnt("user_progress",x=>x.eq("status","REVIEW"))]);
  const c=logs.reduce((a,x)=>a+x.correct_count,0),w=logs.reduce((a,x)=>a+x.wrong_count,0),min=logs.reduce((a,x)=>a+x.study_minutes,0);
  const box=(k,v)=>`<div class="card stat"><small class=muted>${k}</small><b>${v}</b></div>`;
  $("#main").innerHTML=`<h1>Thống kê</h1><div class="grid">${box("Tổng bài",total)}${box("Đã học",learned)}${box("Đang học",lrn)}${box("Ôn tập",rev)}${box("Đã thuộc",master)}${box("Câu sai",wr)}${box("Accuracy",c+w?Math.round(c/(c+w)*100)+"%":"—")}${box("Thời gian",Math.floor(min/60)+"h "+min%60+"m")}${box("Streak",st.cur)}${box("Streak dài nhất",st.best)}</div>`}

/* Lưu trạng thái khi rời trang: mỗi câu đã lưu ngay khi trả lời nên không cần ghi thêm */
boot();
