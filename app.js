/**
 * ANI-TECH AI v2.1 — by ANICADE Tech
 * ─────────────────────────────────────────
 * AI:  Google Gemini 2.0 Flash (free)
 * DB:  JSONBin.io — single bin for all data
 * ─────────────────────────────────────────
 */

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const GEMINI_KEY   = "AIzaSyA64p41nz-OhlfWw_WHixKGGu77Y8mFncc";
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;

// JSONBin — one bin stores everything: { users: {}, chats: {} }
// X-Master-Key is the only header needed for full access
const JB_MASTER  = "$2a$10$t1pvIZA0plsMluFZ9oGuHeEXnbeyv10dGX5p15Q0xdfXGg2fsW0.2";
const JB_BASE    = "https://api.jsonbin.io/v3/b";
const BIN_ID_KEY = "anitechai_bin_id_v2";  // localStorage key for our single bin ID
const SESSION_KEY= "anitechai_session_v2";

const TRIAL_DAYS = 30;

// ─── Gemini Rate Limiter (15 RPM free tier → 1 per 4.2s) ─────────────────────
const RL = {
  queue: [], lastCall: 0, MIN_GAP: 4200, timer: null,
  enqueue(fn) {
    return new Promise((res, rej) => { this.queue.push({ fn, res, rej }); this._tick(); });
  },
  _tick() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.queue.length) { this._ui("ready"); return; }
      const wait = Math.max(0, this.MIN_GAP - (Date.now() - this.lastCall));
      if (wait > 0) {
        this._ui("cool", Math.ceil(wait / 1000));
        this.timer = setTimeout(() => { this.timer = null; this._tick(); }, wait);
        return;
      }
      const { fn, res, rej } = this.queue.shift();
      this.lastCall = Date.now();
      this._ui("ready");
      fn().then(res).catch(rej);
      if (this.queue.length) this._tick();
    }, 0);
  },
  _ui(state, secs) {
    const badge = document.getElementById("rateBadge");
    const txt   = document.getElementById("rateCountdown");
    if (!badge || !txt) return;
    if (state === "cool") {
      badge.className = "rate-badge cooling"; txt.textContent = secs + "s";
      if (this._cd) clearInterval(this._cd);
      let s = secs;
      this._cd = setInterval(() => { s--; if (s <= 0) { clearInterval(this._cd); this._ui("ready"); } else txt.textContent = s + "s"; }, 1000);
    } else {
      if (this._cd) { clearInterval(this._cd); this._cd = null; }
      badge.className = "rate-badge ready"; txt.textContent = "Ready";
    }
  }
};

// ─── System Prompt ────────────────────────────────────────────────────────────
const SYSTEM = `You are Ani-Tech AI, a sharp, precise coding assistant built by ANICADE Tech.
Speciality: coding, software development, tech.
Rules:
- Lead with the answer — no preamble
- All code in triple-backtick blocks with language tag
- Complete, working, production-quality code
- Proper Markdown: headers, bullets, bold key terms
- Concise but thorough — cover edge cases
Coding format: 1) full code 2) brief explanation 3) gotchas/alternatives`;

// ─── State ───────────────────────────────────────────────────────────────────
let DB        = { users: {}, chats: {} };  // full DB loaded into memory
let binId     = null;                       // our single JSONBin bin ID
let curUser   = null;                       // { uid, name, email, trialStart }
let activeId  = null;
let busy      = false;
let eventsOn  = false;

// ─── JSONBin: Single Bin DB ───────────────────────────────────────────────────
const JB_HDR = { "Content-Type": "application/json", "X-Master-Key": JB_MASTER };

async function dbInit() {
  // Check if we already have a bin ID cached
  binId = localStorage.getItem(BIN_ID_KEY);
  if (binId) {
    // Read existing bin
    dbSetStatus("syncing", "Loading…");
    const res = await fetch(`${JB_BASE}/${binId}/latest`, { headers: JB_HDR });
    if (res.ok) {
      const j = await res.json();
      DB = j.record || { users: {}, chats: {} };
      dbSetStatus("ok", "Connected");
      return;
    }
    // Bin ID invalid or deleted — recreate
    binId = null;
    localStorage.removeItem(BIN_ID_KEY);
  }
  // Create a fresh bin
  dbSetStatus("syncing", "Setting up DB…");
  const res = await fetch(JB_BASE, {
    method: "POST",
    headers: { ...JB_HDR, "X-Bin-Name": "AniTechAI-DB", "X-Bin-Private": "true" },
    body: JSON.stringify({ users: {}, chats: {} })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`DB setup failed (${res.status}): ${txt}`);
  }
  const j = await res.json();
  binId = j.metadata.id;
  localStorage.setItem(BIN_ID_KEY, binId);
  DB = { users: {}, chats: {} };
  dbSetStatus("ok", "Connected");
}

async function dbSave() {
  if (!binId) return;
  dbSetStatus("syncing", "Saving…");
  try {
    const res = await fetch(`${JB_BASE}/${binId}`, {
      method: "PUT",
      headers: JB_HDR,
      body: JSON.stringify(DB)
    });
    if (!res.ok) throw new Error(`Save failed: ${res.status}`);
    dbSetStatus("ok", "Saved ✓");
  } catch (e) {
    dbSetStatus("err", "Save failed");
    console.error("dbSave:", e);
  }
}

// Debounce saves — max 1 write per 2s
let saveTimer = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(dbSave, 2000);
}

function dbSetStatus(state, text) {
  const el = document.getElementById("dbStatus");
  if (!el) return;
  el.className = "db-status " + state;
  const t = document.getElementById("dbStatusText");
  if (t) t.textContent = text;
}

// ─── Simple hash for user IDs (not cryptographic) ────────────────────────────
function h(str) {
  let v = 5381;
  for (let i = 0; i < str.length; i++) v = ((v << 5) + v) ^ str.charCodeAt(i);
  return (v >>> 0).toString(36);
}
const uid   = email => h(email.toLowerCase().trim());
const pwHash= (pw, id) => h(pw + id + "anitechai");

// ─── Session ─────────────────────────────────────────────────────────────────
const getSession  = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; } };
const saveSession = u  => localStorage.setItem(SESSION_KEY, JSON.stringify(u));
const clearSess   = () => localStorage.removeItem(SESSION_KEY);

// ─── Trial ────────────────────────────────────────────────────────────────────
function daysLeft(ts) {
  return Math.max(0, TRIAL_DAYS - Math.floor((Date.now() - new Date(ts).getTime()) / 86400000));
}
function renderTrial(ts) {
  const d = daysLeft(ts), pct = (d / TRIAL_DAYS) * 100;
  const banner = document.getElementById("trialBanner");
  const dEl    = document.getElementById("trialDays");
  const fill   = document.getElementById("trialBarFill");
  const plan   = document.getElementById("userPlan");
  if (!banner) return;
  if (dEl)  dEl.textContent    = d;
  if (fill) fill.style.width   = pct + "%";
  banner.classList.remove("warning","expired");
  if (d === 0)     { banner.classList.add("expired"); if (plan) plan.textContent = "Trial expired"; }
  else if (d <= 7) { banner.classList.add("warning"); if (plan) plan.textContent = `Trial — ${d}d left`; }
  else             { if (plan) plan.textContent = `Free Trial — ${d}d left`; }
}

// ─── Auth UI ──────────────────────────────────────────────────────────────────
function switchTab(tab) {
  ["Login","Signup"].forEach(t => {
    const k = t.toLowerCase();
    document.getElementById("tab"+t).classList.toggle("active", k === tab);
    document.getElementById("form"+t).classList.toggle("hidden", k !== tab);
  });
  hideErr("liErr"); hideErr("suErr");
}
function togglePw(id, btn) {
  const inp = document.getElementById(id);
  const show = inp.type === "password";
  inp.type = show ? "text" : "password";
  btn.querySelector(".eye-show").classList.toggle("hidden",  show);
  btn.querySelector(".eye-hide").classList.toggle("hidden", !show);
}
function showErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${esc(msg)}`;
  el.classList.remove("hidden");
}
function hideErr(id) { const el=document.getElementById(id); if(el){el.textContent="";el.classList.add("hidden");} }

function setBusy(btnId, yes, label) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = yes;
  if (yes) {
    btn.innerHTML = `<div class="spinner sm" style="border-top-color:#000"></div><span>Please wait…</span>`;
  } else {
    btn.innerHTML = `<span>${label}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────
async function handleLogin() {
  const email = (document.getElementById("liEmail").value || "").trim().toLowerCase();
  const pass  = document.getElementById("liPass").value || "";
  hideErr("liErr");
  if (!email || !pass) { showErr("liErr","Fill in all fields."); return; }
  setBusy("loginBtn", true);
  try {
    await dbInit();
    const id = uid(email);
    const u  = DB.users[id];
    if (!u || u.pw !== pwHash(pass, id)) {
      showErr("liErr", "Incorrect email or password.");
      return;
    }
    const user = { uid: id, name: u.name, email, trialStart: u.trialStart };
    saveSession(user);
    boot(user);
  } catch (e) {
    console.error("Login error:", e);
    showErr("liErr", `Error: ${e.message}`);
  } finally {
    setBusy("loginBtn", false, "Sign In");
  }
}

// ─── Signup ───────────────────────────────────────────────────────────────────
async function handleSignup() {
  const name  = (document.getElementById("suName").value || "").trim();
  const email = (document.getElementById("suEmail").value || "").trim().toLowerCase();
  const pass  = document.getElementById("suPass").value || "";
  hideErr("suErr");
  if (!name || !email || !pass) { showErr("suErr","Fill in all fields."); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showErr("suErr","Enter a valid email."); return; }
  if (pass.length < 6) { showErr("suErr","Password must be at least 6 characters."); return; }
  setBusy("signupBtn", true);
  try {
    await dbInit();
    const id = uid(email);
    if (DB.users[id]) { showErr("suErr","An account with this email already exists."); return; }
    const trialStart = new Date().toISOString();
    DB.users[id] = { name, email, pw: pwHash(pass, id), trialStart };
    DB.chats[id] = {};
    await dbSave();
    const user = { uid: id, name, email, trialStart };
    saveSession(user);
    boot(user);
  } catch (e) {
    console.error("Signup error:", e);
    showErr("suErr", `Error: ${e.message}`);
  } finally {
    setBusy("signupBtn", false, "Create Account");
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────
function logout() {
  clearSess(); curUser = null; activeId = null;
  document.getElementById("app").classList.add("hidden");
  document.getElementById("authOverlay").classList.remove("hidden");
  document.getElementById("liEmail").value = "";
  document.getElementById("liPass").value  = "";
  switchTab("login");
}

// ─── Boot App ─────────────────────────────────────────────────────────────────
function boot(user) {
  curUser = user;
  document.getElementById("authOverlay").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");

  // Set user info
  document.getElementById("userNm").textContent = user.name;
  const av = document.getElementById("userAv");
  av.textContent = user.name.charAt(0).toUpperCase();

  // Trial
  if (user.trialStart) renderTrial(user.trialStart);

  // Load chats for this user
  const userChats = DB.chats[user.uid] || {};
  // chats is a local reference to DB.chats[uid]
  renderChatList();
  const ids = Object.keys(userChats);
  if (ids.length) loadChat(ids[ids.length - 1]); else showWelcome();

  if (!eventsOn) setupEvents();
  RL._ui("ready");
}

// ─── Chats (stored in DB.chats[uid]) ─────────────────────────────────────────
function myChats() {
  if (!DB.chats[curUser.uid]) DB.chats[curUser.uid] = {};
  return DB.chats[curUser.uid];
}

function newChat() {
  const id = "c" + Date.now();
  myChats()[id] = { title: "New Chat", history: [] };
  scheduleSave(); renderChatList(); loadChat(id);
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("inputTa").focus();
}

function loadChat(id) {
  activeId = id;
  document.getElementById("messages").innerHTML = "";
  const c = myChats()[id]; if (!c) return;
  document.getElementById("chatTitle").textContent = c.title;
  if (!c.history.length) { showWelcome(); }
  else {
    document.getElementById("welcome").style.display = "none";
    c.history.forEach(m => m.role === "user" ? renderUser(m.parts[0].text) : renderAI(m.parts[0].text));
    scrollDown();
  }
  document.querySelectorAll(".chat-item").forEach(el => el.classList.toggle("active", el.dataset.id === id));
}

function delChat(id, e) {
  e.stopPropagation();
  delete myChats()[id]; scheduleSave(); renderChatList();
  const ids = Object.keys(myChats());
  if (activeId === id) {
    if (ids.length) loadChat(ids[ids.length - 1]);
    else { activeId = null; showWelcome(); document.getElementById("chatTitle").textContent = "New Chat"; }
  }
}

function renderChatList() {
  const el = document.getElementById("chatList");
  el.innerHTML = "";
  const ids = Object.keys(myChats()).reverse();
  if (!ids.length) {
    el.innerHTML = `<p style="color:var(--tx3);font-size:.75rem;padding:10px 12px;text-align:center">No chats yet</p>`;
    return;
  }
  ids.forEach(id => {
    const c = myChats()[id];
    const div = document.createElement("div");
    div.className = "chat-item" + (id === activeId ? " active" : "");
    div.dataset.id = id;
    div.innerHTML = `
      <span class="chat-item-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
      <span class="chat-item-lbl">${esc(c.title)}</span>
      <button class="chat-item-del" title="Delete">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>
      </button>`;
    div.addEventListener("click", () => { loadChat(id); document.getElementById("sidebar").classList.remove("open"); });
    div.querySelector(".chat-item-del").addEventListener("click", e => delChat(id, e));
    el.appendChild(div);
  });
}

function setTitle(id, text) {
  myChats()[id].title = text.slice(0, 46) + (text.length > 46 ? "…" : "");
  document.getElementById("chatTitle").textContent = myChats()[id].title;
  scheduleSave(); renderChatList();
}

// ─── UI ───────────────────────────────────────────────────────────────────────
function showWelcome() {
  document.getElementById("welcome").style.display = "flex";
  document.getElementById("messages").innerHTML = "";
}
const scrollDown = () => { const a=document.getElementById("chatArea"); setTimeout(()=>a.scrollTop=a.scrollHeight,60); };

const AI_SVG = `<svg viewBox="0 0 44 54" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="avG" x1="22" y1="3" x2="36" y2="40" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#00FFD1"/><stop offset="100%" stop-color="#0044AA" stop-opacity=".3"/></linearGradient></defs><path d="M22 3 L31 20 Q38 25 33 34 Q28 41 22 39 Q16 37 18 27 L22 3Z" fill="url(#avG)" stroke="#00FFD1" stroke-width=".9"/><line x1="22" y1="3" x2="22" y2="51" stroke="#00FFD1" stroke-width="2.8" stroke-linecap="round"/><circle cx="22" cy="3" r="2.5" fill="#00FFD1"/></svg>`;
const USER_SVG= `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;

function renderUser(text) {
  document.getElementById("welcome").style.display = "none";
  const el = document.createElement("div");
  el.className = "msg user-msg";
  el.innerHTML = `
    <div class="msg-body" style="order:1">
      <div class="msg-from user">You</div>
      <div class="bubble">${esc(text).replace(/\n/g,"<br>")}</div>
    </div>
    <div class="av user" style="order:2">${USER_SVG}</div>`;
  document.getElementById("messages").appendChild(el); scrollDown();
}

function renderAI(content) {
  document.getElementById("welcome").style.display = "none";
  const el = document.createElement("div");
  el.className = "msg";
  el.innerHTML = `
    <div class="av ai">${AI_SVG}</div>
    <div class="msg-body">
      <div class="msg-from ai">Ani-Tech AI</div>
      <div class="bubble">${md(content)}</div>
    </div>`;
  document.getElementById("messages").appendChild(el);
  attachCopy(el); scrollDown();
}

function renderThinking() {
  document.getElementById("welcome").style.display = "none";
  const el = document.createElement("div");
  el.className = "msg"; el.id = "thinking";
  el.innerHTML = `
    <div class="av ai">${AI_SVG}</div>
    <div class="msg-body">
      <div class="msg-from ai">Ani-Tech AI</div>
      <div class="bubble"><div class="thinking"><span></span><span></span><span></span></div></div>
    </div>`;
  document.getElementById("messages").appendChild(el); scrollDown(); return el;
}

function toast(msg, type="err") {
  let t = document.querySelector(".toast");
  if (!t) { t=document.createElement("div"); t.className="toast"; document.body.appendChild(t); }
  t.className=`toast ${type}`;
  t.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${esc(msg)}`;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"),4500);
}

// ─── Markdown ─────────────────────────────────────────────────────────────────
function md(text) {
  if (!text) return "";
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g,(_,lang,code)=>{
    const l=esc(lang||""),c=esc(code.trim()),enc=encodeURIComponent(code.trim());
    return `<div class="code-wrap"><pre><code class="lang-${l}">${c}</code></pre><button class="copy-btn" data-code="${enc}">Copy</button></div>`;
  });
  text = text.replace(/`([^`\n]+)`/g,"<code>$1</code>");
  text = text.replace(/^### (.+)$/gm,"<h3>$1</h3>").replace(/^## (.+)$/gm,"<h2>$1</h2>").replace(/^# (.+)$/gm,"<h1>$1</h1>");
  text = text.replace(/\*\*\*(.+?)\*\*\*/g,"<strong><em>$1</em></strong>").replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\*(.+?)\*/g,"<em>$1</em>");
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
  text = text.replace(/^---$/gm,'<hr style="border:none;border-top:1px solid var(--bd);margin:10px 0">');
  text = text.replace(/^([ \t]*[-*+] .+\n?)+/gm,m=>`<ul>${m.trim().split("\n").map(l=>`<li>${l.replace(/^[ \t]*[-*+] /,"")}</li>`).join("")}</ul>`);
  text = text.replace(/^([ \t]*\d+\. .+\n?)+/gm,m=>`<ol>${m.trim().split("\n").map(l=>`<li>${l.replace(/^[ \t]*\d+\. /,"")}</li>`).join("")}</ol>`);
  text = text.replace(/\n{2,}/g,"</p><p>").replace(/\n/g,"<br>");
  text = "<p>" + text + "</p>";
  text = text.replace(/<p>(<(?:h[123]|ul|ol|pre|hr|div))/g,"$1").replace(/(<\/(?:h[123]|ul|ol|pre|div)>)<\/p>/g,"$1");
  return text;
}
function attachCopy(c) {
  c.querySelectorAll(".copy-btn").forEach(b=>{
    b.addEventListener("click",()=>navigator.clipboard.writeText(decodeURIComponent(b.dataset.code)).then(()=>{b.textContent="Copied!";setTimeout(()=>b.textContent="Copy",1800);}));
  });
}
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

// ─── Send Message ─────────────────────────────────────────────────────────────
async function send() {
  if (busy) return;
  const ta   = document.getElementById("inputTa");
  const text = ta.value.trim();
  if (!text) return;

  // Trial check
  if (curUser?.trialStart && daysLeft(curUser.trialStart) === 0) {
    toast("Your 30-day free trial has expired. Contact ANICADE Tech to renew.", "warn"); return;
  }

  if (!activeId) { newChat(); }

  const isFirst = !myChats()[activeId].history.length;
  if (isFirst) setTitle(activeId, text);

  myChats()[activeId].history.push({ role: "user", parts: [{ text }] });
  renderUser(text);
  ta.value = ""; ta.style.height = "auto";

  busy = true;
  document.getElementById("sendBtn").disabled = true;
  const thinkEl = renderThinking();

  try {
    const reply = await RL.enqueue(() => callGemini([...myChats()[activeId].history]));
    thinkEl.remove();
    myChats()[activeId].history.push({ role: "model", parts: [{ text: reply }] });
    renderAI(reply);
    scheduleSave();
  } catch (e) {
    thinkEl.remove();
    const errMsg = "Error: " + e.message;
    myChats()[activeId].history.push({ role: "model", parts: [{ text: errMsg }] });
    renderAI(errMsg);
    toast(e.message); console.error(e);
  } finally {
    busy = false;
    document.getElementById("sendBtn").disabled = false;
    document.getElementById("inputTa").focus();
  }
}

// ─── Gemini Call ──────────────────────────────────────────────────────────────
async function callGemini(history) {
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM }] },
      contents: history,
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096, topP: 0.95 },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
      ]
    })
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    if (res.status === 429) throw new Error("Gemini rate limited — queued, will retry shortly.");
    if (res.status === 403) throw new Error("Invalid Gemini API key.");
    throw new Error(e?.error?.message || `Gemini error ${res.status}`);
  }
  const data = await res.json();
  const cand = data?.candidates?.[0];
  if (!cand) throw new Error("Empty Gemini response.");
  if (cand.finishReason === "SAFETY") return "Can't answer that due to safety guidelines. Try rephrasing!";
  return (cand?.content?.parts || []).map(p => p.text || "").join("") || "No response received.";
}

// ─── Events ───────────────────────────────────────────────────────────────────
function setupEvents() {
  eventsOn = true;
  document.getElementById("newChatBtn").addEventListener("click", newChat);
  document.getElementById("sendBtn").addEventListener("click", send);
  const sb = document.getElementById("sidebar"), mb = document.getElementById("menuBtn");
  mb.addEventListener("click", () => sb.classList.toggle("open"));
  document.addEventListener("click", e => { if (!sb.contains(e.target) && !mb.contains(e.target)) sb.classList.remove("open"); });
  const ta = document.getElementById("inputTa");
  ta.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
  ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 140) + "px"; });
  document.querySelectorAll(".sug").forEach(b => b.addEventListener("click", () => { ta.value = b.dataset.q; send(); }));
}

// ─── Startup ──────────────────────────────────────────────────────────────────
(async function startup() {
  const loading  = document.getElementById("authLoading");
  const authTabs = document.getElementById("authTabs");
  const formLogin= document.getElementById("formLogin");

  // Show loading spinner while DB connects
  loading.classList.remove("hidden");
  authTabs.classList.add("hidden");
  formLogin.classList.add("hidden");

  try {
    await dbInit();
  } catch (e) {
    console.error("DB init failed:", e);
    // Still show the UI — errors will surface per-action
  }

  loading.classList.add("hidden");
  authTabs.classList.remove("hidden");
  formLogin.classList.remove("hidden");

  // Auto-login from saved session
  const s = getSession();
  if (s?.uid && DB.users[s.uid]) {
    boot({ uid: s.uid, name: DB.users[s.uid].name, email: DB.users[s.uid].email, trialStart: DB.users[s.uid].trialStart });
    return;
  }

  document.getElementById("authOverlay").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
})();
