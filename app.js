/**
 * ANI-TECH AI v2.0 — by ANICADE Tech
 * ─────────────────────────────────────────────
 * APIs used:
 *   • Google Gemini 2.0 Flash (free AI)
 *   • JSONBin.io (cloud database for users + chats)
 * ─────────────────────────────────────────────
 */

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const GEMINI_KEY   = "AIzaSyA64p41nz-OhlfWw_WHixKGGu77Y8mFncc";
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;

// JSONBin.io — cloud database
// ⚠️ Regenerate these keys at jsonbin.io after setup (they were shared in chat)
const JB_MASTER = "$2a$10$t1pvIZA0plsMluFZ9oGuHeEXnbeyv10dGX5p15Q0xdfXGg2fsW0.2";
const JB_ACCESS = "$2a$10$VJXQzwtVgNhMTIJiiQvpy.hG7XaRD0.H42NyZhKzeLRungeekMmpO";
const JB_BASE   = "https://api.jsonbin.io/v3";

// Bin IDs — created on first run and cached in localStorage
const BIN_ID_KEY  = "anitechai_bin_id";   // stores the users bin ID
const SESSION_KEY = "anitechai_session";

// Trial
const TRIAL_DAYS = 30;

// ─── Gemini Rate Limiter ──────────────────────────────────────────────────────
// Gemini 2.0 Flash free tier: 15 RPM → 1 request per 4 seconds minimum
const RL = {
  queue: [],
  lastCall: 0,
  MIN_GAP: 4200, // ms between calls (stays under 15 RPM)
  timer: null,
  cooling: false,

  enqueue(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this._tick();
    });
  },

  _tick() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.queue.length) { this._setReady(); return; }
      const now = Date.now();
      const wait = Math.max(0, this.MIN_GAP - (now - this.lastCall));
      if (wait > 0) {
        this._setCooling(Math.ceil(wait / 1000));
        this.timer = setTimeout(() => { this.timer = null; this._tick(); }, wait);
        return;
      }
      const { fn, resolve, reject } = this.queue.shift();
      this.lastCall = Date.now();
      this._setReady();
      fn().then(resolve).catch(reject);
      if (this.queue.length) this._tick();
    }, 0);
  },

  _setCooling(secs) {
    this.cooling = true;
    const badge = document.getElementById("rateBadge");
    const txt   = document.getElementById("rateCountdown");
    if (!badge || !txt) return;
    badge.classList.remove("ready"); badge.classList.add("cooling");
    txt.textContent = `${secs}s`;
    if (this._cdTimer) clearInterval(this._cdTimer);
    let s = secs;
    this._cdTimer = setInterval(() => {
      s--;
      if (s <= 0) { clearInterval(this._cdTimer); this._setReady(); }
      else if (txt) txt.textContent = `${s}s`;
    }, 1000);
  },

  _setReady() {
    this.cooling = false;
    if (this._cdTimer) { clearInterval(this._cdTimer); this._cdTimer = null; }
    const badge = document.getElementById("rateBadge");
    const txt   = document.getElementById("rateCountdown");
    if (!badge || !txt) return;
    badge.classList.remove("cooling"); badge.classList.add("ready");
    txt.textContent = "Ready";
  }
};

// ─── System Prompt ────────────────────────────────────────────────────────────
const SYSTEM = `You are Ani-Tech AI, a sharp, precise coding assistant built by ANICADE Tech (Animated Arcade Technology).

Speciality: coding, software development, tech. Give direct, real-world answers.

Rules:
- Lead with the answer — no preamble
- Use proper Markdown: headers, bullets, bold for key terms
- All code in triple-backtick blocks with language specified
- Code must be complete, working, production-quality
- Be concise but thorough — cover edge cases
- For non-coding questions, still answer fully

Coding answers:
1. Complete working code first
2. Brief explanation of key choices
3. Gotchas, best practices, or alternatives`;

// ─── State ───────────────────────────────────────────────────────────────────
let currentUser = null;   // { uid, name, email, trialStart, binId }
let chats       = {};     // { chatId: { title, history: [{role,parts}] } }
let activeId    = null;
let busy        = false;
let eventsOn    = false;
let usersBinId  = null;   // JSONBin bin ID for the users collection

// ─── DB: JSONBin Helpers ──────────────────────────────────────────────────────
const JB_HEADERS = {
  "Content-Type": "application/json",
  "X-Master-Key": JB_MASTER,
  "X-Access-Key": JB_ACCESS
};

async function dbCreate(data, name = "Ani-Tech AI DB") {
  const res = await fetch(`${JB_BASE}/b`, {
    method: "POST",
    headers: { ...JB_HEADERS, "X-Bin-Name": name, "X-Bin-Private": "true" },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error("DB create failed: " + res.status);
  const j = await res.json();
  return j.metadata.id;
}

async function dbRead(binId) {
  const res = await fetch(`${JB_BASE}/b/${binId}/latest`, { headers: JB_HEADERS });
  if (!res.ok) throw new Error("DB read failed: " + res.status);
  const j = await res.json();
  return j.record;
}

async function dbWrite(binId, data) {
  const res = await fetch(`${JB_BASE}/b/${binId}`, {
    method: "PUT",
    headers: JB_HEADERS,
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error("DB write failed: " + res.status);
}

function setDbStatus(state, text) {
  const el = document.getElementById("dbStatus");
  if (!el) return;
  el.className = "db-status " + state;
  document.getElementById("dbStatusText").textContent = text;
}

// ─── Users DB ─────────────────────────────────────────────────────────────────
async function loadOrCreateUsersDb() {
  let binId = localStorage.getItem(BIN_ID_KEY);
  if (binId) { usersBinId = binId; return; }
  // First time — create the bin
  setDbStatus("syncing", "Setting up database…");
  binId = await dbCreate({ users: {} }, "AniTechAI-Users");
  localStorage.setItem(BIN_ID_KEY, binId);
  usersBinId = binId;
}

async function getUsers() {
  const data = await dbRead(usersBinId);
  return data.users || {};
}

async function saveUser(uid, userData) {
  setDbStatus("syncing", "Syncing…");
  try {
    const data = await dbRead(usersBinId);
    data.users = data.users || {};
    data.users[uid] = userData;
    await dbWrite(usersBinId, data);
    setDbStatus("ok", "Synced");
  } catch (e) {
    setDbStatus("err", "Sync error");
    throw e;
  }
}

// ─── Chats DB — each user gets their own bin ──────────────────────────────────
async function loadChatsFromDb() {
  if (!currentUser.chatsBinId) {
    // Create a chats bin for this user
    setDbStatus("syncing", "Creating chats bin…");
    const binId = await dbCreate({ chats: {} }, `AniTechAI-Chats-${currentUser.uid.slice(0,8)}`);
    currentUser.chatsBinId = binId;
    await saveUser(currentUser.uid, currentUser);
    chats = {};
    return;
  }
  try {
    setDbStatus("syncing", "Loading chats…");
    const data = await dbRead(currentUser.chatsBinId);
    chats = data.chats || {};
    setDbStatus("ok", "Synced");
  } catch {
    setDbStatus("err", "Load failed — using local");
    chats = {};
  }
}

async function saveChatsToDb() {
  if (!currentUser?.chatsBinId) return;
  setDbStatus("syncing", "Saving…");
  try {
    await dbWrite(currentUser.chatsBinId, { chats });
    setDbStatus("ok", "Saved");
  } catch {
    setDbStatus("err", "Save failed");
  }
}

// Debounced save — don't hammer the API on every keystroke
let saveTimer = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveChatsToDb, 1500);
}

// ─── Session ──────────────────────────────────────────────────────────────────
const getSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; } };
const saveSession = u => localStorage.setItem(SESSION_KEY, JSON.stringify(u));
const clearSess  = () => localStorage.removeItem(SESSION_KEY);

// ─── Trial ────────────────────────────────────────────────────────────────────
function trialDaysLeft(trialStart) {
  const ms = Date.now() - new Date(trialStart).getTime();
  const days = Math.max(0, TRIAL_DAYS - Math.floor(ms / 86400000));
  return days;
}

function renderTrial(trialStart) {
  const days = trialDaysLeft(trialStart);
  const pct  = (days / TRIAL_DAYS) * 100;
  const el   = document.getElementById("trialBanner");
  const dEl  = document.getElementById("trialDays");
  const fill = document.getElementById("trialBarFill");
  const plan = document.getElementById("userPlan");
  if (!el) return;
  dEl.textContent  = days;
  fill.style.width = pct + "%";
  el.classList.remove("warning", "expired");
  if (days === 0) {
    el.classList.add("expired");
    if (plan) plan.textContent = "Trial expired";
  } else if (days <= 7) {
    el.classList.add("warning");
    if (plan) plan.textContent = `Trial — ${days}d left`;
  } else {
    if (plan) plan.textContent = `Free Trial — ${days}d left`;
  }
}

// ─── Auth UI ──────────────────────────────────────────────────────────────────
function switchTab(tab) {
  ["Login","Signup"].forEach(t => {
    const key = t.toLowerCase();
    document.getElementById("tab"+t).classList.toggle("active", key === tab);
    document.getElementById("form"+t).classList.toggle("hidden", key !== tab);
  });
  ["liErr","suErr"].forEach(id => { const el=document.getElementById(id); if(el){el.textContent="";el.classList.add("hidden");} });
}

function togglePw(id, btn) {
  const inp = document.getElementById(id);
  inp.type = inp.type === "password" ? "text" : "password";
  btn.querySelector(".eye-show").classList.toggle("hidden", inp.type === "text");
  btn.querySelector(".eye-hide").classList.toggle("hidden", inp.type === "password");
}

function showErr(id, msg) {
  const el = document.getElementById(id);
  el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${esc(msg)}`;
  el.classList.remove("hidden");
}

function setBtnLoading(id, loading) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled = loading;
  if (loading) btn.innerHTML = `<div class="spinner sm" style="border-top-color:#000"></div><span>Please wait…</span>`;
}

async function handleLogin() {
  const email = (document.getElementById("liEmail").value || "").trim().toLowerCase();
  const pass  = document.getElementById("liPass").value || "";
  document.getElementById("liErr").classList.add("hidden");
  if (!email || !pass) { showErr("liErr","Please fill in all fields."); return; }
  setBtnLoading("loginBtn", true);
  try {
    await loadOrCreateUsersDb();
    const users = await getUsers();
    const uid = simpleHash(email);
    if (!users[uid] || users[uid].passHash !== simpleHash(pass + uid)) {
      showErr("liErr","Incorrect email or password.");
      return;
    }
    const u = { ...users[uid], uid };
    saveSession(u);
    await boot(u);
  } catch (e) {
    showErr("liErr", "Connection error — check your internet and try again.");
    console.error(e);
  } finally {
    const btn = document.getElementById("loginBtn");
    if (btn) { btn.disabled = false; btn.innerHTML = `<span>Sign In</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`; }
  }
}

async function handleSignup() {
  const name  = (document.getElementById("suName").value || "").trim();
  const email = (document.getElementById("suEmail").value || "").trim().toLowerCase();
  const pass  = document.getElementById("suPass").value || "";
  document.getElementById("suErr").classList.add("hidden");
  if (!name || !email || !pass) { showErr("suErr","Please fill in all fields."); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showErr("suErr","Enter a valid email address."); return; }
  if (pass.length < 6) { showErr("suErr","Password must be at least 6 characters."); return; }
  setBtnLoading("signupBtn", true);
  try {
    await loadOrCreateUsersDb();
    const users = await getUsers();
    const uid = simpleHash(email);
    if (users[uid]) { showErr("suErr","An account with this email already exists."); return; }
    const userData = { uid, name, email, passHash: simpleHash(pass + uid), trialStart: new Date().toISOString(), chatsBinId: null };
    await saveUser(uid, userData);
    saveSession(userData);
    await boot(userData);
  } catch (e) {
    showErr("suErr", "Signup failed — check your internet and try again.");
    console.error(e);
  } finally {
    const btn = document.getElementById("signupBtn");
    if (btn) { btn.disabled = false; btn.innerHTML = `<span>Create Account</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`; }
  }
}

function logout() {
  clearSess();
  currentUser = null; chats = {}; activeId = null;
  document.getElementById("app").classList.add("hidden");
  document.getElementById("authOverlay").classList.remove("hidden");
  document.getElementById("liEmail").value = "";
  document.getElementById("liPass").value  = "";
  switchTab("login");
}

// Simple deterministic hash (not cryptographic — just for user IDs)
function simpleHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(36);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function boot(u) {
  currentUser = u;
  document.getElementById("authOverlay").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");

  // Set user info in sidebar
  document.getElementById("userNm").textContent = u.name;
  const av = document.getElementById("userAv");
  av.textContent = u.name.charAt(0).toUpperCase();

  // Trial countdown
  if (u.trialStart) renderTrial(u.trialStart);

  // Load chats from DB
  setDbStatus("syncing", "Loading…");
  try {
    await loadOrCreateUsersDb();
    // Refresh user data in case chatsBinId was just set
    const users = await getUsers();
    if (users[u.uid]) { currentUser = { ...users[u.uid], uid: u.uid }; saveSession(currentUser); }
    await loadChatsFromDb();
  } catch (e) {
    setDbStatus("err", "DB offline");
    console.error("DB boot error:", e);
  }

  renderChatList();
  const ids = Object.keys(chats);
  if (ids.length) loadChat(ids[ids.length - 1]); else showWelcome();

  if (!eventsOn) setupEvents();
}

// ─── Chat Management ──────────────────────────────────────────────────────────
function newChat() {
  const id = "c" + Date.now();
  chats[id] = { title: "New Chat", history: [] };
  scheduleSave();
  renderChatList();
  loadChat(id);
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("inputTa").focus();
}

function loadChat(id) {
  activeId = id;
  document.getElementById("messages").innerHTML = "";
  const c = chats[id]; if (!c) return;
  document.getElementById("chatTitle").textContent = c.title;
  if (!c.history.length) { showWelcome(); }
  else {
    document.getElementById("welcome").style.display = "none";
    c.history.forEach(m => {
      if (m.role === "user") renderUser(m.parts[0].text);
      else renderAI(m.parts[0].text);
    });
    scrollDown();
  }
  document.querySelectorAll(".chat-item").forEach(el => el.classList.toggle("active", el.dataset.id === id));
}

function delChat(id, e) {
  e.stopPropagation();
  delete chats[id];
  scheduleSave();
  renderChatList();
  if (activeId === id) {
    const ids = Object.keys(chats);
    if (ids.length) loadChat(ids[ids.length - 1]);
    else { activeId = null; showWelcome(); document.getElementById("chatTitle").textContent = "New Chat"; }
  }
}

function renderChatList() {
  const el = document.getElementById("chatList");
  el.innerHTML = "";
  const ids = Object.keys(chats).reverse();
  if (!ids.length) {
    el.innerHTML = `<p style="color:var(--tx3);font-size:.75rem;padding:10px 12px;text-align:center">No chats yet</p>`;
    return;
  }
  ids.forEach(id => {
    const c = chats[id];
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
  chats[id].title = text.slice(0, 46) + (text.length > 46 ? "…" : "");
  document.getElementById("chatTitle").textContent = chats[id].title;
  scheduleSave();
  renderChatList();
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────
function showWelcome() {
  document.getElementById("welcome").style.display = "flex";
  document.getElementById("messages").innerHTML = "";
}
const scrollDown = () => { const a=document.getElementById("chatArea"); setTimeout(()=>a.scrollTop=a.scrollHeight,60); };

const AI_SVG = `<svg viewBox="0 0 44 54" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="avG" x1="22" y1="3" x2="36" y2="40" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#00FFD1"/><stop offset="100%" stop-color="#0044AA" stop-opacity=".3"/></linearGradient></defs><path d="M22 3 L31 20 Q38 25 33 34 Q28 41 22 39 Q16 37 18 27 L22 3Z" fill="url(#avG)" stroke="#00FFD1" stroke-width=".9"/><line x1="22" y1="3" x2="22" y2="51" stroke="#00FFD1" stroke-width="2.8" stroke-linecap="round"/><circle cx="22" cy="3" r="2.5" fill="#00FFD1"/></svg>`;
const USER_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;

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
  document.getElementById("messages").appendChild(el);
  scrollDown();
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
  document.getElementById("messages").appendChild(el);
  scrollDown(); return el;
}

function toast(msg, type = "err") {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.className = `toast ${type}`;
  t.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${esc(msg)}`;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 4000);
}

// ─── Markdown ─────────────────────────────────────────────────────────────────
function md(text) {
  if (!text) return "";
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const l = esc(lang||""); const c = esc(code.trim()); const enc = encodeURIComponent(code.trim());
    return `<div class="code-wrap"><pre><code class="lang-${l}">${c}</code></pre><button class="copy-btn" data-code="${enc}">Copy</button></div>`;
  });
  text = text.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  text = text.replace(/^### (.+)$/gm,"<h3>$1</h3>");
  text = text.replace(/^## (.+)$/gm,"<h2>$1</h2>");
  text = text.replace(/^# (.+)$/gm,"<h1>$1</h1>");
  text = text.replace(/\*\*\*(.+?)\*\*\*/g,"<strong><em>$1</em></strong>");
  text = text.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>");
  text = text.replace(/\*(.+?)\*/g,"<em>$1</em>");
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
  text = text.replace(/^---$/gm,'<hr style="border:none;border-top:1px solid var(--bd);margin:10px 0">');
  text = text.replace(/^([ \t]*[-*+] .+\n?)+/gm,m=>`<ul>${m.trim().split("\n").map(l=>`<li>${l.replace(/^[ \t]*[-*+] /,"")}</li>`).join("")}</ul>`);
  text = text.replace(/^([ \t]*\d+\. .+\n?)+/gm,m=>`<ol>${m.trim().split("\n").map(l=>`<li>${l.replace(/^[ \t]*\d+\. /,"")}</li>`).join("")}</ol>`);
  text = text.replace(/\n{2,}/g,"</p><p>").replace(/\n/g,"<br>");
  text = "<p>" + text + "</p>";
  text = text.replace(/<p>(<(?:h[123]|ul|ol|pre|hr|div))/g,"$1");
  text = text.replace(/(<\/(?:h[123]|ul|ol|pre|div)>)<\/p>/g,"$1");
  return text;
}

function attachCopy(container) {
  container.querySelectorAll(".copy-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(decodeURIComponent(btn.dataset.code)).then(() => {
        btn.textContent = "Copied!";
        setTimeout(() => btn.textContent = "Copy", 1800);
      });
    });
  });
}

const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

// ─── Send ─────────────────────────────────────────────────────────────────────
async function send() {
  if (busy) return;
  const ta   = document.getElementById("inputTa");
  const text = ta.value.trim();
  if (!text) return;

  // Trial check
  if (currentUser?.trialStart && trialDaysLeft(currentUser.trialStart) === 0) {
    toast("Your 30-day free trial has expired. Please contact ANICADE Tech to renew.", "warn");
    return;
  }

  if (!activeId) {
    const id = "c" + Date.now();
    chats[id] = { title: "New Chat", history: [] };
    activeId = id;
    renderChatList();
  }

  const isFirst = !chats[activeId].history.length;
  if (isFirst) setTitle(activeId, text);

  chats[activeId].history.push({ role: "user", parts: [{ text }] });
  renderUser(text);
  ta.value = ""; ta.style.height = "auto";

  busy = true;
  document.getElementById("sendBtn").disabled = true;
  const thinkEl = renderThinking();

  try {
    // Queue through rate limiter
    const reply = await RL.enqueue(() => callGemini(chats[activeId].history));
    thinkEl.remove();
    chats[activeId].history.push({ role: "model", parts: [{ text: reply }] });
    renderAI(reply);
    scheduleSave();
  } catch (e) {
    thinkEl.remove();
    const errMsg = "Sorry, I hit an error: " + e.message;
    chats[activeId].history.push({ role: "model", parts: [{ text: errMsg }] });
    renderAI(errMsg);
    scheduleSave();
    toast(e.message);
    console.error(e);
  } finally {
    busy = false;
    document.getElementById("sendBtn").disabled = false;
    document.getElementById("inputTa").focus();
  }
}

// ─── Gemini API ───────────────────────────────────────────────────────────────
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
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || "";
    if (res.status === 429) {
      // Back off and let the rate limiter handle retry signaling
      throw new Error("Rate limited by Gemini. The queue will retry automatically — please wait.");
    }
    if (res.status === 403) throw new Error("Invalid Gemini API key. Check app.js line 15.");
    throw new Error(msg || `Gemini error ${res.status}`);
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  if (!candidate) throw new Error("Empty response from Gemini.");
  if (candidate.finishReason === "SAFETY") return "I can't answer that due to safety guidelines. Try rephrasing!";
  return (candidate?.content?.parts || []).map(p => p.text || "").join("") || "No response received.";
}

// ─── Events ───────────────────────────────────────────────────────────────────
function setupEvents() {
  eventsOn = true;
  document.getElementById("newChatBtn").addEventListener("click", newChat);
  document.getElementById("sendBtn").addEventListener("click", send);

  const sb = document.getElementById("sidebar");
  const mb = document.getElementById("menuBtn");
  mb.addEventListener("click", () => sb.classList.toggle("open"));
  document.addEventListener("click", e => { if (!sb.contains(e.target) && !mb.contains(e.target)) sb.classList.remove("open"); });

  const ta = document.getElementById("inputTa");
  ta.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
  ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 140) + "px"; });

  document.querySelectorAll(".sug").forEach(b => {
    b.addEventListener("click", () => { document.getElementById("inputTa").value = b.dataset.q; send(); });
  });

  // Initialise rate badge
  RL._setReady();
}

// ─── Startup ──────────────────────────────────────────────────────────────────
(async function startup() {
  // Show auth loading while we check DB connectivity
  const authLoading = document.getElementById("authLoading");
  const authTabs    = document.getElementById("authTabs");
  const formLogin   = document.getElementById("formLogin");

  authLoading.classList.remove("hidden");
  authTabs.classList.add("hidden");
  formLogin.classList.add("hidden");

  try {
    await loadOrCreateUsersDb();
  } catch (e) {
    console.warn("DB init failed:", e);
    // Fall through — DB will retry on login/signup
  }

  authLoading.classList.add("hidden");
  authTabs.classList.remove("hidden");
  formLogin.classList.remove("hidden");

  // Check saved session
  const s = getSession();
  if (s?.uid) {
    try {
      await loadOrCreateUsersDb();
      const users = await getUsers();
      if (users[s.uid]) {
        await boot({ ...users[s.uid], uid: s.uid });
        return;
      }
    } catch {}
  }

  document.getElementById("authOverlay").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
})();
