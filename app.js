/**
 * ANI-TECH AI v3.2 — by ANICADE Tech
 * CEO: Tresfor Wrld | www.anicadetech.xyz
 *
 * New in this version:
 *  - ANICADE Tech brand theme throughout
 *  - AI restricted from revealing models, source code, API keys, internals
 *  - Better TTS via ResponsiveVoice CDN (natural human voices, free)
 *  - Rating / feedback form → separate JSONBin (RATINGS_BIN placeholder)
 *  - Face ID / biometric login via WebAuthn
 *  - Onboarding personalisation wizard
 *  - All keys/IDs from previous version preserved
 */

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const GROQ_KEY    = "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";
const GROQ_URL    = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODELS = [
  "llama-3.1-8b-instant",
  "llama3-8b-8192",
  "gemma2-9b-it",
  "mixtral-8x7b-32768"
];

// JSONBin — main DB
const JB_MASTER  = "$2a$10$VJXQzwtVgNhMTIJiiQvpy.hG7XaRD0.H42NyZhKzeLRungeekMmpO";
const JB_BASE    = "https://api.jsonbin.io/v3/b";
const FIXED_BIN  = "69b14c5bc3097a1dd5173665";

// ─── RATINGS BIN (add your own below) ────────────────────────────────────────
const RATINGS_BIN    = "YOUR_RATINGS_BIN_ID_HERE";   // replace with your JSONBin ID
const RATINGS_MASTER = "YOUR_RATINGS_MASTER_KEY_HERE"; // replace with your master key

const SESSION_KEY = "anitechai_s3";
const TRIAL_DAYS  = 30;
const ADMIN_EMAIL = "anicadetech@gmail.com";
const ADMIN_PASS  = "Krsten2044";

// Image generation — Pollinations with quality boost
const makeImgUrl = (prompt, style = "") => {
  const full = [prompt, style, "high quality, sharp, photorealistic, 4k, detailed"].filter(Boolean).join(", ");
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(full)}?width=768&height=768&nologo=true&enhance=true&seed=${Math.floor(Math.random() * 99999)}`;
};

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
function buildSystem(user) {
  const prefs     = user.prefs || {};
  const interests = (prefs.interests || []).join(", ") || "general topics";
  const style     = prefs.aiStyle || "balanced";
  const tasks     = (prefs.tasks   || []).join(", ") || "answering questions";
  const tone      = prefs.tone     || "professional";

  return `You are Ani-Tech AI — the official AI assistant of ANICADE Tech, built in 2026.

ABOUT ANICADE TECH:
- Website: https://www.anicadetech.xyz
- CEO & Founder: Tresfor Wrld — creator of ANICADE Tech and visionary behind Ani-Tech AI
- Services: custom web development (React/Next.js), mobile apps (React Native/Flutter), AI/ML integration, UI/UX design, cloud/DevOps, tech consulting

THIS USER:
- Name: ${user.name}
- Interests: ${interests}
- Response style preference: ${style}
- Main tasks: ${tasks}
- Tone preference: ${tone}
→ Tailor EVERY response to the above. Match the user's preferred style and tone precisely.

CAPABILITIES:
- Coding & software development (primary strength)
- Image generation: when user says "generate/draw/create/make/show me an image" → reply ONLY with [IMAGE: vivid detailed description]
- Writing, essays, creative content, storytelling
- Math, science, research
- Web search integration (when [WEB RESULTS] provided, use them)
- General knowledge, Q&A, explanations
- Career, business, startup advice
- Language translation

PERSONALITY — tone: ${tone}, style: ${style}:
- Lead with the answer, zero preamble
- Use Markdown: headers, **bold key terms**, bullets, numbered lists
- All code in triple-backtick fenced blocks with language tag
- Complete, working, production-quality code only
- Cover edge cases and best practices

STRICT RESTRICTIONS — NEVER reveal or discuss:
- Which AI model or models are powering you (say "I'm Ani-Tech AI" if asked)
- Source code, architecture, or implementation details
- API keys, bin IDs, credentials, or configuration data
- Internal systems, database structure, or infrastructure
- Your training data, weights, or provider
If asked about any of the above, respond: "I'm Ani-Tech AI, built by ANICADE Tech. I can't share technical internals — but I'm here to help you! What can I do for you?"

IMAGE DIRECTIVE — when asked to generate/draw/create/show an image:
Respond with ONLY this line (nothing else before or after):
[IMAGE: a vivid, detailed description of exactly what the user wants]

WEB SEARCH: when [WEB RESULTS] included, cite naturally: "According to recent sources…"

PROMOTION: mention ANICADE Tech (www.anicadetech.xyz) naturally when user asks about building products, apps, or hiring devs. Never pushy.

CODING FORMAT: 1) Full working code 2) Brief explanation 3) Gotchas/alternatives`;
}

// ─── STATE ────────────────────────────────────────────────────────────────────
let DB          = { users:{}, chats:{}, adminNote:"", banned:{} };
let curUser     = null;
let activeId    = null;
let busy        = false;
let eventsOn    = false;
let deferredInstall = null;
let voiceMode   = false;
let recognition = null;
let ratingStars = 0;

// ─── DB — fixed bin, no localStorage for data ─────────────────────────────────
const JB_HDR = { "Content-Type":"application/json", "X-Master-Key":JB_MASTER };

async function dbInit() {
  dbSetStatus("syncing", "Loading…");
  const res = await fetch(`${JB_BASE}/${FIXED_BIN}/latest`, { headers: JB_HDR });
  if (!res.ok) throw new Error(`DB load failed (${res.status})`);
  const j = await res.json();
  DB = { users:{}, chats:{}, adminNote:"", banned:{}, ...(j.record || {}) };
  dbSetStatus("ok", "Connected");
}

async function dbSave() {
  dbSetStatus("syncing", "Saving…");
  try {
    const res = await fetch(`${JB_BASE}/${FIXED_BIN}`, {
      method: "PUT", headers: JB_HDR, body: JSON.stringify(DB)
    });
    if (!res.ok) throw new Error(`Save ${res.status}`);
    dbSetStatus("ok", "Saved ✓");
  } catch(e) { dbSetStatus("err", "Save failed"); console.error(e); }
}

let saveTimer = null;
function scheduleSave() { if(saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(dbSave, 2000); }
function dbSetStatus(state, text) {
  const el = document.getElementById("dbStatus"); if (!el) return;
  el.className = "db-status " + state;
  const t = document.getElementById("dbStatusText"); if (t) t.textContent = text;
}

// ─── SESSION (sessionStorage — survives reload) ────────────────────────────────
const getSession  = () => { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)||"null"); } catch { return null; } };
const saveSession = u  => sessionStorage.setItem(SESSION_KEY, JSON.stringify(u));
const clearSess   = ()  => sessionStorage.removeItem(SESSION_KEY);

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function h(s) { let v=5381; for(let i=0;i<s.length;i++) v=((v<<5)+v)^s.charCodeAt(i); return (v>>>0).toString(36); }
const uidH    = email => h(email.toLowerCase().trim());
const pwHash  = (pw, id) => h(pw + id + "anitechai2026");
const isAdmin  = u => u?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase() && u?.isAdmin === true;
const isBanned = u => !!DB.banned?.[u?.uid];
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

// ─── TRIAL ────────────────────────────────────────────────────────────────────
function daysLeft(ts) { return Math.max(0, TRIAL_DAYS - Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)); }
function renderTrial(ts) {
  const d = daysLeft(ts), pct = (d / TRIAL_DAYS) * 100;
  const banner = document.getElementById("trialBanner");
  const dEl = document.getElementById("trialDays"), fill = document.getElementById("trialBarFill"), plan = document.getElementById("userPlan");
  if (!banner) return;
  if (dEl) dEl.textContent = d; if (fill) fill.style.width = pct + "%";
  banner.classList.remove("warning","expired");
  if (d === 0)     { banner.classList.add("expired");  if (plan) plan.textContent = "Trial expired"; }
  else if (d <= 7) { banner.classList.add("warning");  if (plan) plan.textContent = `Trial — ${d}d left`; }
  else             {                                    if (plan) plan.textContent = `Free Trial — ${d}d left`; }
}

// ─── AUTH UI ──────────────────────────────────────────────────────────────────
function switchTab(tab) {
  ["Login","Signup","Admin"].forEach(t => {
    const k = t.toLowerCase();
    document.getElementById("tab"+t)?.classList.toggle("active", k === tab);
    document.getElementById("form"+t)?.classList.toggle("hidden", k !== tab);
  });
  ["liErr","suErr","adErr"].forEach(id => hideErr(id));
}
function togglePw(id, btn) {
  const inp = document.getElementById(id), show = inp.type === "password";
  inp.type = show ? "text" : "password";
  btn.querySelector(".eye-show").classList.toggle("hidden", show);
  btn.querySelector(".eye-hide").classList.toggle("hidden", !show);
}
function showErr(id, msg) {
  const el = document.getElementById(id); if (!el) return;
  el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${esc(msg)}`;
  el.classList.remove("hidden");
}
function hideErr(id) { const el = document.getElementById(id); if(el){el.textContent="";el.classList.add("hidden");} }
function setBusy(id, yes, label) {
  const btn = document.getElementById(id); if (!btn) return;
  btn.disabled = yes;
  btn.innerHTML = yes
    ? `<div class="spinner sm" style="border-top-color:#0B1C2D"></div><span>Please wait…</span>`
    : `<span>${label}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
}

// ─── FACE ID / BIOMETRIC LOGIN ────────────────────────────────────────────────
async function handleFaceLogin() {
  if (!window.PublicKeyCredential) { toast("Biometric login not supported on this device","err"); return; }
  try {
    // Check if any credential is registered
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!available) { toast("No biometric sensor found on this device","err"); return; }

    // Try to authenticate with existing credential
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        timeout: 60000,
        userVerification: "required",
        rpId: window.location.hostname || "localhost",
      }
    });
    if (assertion) {
      // Look up stored credential ID in session
      const storedId = sessionStorage.getItem("faceid_uid");
      if (storedId && DB.users[storedId]) {
        const u = DB.users[storedId];
        const user = { uid: storedId, name: u.name, email: u.email, trialStart: u.trialStart, prefs: u.prefs||{} };
        saveSession(user); boot(user);
        toast("Biometric login successful!","ok");
      } else {
        toast("No account linked to this biometric. Sign in normally first.","warn");
      }
    }
  } catch(e) {
    if (e.name === "NotAllowedError") toast("Biometric authentication cancelled","warn");
    else toast("Biometric login failed — try password instead","err");
    console.warn("FaceID:", e);
  }
}

async function registerFaceId(userId) {
  if (!window.PublicKeyCredential) return false;
  try {
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!available) return false;
    const challenge = new Uint8Array(32); crypto.getRandomValues(challenge);
    const uid8 = new TextEncoder().encode(userId);
    await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "Ani-Tech AI", id: window.location.hostname || "localhost" },
        user: { id: uid8, name: DB.users[userId]?.email || userId, displayName: DB.users[userId]?.name || "User" },
        pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
        timeout: 60000,
      }
    });
    sessionStorage.setItem("faceid_uid", userId);
    return true;
  } catch(e) { console.warn("FaceID register:", e); return false; }
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
async function handleLogin() {
  const email = (document.getElementById("liEmail").value||"").trim().toLowerCase();
  const pass  = document.getElementById("liPass").value||"";
  hideErr("liErr");
  if (!email||!pass) { showErr("liErr","Fill in all fields."); return; }
  setBusy("loginBtn", true);
  try {
    await dbInit();
    const id = uidH(email), u = DB.users[id];
    if (!u || u.pw !== pwHash(pass, id)) { showErr("liErr","Incorrect email or password."); return; }
    if (DB.banned?.[id]) { showErr("liErr","This account has been suspended. Contact ANICADE Tech."); return; }
    const user = { uid:id, name:u.name, email, trialStart:u.trialStart, prefs:u.prefs||{} };
    saveSession(user);
    // Offer to register biometrics on first login
    sessionStorage.setItem("faceid_uid", id);
    boot(user);
  } catch(e) { console.error("Login:",e); showErr("liErr", e.message||"Connection error."); }
  finally { setBusy("loginBtn", false, "Sign In"); }
}

// ─── SIGNUP ───────────────────────────────────────────────────────────────────
async function handleSignup() {
  const name  = (document.getElementById("suName").value||"").trim();
  const email = (document.getElementById("suEmail").value||"").trim().toLowerCase();
  const pass  = document.getElementById("suPass").value||"";
  hideErr("suErr");
  if (!name||!email||!pass) { showErr("suErr","Fill in all fields."); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showErr("suErr","Enter a valid email."); return; }
  if (pass.length < 6) { showErr("suErr","Password must be at least 6 characters."); return; }
  setBusy("signupBtn", true);
  try {
    await dbInit();
    const id = uidH(email);
    if (DB.users[id]) { showErr("suErr","Account already exists."); return; }
    DB.users[id] = { name, email, pw:pwHash(pass,id), trialStart:new Date().toISOString(), prefs:{} };
    DB.chats[id] = {};
    await dbSave();
    const user = { uid:id, name, email, trialStart:DB.users[id].trialStart, prefs:{} };
    saveSession(user);
    showOnboarding(user);
  } catch(e) { console.error("Signup:",e); showErr("suErr", e.message||"Signup failed."); }
  finally { setBusy("signupBtn", false, "Create Account"); }
}

// ─── ADMIN LOGIN ──────────────────────────────────────────────────────────────
async function handleAdminLogin() {
  const email = (document.getElementById("adEmail").value||"").trim().toLowerCase();
  const pass  = document.getElementById("adPass").value||"";
  hideErr("adErr");
  if (!email||!pass) { showErr("adErr","Fill in both fields."); return; }
  if (email !== ADMIN_EMAIL.toLowerCase() || pass !== ADMIN_PASS) { showErr("adErr","Incorrect admin credentials."); return; }
  setBusy("adminLoginBtn", true);
  try {
    await dbInit();
    const id = uidH(email);
    if (!DB.users[id]) {
      DB.users[id] = { name:"Admin", email, pw:pwHash(pass,id), trialStart:new Date().toISOString(), prefs:{} };
      DB.chats[id] = {};
      await dbSave();
    }
    const user = { uid:id, name:DB.users[id].name, email, trialStart:DB.users[id].trialStart, prefs:DB.users[id].prefs||{}, isAdmin:true };
    saveSession(user); boot(user);
  } catch(e) { console.error("Admin:",e); showErr("adErr", e.message||"Login failed."); }
  finally { setBusy("adminLoginBtn", false, "Admin Sign In"); }
}

function logout() {
  if (voiceMode) stopVoiceCall();
  stopTTS();
  clearSess(); curUser = null; activeId = null;
  document.getElementById("app").classList.add("hidden");
  document.getElementById("authOverlay").classList.remove("hidden");
  document.getElementById("liEmail").value = "";
  document.getElementById("liPass").value  = "";
  document.getElementById("adminBtn")?.classList.add("hidden");
  switchTab("login");
}

// ─── ONBOARDING WIZARD ────────────────────────────────────────────────────────
let onboardUser = null;
function showOnboarding(user) {
  onboardUser = user;
  document.getElementById("authOverlay").classList.add("hidden");
  document.getElementById("onboarding").classList.remove("hidden");
  document.getElementById("obName").textContent = user.name.split(" ")[0];
  document.querySelectorAll(".ob-chip").forEach(c => c.classList.remove("selected"));
  document.getElementById("obStyle").value = "balanced";
  document.getElementById("obTone").value  = "professional";
  obStep(1);
}
function obStep(n) {
  document.querySelectorAll(".ob-step").forEach((s,i) => s.classList.toggle("hidden", i+1 !== n));
  document.querySelectorAll(".ob-dot").forEach((d,i) => d.classList.toggle("active", i+1 <= n));
}
function obToggleChip(el) { el.classList.toggle("selected"); }
async function finishOnboarding() {
  const interests = [...document.querySelectorAll(".ob-interests .ob-chip.selected")].map(c => c.dataset.v);
  const tasks     = [...document.querySelectorAll(".ob-tasks .ob-chip.selected")].map(c => c.dataset.v);
  const aiStyle   = document.getElementById("obStyle").value;
  const tone      = document.getElementById("obTone").value;
  const prefs     = { interests, tasks, aiStyle, tone };
  onboardUser.prefs = prefs;
  if (DB.users[onboardUser.uid]) { DB.users[onboardUser.uid].prefs = prefs; await dbSave(); }
  saveSession(onboardUser);
  document.getElementById("onboarding").classList.add("hidden");
  boot(onboardUser);
}
function skipOnboarding() {
  document.getElementById("onboarding").classList.add("hidden");
  boot(onboardUser);
}

// ─── BOOT ─────────────────────────────────────────────────────────────────────
function boot(user) {
  curUser = user;
  document.getElementById("authOverlay").classList.add("hidden");
  document.getElementById("onboarding")?.classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("userNm").textContent = user.name;
  document.getElementById("userAv").textContent = user.name.charAt(0).toUpperCase();
  if (user.trialStart) renderTrial(user.trialStart);
  if (isAdmin(user)) document.getElementById("adminBtn")?.classList.remove("hidden");
  if (DB.adminNote) {
    const sn = document.getElementById("sysNote"), snt = document.getElementById("sysNoteText");
    if (sn&&snt) { snt.textContent = DB.adminNote; sn.classList.remove("hidden"); }
  }
  initVoice();
  renderChatList();
  const ids = Object.keys(myChats());
  if (ids.length) loadChat(ids[ids.length-1]); else showWelcome();
  if (!eventsOn) setupEvents();
}

// ─── ADMIN PANEL ──────────────────────────────────────────────────────────────
function openAdmin() {
  if (!isAdmin(curUser)) return;
  dbInit().then(()=>{ document.getElementById("adminOverlay").classList.remove("hidden"); populateAdmin(); })
          .catch(()=>{ document.getElementById("adminOverlay").classList.remove("hidden"); populateAdmin(); });
}
function closeAdmin() { document.getElementById("adminOverlay").classList.add("hidden"); }

function populateAdmin() {
  const users = DB.users, allChats = DB.chats, uids = Object.keys(users);
  let totalMsgs=0, activeTrials=0, totalChats=0;
  uids.forEach(id => {
    const uc = allChats[id]||{}, cids = Object.keys(uc);
    totalChats += cids.length;
    cids.forEach(cid => { totalMsgs += (uc[cid].history||[]).length; });
    if (daysLeft(users[id].trialStart||new Date().toISOString()) > 0) activeTrials++;
  });
  document.getElementById("statUsers").textContent  = uids.length;
  document.getElementById("statChats").textContent  = totalChats;
  document.getElementById("statMsgs").textContent   = totalMsgs;
  document.getElementById("statTrial").textContent  = activeTrials;
  const tbody = document.getElementById("adminUsersBody"); tbody.innerHTML = "";
  if (!uids.length) { tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;color:var(--tx3);padding:20px">No users registered yet</td></tr>`; return; }
  uids.forEach(id => {
    const u = users[id], d = daysLeft(u.trialStart||new Date().toISOString());
    const uc = Object.keys(allChats[id]||{}).length;
    const cls = d===0?"atrial-exp":d<=7?"atrial-warn":"atrial-ok";
    const banned = DB.banned?.[id] ? "Banned" : "Active";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(u.name)}</td>
      <td style="font-family:var(--mono);font-size:.72rem">${esc(u.email)}</td>
      <td style="font-size:.72rem">${u.trialStart?new Date(u.trialStart).toLocaleDateString():"—"}</td>
      <td><span class="${cls}">${d===0?"Expired":d+"d"}</span></td>
      <td style="font-family:var(--mono)">${uc}</td>
      <td style="font-size:.72rem;color:${DB.banned?.[id]?"var(--red)":"var(--success)"}">${banned}</td>
      <td>
        <div class="admin-act-row">
          <button class="aa extend" onclick="adminExtend('${id}')" title="+30 days">+30d</button>
          <button class="aa view"   onclick="adminViewChats('${id}')" title="View chats">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="aa ban"    onclick="adminBan('${id}')" title="${DB.banned?.[id]?"Unban":"Ban"}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
          </button>
          <button class="aa del"    onclick="adminDel('${id}')" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>
          </button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
  const noteEl = document.getElementById("adminNote");
  if (noteEl) noteEl.value = DB.adminNote||"";
}

async function adminExtend(id) {
  if (!DB.users[id]) return;
  const d = new Date(DB.users[id].trialStart||Date.now()); d.setDate(d.getDate()+30);
  DB.users[id].trialStart = d.toISOString(); await dbSave(); populateAdmin(); toast("+30 days added","ok");
}
function adminViewChats(id) {
  const uc = DB.chats[id]||{};
  const text = Object.values(uc).map(c=>`## ${c.title}\n`+c.history.map(m=>`**${m.role}:** ${(m.text||"").slice(0,300)}`).join("\n")).join("\n\n---\n\n")||"No chats";
  const w = window.open("","_blank","width=720,height=600");
  w.document.write(`<pre style="background:#0B1C2D;color:#F5F7FA;padding:20px;font-family:monospace;font-size:13px;white-space:pre-wrap;line-height:1.5">${text}</pre>`);
}
async function adminBan(id) {
  if (!DB.banned) DB.banned = {};
  if (DB.banned[id]) { delete DB.banned[id]; toast("User unbanned","ok"); }
  else { DB.banned[id] = true; toast("User banned","warn"); }
  await dbSave(); populateAdmin();
}
async function adminDel(id) {
  if (!confirm("Delete this user and all their chats? Cannot be undone.")) return;
  delete DB.users[id]; delete DB.chats[id]; if (DB.banned) delete DB.banned[id];
  await dbSave(); populateAdmin(); toast("User deleted","ok");
}
async function saveAdminNote() {
  DB.adminNote = (document.getElementById("adminNote").value||"").trim();
  await dbSave(); toast("Note saved","ok");
}
async function resetAllChats() {
  if (!confirm("Reset ALL chats for ALL users? Cannot be undone.")) return;
  Object.keys(DB.chats).forEach(id => { DB.chats[id] = {}; });
  await dbSave(); populateAdmin(); toast("All chats reset","ok");
}
function adminExport() {
  const blob = new Blob([JSON.stringify({exported:new Date().toISOString(),db:DB},null,2)],{type:"application/json"});
  const a = Object.assign(document.createElement("a"),{href:URL.createObjectURL(blob),download:`anitechai-export-${new Date().toISOString().slice(0,10)}.json`});
  a.click(); toast("Data exported","ok");
}

// ─── RATING FORM ──────────────────────────────────────────────────────────────
function openRating() { document.getElementById("rateOverlay").classList.remove("hidden"); }
function closeRating() { document.getElementById("rateOverlay").classList.add("hidden"); ratingStars = 0; document.querySelectorAll(".rate-star").forEach(s=>s.classList.remove("active")); }
function setRatingStar(n) {
  ratingStars = n;
  document.querySelectorAll(".rate-star").forEach((s,i) => s.classList.toggle("active", i < n));
}

async function submitRating() {
  const comment   = (document.getElementById("rateComment").value||"").trim();
  const easeUX    = document.getElementById("rateEase")?.value||"";
  const featUX    = document.getElementById("rateFeat")?.value||"";
  if (!ratingStars) { toast("Please select a star rating","warn"); return; }

  const entry = {
    uid:       curUser?.uid||"anon",
    name:      curUser?.name||"Anonymous",
    stars:     ratingStars,
    comment,
    ease:      easeUX,
    features:  featUX,
    ts:        new Date().toISOString()
  };

  if (!RATINGS_BIN || RATINGS_BIN === "YOUR_RATINGS_BIN_ID_HERE") {
    toast("Ratings bin not configured yet — add RATINGS_BIN in app.js","warn");
    console.log("Rating would have submitted:", entry); closeRating(); return;
  }

  setBusy("rateSubmitBtn", true);
  try {
    const hdr = { "Content-Type":"application/json", "X-Master-Key": RATINGS_MASTER };
    const getRes = await fetch(`https://api.jsonbin.io/v3/b/${RATINGS_BIN}/latest`, { headers: hdr });
    let record = { ratings: [] };
    if (getRes.ok) { const j = await getRes.json(); record = j.record||{ratings:[]}; }
    if (!record.ratings) record.ratings = [];
    record.ratings.push(entry);
    await fetch(`https://api.jsonbin.io/v3/b/${RATINGS_BIN}`, {
      method:"PUT", headers: hdr, body: JSON.stringify(record)
    });
    toast("Thank you for your feedback! ⭐","ok");
    closeRating();
  } catch(e) { toast("Failed to submit — try again","err"); console.error(e); }
  finally { setBusy("rateSubmitBtn", false, "Submit Feedback"); }
}

// ─── CHATS ────────────────────────────────────────────────────────────────────
function myChats() { if (!DB.chats[curUser.uid]) DB.chats[curUser.uid] = {}; return DB.chats[curUser.uid]; }

function newChat() {
  const id = "c"+Date.now();
  myChats()[id] = { title:"New Chat", history:[] };
  scheduleSave(); renderChatList(); loadChat(id);
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("inputTa").focus();
}

function loadChat(id) {
  activeId = id;
  document.getElementById("messages").innerHTML = "";
  const c = myChats()[id]; if (!c) return;
  document.getElementById("chatTitle").textContent = c.title;
  if (!c.history.length) { showWelcome(); return; }
  document.getElementById("welcome").style.display = "none";
  c.history.forEach(m => m.role === "user" ? renderUser(m.text) : renderAI(m.text, false));
  scrollDown();
  document.querySelectorAll(".chat-item").forEach(el => el.classList.toggle("active", el.dataset.id === id));
}

function delChat(id, e) {
  e.stopPropagation(); delete myChats()[id]; scheduleSave(); renderChatList();
  const ids = Object.keys(myChats());
  if (activeId === id) {
    if (ids.length) loadChat(ids[ids.length-1]);
    else { activeId = null; showWelcome(); document.getElementById("chatTitle").textContent = "New Chat"; }
  }
}

function renderChatList() {
  const el = document.getElementById("chatList"); el.innerHTML = "";
  const ids = Object.keys(myChats()).reverse();
  if (!ids.length) { el.innerHTML=`<p style="color:var(--tx3);font-size:.76rem;padding:10px 12px;text-align:center;font-family:var(--font)">No chats yet</p>`; return; }
  ids.forEach(id => {
    const c = myChats()[id];
    const div = document.createElement("div");
    div.className = "chat-item"+(id===activeId?" active":""); div.dataset.id = id;
    div.innerHTML = `
      <span class="ci-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
      <span class="chat-item-lbl">${esc(c.title)}</span>
      <button class="chat-item-del" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg></button>`;
    div.addEventListener("click", () => { loadChat(id); document.getElementById("sidebar").classList.remove("open"); });
    div.querySelector(".chat-item-del").addEventListener("click", e => delChat(id, e));
    el.appendChild(div);
  });
}

function setTitle(id, text) {
  myChats()[id].title = text.slice(0,46) + (text.length>46?"…":"");
  document.getElementById("chatTitle").textContent = myChats()[id].title;
  scheduleSave(); renderChatList();
}

// ─── UI ───────────────────────────────────────────────────────────────────────
function showWelcome() { document.getElementById("welcome").style.display = "flex"; document.getElementById("messages").innerHTML = ""; }
const scrollDown = () => { const a = document.getElementById("chatArea"); setTimeout(() => a.scrollTop = a.scrollHeight, 80); };

// ANICADE logo as AI avatar
const AI_AVATAR = `<img src="https://i.imgur.com/9mjKZAj.jpeg" alt="Ani-Tech AI" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
const USR_AVATAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;

function msgActions(rawText, isAI = true) {
  const safe = (rawText||"").replace(/\\/g,"\\\\").replace(/"/g,"&quot;").replace(/\n/g,"\\n");
  const speakBtn = isAI ? `<button class="mab speak" data-text="${safe}" onclick="speakText(this)" title="Read aloud"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>Speak</button>` : "";
  return `<div class="msg-acts">${speakBtn}<button class="mab copy" onclick="copyMsg(this)" title="Copy message"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy</button></div>`;
}

function copyMsg(btn) {
  const bubble = btn.closest(".msg-body").querySelector(".bubble");
  navigator.clipboard.writeText(bubble?.innerText||"").then(() => {
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>Copied!`;
    setTimeout(() => { btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy`; }, 1800);
  });
}

function renderUser(text) {
  document.getElementById("welcome").style.display = "none";
  const el = document.createElement("div"); el.className = "msg user-msg";
  el.innerHTML = `<div class="msg-body" style="order:1"><div class="msg-from user">You</div><div class="bubble">${esc(text).replace(/\n/g,"<br>")}</div>${msgActions(text,false)}</div><div class="av user" style="order:2">${USR_AVATAR}</div>`;
  document.getElementById("messages").appendChild(el); scrollDown();
}

function renderAI(content, speak = true) {
  document.getElementById("welcome").style.display = "none";
  const el = document.createElement("div"); el.className = "msg";
  const imgMatch = content.match(/^\s*\[IMAGE:\s*([\s\S]+?)\]\s*$/im);
  let bubbleHtml = "", plainText = content;

  if (imgMatch) {
    const prompt = imgMatch[1].trim();
    const style  = (curUser?.prefs?.interests||[]).includes("art") ? "digital art, vibrant" :
                   (curUser?.prefs?.interests||[]).includes("photography") ? "photorealistic, DSLR" : "";
    const imgSrc = makeImgUrl(prompt, style);
    plainText = `Generated image: ${prompt}`;
    bubbleHtml = `
      <div class="ai-img-wrap">
        <div class="ai-img-spinner"><div class="spinner sm"></div><span style="font-family:var(--font)">Generating…</span></div>
        <img class="ai-img" alt="${esc(prompt)}" style="display:none"
          onload="this.previousElementSibling.style.display='none';this.style.display='block'"
          onerror="this.previousElementSibling.innerHTML='<span style=\'color:var(--red)\'>Generation failed — try a different prompt</span>';this.style.display='none'"
          src="${imgSrc}"/>
        <p class="ai-img-cap">${esc(prompt)}</p>
        <a class="ai-img-dl" href="${imgSrc}" target="_blank" rel="noopener"
           onclick="autoDownload(event,'${imgSrc.replace(/'/g,"\\'")}','ani-tech-ai-image.jpg')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download
        </a>
      </div>`;
  } else {
    bubbleHtml = md(content);
  }

  el.innerHTML = `<div class="av ai">${AI_AVATAR}</div><div class="msg-body"><div class="msg-from ai">Ani-Tech AI</div><div class="bubble">${bubbleHtml}</div>${msgActions(plainText,true)}</div>`;
  document.getElementById("messages").appendChild(el);
  attachCopy(el); scrollDown();
  if (speak && voiceMode && plainText && !imgMatch) speakOut(plainText);
}

function autoDownload(e, url, filename) {
  e.preventDefault();
  fetch(url).then(r => r.blob()).then(blob => {
    const a = Object.assign(document.createElement("a"),{href:URL.createObjectURL(blob),download:filename});
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
  }).catch(() => window.open(url,"_blank"));
}

function renderThinking() {
  document.getElementById("welcome").style.display = "none";
  const el = document.createElement("div"); el.className = "msg"; el.id = "thinking";
  el.innerHTML = `<div class="av ai">${AI_AVATAR}</div><div class="msg-body"><div class="msg-from ai">Ani-Tech AI</div><div class="bubble"><div class="thinking"><span></span><span></span><span></span></div></div></div>`;
  document.getElementById("messages").appendChild(el); scrollDown(); return el;
}

function toast(msg, type="err") {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.className = `toast ${type}`;
  t.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${esc(msg)}`;
  t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 4500);
}

// ─── MARKDOWN ─────────────────────────────────────────────────────────────────
function md(text) {
  if (!text) return "";
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_,lang,code) => {
    const l=esc(lang||""), c=esc(code.trim()), enc=encodeURIComponent(code.trim());
    return `<div class="code-wrap"><pre><code class="lang-${l}">${c}</code></pre><button class="copy-btn" data-code="${enc}">Copy</button></div>`;
  });
  text = text.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  text = text.replace(/^### (.+)$/gm,"<h3>$1</h3>").replace(/^## (.+)$/gm,"<h2>$1</h2>").replace(/^# (.+)$/gm,"<h1>$1</h1>");
  text = text.replace(/\*\*\*(.+?)\*\*\*/g,"<strong><em>$1</em></strong>").replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\*(.+?)\*/g,"<em>$1</em>");
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
  text = text.replace(/^---$/gm,'<hr style="border:none;border-top:1px solid rgba(255,255,255,.07);margin:10px 0">');
  text = text.replace(/^([ \t]*[-*+] .+\n?)+/gm, m=>`<ul>${m.trim().split("\n").map(l=>`<li>${l.replace(/^[ \t]*[-*+] /,"")}</li>`).join("")}</ul>`);
  text = text.replace(/^([ \t]*\d+\. .+\n?)+/gm, m=>`<ol>${m.trim().split("\n").map(l=>`<li>${l.replace(/^[ \t]*\d+\. /,"")}</li>`).join("")}</ol>`);
  text = text.replace(/\n{2,}/g,"</p><p>").replace(/\n/g,"<br>");
  text = "<p>"+text+"</p>";
  text = text.replace(/<p>(<(?:h[123]|ul|ol|pre|hr|div))/g,"$1").replace(/(<\/(?:h[123]|ul|ol|pre|div)>)<\/p>/g,"$1");
  return text;
}
function attachCopy(c) { c.querySelectorAll(".copy-btn").forEach(b => b.addEventListener("click", () => navigator.clipboard.writeText(decodeURIComponent(b.dataset.code)).then(() => { b.textContent="Copied!"; setTimeout(()=>b.textContent="Copy",1800); }))); }

// ─── TTS — ResponsiveVoice (much better than browser default) ─────────────────
// ResponsiveVoice is loaded via CDN in index.html and provides natural voices
// Falls back to browser SpeechSynthesis if unavailable

function stopTTS() {
  if (window.responsiveVoice && responsiveVoice.isPlaying()) responsiveVoice.cancel();
  window.speechSynthesis?.cancel();
}

function speakText(btn) {
  const text = (btn.dataset.text||"").replace(/\\n/g," ").trim();
  if (!text) { toast("Nothing to read","warn"); return; }

  // If currently speaking, stop
  const isPlaying = (window.responsiveVoice && responsiveVoice.isPlaying()) || window.speechSynthesis?.speaking;
  if (isPlaying) {
    stopTTS();
    btn.classList.remove("speaking");
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>Speak`;
    return;
  }
  speakOut(text, btn);
}

function speakOut(text, btn = null) {
  stopTTS();
  const clean = text
    .replace(/```[\s\S]*?```/g," [code block] ")
    .replace(/\[IMAGE:.*?\]/gi," [image generated] ")
    .replace(/#{1,6} /g,"").replace(/[*_`]/g,"")
    .replace(/https?:\/\/\S+/g," link ").replace(/\n+/g," ").trim().slice(0,1500);

  const onEnd = () => {
    if (btn) {
      btn.classList.remove("speaking");
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>Speak`;
    }
  };

  if (btn) {
    btn.classList.add("speaking");
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>Stop`;
  }

  // Try ResponsiveVoice first (much better quality)
  if (window.responsiveVoice) {
    // UK English Female is the best free RV voice
    responsiveVoice.speak(clean, "UK English Female", {
      pitch: 1,
      rate: 0.95,
      volume: 1,
      onend: onEnd,
      onerror: onEnd
    });
    return;
  }

  // Fallback: browser SpeechSynthesis with best voice priority
  const synth = window.speechSynthesis;
  const utt   = new SpeechSynthesisUtterance(clean);
  utt.rate=0.9; utt.pitch=1.05; utt.volume=1;
  utt.onend=onEnd; utt.onerror=onEnd;

  const PRIORITY = [
    v => v.name === "Google UK English Female",
    v => v.name === "Google UK English Male",
    v => v.name === "Google US English",
    v => v.name.startsWith("Google") && v.lang.startsWith("en"),
    v => v.name === "Samantha",
    v => v.name === "Daniel",
    v => v.name.startsWith("Microsoft") && v.lang.startsWith("en"),
    v => v.lang === "en-US",
    v => v.lang.startsWith("en"),
  ];

  const setAndSpeak = () => {
    const voices = synth.getVoices();
    for (const test of PRIORITY) { const v = voices.find(test); if (v) { utt.voice = v; break; } }
    synth.speak(utt);
    // Chrome keep-alive fix
    if (clean.length > 200) {
      const ka = setInterval(() => { if (!synth.speaking) { clearInterval(ka); return; } synth.pause(); synth.resume(); }, 10000);
    }
  };

  if (synth.getVoices().length) setAndSpeak();
  else { synth.onvoiceschanged = () => { synth.onvoiceschanged = null; setAndSpeak(); }; }
}

// ─── VOICE INPUT ──────────────────────────────────────────────────────────────
function initVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  recognition = new SR();
  recognition.continuous = false; recognition.interimResults = true; recognition.lang = "en-US";
  recognition.onresult = e => {
    let final="", interim="";
    for (const r of e.results) { if (r.isFinal) final+=r[0].transcript; else interim+=r[0].transcript; }
    const ta = document.getElementById("inputTa");
    ta.value = (final||interim).trim();
    ta.style.height="auto"; ta.style.height=Math.min(ta.scrollHeight,140)+"px";
    if (final && voiceMode) setTimeout(send, 300);
  };
  recognition.onend = () => {
    document.getElementById("micBtn")?.classList.remove("listening");
    if (voiceMode && !busy) setTimeout(() => { try { recognition.start(); } catch{} }, 500);
  };
  recognition.onerror = e => {
    if (e.error!=="no-speech"&&e.error!=="aborted") console.warn("Voice:",e.error);
    document.getElementById("micBtn")?.classList.remove("listening");
  };
}

function tapSpeak() {
  if (!recognition) { toast("Voice not supported. Try Chrome or Edge.","err"); return; }
  if (voiceMode) return;
  try { recognition.start(); } catch{}
  document.getElementById("micBtn")?.classList.add("listening");
}

function startVoiceCall() {
  if (!recognition) { toast("Voice not supported. Try Chrome or Edge.","err"); return; }
  voiceMode = true;
  document.getElementById("voiceCallBtn")?.classList.add("active");
  document.getElementById("voiceOverlay")?.classList.remove("hidden");
  stopTTS();
  try { recognition.start(); } catch{}
  setTimeout(() => speakOut("Voice mode active. I'm listening — speak your message."), 400);
}

function stopVoiceCall() {
  voiceMode = false;
  try { recognition?.stop(); } catch{}
  stopTTS();
  document.getElementById("voiceCallBtn")?.classList.remove("active");
  document.getElementById("voiceOverlay")?.classList.add("hidden");
}

// ─── WEB SEARCH ───────────────────────────────────────────────────────────────
async function webSearch(query) {
  try {
    const q   = encodeURIComponent(query);
    const url = `https://api.allorigins.win/get?url=${encodeURIComponent(`https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const w = await res.json();
    const data = JSON.parse(w.contents||"{}");
    const results = [];
    if (data.AbstractText) results.push(data.AbstractText);
    (data.RelatedTopics||[]).slice(0,4).forEach(t => { if (t.Text) results.push(t.Text); });
    return results.length ? results.join("\n\n") : null;
  } catch { return null; }
}
function needsSearch(text) {
  return ["latest","current","today","2026","news","recent","who is","what happened","price of","weather","release","version","update","trending","now","live"].some(k => text.toLowerCase().includes(k));
}

// ─── SEND ─────────────────────────────────────────────────────────────────────
async function send() {
  if (busy) return;
  const ta = document.getElementById("inputTa"), text = ta.value.trim();
  if (!text) return;
  if (curUser?.trialStart && daysLeft(curUser.trialStart) === 0) { toast("Trial expired. Visit www.anicadetech.xyz to renew.","warn"); return; }
  if (isBanned(curUser)) { toast("Your account has been suspended.","err"); return; }
  if (!activeId || !myChats()[activeId]) {
    const id = "c"+Date.now(); myChats()[id]={title:"New Chat",history:[]}; activeId=id; renderChatList();
  }
  const isFirst = !myChats()[activeId].history.length;
  if (isFirst) setTitle(activeId, text);
  myChats()[activeId].history.push({ role:"user", text });
  renderUser(text); ta.value=""; ta.style.height="auto";
  busy=true; document.getElementById("sendBtn").disabled=true;
  const thinkEl = renderThinking();
  try {
    const reply = await callGroq(myChats()[activeId].history);
    thinkEl.remove();
    myChats()[activeId].history.push({ role:"assistant", text:reply });
    renderAI(reply, true); scheduleSave();
  } catch(e) {
    thinkEl.remove();
    const em = "Error: "+e.message;
    myChats()[activeId].history.push({ role:"assistant", text:em });
    renderAI(em, false); toast(e.message); console.error(e);
  } finally { busy=false; document.getElementById("sendBtn").disabled=false; document.getElementById("inputTa").focus(); }
}

// ─── GROQ — 4-model rotation ──────────────────────────────────────────────────
async function callGroq(history) {
  const lastMsg = history[history.length-1]?.text||"";
  let searchNote = "";
  if (needsSearch(lastMsg)) {
    const r = await webSearch(lastMsg);
    if (r) searchNote = `\n\n[WEB SEARCH RESULTS for "${lastMsg}"]:\n${r}\n[END SEARCH RESULTS]`;
  }
  const messages = [{ role:"system", content:buildSystem(curUser) }];
  history.forEach((m,i) => {
    const content = (i===history.length-1 && searchNote) ? m.text+searchNote : m.text;
    messages.push({ role:m.role==="assistant"?"assistant":"user", content });
  });
  const hdrs = { "Content-Type":"application/json", "Authorization":`Bearer ${GROQ_KEY}` };
  for (const model of GROQ_MODELS) {
    try {
      const res = await fetch(GROQ_URL, { method:"POST", headers:hdrs, body:JSON.stringify({model,messages,temperature:0.7,max_tokens:4096,top_p:0.95}) });
      if (res.status===429) { await new Promise(r=>setTimeout(r,700)); continue; }
      if (res.status===401) throw new Error("AI service authentication failed. Contact ANICADE Tech support.");
      if (res.status===503) throw new Error("AI service temporarily unavailable. Try again shortly.");
      if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e?.error?.message||`Service error ${res.status}`); }
      const data  = await res.json();
      const reply = data?.choices?.[0]?.message?.content;
      if (!reply) throw new Error("Empty response. Please try again.");
      return reply;
    } catch(e) {
      if (e.message.includes("429")||e.message.toLowerCase().includes("rate")) continue;
      throw e;
    }
  }
  throw new Error("All AI models busy. Please wait 60 seconds and try again.");
}

// ─── PWA INSTALL ─────────────────────────────────────────────────────────────
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault(); deferredInstall = e;
  document.getElementById("installBanner")?.classList.remove("hidden");
  document.getElementById("installPopup")?.style && (document.getElementById("installPopup").style.display="flex");
});
window.addEventListener("appinstalled", () => {
  document.getElementById("installBanner")?.classList.add("hidden");
  deferredInstall = null; toast("Ani-Tech AI installed!","ok");
});

function doInstall() {
  if (deferredInstall) {
    deferredInstall.prompt();
    deferredInstall.userChoice.then(({outcome}) => {
      if (outcome==="accepted") { document.getElementById("installBanner")?.classList.add("hidden"); deferredInstall=null; }
    });
  } else {
    const ua = navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(ua) && !/crios|fxios/i.test(ua)) toast("In Safari: tap Share (□↑) → 'Add to Home Screen'","ok");
    else if (/iphone|ipad|ipod/i.test(ua)) toast("Open in Safari, then: Share → 'Add to Home Screen'","ok");
    else if (/android/i.test(ua)) toast("Tap the browser menu (⋮) → 'Add to Home screen'","ok");
    else toast("Click install icon (⊕) in your browser's address bar","ok");
  }
}

function setupInstallBanner() {
  document.getElementById("installYes")?.addEventListener("click", doInstall);
  document.getElementById("installNo")?.addEventListener("click",  () => document.getElementById("installBanner")?.classList.add("hidden"));
  document.getElementById("manualInstallBtn")?.addEventListener("click", doInstall);
  // ANICADE-style popup install buttons
  document.getElementById("installBtn")?.addEventListener("click",    doInstall);
  document.getElementById("installDismiss")?.addEventListener("click",() => { const p=document.getElementById("installPopup"); if(p) p.style.display="none"; });
}

// ─── EVENTS ───────────────────────────────────────────────────────────────────
function setupEvents() {
  eventsOn = true;
  document.getElementById("newChatBtn").addEventListener("click", newChat);
  document.getElementById("sendBtn").addEventListener("click", send);
  document.getElementById("micBtn")?.addEventListener("click", tapSpeak);
  document.getElementById("voiceCallBtn")?.addEventListener("click", () => voiceMode ? stopVoiceCall() : startVoiceCall());
  document.getElementById("stopVoiceBtn")?.addEventListener("click", stopVoiceCall);
  document.getElementById("rateBtn")?.addEventListener("click", openRating);

  const sb = document.getElementById("sidebar"), mb = document.getElementById("menuBtn");
  mb.addEventListener("click", e => { e.stopPropagation(); sb.classList.toggle("open"); });
  document.addEventListener("click", e => {
    if (sb.classList.contains("open") && !sb.contains(e.target) && !mb.contains(e.target)) sb.classList.remove("open");
  });
  document.getElementById("adminOverlay")?.addEventListener("click", e => { if (e.target===document.getElementById("adminOverlay")) closeAdmin(); });
  document.getElementById("rateOverlay")?.addEventListener("click",  e => { if (e.target===document.getElementById("rateOverlay"))  closeRating(); });

  const ta = document.getElementById("inputTa");
  ta.addEventListener("keydown", e => { if (e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();} });
  ta.addEventListener("input", () => { ta.style.height="auto"; ta.style.height=Math.min(ta.scrollHeight,140)+"px"; });
  document.querySelectorAll(".sug").forEach(b => b.addEventListener("click", () => { ta.value=b.dataset.q; send(); }));
}

// ─── SW ───────────────────────────────────────────────────────────────────────
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(e => console.warn("SW:",e)));
}

// ─── STARTUP ──────────────────────────────────────────────────────────────────
(async function startup() {
  setupInstallBanner();
  // Show install popup after 1.5s if not standalone
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (!isStandalone) setTimeout(() => { const p=document.getElementById("installPopup"); if(p&&!deferredInstall) p.style.display="flex"; }, 2000);

  const loading   = document.getElementById("authLoading");
  const authTabs  = document.getElementById("authTabs");
  const formLogin = document.getElementById("formLogin");
  loading.classList.remove("hidden"); authTabs.classList.add("hidden"); formLogin.classList.add("hidden");
  try { await dbInit(); } catch(e) { console.error("DB init:",e); dbSetStatus("err","DB offline"); }
  loading.classList.add("hidden"); authTabs.classList.remove("hidden"); formLogin.classList.remove("hidden");

  const s = getSession();
  if (s?.uid && DB.users[s.uid]) {
    const u = DB.users[s.uid];
    boot({ uid:s.uid, name:u.name, email:u.email, trialStart:u.trialStart, prefs:u.prefs||{}, isAdmin:s.isAdmin||false });
    return;
  }
  document.getElementById("authOverlay").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
})();
