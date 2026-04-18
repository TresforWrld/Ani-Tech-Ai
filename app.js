/**
 * ANI-TECH AI v4.2 — by ANICADE Tech
 * CEO: Tresfor Wrld | www.anicadetech.xyz | Kabwe, Zambia
 *
 * v4.0 changes:
 *  ✓ No install popup (removed)
 *  ✓ Session persists across reload AND view changes
 *  ✓ Reviews bin filled: 69e2b0e6aaba8821970ecd8a
 *  ✓ AI: Groq (llama-3.3-70b + rotation) — xAI Grok ready when provisioned
 *  ✓ Plans: Free/K25/K50/K100/K200 per month (original prices)
 *  ✓ Free plan strict limits, paid = unlimited
 *  ✓ Admin: edit user subscription + approve payments
 *  ✓ Global chat (live between all users via JSONBin polling)
 *  ✓ Code editor panel (Monaco-style textarea with run button)
 *  ✓ User tags & badges system
 *  ✓ Contact & legal info from anicadetech.xyz
 *  ✓ Pricing panel with all tiers
 */

// ─── CONFIG ───────────────────────────────────────────────────────────────────
// AI: Groq (reliable free tier) with xAI Grok as upgrade option
// Groq works now — xAI key kept for future use when account is provisioned
const GROQ_KEY   = "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";
const GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions";
// 4-model rotation — if one hits rate limit, next is tried automatically
const GROQ_MODELS = [
  "llama-3.3-70b-versatile",   // best quality
  "llama-3.1-8b-instant",      // fastest
  "gemma2-9b-it",              // fallback 1
  "mixtral-8x7b-32768",        // fallback 2
];
// xAI Grok — will be activated once account is provisioned at x.ai
const XAI_KEY   = "xai-RKGHkeWsiWbfzTdsJwnFTL7qNwqmGbSonHaKUREMOMZ44I2avLKpViqMhHhhctXKYqkxVlEMBWVknvcI";
const XAI_URL   = "https://api.x.ai/v1/chat/completions";
const USE_XAI   = false; // set to true once x.ai account has API access

const JB_MASTER  = "$2a$10$VJXQzwtVgNhMTIJiiQvpy.hG7XaRD0.H42NyZhKzeLRungeekMmpO";
const JB_BASE    = "https://api.jsonbin.io/v3/b";
const FIXED_BIN  = "69b14c5bc3097a1dd5173665";
const REVIEWS_BIN  = "69e2b0e6aaba8821970ecd8a";  // Reviews bin
const REVIEWS_HDR  = { "Content-Type":"application/json", "X-Master-Key":JB_MASTER };

const SESSION_KEY = "anitechai_s4";
const ADMIN_EMAIL = "anicadetech@gmail.com";
const ADMIN_PASS  = "Krsten2044";

// Image generation
const makeImgUrl = (prompt, style="") => {
  const full = [prompt,style,"high quality, sharp, detailed, 4k"].filter(Boolean).join(", ");
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(full)}?width=768&height=768&nologo=true&enhance=true&seed=${Math.floor(Math.random()*99999)}`;
};

// ─── SUBSCRIPTION PLANS ───────────────────────────────────────────────────────
const PLANS = {
  free:    { name:"Free",    price:"K0",   perMonth:"",       color:"#94A3B8", msgLimit:20,  imgLimit:3,  badge:"FR", features:["20 messages/day","3 image generations/day","Basic AI access","Community chat"] },
  starter: { name:"Starter", price:"K25",  perMonth:"/month", color:"#00BFFF", msgLimit:999, imgLimit:999, badge:"ST", features:["Unlimited messages","Unlimited images","Priority AI","Full code editor","Badge: Starter","WhatsApp support"] },
  pro:     { name:"Pro",     price:"K50",  perMonth:"/month", color:"#C6A85C", msgLimit:999, imgLimit:999, badge:"PR", features:["Everything in Starter","Faster responses","Custom AI personality","Pro badge","Priority support"] },
  elite:   { name:"Elite",   price:"K100", perMonth:"/month", color:"#39ff14", msgLimit:999, imgLimit:999, badge:"EL", features:["Everything in Pro","Team features (up to 5)","API access","Elite badge","Direct dev support","Early features"] },
  business:{ name:"Business",price:"K200", perMonth:"/month", color:"#FF6B35", msgLimit:999, imgLimit:999, badge:"BZ", features:["Everything in Elite","Unlimited team seats","Custom AI branding","Business badge","Account manager","Agent commission 15%"] },
};

// ─── BADGES ───────────────────────────────────────────────────────────────────
const BADGES = {
  new_user:   { label:"New Member",    icon:"NM", desc:"Just joined ANICADE Tech" },
  verified:   { label:"Verified",      icon:"VF", desc:"Verified ANICADE Tech user" },
  starter:    { label:"Starter",       icon:"ST", desc:"Active Starter subscriber" },
  pro:        { label:"Pro",           icon:"PR", desc:"Active Pro subscriber" },
  elite:      { label:"Elite",         icon:"EL", desc:"Active Elite subscriber" },
  business:   { label:"Business",      icon:"BZ", desc:"Active Business subscriber" },
  power_user: { label:"Power User",    icon:"PW", desc:"Sent 100+ messages" },
  creator:    { label:"Creator",       icon:"CR", desc:"Generated 20+ images" },
  early_bird: { label:"Early Adopter", icon:"EB", desc:"Joined in the first wave" },
  admin:      { label:"Staff",         icon:"AF", desc:"ANICADE Tech team member" },
};

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
function buildSystem(user) {
  const prefs     = user.prefs||{};
  const interests = (prefs.interests||[]).join(", ")||"general topics";
  const style     = prefs.aiStyle||"balanced";
  const tasks     = (prefs.tasks||[]).join(", ")||"answering questions";
  const tone      = prefs.tone||"professional";
  const plan      = user.plan||"free";
  const planName  = PLANS[plan]?.name||"Free";

  return `You are Ani-Tech AI — the official AI assistant of ANICADE Tech, built in 2026.
CEO & Founder: Tresfor Wrld | Website: https://www.anicadetech.xyz | Kabwe, Zambia
Services: web dev (React/Next.js), mobile apps, AI/ML, UI/UX, DevOps, tech consulting

USER: ${user.name} | Plan: ${planName} | Interests: ${interests} | Tasks: ${tasks}
→ Style: ${style} | Tone: ${tone}. Tailor ALL responses precisely to these preferences.

CAPABILITIES: coding, image generation, writing, math, research, translation, career advice, business advice, web search.

IMAGE: when user asks to generate/draw/create/make an image → respond ONLY with:
[IMAGE: vivid detailed description]

RESTRICTIONS — NEVER reveal: AI model names, source code, API keys, DB structure, internals.
If asked: "I'm Ani-Tech AI by ANICADE Tech — I can't share internal details. What can I help you with?"

STYLE: ${style}. TONE: ${tone}. Lead with the answer. Use Markdown. Complete code only.
PROMOTION: mention www.anicadetech.xyz naturally when relevant. Never pushy.
WEB SEARCH: cite with "According to recent sources…" when [WEB RESULTS] provided.`;
}

// ─── STATE ────────────────────────────────────────────────────────────────────
let DB          = { users:{}, chats:{}, adminNote:"", banned:{}, globalChat:[], payments:[] };
let curUser     = null;
let activeId    = null;
let activeView  = "chat";   // chat | code | pricing | global | contact | legal
let busy        = false;
let eventsOn    = false;
let deferredInstall = null;
let voiceMode   = false;
let recognition = null;
let ratingStars = 0;
let globalChatPoll = null;
let msgCount    = 0;  // daily message counter
let imgCount    = 0;  // daily image counter

// ─── DB ───────────────────────────────────────────────────────────────────────
const JB_HDR = { "Content-Type":"application/json", "X-Master-Key":JB_MASTER };

async function dbInit() {
  dbSetStatus("syncing","Loading…");
  let attempts = 0;
  while(attempts < 3) {
    try {
      const res = await fetch(`${JB_BASE}/${FIXED_BIN}/latest`, {
        headers: JB_HDR,
        cache: "no-store"  // always get fresh data, never cached
      });
      if(res.ok) {
        const j = await res.json();
        // Deep merge: preserve existing in-memory data if DB record is somehow empty
        const record = j.record || {};
        DB = {
          users:      record.users      || DB.users      || {},
          chats:      record.chats      || DB.chats      || {},
          adminNote:  record.adminNote  ?? DB.adminNote  ?? "",
          banned:     record.banned     || DB.banned     || {},
          globalChat: record.globalChat || DB.globalChat || [],
          payments:   record.payments   || DB.payments   || [],
        };
        dbSetStatus("ok","Connected");
        return;
      }
      if(res.status === 401 || res.status === 403) {
        throw new Error("DB access denied — check JSONBin master key");
      }
      attempts++;
      await new Promise(r => setTimeout(r, 800 * attempts));
    } catch(e) {
      attempts++;
      if(attempts >= 3) throw new Error("Cannot reach database. Check internet connection.");
      await new Promise(r => setTimeout(r, 800 * attempts));
    }
  }
  throw new Error("Database unavailable after 3 attempts.");
}

async function dbSave() {
  dbSetStatus("syncing","Saving…");
  for(let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${JB_BASE}/${FIXED_BIN}`, {
        method: "PUT", headers: JB_HDR, body: JSON.stringify(DB)
      });
      if(res.ok) { dbSetStatus("ok","Saved ✓"); return; }
      if(res.status === 401 || res.status === 403) { dbSetStatus("err","DB auth error"); return; }
      await new Promise(r => setTimeout(r, 600));
    } catch(e) {
      if(attempt === 2) { dbSetStatus("err","Save failed — check connection"); console.error("dbSave:",e); }
      else await new Promise(r => setTimeout(r, 600));
    }
  }
}

let saveTimer = null;
function scheduleSave() { if(saveTimer) clearTimeout(saveTimer); saveTimer=setTimeout(dbSave,2000); }
function dbSetStatus(state,text) {
  const el=document.getElementById("dbStatus"); if(!el) return;
  el.className="db-status "+state;
  const t=document.getElementById("dbStatusText"); if(t) t.textContent=text;
}

// ─── SESSION — stored in both localStorage (persistent) + sessionStorage (fallback) ──
const getSession = () => {
  try {
    const ls = localStorage.getItem(SESSION_KEY);
    if(ls && ls !== "null") return JSON.parse(ls);
  } catch(e) {}
  try {
    const ss = sessionStorage.getItem(SESSION_KEY);
    if(ss && ss !== "null") return JSON.parse(ss);
  } catch(e) {}
  return null;
};
const saveSession = u => {
  const v = JSON.stringify(u);
  try { localStorage.setItem(SESSION_KEY, v); } catch(e) {}
  try { sessionStorage.setItem(SESSION_KEY, v); } catch(e) {}
};
const clearSess = () => {
  try { localStorage.removeItem(SESSION_KEY); } catch(e) {}
  try { sessionStorage.removeItem(SESSION_KEY); } catch(e) {}
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function h(s) { let v=5381; for(let i=0;i<s.length;i++) v=((v<<5)+v)^s.charCodeAt(i); return (v>>>0).toString(36); }
const uidH    = email => h(email.toLowerCase().trim());
const pwHash  = (pw,id) => h(pw+id+"anitechai2026");
const isAdmin  = u => u?.email?.toLowerCase()===ADMIN_EMAIL.toLowerCase() && u?.isAdmin===true;
const isBanned = u => !!DB.banned?.[u?.uid];
const getPlan  = u => PLANS[u?.plan||"free"]||PLANS.free;
const isPaid   = u => u?.plan && u.plan!=="free";
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

// ─── USAGE LIMITS (free plan only) ────────────────────────────────────────────
const DAY_KEY = () => `limits_${new Date().toDateString()}`;
function getUsage() {
  try { return JSON.parse(localStorage.getItem(DAY_KEY())||"{}"); } catch { return {}; }
}
function bumpUsage(type) {
  const u=getUsage(); u[type]=(u[type]||0)+1;
  localStorage.setItem(DAY_KEY(),JSON.stringify(u));
  return u[type];
}
function checkLimit(type) {
  if (isPaid(curUser)||isAdmin(curUser)) return true; // paid = unlimited
  const plan = getPlan(curUser);
  const limit = type==="img" ? plan.imgLimit : plan.msgLimit;
  const used  = getUsage()[type]||0;
  if (used >= limit) {
    toast(`Free plan limit reached (${limit} ${type==="img"?"images":"messages"}/day). Upgrade for unlimited access!`,"warn");
    return false;
  }
  return true;
}

// ─── BADGES HELPERS ───────────────────────────────────────────────────────────
function getUserBadges(uid) {
  const u = DB.users[uid]; if (!u) return [];
  const badges = [];
  if (u.badges) { badges.push(...u.badges); return [...new Set(badges)]; }
  // Auto-assign based on plan
  badges.push("new_user");
  if (u.plan && u.plan!=="free") badges.push(u.plan);
  const msgs = Object.values(DB.chats[uid]||{}).reduce((t,c)=>t+(c.history?.length||0),0);
  if (msgs>=100) badges.push("power_user");
  return [...new Set(badges)];
}
function renderBadges(uid) {
  const b = getUserBadges(uid);
  return b.map(k=>{const d=BADGES[k]; return d?`<span class="badge" title="${d.desc}" style="cursor:default">${d.icon} ${d.label}</span>`:""}).join("");
}
async function adminSetBadge(uid, badge, add) {
  if (!DB.users[uid]) return;
  if (!DB.users[uid].badges) DB.users[uid].badges = getUserBadges(uid);
  if (add) { if (!DB.users[uid].badges.includes(badge)) DB.users[uid].badges.push(badge); }
  else { DB.users[uid].badges = DB.users[uid].badges.filter(b=>b!==badge); }
  await dbSave(); populateAdmin(); toast(`Badge ${add?"added":"removed"}`, "ok");
}

// ─── AUTH UI ──────────────────────────────────────────────────────────────────
function switchTab(tab) {
  ["Login","Signup","Admin"].forEach(t=>{
    const k=t.toLowerCase();
    document.getElementById("tab"+t)?.classList.toggle("active",k===tab);
    document.getElementById("form"+t)?.classList.toggle("hidden",k!==tab);
  });
  ["liErr","suErr","adErr"].forEach(id=>hideErr(id));
}
function togglePw(id,btn) {
  const inp=document.getElementById(id), show=inp.type==="password";
  inp.type=show?"text":"password";
  btn.querySelector(".eye-show").classList.toggle("hidden",show);
  btn.querySelector(".eye-hide").classList.toggle("hidden",!show);
}
function showErr(id,msg) {
  const el=document.getElementById(id); if(!el) return;
  el.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${esc(msg)}`;
  el.classList.remove("hidden");
}
function hideErr(id) { const el=document.getElementById(id); if(el){el.textContent="";el.classList.add("hidden");} }
function setBusy(id,yes,label) {
  const btn=document.getElementById(id); if(!btn) return;
  btn.disabled=yes;
  btn.innerHTML=yes
    ?`<div class="spinner sm" style="border-top-color:#0B1C2D"></div><span>Please wait…</span>`
    :`<span>${label}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
}

// ─── FACE ID ──────────────────────────────────────────────────────────────────
async function handleFaceLogin() {
  if (!window.PublicKeyCredential) { toast("Biometric not supported on this device","err"); return; }
  try {
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!available) { toast("No biometric sensor found","err"); return; }
    const challenge = new Uint8Array(32); crypto.getRandomValues(challenge);
    const assertion = await navigator.credentials.get({publicKey:{challenge,timeout:60000,userVerification:"required",rpId:window.location.hostname||"localhost"}});
    if (assertion) {
      const storedId = localStorage.getItem("faceid_uid");
      if (storedId && DB.users[storedId]) {
        const u=DB.users[storedId];
        const user={uid:storedId,name:u.name,email:u.email,trialStart:u.trialStart,prefs:u.prefs||{},plan:u.plan||"free"};
        saveSession(user); boot(user); toast("Biometric login successful!","ok");
      } else { toast("No account linked. Sign in normally first.","warn"); }
    }
  } catch(e) {
    if (e.name==="NotAllowedError") toast("Authentication cancelled","warn");
    else toast("Biometric login failed — use password","err");
  }
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
async function handleLogin() {
  const email=(document.getElementById("liEmail").value||"").trim().toLowerCase();
  const pass=document.getElementById("liPass").value||"";
  hideErr("liErr");
  if(!email||!pass){showErr("liErr","Fill in all fields.");return;}
  setBusy("loginBtn",true);
  try {
    await dbInit();
    const id=uidH(email), u=DB.users[id];
    if(!u||u.pw!==pwHash(pass,id)){showErr("liErr","Incorrect email or password.");return;}
    if(DB.banned?.[id]){showErr("liErr","Account suspended. Contact ANICADE Tech.");return;}
    const user={uid:id,name:u.name,email,trialStart:u.trialStart,prefs:u.prefs||{},plan:u.plan||"free"};
    localStorage.setItem("faceid_uid",id);
    saveSession(user); boot(user);
  } catch(e){console.error("Login:",e);showErr("liErr",e.message||"Connection error.");}
  finally{setBusy("loginBtn",false,"Sign In");}
}

// ─── SIGNUP ───────────────────────────────────────────────────────────────────
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
    const id=uidH(email);
    if(DB.users[id]){showErr("suErr","Account already exists.");return;}
    DB.users[id]={name,email,pw:pwHash(pass,id),trialStart:new Date().toISOString(),prefs:{},plan:"free",badges:["new_user","early_bird"],joinedAt:new Date().toISOString()};
    DB.chats[id]={};
    await dbSave();
    const user={uid:id,name,email,trialStart:DB.users[id].trialStart,prefs:{},plan:"free"};
    localStorage.setItem("faceid_uid",id);
    saveSession(user);
    showOnboarding(user);
  } catch(e){console.error("Signup:",e);showErr("suErr",e.message||"Signup failed.");}
  finally{setBusy("signupBtn",false,"Create Account");}
}

// ─── ADMIN LOGIN ──────────────────────────────────────────────────────────────
async function handleAdminLogin() {
  const email=(document.getElementById("adEmail").value||"").trim().toLowerCase();
  const pass=document.getElementById("adPass").value||"";
  hideErr("adErr");
  if(!email||!pass){showErr("adErr","Fill in both fields.");return;}
  if(email!==ADMIN_EMAIL.toLowerCase()||pass!==ADMIN_PASS){showErr("adErr","Incorrect admin credentials.");return;}
  setBusy("adminLoginBtn",true);
  try {
    await dbInit();
    const id=uidH(email);
    if(!DB.users[id]){
      DB.users[id]={name:"Admin",email,pw:pwHash(pass,id),trialStart:new Date().toISOString(),prefs:{},plan:"business",badges:["admin","verified"]};
      DB.chats[id]={}; await dbSave();
    }
    const user={uid:id,name:DB.users[id].name,email,trialStart:DB.users[id].trialStart,prefs:DB.users[id].prefs||{},plan:"business",isAdmin:true};
    saveSession(user); boot(user);
  } catch(e){console.error("Admin:",e);showErr("adErr",e.message||"Login failed.");}
  finally{setBusy("adminLoginBtn",false,"Admin Sign In");}
}

function logout() {
  if(voiceMode) stopVoiceCall();
  stopTTS();
  if(globalChatPoll) clearInterval(globalChatPoll);
  clearSess(); curUser=null; activeId=null;
  document.getElementById("app").classList.add("hidden");
  document.getElementById("authOverlay").classList.remove("hidden");
  document.getElementById("liEmail").value="";
  document.getElementById("liPass").value="";
  document.getElementById("adminBtn")?.classList.add("hidden");
  switchTab("login");
}

// ─── ONBOARDING ───────────────────────────────────────────────────────────────
let onboardUser=null;
function showOnboarding(user) {
  onboardUser=user;
  document.getElementById("authOverlay").classList.add("hidden");
  document.getElementById("onboarding").classList.remove("hidden");
  document.getElementById("obName").textContent=user.name.split(" ")[0];
  document.querySelectorAll(".ob-chip").forEach(c=>c.classList.remove("selected"));
  document.getElementById("obStyle").value="balanced";
  document.getElementById("obTone").value="professional";
  obStep(1);
}
function obStep(n) {
  document.querySelectorAll(".ob-step").forEach((s,i)=>s.classList.toggle("hidden",i+1!==n));
  document.querySelectorAll(".ob-dot").forEach((d,i)=>d.classList.toggle("active",i+1<=n));
}
function obToggleChip(el){el.classList.toggle("selected");}
async function finishOnboarding() {
  const interests=[...document.querySelectorAll(".ob-interests .ob-chip.selected")].map(c=>c.dataset.v);
  const tasks=[...document.querySelectorAll(".ob-tasks .ob-chip.selected")].map(c=>c.dataset.v);
  const aiStyle=document.getElementById("obStyle").value;
  const tone=document.getElementById("obTone").value;
  const prefs={interests,tasks,aiStyle,tone};
  onboardUser.prefs=prefs;
  if(DB.users[onboardUser.uid]){DB.users[onboardUser.uid].prefs=prefs; await dbSave();}
  saveSession(onboardUser);
  document.getElementById("onboarding").classList.add("hidden");
  boot(onboardUser);
}
function skipOnboarding(){document.getElementById("onboarding").classList.add("hidden");boot(onboardUser);}

// ─── BOOT ─────────────────────────────────────────────────────────────────────
function boot(user) {
  curUser=user;
  document.getElementById("authOverlay").classList.add("hidden");
  document.getElementById("onboarding")?.classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("userNm").textContent=user.name;
  document.getElementById("userAv").textContent=user.name.charAt(0).toUpperCase();
  // Show plan badge
  const planBadge=document.getElementById("planBadge");
  if(planBadge){const p=getPlan(user);planBadge.textContent=`${p.badge} ${p.name}`;planBadge.style.color=p.color;}
  renderTrial(user);
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
  startGlobalChatPoll();
  // show rate button after 30s
  setTimeout(()=>document.getElementById("rateBtn")?.classList.remove("hidden"),30000);
}

// ─── TRIAL / PLAN DISPLAY ─────────────────────────────────────────────────────
function renderTrial(user) {
  const plan=getPlan(user);
  const banner=document.getElementById("trialBanner");
  const planEl=document.getElementById("userPlan");
  if(planEl) planEl.textContent=`${plan.badge} ${plan.name}`;
  if(!banner) return;
  if(isPaid(user)){
    banner.innerHTML=`<div class="trial-banner-top"><span style="color:${plan.color}">${plan.badge} ${plan.name} Plan</span><span style="color:var(--tx2);font-size:.7rem;margin-left:8px">Unlimited access</span></div>`;
    return;
  }
  // Free plan — show daily limits
  const used=getUsage();
  const msgUsed=used.msg||0, imgUsed=used.img||0;
  banner.innerHTML=`
    <div class="trial-banner-top">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;color:var(--gold)"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span>Free Plan</span>
      <span style="font-family:var(--mono);font-size:.72rem;color:var(--tx2);margin-left:auto">${msgUsed}/${plan.msgLimit} msgs · ${imgUsed}/${plan.imgLimit} imgs today</span>
    </div>
    <div class="trial-bar-wrap"><div class="trial-bar-fill" style="width:${Math.min(100,(msgUsed/plan.msgLimit)*100)}%"></div></div>`;
}

// ─── ADMIN PANEL ──────────────────────────────────────────────────────────────
function openAdmin(){
  if(!isAdmin(curUser)) return;
  dbInit().then(()=>{document.getElementById("adminOverlay").classList.remove("hidden");populateAdmin();})
          .catch(()=>{document.getElementById("adminOverlay").classList.remove("hidden");populateAdmin();});
}
function closeAdmin(){document.getElementById("adminOverlay").classList.add("hidden");}

function populateAdmin(){
  const users=DB.users, allChats=DB.chats, uids=Object.keys(users);
  let totalMsgs=0,totalChats=0,paidUsers=0;
  uids.forEach(id=>{
    const uc=allChats[id]||{}, cids=Object.keys(uc);
    totalChats+=cids.length;
    cids.forEach(cid=>{totalMsgs+=(uc[cid].history||[]).length;});
    if(users[id].plan&&users[id].plan!=="free") paidUsers++;
  });
  document.getElementById("statUsers").textContent=uids.length;
  document.getElementById("statChats").textContent=totalChats;
  document.getElementById("statMsgs").textContent=totalMsgs;
  document.getElementById("statTrial").textContent=paidUsers;

  const tbody=document.getElementById("adminUsersBody"); tbody.innerHTML="";
  if(!uids.length){tbody.innerHTML=`<tr><td colspan="8" style="text-align:center;color:var(--tx3);padding:20px">No users yet</td></tr>`;return;}
  uids.forEach(id=>{
    const u=users[id];
    const plan=PLANS[u.plan||"free"]||PLANS.free;
    const uc=Object.keys(allChats[id]||{}).length;
    const banned=DB.banned?.[id];
    const tr=document.createElement("tr");
    tr.innerHTML=`
      <td>${esc(u.name)}</td>
      <td style="font-family:var(--mono);font-size:.7rem">${esc(u.email)}</td>
      <td><span style="color:${plan.color};font-weight:700">${plan.badge} ${plan.name}</span></td>
      <td style="font-size:.72rem">${u.trialStart?new Date(u.trialStart).toLocaleDateString():"—"}</td>
      <td style="font-family:var(--mono)">${uc}</td>
      <td style="font-size:.72rem;max-width:100px;overflow:hidden;text-overflow:ellipsis" title="${renderBadges_text(id)}">${renderBadges_text(id)}</td>
      <td style="font-size:.72rem;color:${banned?'var(--red)':'var(--success)'}">${banned?"🚫 Banned":"✅ Active"}</td>
      <td>
        <div class="admin-act-row">
          <select class="aa-select" onchange="adminSetPlan('${id}',this.value)" title="Change plan">
            ${Object.keys(PLANS).map(k=>`<option value="${k}" ${(u.plan||"free")===k?"selected":""}>${PLANS[k].name}</option>`).join("")}
          </select>
          <button class="aa extend" onclick="adminExtend('${id}')" title="Approve payment">✓Pay</button>
          <button class="aa view" onclick="adminViewChats('${id}')" title="View chats"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
          <button class="aa ban" onclick="adminBan('${id}')" title="${banned?"Unban":"Ban"}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></button>
          <button class="aa del" onclick="adminDel('${id}')" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg></button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });

  // Pending payments
  const payments=(DB.payments||[]).filter(p=>p.status==="pending");
  const payTbody=document.getElementById("adminPaymentsBody");
  if(payTbody){
    payTbody.innerHTML=payments.length ? payments.map(p=>`
      <tr>
        <td>${esc(p.name)}</td>
        <td style="font-family:var(--mono);font-size:.72rem">${esc(p.email)}</td>
        <td><span style="color:${PLANS[p.plan]?.color||"#fff"}">${PLANS[p.plan]?.name||p.plan}</span></td>
        <td style="font-size:.72rem">${new Date(p.ts).toLocaleDateString()}</td>
        <td>${esc(p.method||"—")}</td>
        <td>
          <button class="aa extend" onclick="adminApprovePayment('${p.id}')">✓ Approve</button>
          <button class="aa del" onclick="adminRejectPayment('${p.id}')">✗ Reject</button>
        </td>
      </tr>`).join("")
    : `<tr><td colspan="6" style="text-align:center;color:var(--tx3);padding:12px">No pending payments</td></tr>`;
  }
  const noteEl=document.getElementById("adminNote");
  if(noteEl) noteEl.value=DB.adminNote||"";
}

function renderBadges_text(uid) {
  return getUserBadges(uid).map(k=>BADGES[k]?.icon||"").join(" ");
}

async function adminSetPlan(uid, plan) {
  if(!DB.users[uid]) return;
  DB.users[uid].plan=plan;
  // Update badge to match plan
  if(!DB.users[uid].badges) DB.users[uid].badges=[];
  Object.keys(PLANS).forEach(p=>{ DB.users[uid].badges=DB.users[uid].badges.filter(b=>b!==p); });
  if(plan!=="free") DB.users[uid].badges.push(plan);
  await dbSave(); populateAdmin(); toast(`Plan updated to ${PLANS[plan]?.name}`,"ok");
}

async function adminApprovePayment(payId) {
  const p=DB.payments.find(x=>x.id===payId); if(!p) return;
  p.status="approved";
  await adminSetPlan(uidH(p.email), p.plan);
  toast(`Payment approved — ${p.name} upgraded to ${PLANS[p.plan]?.name}`,"ok");
}
async function adminRejectPayment(payId) {
  DB.payments=(DB.payments||[]).filter(x=>x.id!==payId);
  await dbSave(); populateAdmin(); toast("Payment rejected","warn");
}

async function adminExtend(id) {
  if(!DB.users[id]) return;
  const d=new Date(DB.users[id].trialStart||Date.now()); d.setDate(d.getDate()+30);
  DB.users[id].trialStart=d.toISOString(); await dbSave(); populateAdmin(); toast("+30 days","ok");
}
function adminViewChats(id) {
  const uc=DB.chats[id]||{};
  const text=Object.values(uc).map(c=>`## ${c.title}\n`+c.history.map(m=>`**${m.role}:** ${(m.text||"").slice(0,300)}`).join("\n")).join("\n\n---\n\n")||"No chats";
  const w=window.open("","_blank","width=720,height=600");
  w.document.write(`<pre style="background:#0B1C2D;color:#F5F7FA;padding:20px;font-family:monospace;font-size:13px;white-space:pre-wrap;line-height:1.5">${text}</pre>`);
}
async function adminBan(id) {
  if(!DB.banned) DB.banned={};
  if(DB.banned[id]){delete DB.banned[id];toast("User unbanned","ok");}
  else{DB.banned[id]=true;toast("User banned","warn");}
  await dbSave(); populateAdmin();
}
async function adminDel(id) {
  if(!confirm("Delete this user and all chats? Cannot be undone.")) return;
  delete DB.users[id]; delete DB.chats[id]; if(DB.banned) delete DB.banned[id];
  await dbSave(); populateAdmin(); toast("User deleted","ok");
}
async function saveAdminNote() {
  DB.adminNote=(document.getElementById("adminNote").value||"").trim();
  await dbSave(); toast("Note saved","ok");
}
async function resetAllChats() {
  if(!confirm("Reset ALL chats? Cannot be undone.")) return;
  Object.keys(DB.chats).forEach(id=>{DB.chats[id]={};});
  await dbSave(); populateAdmin(); toast("All chats reset","ok");
}
function adminExport() {
  const blob=new Blob([JSON.stringify({exported:new Date().toISOString(),db:DB},null,2)],{type:"application/json"});
  const a=Object.assign(document.createElement("a"),{href:URL.createObjectURL(blob),download:`anitechai-${new Date().toISOString().slice(0,10)}.json`});
  a.click(); toast("Exported","ok");
}

// ─── RATING / REVIEWS ─────────────────────────────────────────────────────────
function openRating(){document.getElementById("rateOverlay").classList.remove("hidden");}
function closeRating(){document.getElementById("rateOverlay").classList.add("hidden");ratingStars=0;document.querySelectorAll(".rate-star").forEach(s=>s.classList.remove("active"));}
function setRatingStar(n){ratingStars=n;document.querySelectorAll(".rate-star").forEach((s,i)=>s.classList.toggle("active",i<n));}

async function submitRating() {
  const comment=(document.getElementById("rateComment").value||"").trim();
  const ease=document.getElementById("rateEase")?.value||"";
  const feat=document.getElementById("rateFeat")?.value||"";
  if(!ratingStars){toast("Select a star rating","warn");return;}
  const entry={uid:curUser?.uid||"anon",name:curUser?.name||"Anonymous",plan:curUser?.plan||"free",stars:ratingStars,comment,ease,feat,ts:new Date().toISOString()};
  setBusy("rateSubmitBtn",true);
  try {
    const getRes=await fetch(`${JB_BASE}/${REVIEWS_BIN}/latest`,{headers:REVIEWS_HDR});
    let record={ratings:[]};
    if(getRes.ok){const j=await getRes.json();record=j.record||{ratings:[]};}
    if(!record.ratings) record.ratings=[];
    record.ratings.push(entry);
    await fetch(`${JB_BASE}/${REVIEWS_BIN}`,{method:"PUT",headers:REVIEWS_HDR,body:JSON.stringify(record)});
    toast("Thank you for your feedback! ⭐","ok");
    closeRating();
  } catch(e){toast("Failed to submit. Try again.","err");console.error(e);}
  finally{setBusy("rateSubmitBtn",false,"Submit Feedback");}
}

// ─── SUBSCRIPTION FLOW ────────────────────────────────────────────────────────
function showPricing() { switchView("pricing"); }
function closePricing() { switchView("chat"); }

async function requestUpgrade(planKey) {
  const plan=PLANS[planKey]; if(!plan) return;
  // Show payment modal
  const method=prompt(`Upgrade to ${plan.name} (${plan.price}/month)\n\nSelect payment:\n1. MTN Mobile Money\n2. Airtel Money\n3. Bank Transfer\n4. WhatsApp Arrangement\n\nEnter 1-4:`);
  const methods={"1":"MTN Mobile Money","2":"Airtel Money","3":"Bank Transfer","4":"WhatsApp Arrangement"};
  const chosen=methods[method?.trim()]||"WhatsApp Arrangement";
  const payId="pay_"+Date.now();
  const payment={id:payId,uid:curUser.uid,name:curUser.name,email:curUser.email,plan:planKey,method:chosen,ts:new Date().toISOString(),status:"pending"};
  if(!DB.payments) DB.payments=[];
  DB.payments.push(payment);
  await dbSave();
  toast(`Upgrade request submitted. Admin will confirm your ${chosen} payment. Contact ANICADE Tech: +260 777 083 995`,"ok");
}

// ─── GLOBAL CHAT ──────────────────────────────────────────────────────────────
function startGlobalChatPoll() {
  if(globalChatPoll) clearInterval(globalChatPoll);
  renderGlobalChat();
  globalChatPoll=setInterval(async()=>{
    try{
      const res=await fetch(`${JB_BASE}/${FIXED_BIN}/latest`,{headers:JB_HDR});
      if(res.ok){const j=await res.json();if(j.record?.globalChat) DB.globalChat=j.record.globalChat;renderGlobalChat();}
    }catch{}
  },8000);
}

function renderGlobalChat() {
  const el=document.getElementById("globalChatMessages"); if(!el) return;
  const msgs=(DB.globalChat||[]).slice(-50);
  if(!msgs.length){el.innerHTML=`<p style="text-align:center;color:var(--tx3);padding:20px;font-size:.82rem">No messages yet — say hello!</p>`;return;}
  el.innerHTML=msgs.map(m=>{
    const isMe=m.uid===curUser?.uid;
    const badges=getUserBadges(m.uid).slice(0,2).map(k=>BADGES[k]?.icon||"").join("");
    return `<div class="gc-msg ${isMe?"gc-me":""}">
      <div class="gc-meta"><span class="gc-name">${esc(m.name)}</span><span class="gc-badges">${badges}</span><span class="gc-time">${new Date(m.ts).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span></div>
      <div class="gc-bubble">${esc(m.text)}</div>
    </div>`;
  }).join("");
  el.scrollTop=el.scrollHeight;
}

async function sendGlobalMsg() {
  const inp=document.getElementById("gcInput"); if(!inp) return;
  const text=inp.value.trim(); if(!text) return;
  if(!DB.globalChat) DB.globalChat=[];
  DB.globalChat.push({uid:curUser.uid,name:curUser.name,plan:curUser.plan||"free",text,ts:new Date().toISOString()});
  if(DB.globalChat.length>200) DB.globalChat=DB.globalChat.slice(-200);
  inp.value="";
  renderGlobalChat();
  await dbSave();
}

// ─── VIEWS ────────────────────────────────────────────────────────────────────
function switchView(view) {
  if(activeView === view) {
    // Already on this view — just close sidebar
    document.getElementById("sidebar")?.classList.remove("open");
    return;
  }
  activeView=view;
  document.getElementById("sidebar")?.classList.remove("open");
  const views=["chat","code","pricing","global","contact","legal"];
  views.forEach(v=>{
    document.getElementById("view-"+v)?.classList.toggle("hidden",v!==view);
  });
  document.querySelectorAll(".nav-tab").forEach(t=>t.classList.toggle("active",t.dataset.view===view));
  // Special setup for views
  if(view==="pricing") renderPricing();
  if(view==="global") renderGlobalChat();
  if(view==="code") initCodeEditor();
  if(view==="contact") renderContact();
  if(view==="legal") renderLegal();
}

function renderPricing() {
  const el=document.getElementById("pricingCards"); if(!el) return;
  const current=curUser?.plan||"free";
  el.innerHTML=Object.entries(PLANS).map(([key,p])=>`
    <div class="pricing-card ${key===current?"current":""}">
      ${key==="pro"?'<div class="pricing-popular">POPULAR</div>':""}
      ${key==="business"?'<div class="pricing-popular" style="background:linear-gradient(135deg,#FF6B35,#cc5525)">BEST VALUE</div>':""}
      <div class="pricing-badge">${p.badge}</div>
      <div class="pricing-name" style="color:${p.color}">${p.name}</div>
      <div class="pricing-price"><span class="pricing-amount">${p.price}</span><span class="pricing-period">${p.perMonth}</span></div>
      <ul class="pricing-features">${p.features.map(f=>`<li>${f}</li>`).join("")}</ul>
      ${key===current
        ? `<button class="pricing-btn current-btn">✓ Current Plan</button>`
        : key==="free"
          ? `<button class="pricing-btn free-btn" onclick="adminSetPlanSelf('free')">Downgrade to Free</button>`
          : `<button class="pricing-btn upgrade-btn" style="border-color:${p.color};color:${p.color}" onclick="requestUpgrade('${key}')">Upgrade — ${p.price}/mo</button>`
      }
    </div>`).join("");
}

async function adminSetPlanSelf(plan) {
  if(!DB.users[curUser.uid]) return;
  DB.users[curUser.uid].plan=plan; curUser.plan=plan;
  saveSession(curUser); await dbSave();
  renderTrial(curUser); renderPricing(); toast("Plan updated","ok");
}

function renderContact() {
  const el=document.getElementById("contactContent"); if(!el) return;
  el.innerHTML=`
    <div class="info-card">
      <h2 class="info-h">Contact ANICADE Tech</h2>
      <div class="info-grid">
        <div class="info-item"><span class="info-label">📧 Email</span><a href="mailto:anicadetech@gmail.com" class="info-val">anicadetech@gmail.com</a></div>
        <div class="info-item"><span class="info-label">📱 WhatsApp</span><a href="https://wa.me/260777083995" target="_blank" class="info-val">+260 777 083 995</a></div>
        <div class="info-item"><span class="info-label">📍 Location</span><span class="info-val">Kabwe, Zambia</span></div>
        <div class="info-item"><span class="info-label">🌐 Website</span><a href="https://www.anicadetech.xyz" target="_blank" class="info-val">www.anicadetech.xyz</a></div>
      </div>
      <div class="info-divider"></div>
      <h3 class="info-sub">Services</h3>
      <div class="info-services">
        <span class="info-tag">Web Development</span><span class="info-tag">Mobile Apps</span>
        <span class="info-tag">AI / ML Integration</span><span class="info-tag">UI/UX Design</span>
        <span class="info-tag">Cloud / DevOps</span><span class="info-tag">Tech Consulting</span>
        <span class="info-tag">Digital Marketing</span><span class="info-tag">Brand Design</span>
      </div>
      <div class="info-divider"></div>
      <p style="font-size:.82rem;color:var(--tx2);line-height:1.6">Built in Zambia. Built for Zambia. ANICADE Tech makes professional digital services accessible to every Zambian business. Starting from K100.</p>
      <a href="https://wa.me/260777083995?text=Hi%20ANICADE%20Tech%2C%20I'm%20interested%20in%20your%20services" target="_blank" class="wa-contact-btn">
        <svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.099.547 4.07 1.504 5.782L0 24l6.357-1.504A11.962 11.962 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.918 0-3.701-.534-5.218-1.453l-.374-.222-3.878.917.934-3.779-.244-.389A9.955 9.955 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
        Chat on WhatsApp
      </a>
    </div>`;
}

function renderLegal() {
  const el=document.getElementById("legalContent"); if(!el) return;
  el.innerHTML=`<div class="info-card">
    <h2 class="info-h">Terms of Service & Privacy Policy</h2>
    <p class="info-meta">Effective: 1 January 2026 · Last Updated: March 2026 · Governing Law: Republic of Zambia</p>
    <div class="legal-section"><h3>1. Introduction</h3><p>By using Ani-Tech AI, you agree to ANICADE Tech's Terms of Service. ANICADE TECH is based in Kabwe, Zambia and provides web development, AI automation, digital marketing, design services, and premium digital products.</p></div>
    <div class="legal-section"><h3>2. Payments & Pricing</h3><p>All prices are in Zambian Kwacha (K). Payment is required upfront via mobile money, bank transfer, or WhatsApp arrangement. ANICADE Tech may suspend access until full payment is received.</p></div>
    <div class="legal-section"><h3>3. Refund Policy</h3><p>All sales are final. Exceptions: ANICADE Tech cannot deliver, duplicate payment error, or significant deviation from agreed brief. Refund requests to anicadetech@gmail.com within 7 days.</p></div>
    <div class="legal-section"><h3>4. Intellectual Property</h3><p>Upon full payment, client receives ownership of final deliverable. ANICADE Tech retains rights to frameworks and templates. Clients may not resell deliverables without written consent.</p></div>
    <div class="legal-section"><h3>5. Privacy Policy</h3><p>We collect name, email, and messages for service delivery. We do not sell your data. You may request deletion by emailing anicadetech@gmail.com.</p></div>
    <div class="legal-section"><h3>6. Limitation of Liability</h3><p>ANICADE Tech is not liable for indirect or consequential damages. Total liability does not exceed the amount paid for the specific service.</p></div>
    <div class="legal-section"><h3>7. Contact</h3><p>📧 anicadetech@gmail.com · 📱 +260 777 083 995 · 📍 Kabwe, Zambia</p></div>
    <a href="https://www.anicadetech.xyz/terms.html" target="_blank" class="info-link">Read full Terms on anicadetech.xyz →</a>
  </div>`;
}

// ─── CODE EDITOR ──────────────────────────────────────────────────────────────
function initCodeEditor() {
  // Already initialized by HTML
  const output=document.getElementById("codeOutput");
  if(output&&!output.textContent) output.textContent="// Output appears here after running code";
}

function runCode() {
  if(!isPaid(curUser)&&!isAdmin(curUser)){toast("Code editor requires a paid plan. Upgrade for access!","warn");return;}
  const lang=document.getElementById("codeLang").value;
  const code=document.getElementById("codeEditor").value;
  const output=document.getElementById("codeOutput");
  if(!code.trim()){output.textContent="// Nothing to run";return;}
  if(lang==="javascript"){
    output.textContent="";
    const origLog=console.log, origErr=console.error, origWarn=console.warn;
    const logs=[];
    console.log=(...a)=>{logs.push(a.map(String).join(" "));origLog(...a);};
    console.error=(...a)=>{logs.push("ERROR: "+a.map(String).join(" "));origErr(...a);};
    console.warn=(...a)=>{logs.push("WARN: "+a.map(String).join(" "));origWarn(...a);};
    try {
      const result=eval(code);
      if(result!==undefined) logs.push("→ "+String(result));
      output.textContent=logs.length?logs.join("\n"):"// Code ran (no output)";
    } catch(e) {
      output.textContent="// Error: "+e.message;
    } finally {
      console.log=origLog; console.error=origErr; console.warn=origWarn;
    }
  } else {
    output.textContent=`// Note: ${lang.toUpperCase()} runs server-side.\n// Paste your code into the AI chat and ask it to explain or debug it!`;
  }
}

function copyCode() {
  const code=document.getElementById("codeEditor").value;
  navigator.clipboard.writeText(code).then(()=>toast("Code copied","ok"));
}
function clearCode() {
  document.getElementById("codeEditor").value="";
  document.getElementById("codeOutput").textContent="// Output appears here after running code";
}
function aiHelpCode() {
  const code=document.getElementById("codeEditor").value.trim();
  if(!code){toast("Enter some code first","warn");return;}
  const lang=document.getElementById("codeLang").value;
  document.getElementById("inputTa").value=`Review this ${lang} code and explain what it does, identify any bugs, and suggest improvements:\n\`\`\`${lang}\n${code}\n\`\`\``;
  switchView("chat");
  send();
}

// ─── CHATS ────────────────────────────────────────────────────────────────────
function myChats(){if(!DB.chats[curUser.uid]) DB.chats[curUser.uid]={};return DB.chats[curUser.uid];}

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
  if(activeId===id){if(ids.length)loadChat(ids[ids.length-1]);else{activeId=null;showWelcome();document.getElementById("chatTitle").textContent="New Chat";}}
}

function renderChatList() {
  const el=document.getElementById("chatList"); el.innerHTML="";
  const ids=Object.keys(myChats()).reverse();
  if(!ids.length){el.innerHTML=`<p style="color:var(--tx3);font-size:.76rem;padding:10px 12px;text-align:center;font-family:var(--font)">No chats yet</p>`;return;}
  ids.forEach(id=>{
    const c=myChats()[id];
    const div=document.createElement("div");
    div.className="chat-item"+(id===activeId?" active":""); div.dataset.id=id;
    div.innerHTML=`<span class="ci-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span><span class="chat-item-lbl">${esc(c.title)}</span><button class="chat-item-del" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg></button>`;
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
function showWelcome(){document.getElementById("welcome").style.display="flex";document.getElementById("messages").innerHTML="";}
const scrollDown=()=>{const a=document.getElementById("chatArea");setTimeout(()=>a.scrollTop=a.scrollHeight,80);};
const AI_AVATAR=`<img src="https://i.imgur.com/9mjKZAj.jpeg" alt="Ani-Tech AI" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
const USR_AVATAR=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;

function msgActions(rawText,isAI=true) {
  const safe=(rawText||"").replace(/\\/g,"\\\\").replace(/"/g,"&quot;").replace(/\n/g,"\\n");
  const speakBtn=isAI?`<button class="mab speak" data-text="${safe}" onclick="speakText(this)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>Speak</button>`:"";
  return `<div class="msg-acts">${speakBtn}<button class="mab copy" onclick="copyMsg(this)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy</button></div>`;
}
function copyMsg(btn) {
  const bubble=btn.closest(".msg-body").querySelector(".bubble");
  navigator.clipboard.writeText(bubble?.innerText||"").then(()=>{btn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>Copied!`;setTimeout(()=>{btn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy`;},1800);});
}

function renderUser(text) {
  document.getElementById("welcome").style.display="none";
  const el=document.createElement("div"); el.className="msg user-msg";
  el.innerHTML=`<div class="msg-body" style="order:1"><div class="msg-from user">You</div><div class="bubble">${esc(text).replace(/\n/g,"<br>")}</div>${msgActions(text,false)}</div><div class="av user" style="order:2">${USR_AVATAR}</div>`;
  document.getElementById("messages").appendChild(el); scrollDown();
}

function renderAI(content,speak=true) {
  document.getElementById("welcome").style.display="none";
  const el=document.createElement("div"); el.className="msg";
  const imgMatch=content.match(/^\s*\[IMAGE:\s*([\s\S]+?)\]\s*$/im);
  let bubbleHtml="",plainText=content;
  if(imgMatch){
    const prompt=imgMatch[1].trim();
    const style=(curUser?.prefs?.interests||[]).includes("art")?"digital art, vibrant":(curUser?.prefs?.interests||[]).includes("photography")?"photorealistic, DSLR":"";
    const imgSrc=makeImgUrl(prompt,style);
    plainText=`Generated image: ${prompt}`;
    bubbleHtml=`<div class="ai-img-wrap"><div class="ai-img-spinner"><div class="spinner sm"></div><span>Generating…</span></div><img class="ai-img" alt="${esc(prompt)}" style="display:none" onload="this.previousElementSibling.style.display='none';this.style.display='block'" onerror="this.previousElementSibling.innerHTML='<span style=\'color:var(--red)\'>Generation failed</span>';this.style.display='none'" src="${imgSrc}"/><p class="ai-img-cap">${esc(prompt)}</p><a class="ai-img-dl" href="${imgSrc}" target="_blank" rel="noopener" onclick="autoDownload(event,'${imgSrc.replace(/'/g,"\\'")}','ani-tech-ai.jpg')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download</a></div>`;
    bumpUsage("img");
  } else {
    bubbleHtml=md(content);
  }
  el.innerHTML=`<div class="av ai">${AI_AVATAR}</div><div class="msg-body"><div class="msg-from ai">Ani-Tech AI</div><div class="bubble">${bubbleHtml}</div>${msgActions(plainText,true)}</div>`;
  document.getElementById("messages").appendChild(el);
  attachCopy(el); scrollDown();
  if(speak&&voiceMode&&plainText&&!imgMatch) speakOut(plainText);
}

function autoDownload(e,url,filename) {
  e.preventDefault();
  fetch(url).then(r=>r.blob()).then(blob=>{
    const a=Object.assign(document.createElement("a"),{href:URL.createObjectURL(blob),download:filename});
    document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(a.href);
  }).catch(()=>window.open(url,"_blank"));
}

function renderThinking() {
  document.getElementById("welcome").style.display="none";
  const el=document.createElement("div");el.className="msg";el.id="thinking";
  el.innerHTML=`<div class="av ai">${AI_AVATAR}</div><div class="msg-body"><div class="msg-from ai">Ani-Tech AI</div><div class="bubble"><div class="thinking"><span></span><span></span><span></span></div></div></div>`;
  document.getElementById("messages").appendChild(el);scrollDown();return el;
}

function toast(msg,type="err") {
  let t=document.querySelector(".toast");
  if(!t){t=document.createElement("div");t.className="toast";document.body.appendChild(t);}
  t.className=`toast ${type}`;
  t.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${esc(msg)}`;
  t.classList.add("show");setTimeout(()=>t.classList.remove("show"),5000);
}

// ─── MARKDOWN ─────────────────────────────────────────────────────────────────
function md(text) {
  if(!text) return "";
  text=text.replace(/```(\w*)\n?([\s\S]*?)```/g,(_,lang,code)=>{const l=esc(lang||""),c=esc(code.trim()),enc=encodeURIComponent(code.trim());return `<div class="code-wrap"><pre><code class="lang-${l}">${c}</code></pre><button class="copy-btn" data-code="${enc}">Copy</button></div>`;});
  text=text.replace(/`([^`\n]+)`/g,"<code>$1</code>");
  text=text.replace(/^### (.+)$/gm,"<h3>$1</h3>").replace(/^## (.+)$/gm,"<h2>$1</h2>").replace(/^# (.+)$/gm,"<h1>$1</h1>");
  text=text.replace(/\*\*\*(.+?)\*\*\*/g,"<strong><em>$1</em></strong>").replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\*(.+?)\*/g,"<em>$1</em>");
  text=text.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
  text=text.replace(/^---$/gm,'<hr style="border:none;border-top:1px solid rgba(255,255,255,.07);margin:10px 0">');
  text=text.replace(/^([ \t]*[-*+] .+\n?)+/gm,m=>`<ul>${m.trim().split("\n").map(l=>`<li>${l.replace(/^[ \t]*[-*+] /,"")}</li>`).join("")}</ul>`);
  text=text.replace(/^([ \t]*\d+\. .+\n?)+/gm,m=>`<ol>${m.trim().split("\n").map(l=>`<li>${l.replace(/^[ \t]*\d+\. /,"")}</li>`).join("")}</ol>`);
  text=text.replace(/\n{2,}/g,"</p><p>").replace(/\n/g,"<br>");
  text="<p>"+text+"</p>";
  text=text.replace(/<p>(<(?:h[123]|ul|ol|pre|hr|div))/g,"$1").replace(/(<\/(?:h[123]|ul|ol|pre|div)>)<\/p>/g,"$1");
  return text;
}
function attachCopy(c){c.querySelectorAll(".copy-btn").forEach(b=>b.addEventListener("click",()=>navigator.clipboard.writeText(decodeURIComponent(b.dataset.code)).then(()=>{b.textContent="Copied!";setTimeout(()=>b.textContent="Copy",1800);})));}

// ─── TTS (ResponsiveVoice + browser fallback) ─────────────────────────────────
function stopTTS(){if(window.responsiveVoice&&responsiveVoice.isPlaying())responsiveVoice.cancel();window.speechSynthesis?.cancel();}
function speakText(btn) {
  const text=(btn.dataset.text||"").replace(/\\n/g," ").trim();
  if(!text){toast("Nothing to read","warn");return;}
  const playing=(window.responsiveVoice&&responsiveVoice.isPlaying())||window.speechSynthesis?.speaking;
  if(playing){stopTTS();btn.classList.remove("speaking");btn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>Speak`;return;}
  speakOut(text,btn);
}
function speakOut(text,btn=null) {
  stopTTS();
  const clean=text.replace(/```[\s\S]*?```/g," code block ").replace(/\[IMAGE:.*?\]/gi," image ").replace(/#{1,6} /g,"").replace(/[*_`]/g,"").replace(/https?:\/\/\S+/g," link ").replace(/\n+/g," ").trim().slice(0,1500);
  const onEnd=()=>{if(btn){btn.classList.remove("speaking");btn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>Speak`;}};
  if(btn){btn.classList.add("speaking");btn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>Stop`;}
  if(window.responsiveVoice){responsiveVoice.speak(clean,"UK English Female",{pitch:1,rate:0.95,volume:1,onend:onEnd,onerror:onEnd});return;}
  const synth=window.speechSynthesis, utt=new SpeechSynthesisUtterance(clean);
  utt.rate=0.9;utt.pitch=1.05;utt.volume=1;utt.onend=onEnd;utt.onerror=onEnd;
  const PRIORITY=[v=>v.name==="Google UK English Female",v=>v.name==="Google UK English Male",v=>v.name==="Google US English",v=>v.name.startsWith("Google")&&v.lang.startsWith("en"),v=>v.name==="Samantha",v=>v.lang==="en-US",v=>v.lang.startsWith("en")];
  const doSpeak=()=>{const voices=synth.getVoices();for(const t of PRIORITY){const v=voices.find(t);if(v){utt.voice=v;break;}}synth.speak(utt);};
  if(synth.getVoices().length)doSpeak();else{synth.onvoiceschanged=()=>{synth.onvoiceschanged=null;doSpeak();};}
}

// ─── VOICE INPUT ──────────────────────────────────────────────────────────────
function initVoice() {
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition; if(!SR) return;
  recognition=new SR();recognition.continuous=false;recognition.interimResults=true;recognition.lang="en-US";
  recognition.onresult=e=>{let final="",interim="";for(const r of e.results){if(r.isFinal)final+=r[0].transcript;else interim+=r[0].transcript;}const ta=document.getElementById("inputTa");ta.value=(final||interim).trim();ta.style.height="auto";ta.style.height=Math.min(ta.scrollHeight,140)+"px";if(final&&voiceMode)setTimeout(send,300);};
  recognition.onend=()=>{document.getElementById("micBtn")?.classList.remove("listening");if(voiceMode&&!busy)setTimeout(()=>{try{recognition.start();}catch{}},500);};
  recognition.onerror=e=>{if(e.error!=="no-speech"&&e.error!=="aborted")console.warn("Voice:",e.error);document.getElementById("micBtn")?.classList.remove("listening");};
}
function tapSpeak(){if(!recognition){toast("Voice not supported. Try Chrome.","err");return;}if(voiceMode)return;try{recognition.start();}catch{}document.getElementById("micBtn")?.classList.add("listening");}
function startVoiceCall(){if(!recognition){toast("Voice not supported.","err");return;}voiceMode=true;document.getElementById("voiceCallBtn")?.classList.add("active");document.getElementById("voiceOverlay")?.classList.remove("hidden");stopTTS();try{recognition.start();}catch{}setTimeout(()=>speakOut("Voice mode active. I'm listening."),400);}
function stopVoiceCall(){voiceMode=false;try{recognition?.stop();}catch{}stopTTS();document.getElementById("voiceCallBtn")?.classList.remove("active");document.getElementById("voiceOverlay")?.classList.add("hidden");}

// ─── WEB SEARCH ───────────────────────────────────────────────────────────────
async function webSearch(query) {
  try{const q=encodeURIComponent(query),url=`https://api.allorigins.win/get?url=${encodeURIComponent(`https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`)}`;const res=await fetch(url,{signal:AbortSignal.timeout(5000)});if(!res.ok)return null;const w=await res.json();const data=JSON.parse(w.contents||"{}");const results=[];if(data.AbstractText)results.push(data.AbstractText);(data.RelatedTopics||[]).slice(0,4).forEach(t=>{if(t.Text)results.push(t.Text);});return results.length?results.join("\n\n"):null;}catch{return null;}
}
function needsSearch(text){return["latest","current","today","2026","news","recent","who is","what happened","price of","weather","release","version","update","trending","now","live"].some(k=>text.toLowerCase().includes(k));}

// ─── SEND ─────────────────────────────────────────────────────────────────────
async function send() {
  if(busy) return;
  const ta=document.getElementById("inputTa"), text=ta.value.trim();
  if(!text) return;
  if(isBanned(curUser)){toast("Account suspended.","err");return;}
  // Check free plan limits
  if(!checkLimit("msg")) return;
  if(!activeId||!myChats()[activeId]){const id="c"+Date.now();myChats()[id]={title:"New Chat",history:[]};activeId=id;renderChatList();}
  const isFirst=!myChats()[activeId].history.length;
  if(isFirst) setTitle(activeId,text);
  myChats()[activeId].history.push({role:"user",text});
  renderUser(text);ta.value="";ta.style.height="auto";
  busy=true;document.getElementById("sendBtn").disabled=true;
  const thinkEl=renderThinking();
  try{
    const reply=await callGroq(myChats()[activeId].history);
    thinkEl.remove();myChats()[activeId].history.push({role:"assistant",text:reply});
    renderAI(reply,true);scheduleSave();
    bumpUsage("msg");
    // Update trial display
    renderTrial(curUser);
    // Check power_user badge
    const totalMsgs=Object.values(myChats()).reduce((t,c)=>t+(c.history?.length||0),0);
    if(totalMsgs>=100&&DB.users[curUser.uid]&&!getUserBadges(curUser.uid).includes("power_user")){
      if(!DB.users[curUser.uid].badges) DB.users[curUser.uid].badges=getUserBadges(curUser.uid);
      DB.users[curUser.uid].badges.push("power_user");
      scheduleSave(); toast("🔥 Badge unlocked: Power User!","ok");
    }
  }catch(e){thinkEl.remove();const em="Error: "+e.message;myChats()[activeId].history.push({role:"assistant",text:em});renderAI(em,false);toast(e.message);console.error(e);}
  finally{busy=false;document.getElementById("sendBtn").disabled=false;document.getElementById("inputTa").focus();}
}

// ─── AI API — Groq (active) / xAI (ready when provisioned) ──────────────────
async function callGroq(history) {
  const lastMsg = history[history.length-1]?.text || "";
  let searchNote = "";
  if(needsSearch(lastMsg)){
    const r = await webSearch(lastMsg);
    if(r) searchNote = `\n\n[WEB SEARCH RESULTS for "${lastMsg}"]:\n${r}\n[END SEARCH RESULTS]`;
  }
  const messages = [{ role:"system", content:buildSystem(curUser) }];
  history.forEach((m,i) => {
    const content = (i === history.length-1 && searchNote) ? m.text+searchNote : m.text;
    messages.push({ role: m.role==="assistant" ? "assistant" : "user", content });
  });

  // ── Try xAI Grok first if account is provisioned ──
  if(USE_XAI) {
    try {
      const res = await fetch(XAI_URL, {
        method: "POST",
        headers: { "Content-Type":"application/json", "Authorization":`Bearer ${XAI_KEY}` },
        body: JSON.stringify({ model:"grok-3-mini", messages, temperature:0.7, max_tokens:4096, stream:false })
      });
      if(res.ok) {
        const data = await res.json();
        const reply = data?.choices?.[0]?.message?.content;
        if(reply) return reply;
      }
    } catch(e) { console.warn("xAI failed, falling back to Groq:", e.message); }
  }

  // ── Groq: 4-model rotation, never blocks on rate limit ──
  const hdrs = { "Content-Type":"application/json", "Authorization":`Bearer ${GROQ_KEY}` };
  for(const model of GROQ_MODELS) {
    try {
      const res = await fetch(GROQ_URL, {
        method: "POST", headers: hdrs,
        body: JSON.stringify({ model, messages, temperature:0.7, max_tokens:4096, top_p:0.95 })
      });
      if(res.status === 429) { await new Promise(r=>setTimeout(r,600)); continue; }
      if(res.status === 401) throw new Error("AI service key error — contact ANICADE Tech support.");
      if(!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e?.error?.message||`AI error ${res.status}`); }
      const data  = await res.json();
      const reply = data?.choices?.[0]?.message?.content;
      if(!reply) throw new Error("Empty response — please try again.");
      return reply;
    } catch(e) {
      if(e.message.includes("429") || e.message.toLowerCase().includes("rate")) continue;
      throw e;
    }
  }
  throw new Error("AI is busy — please wait 30 seconds and try again.");
}

// ─── PWA INSTALL (no popup — sidebar button only) ─────────────────────────────
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;});
window.addEventListener("appinstalled",()=>{deferredInstall=null;toast("Ani-Tech AI installed!","ok");});
function doInstall(){
  if(deferredInstall){deferredInstall.prompt();deferredInstall.userChoice.then(({outcome})=>{if(outcome==="accepted")deferredInstall=null;});}
  else{const ua=navigator.userAgent;if(/iphone|ipad|ipod/i.test(ua)&&!/crios|fxios/i.test(ua))toast("In Safari: tap Share (□↑) → 'Add to Home Screen'","ok");else if(/android/i.test(ua))toast("Tap browser menu (⋮) → 'Add to Home screen'","ok");else toast("Click install icon (⊕) in your browser's address bar","ok");}
}
function setupInstallBanner(){
  // install button removed from sidebar
}

// ─── EVENTS ───────────────────────────────────────────────────────────────────
function setupEvents() {
  eventsOn=true;
  document.getElementById("newChatBtn").addEventListener("click",newChat);
  document.getElementById("sendBtn").addEventListener("click",send);
  document.getElementById("micBtn")?.addEventListener("click",tapSpeak);
  document.getElementById("voiceCallBtn")?.addEventListener("click",()=>voiceMode?stopVoiceCall():startVoiceCall());
  document.getElementById("stopVoiceBtn")?.addEventListener("click",stopVoiceCall);
  document.getElementById("rateBtn")?.addEventListener("click",openRating);
  document.getElementById("gcSendBtn")?.addEventListener("click",sendGlobalMsg);
  document.getElementById("gcInput")?.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendGlobalMsg();}});
  // Navigation tabs
  document.querySelectorAll(".nav-tab").forEach(t=>t.addEventListener("click",()=>switchView(t.dataset.view)));
  const sb=document.getElementById("sidebar"),mb=document.getElementById("menuBtn");
  mb.addEventListener("click",e=>{e.stopPropagation();sb.classList.toggle("open");});
  document.addEventListener("click",e=>{if(sb.classList.contains("open")&&!sb.contains(e.target)&&!mb.contains(e.target))sb.classList.remove("open");});
  document.getElementById("adminOverlay")?.addEventListener("click",e=>{if(e.target===document.getElementById("adminOverlay"))closeAdmin();});
  document.getElementById("rateOverlay")?.addEventListener("click",e=>{if(e.target===document.getElementById("rateOverlay"))closeRating();});
  const ta=document.getElementById("inputTa");
  ta.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}});
  ta.addEventListener("input",()=>{ta.style.height="auto";ta.style.height=Math.min(ta.scrollHeight,140)+"px";});
  document.querySelectorAll(".sug").forEach(b=>b.addEventListener("click",()=>{ta.value=b.dataset.q;send();}));
}

// ─── SW ───────────────────────────────────────────────────────────────────────
if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(e=>console.warn("SW:",e)));}

// ─── STARTUP ──────────────────────────────────────────────────────────────────
(async function startup(){
  setupInstallBanner();
  const loading=document.getElementById("authLoading"),authTabs=document.getElementById("authTabs"),formLogin=document.getElementById("formLogin");
  loading.classList.remove("hidden");authTabs.classList.add("hidden");formLogin.classList.add("hidden");
  try{await dbInit();}catch(e){console.error("DB init:",e);dbSetStatus("err","DB offline");}
  loading.classList.add("hidden");authTabs.classList.remove("hidden");formLogin.classList.remove("hidden");
  // Restore session — localStorage persists across all view changes and reloads
  const s = getSession();
  if (s?.uid) {
    // DB loaded successfully — check if user exists
    if (DB.users[s.uid]) {
      const u = DB.users[s.uid];
      boot({ uid:s.uid, name:u.name, email:u.email, trialStart:u.trialStart, prefs:u.prefs||{}, plan:u.plan||"free", isAdmin:s.isAdmin||false });
      return;
    }
    // User not in DB — clear stale session
    clearSess();
  }
  document.getElementById("authOverlay").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
})();

// ─── CODE EDITOR LINE NUMBERS ─────────────────────────────────────────────────
function updateLineNums() {
  const ta = document.getElementById("codeEditor");
  const lnEl = document.getElementById("lineNums");
  if (!ta || !lnEl) return;
  const lines = ta.value.split("\n").length;
  lnEl.textContent = Array.from({length:lines},(_,i)=>i+1).join("\n");
  lnEl.scrollTop = ta.scrollTop;
}
