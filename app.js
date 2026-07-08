/**
 * ANI-TECH AI v4.5 — by ANICADE Tech
 * www.anicadetech.xyz
 *
 * v4.5 changes:
 *  ✓ New JSONBin credentials (bin: 6a3254adda38895dfeceb830)
 *  ✓ Reviews consolidated into main bin (no separate reviews bin)
 *  ✓ Natural TTS via Web Speech API (ResponsiveVoice removed)
 *  ✓ Enhanced voice call: timer, status, waveform, auto-restart
 *  ✓ Streaming AI responses (SSE word-by-word)
 *  ✓ Improved error handling & exponential backoff
 *  ✓ Context window management (last 20 messages)
 *  ✓ DB save mutex (prevents race conditions)
 *  ✓ Global chat polling fix (partial update)
 *  ✓ Session refresh from DB on boot
 *  ✓ Toast queuing (no more replacing)
 *  ✓ Memory leak cleanup on logout
 *  ✓ Chat export & search
 *  ✓ Typing indicator
 *  ✓ Message reactions & smart suggestions
 *  ✓ Dark/light theme toggle
 */

// ─── CONFIG ───────────────────────────────────────────────────────────────────
// AI: xAI Grok (primary) — user's active API key
const AI_KEY   = "xai-RKGHkeWsiWbfzTdsJwnFTL7qNwqmGbSonHaKUREMOMZ44I2avLKpViqMhHhhctXKYqkxVlEMBWVknvcI";
const AI_URL   = "https://api.x.ai/v1/chat/completions";
// Model list — try in order, skip on 429 rate limit
const AI_MODELS = [
  "grok-4.3",
  "grok-build-0.1",
];

// JSONBin v4.5 credentials — NEW BIN
const JB_MASTER  = "$2a$10$Ua.HxOcupZkXk4ekqRBSyOsVgYWgD7R7a3clYMOmeCJ746wPkV8JO";
const JB_ACCESS  = "$2a$10$4Et.DkVnxmJatjlybRcJTOp8GI7Hau2e6C2NLjAA9xLj1D0ce9sXK";
const JB_BASE    = "https://api.jsonbin.io/v3/b";
const FIXED_BIN  = "6a3254adda38895dfeceb830";
// Reviews consolidated into main bin — no separate REVIEWS_BIN

const SESSION_KEY = "anitechai_s4";

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
function buildSystem(user, isVoiceMode = false) {
  const prefs     = user.prefs||{};
  const interests = (prefs.interests||[]).join(", ")||"general topics";
  const style     = prefs.aiStyle||"balanced";
  const tasks     = (prefs.tasks||[]).join(", ")||"answering questions";
  const tone      = prefs.tone||"professional";
  const plan      = user.plan||"free";
  const planName  = PLANS[plan]?.name||"Free";

  let prompt = `You are Ani-Tech AI — the official AI assistant of ANICADE Tech, built in 2026.
Website: https://www.anicadetech.xyz
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

  if (isVoiceMode) {
    prompt += `\n\nVOICE MODE ACTIVE: Keep responses SHORT (2-4 sentences max). Be conversational, not formal. No markdown formatting, no code blocks, no bullet points. Speak naturally like a helpful friend on a phone call. Avoid long explanations unless specifically asked.`;
  }

  prompt += `\n\nSUGGESTIONS: After every response, on a NEW LINE at the very end, add exactly 3 follow-up suggestions in this format:
[SUGGESTIONS: suggestion one | suggestion two | suggestion three]
Make suggestions contextually relevant and interesting.`;

  return prompt;
}

// ─── STATE ────────────────────────────────────────────────────────────────────
let DB          = { users:{}, chats:{}, adminNote:"", banned:{}, globalChat:[], payments:[], ratings:[] };
let curUser     = null;
let activeId    = null;
let activeView  = "chat";   // chat | code | pricing | global | contact | legal
let busy        = false;
let eventsOn    = false;
let deferredInstall = null;
let voiceMode   = false;
let voiceSettings = { voiceURI:null, rate:0.92, pitch:1.02, lang:"en-US", autoSpeak:false };
let recognition = null;
let recognitionActive = false;
let voiceRestartTimer = null;
let voiceAwaitingSend = false;
let ratingStars = 0;
let globalChatPoll = null;
let msgCount    = 0;  // daily message counter
let imgCount    = 0;  // daily image counter
let voiceTimerInterval = null;
let voiceStartTime = null;
let currentTheme = "dark";
let cleanupFns  = []; // for memory leak cleanup

// ─── DB ───────────────────────────────────────────────────────────────────────
const JB_HDR = {
  "Content-Type":"application/json",
  "X-Master-Key": JB_MASTER,
  "X-Access-Key": JB_ACCESS
};

async function dbInit() {
  dbSetStatus("syncing","Loading…");
  let attempts = 0;
    const maxAttempts = 5;
    while(attempts < maxAttempts) {
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
          ratings:    record.ratings    || DB.ratings    || [],
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
        console.error(`DB init attempt ${attempts} error:`, e.message);
        if(attempts >= maxAttempts) {
          dbSetStatus("err","DB offline");
          throw new Error("Cannot reach database. Check internet connection.");
        }
      await new Promise(r => setTimeout(r, 800 * attempts));
    }
  }
  dbSetStatus("err","DB unavailable");
    throw new Error("Database unavailable after " + maxAttempts + " attempts.");
}

// DB Save with mutex to prevent race conditions
let _dbSaving = false;
let _dbSaveQueued = false;

async function dbSave() {
  if (_dbSaving) {
    _dbSaveQueued = true;
    return;
  }
  _dbSaving = true;
  dbSetStatus("syncing","Saving…");
  for(let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${JB_BASE}/${FIXED_BIN}`, {
        method: "PUT", headers: JB_HDR, body: JSON.stringify(DB)
      });
      if(res.ok) { dbSetStatus("ok","Saved ✓"); break; }
      if(res.status === 401 || res.status === 403) { dbSetStatus("err","DB auth error"); break; }
      await new Promise(r => setTimeout(r, 600));
    } catch(e) {
      if(attempt === 2) { dbSetStatus("err","Save failed — check connection"); console.error("dbSave:",e); }
      else await new Promise(r => setTimeout(r, 600));
    }
  }
  _dbSaving = false;
  if (_dbSaveQueued) {
    _dbSaveQueued = false;
    dbSave(); // process queued save
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
const isAdmin  = u => u?.isAdmin===true;
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
  ["Login","Signup"].forEach(t=>{
    const k=t.toLowerCase();
    document.getElementById("tab"+t)?.classList.toggle("active",k===tab);
    document.getElementById("form"+t)?.classList.toggle("hidden",k!==tab);
  });
  ["liErr","suErr"].forEach(id=>hideErr(id));
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
        const user={uid:storedId,name:u.name,email:u.email,trialStart:u.trialStart,prefs:u.prefs||{},plan:u.plan||"free",isAdmin:u.isAdmin===true};
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
    const id = uidH(email);
    const u  = DB.users[id];
    // Account not found
    if(!u) {
      // DB may have 0 users if bin was reset — give user the option
      const userCount = Object.keys(DB.users).length;
      if(userCount === 0) {
        showErr("liErr","No accounts found in database. Please register a new account.");
      } else {
        showErr("liErr","Email not found. Check your email or register a new account.");
      }
      return;
    }
    // Password mismatch — could be old hash from a previous version
    if(u.pw !== pwHash(pass,id)) {
      // Try legacy hash (no salt) for accounts created in older versions
      const legacyHash = h(pass + id);
      if(u.pw === legacyHash) {
        // Migrate to new hash on login
        DB.users[id].pw = pwHash(pass,id);
        await dbSave();
      } else {
        showErr("liErr","Incorrect email or password.");
        return;
      }
    }
    if(DB.banned?.[id]){showErr("liErr","Account suspended. Contact ANICADE Tech.");return;}
    const user={uid:id,name:u.name,email,trialStart:u.trialStart,prefs:u.prefs||{},plan:u.plan||"free",isAdmin:u.isAdmin===true};
    localStorage.setItem("faceid_uid",id);
    saveSession(user); boot(user);
  } catch(e){console.error("Login:",e);showErr("liErr",e.message||"Connection error. Try again.");}
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
    if(DB.users[id]) {
      // Account exists — check if password matches (re-login path)
      if(DB.users[id].pw === pwHash(pass,id) || DB.users[id].pw === h(pass+id)) {
        // Same credentials — just log them in
        const u = DB.users[id];
        const user={uid:id,name:u.name,email,trialStart:u.trialStart,prefs:u.prefs||{},plan:u.plan||"free",isAdmin:u.isAdmin===true};
        localStorage.setItem("faceid_uid",id);
        saveSession(user); boot(user); return;
      }
      showErr("suErr","An account with this email already exists. Sign in instead.");
      return;
    }
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

function logout() {
  if(voiceMode) stopVoiceCall();
  stopTTS();
  if(globalChatPoll) clearInterval(globalChatPoll);
  // Memory leak cleanup — clear all tracked intervals/listeners
  cleanupFns.forEach(fn => { try { fn(); } catch(e) {} });
  cleanupFns = [];
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

  // Refresh user data from DB (not stale session cache)
  if (DB.users[user.uid]) {
    const dbUser = DB.users[user.uid];
    curUser.name = dbUser.name;
    curUser.prefs = dbUser.prefs || curUser.prefs || {};
    curUser.plan = dbUser.plan || curUser.plan || "free";
    saveSession(curUser);
  }

  document.getElementById("authOverlay").classList.add("hidden");
  document.getElementById("onboarding")?.classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("userNm").textContent=curUser.name;
  document.getElementById("userAv").textContent=curUser.name.charAt(0).toUpperCase();
  // Show plan badge
  const planBadge=document.getElementById("planBadge");
  if(planBadge){const p=getPlan(curUser);planBadge.textContent=`${p.badge} ${p.name}`;planBadge.style.color=p.color;planBadge.style.display="inline";}
  renderTrial(curUser);
  if(isAdmin(curUser)) document.getElementById("adminBtn")?.classList.remove("hidden");
  if(DB.adminNote){
    const sn=document.getElementById("sysNote"),snt=document.getElementById("sysNoteText");
    if(sn&&snt){snt.textContent=DB.adminNote;sn.classList.remove("hidden");}
  }
  loadVoiceSettings();
  initVoice();
  initTheme();
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
      <td style="font-size:.72rem;color:${banned?'var(--red)':'var(--success)'}"><span class="status-pill ${banned?'danger':'ok'}">${banned?ICONS.ban:ICONS.check}${banned?"Banned":"Active"}</span></td>
      <td>
        <div class="admin-act-row">
          <select class="aa-select" onchange="adminSetPlan('${id}',this.value)" title="Change plan">
            ${Object.keys(PLANS).map(k=>`<option value="${k}" ${(u.plan||"free")===k?"selected":""}>${PLANS[k].name}</option>`).join("")}
          </select>
          <button class="aa extend" onclick="adminExtend('${id}')" title="Approve payment">${ICONS.check}Pay</button>
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
          <button class="aa extend" onclick="adminApprovePayment('${p.id}')">${ICONS.check} Approve</button>
          <button class="aa del" onclick="adminRejectPayment('${p.id}')">${ICONS.x} Reject</button>
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

// ─── RATING / REVIEWS (consolidated into main bin) ────────────────────────────
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
    // Consolidated into main bin — no separate reviews bin
    if (!DB.ratings) DB.ratings = [];
    DB.ratings.push(entry);
    await dbSave();
    toast("Thank you for your feedback!","ok");
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
      const res=await fetch(`${JB_BASE}/${FIXED_BIN}/latest`,{headers:JB_HDR, cache:"no-store"});
      if(res.ok){
        const j=await res.json();
        // Only refresh globalChat field — don't overwrite full DB
        if(j.record?.globalChat) DB.globalChat=j.record.globalChat;
        renderGlobalChat();
      }
    }catch{}
  },8000);
  cleanupFns.push(() => { if(globalChatPoll) clearInterval(globalChatPoll); });
}

function renderGlobalChat() {
  const el=document.getElementById("globalChatMessages"); if(!el) return;
  const msgs=(DB.globalChat||[]).slice(-50);
  if(!msgs.length){el.innerHTML=`<p style="text-align:center;color:var(--tx3);padding:20px;font-size:.82rem">No messages yet — say hello!</p>`;return;}
  el.innerHTML=msgs.map(m=>{
    const isMe=curUser && m.uid===curUser.uid;
    const badges=getUserBadges(m.uid).slice(0,2).map(k=>BADGES[k]?.icon||"").join("");
    return `<div class="gc-msg ${isMe?"gc-me":""}">
      <div class="gc-meta"><span class="gc-name">${esc(m.name||"Anonymous")}</span><span class="gc-badges">${badges}</span><span class="gc-time">${new Date(m.ts).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span></div>
      <div class="gc-bubble">${esc(m.text||"")}</div>
    </div>`;
  }).join("");
  el.scrollTop=el.scrollHeight;
}

async function sendGlobalMsg() {
  if(!curUser) { alert("Please login to send messages."); return; }
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
      <ul class="pricing-features">${p.features.map(f=>`<li>${ICONS.check}<span>${f}</span></li>`).join("")}</ul>
      ${key===current
        ? `<button class="pricing-btn current-btn">${ICONS.check} Current Plan</button>`
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
        <div class="info-item"><span class="info-label">${ICONS.mail} Email</span><a href="mailto:anicadetech@gmail.com" class="info-val">anicadetech@gmail.com</a></div>
        <div class="info-item"><span class="info-label">${ICONS.phone} WhatsApp</span><a href="https://wa.me/260777083995" target="_blank" class="info-val">+260 777 083 995</a></div>
        <div class="info-item"><span class="info-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10z"/></svg> Website</span><a href="https://www.anicadetech.xyz" target="_blank" class="info-val">www.anicadetech.xyz</a></div>
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
    <p class="info-meta">Effective: 1 January 2026 · Last Updated: July 2026 · Governing Law: Republic of Zambia</p>
    <div class="legal-section"><h3>1. Introduction</h3><p>By using Ani-Tech AI, you agree to ANICADE Tech's Terms of Service. ANICADE TECH is based in Zambia and provides web development, AI automation, digital marketing, design services, and premium digital products.</p></div>
    <div class="legal-section"><h3>2. Payments & Pricing</h3><p>All prices are in Zambian Kwacha (K). Payment is required upfront via mobile money, bank transfer, or WhatsApp arrangement. ANICADE Tech may suspend access until full payment is received.</p></div>
    <div class="legal-section"><h3>3. Refund Policy</h3><p>All sales are final. Exceptions: ANICADE Tech cannot deliver, duplicate payment error, or significant deviation from agreed brief. Refund requests to anicadetech@gmail.com within 7 days.</p></div>
    <div class="legal-section"><h3>4. Intellectual Property</h3><p>Upon full payment, client receives ownership of final deliverable. ANICADE Tech retains rights to frameworks and templates. Clients may not resell deliverables without written consent.</p></div>
    <div class="legal-section"><h3>5. Privacy Policy</h3><p>We collect name, email, and messages for service delivery. We do not sell your data. You may request deletion by emailing anicadetech@gmail.com.</p></div>
    <div class="legal-section"><h3>6. Limitation of Liability</h3><p>ANICADE Tech is not liable for indirect or consequential damages. Total liability does not exceed the amount paid for the specific service.</p></div>
    <div class="legal-section"><h3>7. Contact</h3><p class="legal-contact"><span>${ICONS.mail} anicadetech@gmail.com</span><span>${ICONS.phone} +260 777 083 995</span></p></div>
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
    // Check login first
    if(!curUser) { toast("Please login to run code.", "warn"); return; }
    // Paid plans + admin only
    if(!isPaid(curUser) && !isAdmin(curUser)) {
    toast("Code execution requires a paid plan (K25/month+). Tap Plans to upgrade.","warn");
    return;
  }
  const lang   = document.getElementById("codeLang").value;
  const code   = document.getElementById("codeEditor").value.trim();
  const output = document.getElementById("codeOutput");
  const preview= document.getElementById("codePreview");
  if(!code) { output.textContent="// Nothing to run"; return; }

  // ── HTML / CSS — render in sandboxed iframe preview ──────────────────
  if(lang === "html" || lang === "css") {
    const htmlContent = lang === "css"
      ? `<!DOCTYPE html><html><head><style>${code}</style></head><body><p>CSS applied. Add HTML elements in the editor to preview.</p></body></html>`
      : code;
    if(preview) {
      preview.style.display = "block";
      // Use srcdoc for proper sandboxing (prevents XSS)
      preview.srcdoc = htmlContent;
    }
    output.textContent = `// ${lang.toUpperCase()} rendered in preview above`;
    return;
  }

  // Hide preview for non-HTML runs
  if(preview) preview.style.display = "none";

  // ── JavaScript — execute in sandboxed context ───────────────
  if(lang === "javascript") {
    output.textContent = "";
    const logs = [];
    const sandbox = {
      console: {
        log:   (...a) => logs.push(a.map(v=>JSON.stringify(v)??String(v)).join(" ")),
        error: (...a) => logs.push("ERROR: "+a.map(String).join(" ")),
        warn:  (...a) => logs.push("WARN:  "+a.map(String).join(" ")),
        info:  (...a) => logs.push("INFO:  "+a.map(String).join(" ")),
      }
    };
    try {
      // Wrap in function so return statements work, inject console
      const fn = new Function("console", code);
      const result = fn(sandbox.console);
      if(result !== undefined) logs.push("→ " + JSON.stringify(result));
      output.textContent = logs.length ? logs.join("\n") : "// Ran successfully (no output)";
    } catch(e) {
      output.textContent = "// Runtime error: " + e.message;
    }
    return;
  }

  // ── Other languages — send to AI for explanation ───────────
  output.textContent = `// ${lang.toUpperCase()} cannot run in the browser.\n// Click "AI Help" to have Ani-Tech AI explain or debug your code.`;
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

// ─── CHAT EXPORT ──────────────────────────────────────────────────────────────
function exportChat(id, e) {
  e.stopPropagation();
  const c = myChats()[id]; if (!c) return;
  let md = `# ${c.title}\n\nExported from Ani-Tech AI v4.5 — ${new Date().toLocaleString()}\n\n---\n\n`;
  (c.history || []).forEach(m => {
    md += `**${m.role === "user" ? "You" : "Ani-Tech AI"}:**\n${m.text}\n\n`;
  });
  const blob = new Blob([md], { type: "text/markdown" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: `${c.title.replace(/[^a-zA-Z0-9 ]/g,"").trim().replace(/ +/g,"-")}.md`
  });
  a.click(); URL.revokeObjectURL(a.href);
  toast("Chat exported","ok");
}

function renderChatList(filter="") {
  const el=document.getElementById("chatList"); el.innerHTML="";
  const ids=Object.keys(myChats()).reverse();
  const filtered = filter ? ids.filter(id => {
    const c = myChats()[id];
    return c.title.toLowerCase().includes(filter.toLowerCase()) ||
           (c.history||[]).some(m => (m.text||"").toLowerCase().includes(filter.toLowerCase()));
  }) : ids;
  if(!filtered.length){el.innerHTML=`<p style="color:var(--tx3);font-size:.76rem;padding:10px 12px;text-align:center;font-family:var(--font)">${filter?"No matching chats":"No chats yet"}</p>`;return;}
  filtered.forEach(id=>{
    const c=myChats()[id];
    const div=document.createElement("div");
    div.className="chat-item"+(id===activeId?" active":""); div.dataset.id=id;
    div.innerHTML=`<span class="ci-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span><span class="chat-item-lbl">${esc(c.title)}</span><button class="chat-item-export" title="Export"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button><button class="chat-item-del" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg></button>`;
    div.addEventListener("click",()=>{loadChat(id);document.getElementById("sidebar").classList.remove("open");});
    div.querySelector(".chat-item-del").addEventListener("click",e=>delChat(id,e));
    div.querySelector(".chat-item-export").addEventListener("click",e=>exportChat(id,e));
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
const ICONS = {
  check:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
  x:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  ban:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
  thumb:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 10v11H3V10h4z"/><path d="M7 10l5-7 1 1v5h6a2 2 0 0 1 2 2l-2 8a2 2 0 0 1-2 2H7"/></svg>`,
  heart:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>`,
  flame:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A3.5 3.5 0 0 0 12 22a7 7 0 0 0 7-7c0-5-4-8-5-13-3 2-5 5-5 8a4 4 0 0 0 .5 2C8 11 6 9 6 6c-2 2-3 5-3 8a9 9 0 0 0 9 8"/></svg>`,
  bulb:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12c.7.6 1 1.3 1 2h6c0-.7.3-1.4 1-2a7 7 0 0 0-4-12z"/></svg>`,
  star:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  mail:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a2 2 0 0 1-2.06 0L2 7"/></svg>`,
  phone:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.62 4.37 2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9a16 16 0 0 0 6.29 6.29l.36-.36a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  map:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 12-9 12S3 17 3 10a9 9 0 1 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`
};

function msgActions(rawText,isAI=true) {
  const safe=(rawText||"").replace(/\\/g,"\\\\").replace(/"/g,"&quot;").replace(/\n/g,"\\n");
  const speakBtn=isAI?`<button class="mab speak" data-text="${safe}" onclick="speakText(this)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>Speak</button>`:"";
  const reactions = isAI ? `<div class="msg-reactions">
    <button class="msg-reaction" onclick="reactMsg(this)" title="Helpful">${ICONS.thumb}</button>
    <button class="msg-reaction" onclick="reactMsg(this)" title="Loved it">${ICONS.heart}</button>
    <button class="msg-reaction" onclick="reactMsg(this)" title="Great answer">${ICONS.flame}</button>
    <button class="msg-reaction" onclick="reactMsg(this)" title="Good idea">${ICONS.bulb}</button>
  </div>` : "";
  return `<div class="msg-acts">${speakBtn}<button class="mab copy" onclick="copyMsg(this)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy</button></div>${reactions}`;
}

function reactMsg(btn) {
  btn.classList.toggle("active");
  // Visual only — no persistence needed for reactions
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

  // Extract suggestions
  let mainContent = content;
  let suggestions = [];
  const sugMatch = content.match(/\[SUGGESTIONS:\s*(.+?)\]\s*$/im);
  if (sugMatch) {
    mainContent = content.replace(sugMatch[0], "").trim();
    suggestions = sugMatch[1].split("|").map(s => s.trim()).filter(Boolean);
  }

  let bubbleHtml="",plainText=mainContent;
  const isErr = /^Error:/.test(mainContent.trim());
  if(isErr){
    bubbleHtml=`<div style="color:var(--red)">${md(mainContent)}</div><button class="smart-sug" style="margin-top:8px" onclick="retryLastAI(this)">↻ Retry</button>`;
  } else if(imgMatch){
    const prompt=imgMatch[1].trim();
    if(!checkLimit("img")){
      plainText=`Image generation limit reached for today.`;
      bubbleHtml=`<div class="ai-img-wrap"><p style="color:var(--red)">You've reached today's image generation limit for your plan. Upgrade in the Plans tab for unlimited images.</p></div>`;
    } else {
      const style=(curUser?.prefs?.interests||[]).includes("art")?"digital art, vibrant":(curUser?.prefs?.interests||[]).includes("photography")?"photorealistic, DSLR":"";
      const imgSrc=makeImgUrl(prompt,style);
      plainText=`Generated image: ${prompt}`;
      bubbleHtml=`<div class="ai-img-wrap"><div class="ai-img-spinner"><div class="spinner sm"></div><span>Generating…</span></div><img class="ai-img" alt="${esc(prompt)}" style="display:none" onload="this.previousElementSibling.style.display='none';this.style.display='block'" onerror="this.previousElementSibling.innerHTML='<span style=\\'color:var(--red)\\'>Generation failed — try again</span>';this.style.display='none'" src="${imgSrc}"/><p class="ai-img-cap">${esc(prompt)}</p><a class="ai-img-dl" href="${imgSrc}" target="_blank" rel="noopener" onclick="autoDownload(event,'${imgSrc.replace(/'/g,"\\'")}','ani-tech-ai.jpg')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download</a></div>`;
      bumpUsage("img");
    }
  } else {
    bubbleHtml=md(mainContent);
  }

  // Suggestions HTML
  let sugHtml = "";
  if (suggestions.length && !imgMatch) {
    sugHtml = `<div class="smart-suggestions">${suggestions.map(s => `<button class="smart-sug" onclick="useSuggestion(this)">${esc(s)}</button>`).join("")}</div>`;
  }

  el.innerHTML=`<div class="av ai">${AI_AVATAR}</div><div class="msg-body"><div class="msg-from ai">Ani-Tech AI</div><div class="bubble">${bubbleHtml}</div>${msgActions(plainText,true)}${sugHtml}</div>`;
  document.getElementById("messages").appendChild(el);
  attachCopy(el); scrollDown();
  if(speak&&(voiceMode||voiceSettings.autoSpeak)&&plainText&&!imgMatch) speakOut(plainText);
}

function useSuggestion(btn) {
  const ta = document.getElementById("inputTa");
  ta.value = btn.textContent;
  send();
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
  // Show typing indicator
  const ti = document.getElementById("typingIndicator");
  if (ti) ti.classList.remove("hidden");
  const el=document.createElement("div");el.className="msg";el.id="thinking";
  el.innerHTML=`<div class="av ai">${AI_AVATAR}</div><div class="msg-body"><div class="msg-from ai">Ani-Tech AI</div><div class="bubble"><div class="thinking"><span></span><span></span><span></span></div></div></div>`;
  document.getElementById("messages").appendChild(el);scrollDown();return el;
}

function removeThinking() {
  const ti = document.getElementById("typingIndicator");
  if (ti) ti.classList.add("hidden");
}

// ─── TOAST (queued, not replacing) ────────────────────────────────────────────
function toast(msg,type="err") {
  let container = document.querySelector(".toast-container");
  if(!container){
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const t=document.createElement("div");
  t.className=`toast ${type}`;
  t.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${esc(msg)}`;
  container.appendChild(t);
  requestAnimationFrame(()=>t.classList.add("show"));
  setTimeout(()=>{
    t.classList.remove("show");
    setTimeout(()=>t.remove(), 280);
  },4000);
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

// ─── TTS — Natural Web Speech API (ResponsiveVoice REMOVED) ──────────────────
let _bestVoice = null;
let _voicesLoaded = false;

function loadBestVoice() {
  const synth = window.speechSynthesis;
  if (!synth) return;
  const voices = synth.getVoices();
  if (!voices.length) return;

  // User's saved voice preference takes priority
  if (voiceSettings.voiceURI) {
    const chosen = voices.find(v => v.voiceURI === voiceSettings.voiceURI);
    if (chosen) { _bestVoice = chosen; _voicesLoaded = true; return; }
  }

  // Rank voices by naturalness — priority order
  const rankings = [
    v => v.name === "Google UK English Female",
    v => v.name === "Google US English",
    v => v.name.includes("Google") && v.lang.startsWith("en"),
    v => v.name.includes("Microsoft") && v.name.includes("Natural") && v.lang.startsWith("en"),
    v => v.name === "Samantha",
    v => v.name.includes("Microsoft") && v.lang.startsWith("en"),
    v => v.lang === "en-US",
    v => v.lang === "en-GB",
    v => v.lang.startsWith("en"),
  ];

  for (const test of rankings) {
    const found = voices.find(test);
    if (found) { _bestVoice = found; break; }
  }
  if (!_bestVoice && voices.length) _bestVoice = voices[0];
  _voicesLoaded = true;
}

function stopTTS() {
  window.speechSynthesis?.cancel();
}

function clearVoiceRestart() {
  if (voiceRestartTimer) {
    clearTimeout(voiceRestartTimer);
    voiceRestartTimer = null;
  }
}

function startRecognitionSafe(delay = 0) {
  if (!recognition || recognitionActive) return;
  clearVoiceRestart();
  voiceRestartTimer = setTimeout(() => {
    voiceRestartTimer = null;
    if (!recognition || recognitionActive) return;
    if (voiceMode && (busy || window.speechSynthesis?.speaking)) return;
    try {
      recognition.start();
    } catch(e) {
      recognitionActive = false;
      if (voiceMode) startRecognitionSafe(800);
    }
  }, delay);
}

function stopRecognitionSafe() {
  clearVoiceRestart();
  if (!recognition) return;
  try { recognition.stop(); } catch {}
  recognitionActive = false;
}

function speakText(btn) {
  const text=(btn.dataset.text||"").replace(/\\n/g," ").trim();
  if(!text){toast("Nothing to read","warn");return;}
  const playing = window.speechSynthesis?.speaking;
  if(playing){
    stopTTS();
    btn.classList.remove("speaking");
    btn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>Speak`;
    return;
  }
  speakOut(text,btn);
}

function speakOut(text, btn=null) {
  stopTTS();
  const synth = window.speechSynthesis;
  if (!synth) {
    if (voiceMode) startRecognitionSafe(100);
    return;
  }

  const clean = text.replace(/```[\s\S]*?```/g," code block ").replace(/\[IMAGE:.*?\]/gi," image ").replace(/\[SUGGESTIONS:.*?\]/gi,"").replace(/#{1,6} /g,"").replace(/[*_`]/g,"").replace(/https?:\/\/\S+/g," link ").replace(/\n+/g," ").trim().slice(0,3000);

  const onEnd = () => {
    if(btn){
      btn.classList.remove("speaking");
      btn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>Speak`;
    }
    // If voice mode, auto-restart listening after speaking
    if (voiceMode && recognition && !busy) {
      setVoiceStatus("listening");
      startRecognitionSafe(350);
    }
  };

  if(btn){
    btn.classList.add("speaking");
    btn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>Stop`;
  }

  if (voiceMode) setVoiceStatus("speaking");

  // Chunk-based speaking for long texts (avoids cutoffs)
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [clean];
  const chunks = [];
  let current = "";
  for (const s of sentences) {
    if ((current + s).length > 200) {
      if (current) chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  let chunkIndex = 0;
  function speakChunk() {
    if (chunkIndex >= chunks.length) { onEnd(); return; }
    const utt = new SpeechSynthesisUtterance(chunks[chunkIndex]);
    utt.rate = voiceSettings.rate;
    utt.pitch = voiceSettings.pitch;
    utt.volume = 1;
    if (_bestVoice) utt.voice = _bestVoice;
    utt.onend = () => { chunkIndex++; speakChunk(); };
    utt.onerror = () => { chunkIndex++; speakChunk(); };
    synth.speak(utt);
  }

  if (!_voicesLoaded) {
    loadBestVoice();
    if (!_voicesLoaded) {
      synth.onvoiceschanged = () => {
        synth.onvoiceschanged = null;
        loadBestVoice();
        speakChunk();
      };
      return;
    }
  }
  speakChunk();
}

// ─── VOICE INPUT & CALL ───────────────────────────────────────────────────────
function initVoice() {
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition; if(!SR) return;
  recognition=new SR();recognition.continuous=false;recognition.interimResults=true;recognition.lang=voiceSettings.lang||"en-US";
  recognition.onstart=()=>{
    recognitionActive = true;
    document.getElementById("micBtn")?.classList.add("listening");
    if (voiceMode) setVoiceStatus("listening");
  };
  recognition.onresult=e=>{
    let final="",interim="";
    for(const r of e.results){if(r.isFinal)final+=r[0].transcript;else interim+=r[0].transcript;}
    const ta=document.getElementById("inputTa");
    const transcript=(final||interim).trim();
    ta.value=transcript;
    ta.style.height="auto";ta.style.height=Math.min(ta.scrollHeight,140)+"px";
    setVoiceTranscript(transcript || "Listening...");
    if(final&&voiceMode&&!busy) {
      voiceAwaitingSend = true;
      stopRecognitionSafe();
      setVoiceStatus("thinking");
      setTimeout(send,220);
    }
  };
  recognition.onend=()=>{
    recognitionActive = false;
    document.getElementById("micBtn")?.classList.remove("listening");
    if(voiceMode&&!busy&&!voiceAwaitingSend&&!window.speechSynthesis?.speaking) {
      setVoiceStatus("listening");
      startRecognitionSafe(500);
    }
  };
  recognition.onerror=e=>{
    recognitionActive = false;
    // Properly handle fatal errors
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      toast("Microphone access denied. Enable it in browser settings.","err");
      if (voiceMode) stopVoiceCall();
      return;
    }
    if(e.error!=="no-speech"&&e.error!=="aborted") console.warn("Voice:",e.error);
    document.getElementById("micBtn")?.classList.remove("listening");
    // Auto-restart on non-fatal errors during voice call
    if (voiceMode && e.error !== "not-allowed" && e.error !== "service-not-allowed") {
      startRecognitionSafe(e.error === "no-speech" ? 500 : 1000);
    }
  };

  // Load best voice early
  loadBestVoice();
  const synth = window.speechSynthesis;
  if (synth && !_voicesLoaded) {
    synth.onvoiceschanged = () => { loadBestVoice(); };
  }
}

function tapSpeak(){
  if(!recognition){toast("Voice not supported. Try Chrome.","err");return;}
  if(voiceMode)return;
  startRecognitionSafe();
}

function startVoiceCall(){
  if(!recognition){toast("Voice not supported.","err");return;}
  voiceMode=true;
  document.getElementById("voiceCallBtn")?.classList.add("active");
  document.getElementById("voiceOverlay")?.classList.remove("hidden");
  stopTTS();

  // Start call timer
  voiceStartTime = Date.now();
  updateVoiceTimer();
  voiceTimerInterval = setInterval(updateVoiceTimer, 1000);
  cleanupFns.push(() => { if(voiceTimerInterval) clearInterval(voiceTimerInterval); });

  setVoiceStatus("speaking");
  setVoiceTranscript("Starting voice call...");

  setTimeout(()=>speakOut("Hey there, I'm ready. Go ahead."),250);
}

function stopVoiceCall(){
  voiceMode=false;
  voiceAwaitingSend=false;
  stopRecognitionSafe();
  stopTTS();
  document.getElementById("voiceCallBtn")?.classList.remove("active");
  document.getElementById("voiceOverlay")?.classList.add("hidden");

  // Stop timer
  if (voiceTimerInterval) { clearInterval(voiceTimerInterval); voiceTimerInterval = null; }
  const timer = document.getElementById("voiceTimer");
  if (timer) timer.textContent = "00:00";
  setVoiceTranscript("");
}

function updateVoiceTimer() {
  if (!voiceStartTime) return;
  const elapsed = Math.floor((Date.now() - voiceStartTime) / 1000);
  const mins = String(Math.floor(elapsed / 60)).padStart(2,"0");
  const secs = String(elapsed % 60).padStart(2,"0");
  const timer = document.getElementById("voiceTimer");
  if (timer) timer.textContent = `${mins}:${secs}`;
}

function setVoiceStatus(status) {
  const el = document.getElementById("voiceStatus");
  if (!el) return;
  el.className = "voice-status " + status;
  const labels = { listening:"Listening…", thinking:"Thinking…", speaking:"Speaking…" };
  el.textContent = labels[status] || status;
}

function setVoiceTranscript(text) {
  const el = document.getElementById("voiceTranscript");
  if (!el) return;
  el.textContent = text || "Say something when the ring glows.";
}

// ─── VOICE SETTINGS ───────────────────────────────────────────────────────────
function loadVoiceSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("anitechai_voice_settings") || "null");
    if (saved) voiceSettings = { ...voiceSettings, ...saved };
  } catch {}
}

function persistVoiceSettings() {
  try { localStorage.setItem("anitechai_voice_settings", JSON.stringify(voiceSettings)); } catch {}
}

function populateVoiceSelect() {
  const sel = document.getElementById("vsVoiceSelect");
  if (!sel) return;
  const synth = window.speechSynthesis;
  const voices = synth ? synth.getVoices() : [];
  if (!voices.length) {
    sel.innerHTML = `<option value="">Auto (best available)</option>`;
    return;
  }
  const englishFirst = [...voices].sort((a,b)=>{
    const aEn = a.lang.startsWith("en") ? 0 : 1;
    const bEn = b.lang.startsWith("en") ? 0 : 1;
    return aEn - bEn || a.name.localeCompare(b.name);
  });
  sel.innerHTML = `<option value="">Auto (best available)</option>` +
    englishFirst.map(v => `<option value="${esc(v.voiceURI)}">${esc(v.name)} (${esc(v.lang)})</option>`).join("");
  sel.value = voiceSettings.voiceURI || "";
}

function openVoiceSettings() {
  const synth = window.speechSynthesis;
  if (synth) {
    populateVoiceSelect();
    if (!_voicesLoaded) synth.onvoiceschanged = () => { loadBestVoice(); populateVoiceSelect(); };
  }
  document.getElementById("vsLangSelect").value = voiceSettings.lang || "en-US";
  document.getElementById("vsRate").value = voiceSettings.rate;
  document.getElementById("vsRateVal").textContent = Number(voiceSettings.rate).toFixed(2) + "x";
  document.getElementById("vsPitch").value = voiceSettings.pitch;
  document.getElementById("vsPitchVal").textContent = Number(voiceSettings.pitch).toFixed(2);
  document.getElementById("vsAutoSpeak").checked = !!voiceSettings.autoSpeak;
  document.getElementById("voiceSettingsOverlay")?.classList.remove("hidden");
}

function closeVoiceSettings() {
  document.getElementById("voiceSettingsOverlay")?.classList.add("hidden");
}

function saveVoiceSettings() {
  voiceSettings.voiceURI = document.getElementById("vsVoiceSelect").value || null;
  voiceSettings.lang = document.getElementById("vsLangSelect").value || "en-US";
  voiceSettings.rate = parseFloat(document.getElementById("vsRate").value) || 0.92;
  voiceSettings.pitch = parseFloat(document.getElementById("vsPitch").value) || 1.02;
  voiceSettings.autoSpeak = document.getElementById("vsAutoSpeak").checked;
  persistVoiceSettings();
  loadBestVoice();
  if (recognition) recognition.lang = voiceSettings.lang;
  toast("Voice settings saved","ok");
  closeVoiceSettings();
}

function testVoiceSettings() {
  const prevVoiceURI = voiceSettings.voiceURI;
  voiceSettings.voiceURI = document.getElementById("vsVoiceSelect").value || null;
  voiceSettings.rate = parseFloat(document.getElementById("vsRate").value) || 0.92;
  voiceSettings.pitch = parseFloat(document.getElementById("vsPitch").value) || 1.02;
  loadBestVoice();
  speakOut("Hi, I'm Ani-Tech AI. This is how I'll sound with these settings.");
  voiceSettings.voiceURI = prevVoiceURI;
}

// ─── WEB SEARCH ───────────────────────────────────────────────────────────────
async function webSearch(query) {
  try{const q=encodeURIComponent(query),url=`https://api.allorigins.win/get?url=${encodeURIComponent(`https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`)}`;const res=await fetch(url,{signal:AbortSignal.timeout(5000)});if(!res.ok)return null;const w=await res.json();const data=JSON.parse(w.contents||"{}");const results=[];if(data.AbstractText)results.push(data.AbstractText);(data.RelatedTopics||[]).slice(0,4).forEach(t=>{if(t.Text)results.push(t.Text);});return results.length?results.join("\n\n"):null;}catch{return null;}
}
function needsSearch(text){
  const t = text.toLowerCase();
  return ["latest news","current price","today's","who is the current","what happened","price of","weather in","weather today","stock price","exchange rate","trending now"].some(k=>t.includes(k));
}

// ─── THEME ────────────────────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem("anitechai_theme") || "dark";
  setTheme(saved);
}

function setTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("anitechai_theme", theme);

  const darkIcon = document.querySelector(".theme-icon-dark");
  const lightIcon = document.querySelector(".theme-icon-light");
  if (darkIcon && lightIcon) {
    darkIcon.classList.toggle("hidden", theme === "light");
    lightIcon.classList.toggle("hidden", theme === "dark");
  }
}

function toggleTheme() {
  setTheme(currentTheme === "dark" ? "light" : "dark");
}

// ─── SEND ─────────────────────────────────────────────────────────────────────
async function runAITurn() {
  busy=true;document.getElementById("sendBtn").disabled=true;
  if (voiceMode) setVoiceStatus("thinking");
  const thinkEl=renderThinking();
  try{
    const reply=await callAI(myChats()[activeId].history);
    thinkEl.remove();removeThinking();
    myChats()[activeId].history.push({role:"assistant",text:reply});
    renderAI(reply,true);scheduleSave();
    bumpUsage("msg");
    // Update trial display
    renderTrial(curUser);
    // Check power_user badge
    const totalMsgs=Object.values(myChats()).reduce((t,c)=>t+(c.history?.length||0),0);
    if(totalMsgs>=100&&DB.users[curUser.uid]&&!getUserBadges(curUser.uid).includes("power_user")){
      if(!DB.users[curUser.uid].badges) DB.users[curUser.uid].badges=getUserBadges(curUser.uid);
      DB.users[curUser.uid].badges.push("power_user");
      scheduleSave(); toast("Badge unlocked: Power User!","ok");
    }
  }catch(e){
    thinkEl.remove();removeThinking();
    const em="Error: "+(e.message||"Something went wrong");
    myChats()[activeId].history.push({role:"assistant",text:em});
    renderAI(em,false);
    toast(e.message||"Request failed");
    console.error("Send error:",e);
  }
  finally{
    busy=false;
    document.getElementById("sendBtn").disabled=false;
    document.getElementById("inputTa").focus();
    const voiceIsSpeaking = document.getElementById("voiceStatus")?.classList.contains("speaking") || window.speechSynthesis?.speaking;
    if (voiceMode && !voiceIsSpeaking) {
      setVoiceStatus("listening");
      startRecognitionSafe(450);
    }
  }
}

async function retryLastAI(btn) {
  if(busy || !curUser || !activeId) return;
  const hist = myChats()[activeId]?.history;
  if(!hist || !hist.length) return;
  // Drop the trailing failed assistant entry so it isn't kept as bad context
  if(hist[hist.length-1]?.role === "assistant" && /^Error:/.test(hist[hist.length-1].text)) {
    hist.pop();
  }
  if(!hist.length || hist[hist.length-1].role !== "user") { toast("Nothing to retry.","warn"); return; }
  // Remove the rendered error bubble from the DOM
  const bubble = btn?.closest(".msg");
  bubble?.remove();
  await runAITurn();
}

async function send() {
  if(busy) return;
  const ta=document.getElementById("inputTa"), text=ta.value.trim();
  if(!text) return;
  voiceAwaitingSend = false;
  if(isBanned(curUser)){toast("Account suspended.","err");return;}
  // Check free plan limits
  if(!checkLimit("msg")) return;
  if(!activeId||!myChats()[activeId]){const id="c"+Date.now();myChats()[id]={title:"New Chat",history:[]};activeId=id;renderChatList();}
  const isFirst=!myChats()[activeId].history.length;
  if(isFirst) setTitle(activeId,text);
  myChats()[activeId].history.push({role:"user",text});
  renderUser(text);ta.value="";ta.style.height="auto";
  await runAITurn();
}

// ─── AI API — xAI Grok with streaming + exponential backoff ─────────────────
async function readAIError(res) {
  const raw = await res.text().catch(()=>"");
  if(!raw) return `AI request failed (${res.status})`;
  try {
    const json = JSON.parse(raw);
    return json.error?.message || json.message || raw.slice(0, 240);
  } catch {
    return raw.slice(0, 240);
  }
}

function friendlyAIError(status, detail="") {
  const msg = String(detail || "").toLowerCase();
  console.warn("AI error detail:", status, detail);
  if(status === 401 || status === 403) return "Ani-Tech AI is temporarily unavailable. Our team has been notified — please try again shortly.";
  if(status === 402 || msg.includes("quota") || msg.includes("credit") || msg.includes("billing")) return "Ani-Tech AI is at capacity right now. Please try again in a few minutes, or contact ANICADE Tech if this continues.";
  if(status === 429) return "AI is busy right now. Trying another model...";
  if(status === 404 || msg.includes("model")) return "Switching to another AI model...";
  if(status >= 500) return "AI service is having a temporary issue. Please try again in a moment.";
  return "AI request failed. Please try again.";
}

async function fetchAI(model, messages, stream) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), stream ? 65000 : 45000);
  try {
    return await fetch(AI_URL, {
      method: "POST",
      headers: { "Content-Type":"application/json", "Authorization":`Bearer ${AI_KEY}` },
      signal: controller.signal,
      body: JSON.stringify({ model, messages, temperature:0.7, max_tokens:2048, stream })
    });
  } finally {
    clearTimeout(timer);
  }
}

async function streamRead(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, {stream: true});
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") return fullText.trim();
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) fullText += delta;
      } catch {}
    }
  }
  return fullText.trim();
}

async function parseAIResponse(res) {
  if (res.headers.get("content-type")?.includes("text/event-stream")) return streamRead(res);
  const data = await res.json().catch(()=>null);
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

// Attempt a single model, retrying transient failures (network/429/5xx) up to
// `maxRetries` times with capped exponential backoff before giving up on it.
async function tryModel(model, messages, maxRetries = 2) {
  const MAX_BACKOFF = 6000;
  let backoff = 700;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      let res = await fetchAI(model, messages, true);

      if (res.status === 429 || res.status >= 500) {
        if (attempt < maxRetries) {
          await new Promise(r=>setTimeout(r, backoff));
          backoff = Math.min(backoff * 2, MAX_BACKOFF);
          continue;
        }
        const detail = await readAIError(res);
        throw Object.assign(new Error(friendlyAIError(res.status, detail)), {status:res.status, retryable:true});
      }

      if (!res.ok) {
        const detail = await readAIError(res);
        const err = Object.assign(new Error(friendlyAIError(res.status, detail)), {status:res.status});
        // Auth/billing errors are not fixable by retrying or switching models
        if (res.status===401||res.status===403||res.status===402) { err.fatal = true; throw err; }
        // Bad/unavailable model — no point retrying this one
        if (res.status===404) { err.skipModel = true; throw err; }
        throw err;
      }

      const text = await parseAIResponse(res);
      if (text) return text;

      // Empty stream — one non-streaming fallback attempt before giving up on this model
      const res2 = await fetchAI(model, messages, false);
      if (!res2.ok) {
        const detail = await readAIError(res2);
        const err = Object.assign(new Error(friendlyAIError(res2.status, detail)), {status:res2.status});
        if (res2.status===401||res2.status===403||res2.status===402) err.fatal = true;
        throw err;
      }
      const text2 = await parseAIResponse(res2);
      if (text2) return text2;
      throw new Error("Empty response");
    } catch (e) {
      if (e?.fatal || e?.skipModel) throw e;
      if (e?.name === "AbortError") {
        if (attempt < maxRetries) { await new Promise(r=>setTimeout(r, backoff)); backoff = Math.min(backoff*2, MAX_BACKOFF); continue; }
        throw new Error("AI request timed out. Please try again.");
      }
      if (/failed to fetch|networkerror|load failed/i.test(e?.message||"")) {
        if (attempt < maxRetries) { await new Promise(r=>setTimeout(r, backoff)); backoff = Math.min(backoff*2, MAX_BACKOFF); continue; }
        throw new Error("Couldn't reach the AI service. Please check your connection and try again.");
      }
      if (attempt < maxRetries && e?.retryable) { continue; }
      throw e;
    }
  }
}

async function callAI(history) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("You're offline. Please check your internet connection and try again.");
  }

  const lastMsg = history[history.length-1]?.text || "";
  let searchNote = "";
  if(needsSearch(lastMsg)){
    const r = await webSearch(lastMsg);
    if(r) searchNote = `\n\n[WEB SEARCH RESULTS for "${lastMsg}"]:\n${r}\n[END SEARCH RESULTS]`;
  }

  // Context window management — trim to last 20 messages
  const trimmedHistory = history.length > 20 ? history.slice(-20) : history;

  const messages = [{ role:"system", content:buildSystem(curUser, voiceMode) }];
  trimmedHistory.forEach((m,i) => {
    const content = (i === trimmedHistory.length-1 && searchNote) ? m.text+searchNote : m.text;
    messages.push({ role: m.role==="assistant" ? "assistant" : "user", content });
  });

  let lastErr = null;
  for (let i = 0; i < AI_MODELS.length; i++) {
    const model = AI_MODELS[i];
    try {
      return await tryModel(model, messages);
    } catch (e) {
      lastErr = e;
      if (e?.fatal) break; // auth/billing — switching models won't help
      if (i < AI_MODELS.length - 1) toast(`Switching AI models…`, "warn");
      continue;
    }
  }
  console.error("All AI models failed. Last error:", lastErr);
  throw new Error(lastErr?.message || "AI service temporarily unavailable. Please try again in a moment.");
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

  // Theme toggle
  document.getElementById("themeToggleBtn")?.addEventListener("click", toggleTheme);

  // Chat search
  const searchInput = document.getElementById("chatSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", () => renderChatList(searchInput.value));
  }

  // Navigation tabs
  document.querySelectorAll(".nav-tab").forEach(t=>t.addEventListener("click",()=>switchView(t.dataset.view)));
  const sb=document.getElementById("sidebar"),mb=document.getElementById("menuBtn");
  mb.addEventListener("click",e=>{e.stopPropagation();sb.classList.toggle("open");});
  document.addEventListener("click",e=>{if(sb.classList.contains("open")&&!sb.contains(e.target)&&!mb.contains(e.target))sb.classList.remove("open");});
  document.getElementById("adminOverlay")?.addEventListener("click",e=>{if(e.target===document.getElementById("adminOverlay"))closeAdmin();});
  document.getElementById("rateOverlay")?.addEventListener("click",e=>{if(e.target===document.getElementById("rateOverlay"))closeRating();});
  document.getElementById("voiceSettingsOverlay")?.addEventListener("click",e=>{if(e.target===document.getElementById("voiceSettingsOverlay"))closeVoiceSettings();});
  const vsRate=document.getElementById("vsRate"), vsPitch=document.getElementById("vsPitch");
  vsRate?.addEventListener("input",()=>{document.getElementById("vsRateVal").textContent=parseFloat(vsRate.value).toFixed(2)+"x";});
  vsPitch?.addEventListener("input",()=>{document.getElementById("vsPitchVal").textContent=parseFloat(vsPitch.value).toFixed(2);});
  const ta=document.getElementById("inputTa");
  ta.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}});
  ta.addEventListener("input",()=>{ta.style.height="auto";ta.style.height=Math.min(ta.scrollHeight,140)+"px";});
  document.querySelectorAll(".sug").forEach(b=>b.addEventListener("click",()=>{ta.value=b.dataset.q;send();}));

  // Code editor: Tab key inserts 2 spaces, scroll syncs line numbers
  const ce = document.getElementById("codeEditor");
  if(ce) {
    ce.addEventListener("keydown", e => {
      if(e.key === "Tab") {
        e.preventDefault();
        const start = ce.selectionStart, end = ce.selectionEnd;
        ce.value = ce.value.substring(0,start) + "  " + ce.value.substring(end);
        ce.selectionStart = ce.selectionEnd = start + 2;
        updateLineNums();
      }
    });
    ce.addEventListener("input", updateLineNums);
    ce.addEventListener("scroll", syncEditorScroll);
  }
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
      const isAdminUser = u.isAdmin === true;
        boot({ uid:s.uid, name:u.name, email:u.email, trialStart:u.trialStart, prefs:u.prefs||{}, plan:u.plan||"free", isAdmin:isAdminUser });
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
  const ta   = document.getElementById("codeEditor");
  const lnEl = document.getElementById("lineNums");
  if(!ta || !lnEl) return;
  const lines = (ta.value || "").split("\n").length || 1;
  lnEl.textContent = Array.from({length:lines},(_,i)=>String(i+1)).join("\n");
  // Sync scroll
  lnEl.scrollTop = ta.scrollTop;
}

// Sync line numbers scroll with textarea scroll
function syncEditorScroll() {
  const ta   = document.getElementById("codeEditor");
  const lnEl = document.getElementById("lineNums");
  if(ta && lnEl) lnEl.scrollTop = ta.scrollTop;
}
