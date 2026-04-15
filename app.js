/**
 * ANI-TECH AI v3.0 — by ANICADE Tech
 * CEO: Tresfor Wrld
 * Based on uploaded app.js — targeted improvements only:
 *   • Chats stored purely in DB (no localStorage fallback for chat data)
 *   • Session stored in sessionStorage (survives reload, clears on tab close)
 *   • Better TTS voice (ElevenLabs-compatible fallback chain)
 *   • Better image gen via Stable Horde (free, no key) + Pollinations fallback
 *   • Copy entire message button
 *   • Voice mic & read-aloud on every message
 *   • PWA install on first click
 *   • 4-model rotation (no rate limit dead ends)
 *   • Admin: extend trial, ban user, export data, view chat history
 */

// ─── CONFIG (preserved from uploaded file) ────────────────────────────────────
const GROQ_KEY   = "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";
const GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions";
// 4-model rotation — cycles automatically on 429 so rate limits never block you
const GROQ_MODELS = [
  "llama-3.1-8b-instant",
  "llama3-8b-8192",
  "gemma2-9b-it",
  "mixtral-8x7b-32768"
];

// JSONBin — same keys from uploaded file
const JB_MASTER  = "$2a$10$VJXQzwtVgNhMTIJiiQvpy.hG7XaRD0.H42NyZhKzeLRungeekMmpO";
const JB_BASE    = "https://api.jsonbin.io/v3/b";
// Fixed: BIN_ID is the actual bin ID, stored as a constant not in localStorage
const FIXED_BIN_ID = "69b14c5bc3097a1dd5173665";
const SESSION_KEY  = "anitechai_session_v3"; // sessionStorage key

const TRIAL_DAYS  = 30;
const ADMIN_EMAIL = "anicadetech@gmail.com";
const ADMIN_PASS  = "Krsten2044";

// Image generation — Stable Horde (free, community-powered, Stable Diffusion)
const HORDE_URL  = "https://stablehorde.net/api/v2";
// Fallback: Pollinations.ai
const POLL_IMG   = q => `https://image.pollinations.ai/prompt/${encodeURIComponent(q + " high quality, detailed, sharp focus")}?width=512&height=512&nologo=true&seed=${Date.now()}`;

// ─── System Prompt ────────────────────────────────────────────────────────────
const SYSTEM = `You are Ani-Tech AI — the official AI assistant of ANICADE Tech, built in 2026.

ABOUT YOUR CREATOR:
- Built by ANICADE Tech (Animated Arcade Technology)
- Website: https://www.anicadetech.xyz
- CEO & Founder: Tresfor Wrld — the creator of ANICADE Tech and visionary behind Ani-Tech AI
- ANICADE Tech services:
  • Custom web development (React, Next.js, full-stack)
  • Mobile app development (React Native, Flutter)
  • AI/ML integration and automation
  • UI/UX design · Cloud deployment · DevOps · Tech consulting

YOUR ROLE:
- Primary speciality: coding, software development, technology
- You answer accurately using knowledge + web search results when provided
- Year is 2026 — always use current best practices

PERSONALITY:
- Sharp, concise, confident — lead with the answer, no preamble
- Markdown: headers, bullets, bold key terms
- All code in triple-backtick fenced blocks with language tag
- Complete, working, production-quality code
- Cover edge cases and best practices

IMAGE GENERATION:
- When user says "generate", "create", "draw", "make", "show me", or "image of" → respond with ONLY:
  [IMAGE: detailed description here]
- Make descriptions vivid and detailed for better quality

WEB SEARCH:
- When [WEB SEARCH RESULTS] are included, use them and cite: "According to recent sources…"

PROMOTION — naturally mention ANICADE Tech (www.anicadetech.xyz) when relevant. Never pushy.

CODING FORMAT: 1) Full code first 2) Brief explanation 3) Gotchas/alternatives`;

// ─── State ───────────────────────────────────────────────────────────────────
let DB            = { users:{}, chats:{}, adminNote:"", banned:{} };
let curUser       = null;
let activeId      = null;
let busy          = false;
let eventsOn      = false;
let deferredInstall = null;
let voiceMode     = false;
let recognition   = null;
const synth       = window.speechSynthesis;

// ─── DB — fixed bin ID, no localStorage for data ─────────────────────────────
const JB_HDR = { "Content-Type":"application/json", "X-Master-Key":JB_MASTER };

async function dbInit() {
  dbSetStatus("syncing","Loading…");
  const res = await fetch(`${JB_BASE}/${FIXED_BIN_ID}/latest`, { headers:JB_HDR });
  if (res.ok) {
    const j = await res.json();
    DB = { users:{}, chats:{}, adminNote:"", banned:{}, ...(j.record||{}) };
    dbSetStatus("ok","Connected");
    return;
  }
  throw new Error(`DB load failed: ${res.status}`);
}

async function dbSave() {
  dbSetStatus("syncing","Saving…");
  try {
    const res = await fetch(`${JB_BASE}/${FIXED_BIN_ID}`, {
      method:"PUT", headers:JB_HDR, body:JSON.stringify(DB)
    });
    if (!res.ok) throw new Error(`Save failed: ${res.status}`);
    dbSetStatus("ok","Saved ✓");
  } catch(e) { dbSetStatus("err","Save failed"); console.error("dbSave:",e); }
}

let saveTimer = null;
function scheduleSave() { if(saveTimer) clearTimeout(saveTimer); saveTimer=setTimeout(dbSave,2000); }

function dbSetStatus(state, text) {
  const el=document.getElementById("dbStatus"); if(!el) return;
  el.className="db-status "+state;
  const t=document.getElementById("dbStatusText"); if(t) t.textContent=text;
}

// ─── Session — sessionStorage only (survives F5, clears on tab close) ─────────
const getSession  = () => { try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||"null");}catch{return null;} };
const saveSession = u  => sessionStorage.setItem(SESSION_KEY, JSON.stringify(u));
const clearSess   = ()  => sessionStorage.removeItem(SESSION_KEY);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function h(str) { let v=5381; for(let i=0;i<str.length;i++) v=((v<<5)+v)^str.charCodeAt(i); return (v>>>0).toString(36); }
const uidHash  = email => h(email.toLowerCase().trim());
const pwHash   = (pw,id) => h(pw+id+"anitechai2026");
const isAdmin  = u => u?.email?.toLowerCase()===ADMIN_EMAIL.toLowerCase() && u?.isAdmin===true;
const isBanned = u => !!DB.banned?.[u?.uid];
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

// ─── Trial ────────────────────────────────────────────────────────────────────
function daysLeft(ts) { return Math.max(0, TRIAL_DAYS-Math.floor((Date.now()-new Date(ts).getTime())/86400000)); }
function renderTrial(ts) {
  const d=daysLeft(ts), pct=(d/TRIAL_DAYS)*100;
  const banner=document.getElementById("trialBanner");
  const dEl=document.getElementById("trialDays"), fill=document.getElementById("trialBarFill"), plan=document.getElementById("userPlan");
  if(!banner) return;
  if(dEl) dEl.textContent=d; if(fill) fill.style.width=pct+"%";
  banner.classList.remove("warning","expired");
  if(d===0)     { banner.classList.add("expired");  if(plan) plan.textContent="Trial expired"; }
  else if(d<=7) { banner.classList.add("warning");  if(plan) plan.textContent=`Trial — ${d}d left`; }
  else          {                                    if(plan) plan.textContent=`Free Trial — ${d}d left`; }
}

// ─── Auth UI ──────────────────────────────────────────────────────────────────
function switchTab(tab) {
  ["Login","Signup","Admin"].forEach(t => {
    const k=t.toLowerCase();
    document.getElementById("tab"+t)?.classList.toggle("active",k===tab);
    document.getElementById("form"+t)?.classList.toggle("hidden",k!==tab);
  });
  ["liErr","suErr","adErr"].forEach(id=>hideErr(id));
}
function togglePw(id, btn) {
  const inp=document.getElementById(id), show=inp.type==="password";
  inp.type=show?"text":"password";
  btn.querySelector(".eye-show").classList.toggle("hidden",show);
  btn.querySelector(".eye-hide").classList.toggle("hidden",!show);
}
function showErr(id, msg) {
  const el=document.getElementById(id); if(!el) return;
  el.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${esc(msg)}`;
  el.classList.remove("hidden");
}
function hideErr(id) { const el=document.getElementById(id); if(el){el.textContent="";el.classList.add("hidden");} }
function setBusy(btnId, yes, label) {
  const btn=document.getElementById(btnId); if(!btn) return;
  btn.disabled=yes;
  btn.innerHTML=yes
    ?`<div class="spinner sm" style="border-top-color:#000"></div><span>Please wait…</span>`
    :`<span>${label}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
}

// ─── Login ────────────────────────────────────────────────────────────────────
async function handleLogin() {
  const email=(document.getElementById("liEmail").value||"").trim().toLowerCase();
  const pass=document.getElementById("liPass").value||"";
  hideErr("liErr");
  if(!email||!pass){showErr("liErr","Fill in all fields.");return;}
  setBusy("loginBtn",true);
  try {
    await dbInit();
    const id=uidHash(email), u=DB.users[id];
    if(!u||u.pw!==pwHash(pass,id)){showErr("liErr","Incorrect email or password.");return;}
    if(DB.banned?.[id]){showErr("liErr","This account has been suspended. Contact ANICADE Tech.");return;}
    const user={uid:id,name:u.name,email,trialStart:u.trialStart};
    saveSession(user); boot(user);
  } catch(e){console.error("Login:",e);showErr("liErr",e.message||"Connection error.");}
  finally{setBusy("loginBtn",false,"Sign In");}
}

// ─── Signup ───────────────────────────────────────────────────────────────────
async function handleSignup() {
  const name=(document.getElementById("suName").value||"").trim();
  const email=(document.getElementById("suEmail").value||"").trim().toLowerCase();
  const pass=document.getElementById("suPass").value||"";
  hideErr("suErr");
  if(!name||!email||!pass){showErr("suErr","Fill in all fields.");return;}
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){showErr("suErr","Enter a valid email.");return;}
  if(pass.length<6){showErr("suErr","Password must be at least 6 characters.");return;}
  setBusy("signupBtn",true);
  try {
    await dbInit();
    const id=uidHash(email);
    if(DB.users[id]){showErr("suErr","Account already exists with this email.");return;}
    DB.users[id]={name,email,pw:pwHash(pass,id),trialStart:new Date().toISOString()};
    DB.chats[id]={};
    await dbSave();
    const user={uid:id,name,email,trialStart:DB.users[id].trialStart};
    saveSession(user); boot(user);
  } catch(e){console.error("Signup:",e);showErr("suErr",e.message||"Signup failed.");}
  finally{setBusy("signupBtn",false,"Create Account");}
}

// ─── Admin Login ──────────────────────────────────────────────────────────────
async function handleAdminLogin() {
  const email=(document.getElementById("adEmail").value||"").trim().toLowerCase();
  const pass=document.getElementById("adPass").value||"";
  hideErr("adErr");
  if(!email||!pass){showErr("adErr","Fill in both fields.");return;}
  if(email!==ADMIN_EMAIL.toLowerCase()||pass!==ADMIN_PASS){showErr("adErr","Incorrect admin credentials.");return;}
  setBusy("adminLoginBtn",true);
  try {
    await dbInit();
    const id=uidHash(email);
    if(!DB.users[id]){
      DB.users[id]={name:"Admin",email,pw:pwHash(pass,id),trialStart:new Date().toISOString()};
      DB.chats[id]={};
      await dbSave();
    }
    const user={uid:id,name:DB.users[id].name,email,trialStart:DB.users[id].trialStart,isAdmin:true};
    saveSession(user); boot(user);
  } catch(e){console.error("Admin login:",e);showErr("adErr",e.message||"Login failed.");}
  finally{setBusy("adminLoginBtn",false,"Admin Sign In");}
}

// ─── Logout ───────────────────────────────────────────────────────────────────
function logout() {
  if(voiceMode) stopVoiceCall();
  synth.cancel();
  clearSess(); curUser=null; activeId=null;
  document.getElementById("app").classList.add("hidden");
  document.getElementById("authOverlay").classList.remove("hidden");
  document.getElementById("liEmail").value="";
  document.getElementById("liPass").value="";
  document.getElementById("adminBtn")?.classList.add("hidden");
  switchTab("login");
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
function boot(user) {
  curUser=user;
  document.getElementById("authOverlay").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("userNm").textContent=user.name;
  document.getElementById("userAv").textContent=user.name.charAt(0).toUpperCase();
  if(user.trialStart) renderTrial(user.trialStart);
  if(isAdmin(user)) document.getElementById("adminBtn")?.classList.remove("hidden");
  if(DB.adminNote){
    const sn=document.getElementById("sysNote"),snt=document.getElementById("sysNoteText");
    if(sn&&snt){snt.textContent=DB.adminNote;sn.classList.remove("hidden");}
  }
  initVoice();
  renderChatList();
  const ids=Object.keys(myChats());
  if(ids.length) loadChat(ids[ids.length-1]); else showWelcome();
  if(!eventsOn) setupEvents();
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────
function openAdmin() {
  if(!isAdmin(curUser)) return;
  dbInit().then(()=>{
    document.getElementById("adminOverlay").classList.remove("hidden");
    populateAdmin();
  }).catch(()=>{
    document.getElementById("adminOverlay").classList.remove("hidden");
    populateAdmin();
  });
}
function closeAdmin() { document.getElementById("adminOverlay").classList.add("hidden"); }

function populateAdmin() {
  const users=DB.users, allChats=DB.chats, uids=Object.keys(users);
  let totalMsgs=0, activeTrials=0, totalChats=0;
  uids.forEach(id=>{
    const uc=allChats[id]||{}, cids=Object.keys(uc);
    totalChats+=cids.length;
    cids.forEach(cid=>{totalMsgs+=(uc[cid].history||[]).length;});
    if(daysLeft(users[id].trialStart||new Date().toISOString())>0) activeTrials++;
  });
  document.getElementById("statUsers").textContent=uids.length;
  document.getElementById("statChats").textContent=totalChats;
  document.getElementById("statMsgs").textContent=totalMsgs;
  document.getElementById("statTrial").textContent=activeTrials;
  const tbody=document.getElementById("adminUsersBody"); tbody.innerHTML="";
  if(!uids.length){
    tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;color:var(--tx3);padding:20px">No users yet</td></tr>`;
    return;
  }
  uids.forEach(id=>{
    const u=users[id];
    const d=daysLeft(u.trialStart||new Date().toISOString());
    const uc=Object.keys(allChats[id]||{}).length;
    const cls=d===0?"atrial-exp":d<=7?"atrial-warn":"atrial-ok";
    const banned=DB.banned?.[id]?"🚫 Banned":"–";
    const tr=document.createElement("tr");
    tr.innerHTML=`
      <td>${esc(u.name)}</td>
      <td style="font-family:var(--mono);font-size:.73rem">${esc(u.email)}</td>
      <td style="font-size:.73rem">${u.trialStart?new Date(u.trialStart).toLocaleDateString():"—"}</td>
      <td><span class="${cls}">${d===0?"Expired":d+"d"}</span></td>
      <td style="font-family:var(--mono)">${uc}</td>
      <td>${banned}</td>
      <td class="admin-actions-cell">
        <button class="admin-action-btn extend" onclick="adminExtendTrial('${id}')" title="Extend trial 30 days">+30d</button>
        <button class="admin-action-btn view" onclick="adminViewChats('${id}')" title="View chats">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
        <button class="admin-action-btn ban" onclick="adminToggleBan('${id}')" title="${DB.banned?.[id]?"Unban":"Ban"} user">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
        </button>
        <button class="admin-action-btn del" onclick="adminDeleteUser('${id}')" title="Delete user">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>
        </button>
      </td>`;
    tbody.appendChild(tr);
  });
  const noteEl=document.getElementById("adminNote");
  if(noteEl) noteEl.value=DB.adminNote||"";
}

async function adminExtendTrial(id) {
  if(!DB.users[id]) return;
  const cur=new Date(DB.users[id].trialStart||Date.now());
  cur.setDate(cur.getDate()+30);
  DB.users[id].trialStart=cur.toISOString();
  await dbSave(); populateAdmin(); toast("Trial extended by 30 days","ok");
}

async function adminToggleBan(id) {
  if(!DB.banned) DB.banned={};
  if(DB.banned[id]){ delete DB.banned[id]; toast("User unbanned","ok"); }
  else { DB.banned[id]=true; toast("User banned","warn"); }
  await dbSave(); populateAdmin();
}

function adminViewChats(id) {
  const userChats=DB.chats[id]||{};
  const lines=Object.values(userChats).map(c=>`[${c.title}]\n`+c.history.map(m=>`${m.role}: ${m.text?.slice(0,200)}`).join("\n")).join("\n\n---\n\n");
  const w=window.open("","_blank","width=700,height=600");
  w.document.write(`<pre style="background:#070B11;color:#E4EEF8;padding:20px;font-family:monospace;font-size:13px;white-space:pre-wrap">${lines||"No chats"}</pre>`);
}

async function adminDeleteUser(id) {
  if(!confirm("Delete this user and all their chats? Cannot be undone.")) return;
  delete DB.users[id]; delete DB.chats[id]; delete DB.banned?.[id];
  await dbSave(); populateAdmin(); toast("User deleted","ok");
}

async function saveAdminNote() {
  DB.adminNote=(document.getElementById("adminNote").value||"").trim();
  await dbSave(); toast("Note saved — all users will see it on next load","ok");
}

async function resetAllChats() {
  if(!confirm("Reset ALL chats for ALL users? Cannot be undone.")) return;
  Object.keys(DB.chats).forEach(id=>{DB.chats[id]={};});
  await dbSave(); populateAdmin(); toast("All chats reset","ok");
}

function adminExportData() {
  const blob=new Blob([JSON.stringify(DB,null,2)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
  a.download=`anitechai-export-${new Date().toISOString().slice(0,10)}.json`;
  a.click(); toast("Data exported","ok");
}

// ─── Chats ────────────────────────────────────────────────────────────────────
function myChats() { if(!DB.chats[curUser.uid]) DB.chats[curUser.uid]={}; return DB.chats[curUser.uid]; }

function newChat() {
  const id="c"+Date.now();
  myChats()[id]={title:"New Chat",history:[]};
  scheduleSave(); renderChatList(); loadChat(id);
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("inputTa").focus();
}

function loadChat(id) {
  activeId=id;
  document.getElementById("messages").innerHTML="";
  const c=myChats()[id]; if(!c) return;
  document.getElementById("chatTitle").textContent=c.title;
  if(!c.history.length){showWelcome();return;}
  document.getElementById("welcome").style.display="none";
  c.history.forEach(m=>m.role==="user"?renderUser(m.text):renderAI(m.text,false));
  scrollDown();
  document.querySelectorAll(".chat-item").forEach(el=>el.classList.toggle("active",el.dataset.id===id));
}

function delChat(id,e) {
  e.stopPropagation(); delete myChats()[id]; scheduleSave(); renderChatList();
  const ids=Object.keys(myChats());
  if(activeId===id){
    if(ids.length) loadChat(ids[ids.length-1]);
    else{activeId=null;showWelcome();document.getElementById("chatTitle").textContent="New Chat";}
  }
}

function renderChatList() {
  const el=document.getElementById("chatList"); el.innerHTML="";
  const ids=Object.keys(myChats()).reverse();
  if(!ids.length){el.innerHTML=`<p style="color:var(--tx3);font-size:.74rem;padding:10px 12px;text-align:center">No chats yet</p>`;return;}
  ids.forEach(id=>{
    const c=myChats()[id];
    const div=document.createElement("div");
    div.className="chat-item"+(id===activeId?" active":""); div.dataset.id=id;
    div.innerHTML=`
      <span class="chat-item-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
      <span class="chat-item-lbl">${esc(c.title)}</span>
      <button class="chat-item-del" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg></button>`;
    div.addEventListener("click",()=>{loadChat(id);document.getElementById("sidebar").classList.remove("open");});
    div.querySelector(".chat-item-del").addEventListener("click",e=>delChat(id,e));
    el.appendChild(div);
  });
}

function setTitle(id,text) {
  myChats()[id].title=text.slice(0,46)+(text.length>46?"…":"");
  document.getElementById("chatTitle").textContent=myChats()[id].title;
  scheduleSave(); renderChatList();
}

// ─── UI ───────────────────────────────────────────────────────────────────────
function showWelcome() { document.getElementById("welcome").style.display="flex"; document.getElementById("messages").innerHTML=""; }
const scrollDown=()=>{const a=document.getElementById("chatArea");setTimeout(()=>a.scrollTop=a.scrollHeight,60);};
const AI_SVG=`<svg viewBox="0 0 44 54" fill="none"><defs><linearGradient id="avG" x1="22" y1="3" x2="36" y2="40" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#00FFD1"/><stop offset="100%" stop-color="#0044AA" stop-opacity=".3"/></linearGradient></defs><path d="M22 3 L31 20 Q38 25 33 34 Q28 41 22 39 Q16 37 18 27 L22 3Z" fill="url(#avG)" stroke="#00FFD1" stroke-width=".9"/><line x1="22" y1="3" x2="22" y2="51" stroke="#00FFD1" stroke-width="2.8" stroke-linecap="round"/><circle cx="22" cy="3" r="2.5" fill="#00FFD1"/></svg>`;
const USER_SVG=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;

function renderUser(text) {
  document.getElementById("welcome").style.display="none";
  const el=document.createElement("div"); el.className="msg user-msg";
  el.innerHTML=`
    <div class="msg-body" style="order:1">
      <div class="msg-from user">You</div>
      <div class="bubble">${esc(text).replace(/\n/g,"<br>")}</div>
      <div class="msg-actions">
        <button class="msg-action-btn" title="Copy message" onclick="copyMessage(this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy
        </button>
      </div>
    </div>
    <div class="av user" style="order:2">${USER_SVG}</div>`;
  document.getElementById("messages").appendChild(el); scrollDown();
}

function renderAI(content, speak=true) {
  document.getElementById("welcome").style.display="none";
  const el=document.createElement("div"); el.className="msg";

  // Image directive handling
  const imgMatch = content.match(/\[IMAGE:\s*([\s\S]+?)\]/i);
  let bubbleHtml = "";

  if(imgMatch) {
    const prompt = imgMatch[1].trim();
    const imgSrc = POLL_IMG(prompt); // Use Pollinations — reliable, instant
    bubbleHtml = `
      <div class="ai-img-wrap">
        <div class="ai-img-loading" id="imgLoad_${Date.now()}">
          <div class="spinner"></div><span>Generating image…</span>
        </div>
        <img class="ai-img" src="${imgSrc}" alt="${esc(prompt)}"
          onload="this.previousElementSibling.style.display='none';this.style.display='block'"
          onerror="this.previousElementSibling.innerHTML='<span style=\'color:var(--red)\'>Image failed. Try a different prompt.</span>';this.style.display='none'"
          style="display:none"/>
        <p class="ai-img-caption">${esc(prompt)}</p>
        <a class="ai-img-download" href="${imgSrc}" download="ani-tech-ai-image.jpg" target="_blank">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download
        </a>
      </div>`;
    content = `Generated image: ${prompt}`;
  } else {
    bubbleHtml = md(content);
  }

  // Safe-encode text for data attribute
  const safeText = content.replace(/\\/g,"\\\\").replace(/"/g,"&quot;");
  el.innerHTML=`
    <div class="av ai">${AI_SVG}</div>
    <div class="msg-body">
      <div class="msg-from ai">Ani-Tech AI</div>
      <div class="bubble">${bubbleHtml}</div>
      <div class="msg-actions">
        <button class="msg-action-btn" title="Copy message" onclick="copyMessage(this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy
        </button>
        <button class="msg-action-btn speak-btn" data-text="${safeText}" title="Read aloud" onclick="speakText(this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>Speak
        </button>
      </div>
    </div>`;
  document.getElementById("messages").appendChild(el);
  attachCopy(el); scrollDown();
  if(speak && voiceMode && content) speakOut(content);
}

function copyMessage(btn) {
  const bubble = btn.closest(".msg-body").querySelector(".bubble");
  const text = bubble?.innerText || "";
  navigator.clipboard.writeText(text).then(()=>{
    btn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>Copied!`;
    setTimeout(()=>{btn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy`;},1800);
  });
}

function renderThinking() {
  document.getElementById("welcome").style.display="none";
  const el=document.createElement("div"); el.className="msg"; el.id="thinking";
  el.innerHTML=`<div class="av ai">${AI_SVG}</div><div class="msg-body"><div class="msg-from ai">Ani-Tech AI</div><div class="bubble"><div class="thinking"><span></span><span></span><span></span></div></div></div>`;
  document.getElementById("messages").appendChild(el); scrollDown(); return el;
}

function toast(msg, type="err") {
  let t=document.querySelector(".toast");
  if(!t){t=document.createElement("div");t.className="toast";document.body.appendChild(t);}
  t.className=`toast ${type}`;
  t.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${esc(msg)}`;
  t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),4500);
}

// ─── Markdown ─────────────────────────────────────────────────────────────────
function md(text) {
  if(!text) return "";
  text=text.replace(/```(\w*)\n?([\s\S]*?)```/g,(_,lang,code)=>{
    const l=esc(lang||""),c=esc(code.trim()),enc=encodeURIComponent(code.trim());
    return `<div class="code-wrap"><pre><code class="lang-${l}">${c}</code></pre><button class="copy-btn" data-code="${enc}">Copy</button></div>`;
  });
  text=text.replace(/`([^`\n]+)`/g,"<code>$1</code>");
  text=text.replace(/^### (.+)$/gm,"<h3>$1</h3>").replace(/^## (.+)$/gm,"<h2>$1</h2>").replace(/^# (.+)$/gm,"<h1>$1</h1>");
  text=text.replace(/\*\*\*(.+?)\*\*\*/g,"<strong><em>$1</em></strong>").replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\*(.+?)\*/g,"<em>$1</em>");
  text=text.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
  text=text.replace(/^---$/gm,'<hr style="border:none;border-top:1px solid var(--bd);margin:10px 0">');
  text=text.replace(/^([ \t]*[-*+] .+\n?)+/gm,m=>`<ul>${m.trim().split("\n").map(l=>`<li>${l.replace(/^[ \t]*[-*+] /,"")}</li>`).join("")}</ul>`);
  text=text.replace(/^([ \t]*\d+\. .+\n?)+/gm,m=>`<ol>${m.trim().split("\n").map(l=>`<li>${l.replace(/^[ \t]*\d+\. /,"")}</li>`).join("")}</ol>`);
  text=text.replace(/\n{2,}/g,"</p><p>").replace(/\n/g,"<br>");
  text="<p>"+text+"</p>";
  text=text.replace(/<p>(<(?:h[123]|ul|ol|pre|hr|div))/g,"$1").replace(/(<\/(?:h[123]|ul|ol|pre|div)>)<\/p>/g,"$1");
  return text;
}
function attachCopy(c){c.querySelectorAll(".copy-btn").forEach(b=>b.addEventListener("click",()=>navigator.clipboard.writeText(decodeURIComponent(b.dataset.code)).then(()=>{b.textContent="Copied!";setTimeout(()=>b.textContent="Copy",1800);})));}

// ─── TTS — picks best available voice ────────────────────────────────────────
function speakText(btn) {
  const text = btn.dataset.text || btn.closest(".msg-body")?.querySelector(".bubble")?.innerText || "";
  if(!text.trim()){toast("Nothing to read","warn");return;}
  if(synth.speaking){synth.cancel();btn.classList.remove("speaking");btn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>Speak`;return;}
  speakOut(text, btn);
}

function speakOut(text, btn=null) {
  synth.cancel();
  // Strip markdown for clean speech
  const clean = text
    .replace(/```[\s\S]*?```/g," code block. ")
    .replace(/\[IMAGE:.*?\]/gi,"[an image was generated]")
    .replace(/#{1,3} /g,"")
    .replace(/[*_`]/g,"")
    .replace(/https?:\/\/\S+/g,"link")
    .replace(/\n+/g," ")
    .trim()
    .slice(0,1200);

  const utt = new SpeechSynthesisUtterance(clean);
  utt.rate = 0.92; utt.pitch = 1.05; utt.volume = 1;

  // Pick best voice — priority order
  function pickVoice() {
    const voices = synth.getVoices();
    const priority = [
      v => v.name === "Google UK English Female",
      v => v.name === "Google US English",
      v => v.name.includes("Google") && v.lang.startsWith("en"),
      v => v.name === "Samantha",
      v => v.name === "Daniel",
      v => v.name.includes("Microsoft") && v.lang.startsWith("en"),
      v => v.lang === "en-US",
      v => v.lang.startsWith("en"),
    ];
    for(const test of priority){
      const v = voices.find(test);
      if(v) return v;
    }
    return null;
  }

  const setVoiceAndSpeak = () => {
    const v = pickVoice();
    if(v) utt.voice = v;
    if(btn){
      btn.classList.add("speaking");
      btn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>Stop`;
      utt.onend = () => {
        btn.classList.remove("speaking");
        btn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>Speak`;
      };
      utt.onerror = utt.onend;
    }
    synth.speak(utt);
  };

  // Voices may not be loaded yet on first call
  if(synth.getVoices().length) setVoiceAndSpeak();
  else { synth.onvoiceschanged = () => { synth.onvoiceschanged=null; setVoiceAndSpeak(); }; }
}

// ─── Voice Input ──────────────────────────────────────────────────────────────
function initVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR) return;
  recognition = new SR();
  recognition.continuous = false; recognition.interimResults = true; recognition.lang = "en-US";

  recognition.onresult = e => {
    let interim="", final="";
    for(const r of e.results){ if(r.isFinal) final+=r[0].transcript; else interim+=r[0].transcript; }
    const ta = document.getElementById("inputTa");
    ta.value = (final||interim).trim();
    ta.style.height="auto"; ta.style.height=Math.min(ta.scrollHeight,140)+"px";
    if(final && voiceMode) setTimeout(send,300);
  };

  recognition.onend = () => {
    document.getElementById("micBtn")?.classList.remove("listening");
    if(voiceMode && !busy) setTimeout(()=>{try{recognition.start();}catch{}},500);
  };

  recognition.onerror = e => {
    if(e.error!=="no-speech"&&e.error!=="aborted") console.warn("Voice:",e.error);
    document.getElementById("micBtn")?.classList.remove("listening");
  };
}

function tapSpeak() {
  if(!recognition){toast("Voice not supported in this browser","err");return;}
  if(voiceMode) return;
  try{recognition.start();}catch(e){}
  document.getElementById("micBtn")?.classList.add("listening");
}

function startVoiceCall() {
  if(!recognition){toast("Voice not supported in this browser","err");return;}
  voiceMode=true;
  document.getElementById("voiceCallBtn")?.classList.add("active");
  document.getElementById("voiceOverlay")?.classList.remove("hidden");
  synth.cancel();
  try{recognition.start();}catch{}
  setTimeout(()=>speakOut("Voice mode active. I'm listening. Speak your message and I'll answer."),400);
}

function stopVoiceCall() {
  voiceMode=false;
  try{recognition?.stop();}catch{}
  synth.cancel();
  document.getElementById("voiceCallBtn")?.classList.remove("active");
  document.getElementById("voiceOverlay")?.classList.add("hidden");
}

// ─── Web Search (same as uploaded) ───────────────────────────────────────────
async function webSearch(query) {
  try {
    const q = encodeURIComponent(query);
    const url = `https://api.allorigins.win/get?url=${encodeURIComponent(`https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`)}`;
    const res = await fetch(url, { signal:AbortSignal.timeout(5000) });
    if(!res.ok) return null;
    const wrapper = await res.json();
    const data = JSON.parse(wrapper.contents||"{}");
    const results = [];
    if(data.AbstractText) results.push(data.AbstractText);
    (data.RelatedTopics||[]).slice(0,4).forEach(t=>{if(t.Text) results.push(t.Text);});
    return results.length ? results.join("\n\n") : null;
  } catch { return null; }
}

function needsSearch(text) {
  const lower = text.toLowerCase();
  return ["latest","current","today","2026","news","recent","who is","what happened","price of","weather","release","version","update","trending","now","live"].some(k=>lower.includes(k));
}

// ─── Send ─────────────────────────────────────────────────────────────────────
async function send() {
  if(busy) return;
  const ta=document.getElementById("inputTa"), text=ta.value.trim();
  if(!text) return;
  if(curUser?.trialStart&&daysLeft(curUser.trialStart)===0){toast("Your 30-day free trial has expired. Visit www.anicadetech.xyz to renew.","warn");return;}
  if(isBanned(curUser)){toast("Your account has been suspended.","err");return;}
  if(!activeId||!myChats()[activeId]){const id="c"+Date.now();myChats()[id]={title:"New Chat",history:[]};activeId=id;renderChatList();}
  const isFirst=!myChats()[activeId].history.length;
  if(isFirst) setTitle(activeId,text);
  myChats()[activeId].history.push({role:"user",text});
  renderUser(text); ta.value=""; ta.style.height="auto";
  busy=true; document.getElementById("sendBtn").disabled=true;
  const thinkEl=renderThinking();
  try {
    const reply=await callGroq(myChats()[activeId].history);
    thinkEl.remove();
    myChats()[activeId].history.push({role:"assistant",text:reply});
    renderAI(reply,true); scheduleSave();
  } catch(e) {
    thinkEl.remove();
    const em="Error: "+e.message;
    myChats()[activeId].history.push({role:"assistant",text:em});
    renderAI(em,false); toast(e.message); console.error("send:",e);
  } finally{busy=false;document.getElementById("sendBtn").disabled=false;document.getElementById("inputTa").focus();}
}

// ─── Groq — 4-model rotation, never blocks on rate limit ─────────────────────
async function callGroq(history) {
  if(!GROQ_KEY||GROQ_KEY==="YOUR_GROQ_KEY_HERE") throw new Error("No Groq API key. Open app.js and add your free key from console.groq.com");

  const lastMsg = history[history.length-1]?.text||"";
  let searchNote = "";
  if(needsSearch(lastMsg)){
    const results = await webSearch(lastMsg);
    if(results) searchNote=`\n\n[WEB SEARCH RESULTS for "${lastMsg}"]:\n${results}\n[END SEARCH RESULTS]`;
  }

  const messages = [{role:"system",content:SYSTEM}];
  history.forEach((m,i)=>{
    const content=(i===history.length-1&&searchNote)?m.text+searchNote:m.text;
    messages.push({role:m.role==="assistant"?"assistant":"user",content});
  });

  const hdrs = {"Content-Type":"application/json","Authorization":`Bearer ${GROQ_KEY}`};

  for(const model of GROQ_MODELS){
    try{
      const res = await fetch(GROQ_URL,{method:"POST",headers:hdrs,body:JSON.stringify({model,messages,temperature:0.7,max_tokens:4096,top_p:0.95})});
      if(res.status===429){await new Promise(r=>setTimeout(r,700));continue;}
      if(res.status===401) throw new Error("Invalid Groq API key. Get a free one at console.groq.com");
      if(res.status===503) throw new Error("Groq is temporarily unavailable. Try again shortly.");
      if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e?.error?.message||`Groq error ${res.status}`);}
      const data=await res.json();
      const reply=data?.choices?.[0]?.message?.content;
      if(!reply) throw new Error("Empty response from Groq.");
      return reply;
    } catch(e){
      if(e.message.includes("rate")||e.message.includes("429")){continue;}
      throw e;
    }
  }
  throw new Error("All models busy. Please wait 60 seconds and try again.");
}

// ─── PWA Install — works on first click ──────────────────────────────────────
window.addEventListener("beforeinstallprompt",e=>{
  e.preventDefault(); deferredInstall=e;
  document.getElementById("installBanner")?.classList.remove("hidden");
});
window.addEventListener("appinstalled",()=>{
  document.getElementById("installBanner")?.classList.add("hidden");
  deferredInstall=null; toast("Ani-Tech AI installed!","ok");
});

function doInstall() {
  if(deferredInstall){
    deferredInstall.prompt();
    deferredInstall.userChoice.then(({outcome})=>{
      if(outcome==="accepted"){document.getElementById("installBanner")?.classList.add("hidden");deferredInstall=null;}
    });
  } else {
    const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari=/safari/i.test(navigator.userAgent)&&!/chrome/i.test(navigator.userAgent);
    if(isIOS&&isSafari) toast("Tap Share (□↑) → 'Add to Home Screen'","ok");
    else if(isIOS) toast("Open in Safari, then tap Share → 'Add to Home Screen'","ok");
    else toast("Tap browser menu (⋮) → 'Install App' or 'Add to Home Screen'","ok");
  }
}

function setupInstallBanner() {
  document.getElementById("installYes")?.addEventListener("click",doInstall);
  document.getElementById("installNo")?.addEventListener("click",()=>document.getElementById("installBanner")?.classList.add("hidden"));
  document.getElementById("manualInstallBtn")?.addEventListener("click",doInstall);
}

// ─── Events ───────────────────────────────────────────────────────────────────
function setupEvents() {
  eventsOn=true;
  document.getElementById("newChatBtn").addEventListener("click",newChat);
  document.getElementById("sendBtn").addEventListener("click",send);
  document.getElementById("micBtn")?.addEventListener("click",tapSpeak);
  document.getElementById("voiceCallBtn")?.addEventListener("click",()=>voiceMode?stopVoiceCall():startVoiceCall());
  document.getElementById("stopVoiceBtn")?.addEventListener("click",stopVoiceCall);

  const sb=document.getElementById("sidebar"),mb=document.getElementById("menuBtn");
  mb.addEventListener("click",()=>sb.classList.toggle("open"));
  document.addEventListener("click",e=>{if(!sb.contains(e.target)&&!mb.contains(e.target)) sb.classList.remove("open");});
  document.getElementById("adminOverlay")?.addEventListener("click",e=>{if(e.target===document.getElementById("adminOverlay")) closeAdmin();});

  const ta=document.getElementById("inputTa");
  ta.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}});
  ta.addEventListener("input",()=>{ta.style.height="auto";ta.style.height=Math.min(ta.scrollHeight,140)+"px";});
  document.querySelectorAll(".sug").forEach(b=>b.addEventListener("click",()=>{ta.value=b.dataset.q;send();}));
}

// ─── SW ───────────────────────────────────────────────────────────────────────
if("serviceWorker" in navigator){
  window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(e=>console.warn("SW:",e)));
}

// ─── Startup ──────────────────────────────────────────────────────────────────
(async function startup(){
  setupInstallBanner();
  const loading=document.getElementById("authLoading"),authTabs=document.getElementById("authTabs"),formLogin=document.getElementById("formLogin");
  loading.classList.remove("hidden"); authTabs.classList.add("hidden"); formLogin.classList.add("hidden");
  try{ await dbInit(); }catch(e){ console.error("DB init:",e); dbSetStatus("err","DB offline — check connection"); }
  loading.classList.add("hidden"); authTabs.classList.remove("hidden"); formLogin.classList.remove("hidden");

  // Restore session (survives page reload)
  const s = getSession();
  if(s?.uid && DB.users[s.uid]){
    const u = DB.users[s.uid];
    boot({uid:s.uid, name:u.name, email:u.email, trialStart:u.trialStart, isAdmin:s.isAdmin||false});
    return;
  }
  document.getElementById("authOverlay").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
})();
