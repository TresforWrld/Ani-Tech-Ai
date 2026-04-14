/**
 * ANI-TECH AI v2.2 — by ANICADE Tech
 * ─────────────────────────────────────────
 * AI:  Groq API — Llama 3.3 70B (free, fast, no credit card)
 *      Get a free key at: console.groq.com
 * DB:  JSONBin.io — single bin for all data
 * ─────────────────────────────────────────
 */

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Get your FREE Groq key at https://console.groq.com (no credit card needed)
const GROQ_KEY   = "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";
const GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile"; // 30 RPM, 1000 RPD free

// JSONBin.io — one bin stores everything: { users: {}, chats: {} }
const JB_MASTER  = "$2a$10$VJXQzwtVgNhMTIJiiQvpy.hG7XaRD0.H42NyZhKzeLRungeekMmpO";
const JB_BASE    = "https://api.jsonbin.io/v3/b";
const BIN_ID_KEY = "69b14c5bc3097a1dd5173665";
const SESSION_KEY= "anitechai_session_v2";

const TRIAL_DAYS = 30;

// ─── System Prompt ────────────────────────────────────────────────────────────
const SYSTEM = `You are Ani-Tech AI, a sharp and precise coding assistant built by ANICADE Tech (Animated Arcade Technology) in 2026.

Your speciality is coding, software development, and technology. Give direct, real-world answers.

Rules:
- Lead with the answer — no preamble or filler
- All code goes in triple-backtick fenced blocks with the language tag
- Code must be complete, working, and production-quality
- Use proper Markdown: headers, bullets, bold for key terms
- Be concise but thorough — always cover important edge cases
- For non-coding questions, still answer fully and accurately

When answering coding questions:
1. Provide the full working code first
2. Brief explanation of key choices
3. Note any gotchas, best practices, or alternatives`;

// ─── State ───────────────────────────────────────────────────────────────────
let DB       = { users: {}, chats: {} };
let binId    = null;
let curUser  = null;
let activeId = null;
let busy     = false;
let eventsOn = false;

// ─── JSONBin DB ───────────────────────────────────────────────────────────────
const JB_HDR = { "Content-Type": "application/json", "X-Master-Key": JB_MASTER };

async function dbInit() {
  binId = localStorage.getItem(BIN_ID_KEY);
  if (binId) {
    dbSetStatus("syncing", "Loading…");
    const res = await fetch(`${JB_BASE}/${binId}/latest`, { headers: JB_HDR });
    if (res.ok) {
      const j = await res.json();
      DB = j.record || { users: {}, chats: {} };
      dbSetStatus("ok", "Connected");
      return;
    }
    // Stale bin ID — recreate
    binId = null;
    localStorage.removeItem(BIN_ID_KEY);
  }
  // First run — create the bin
  dbSetStatus("syncing", "Setting up database…");
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function h(str) {
  let v = 5381;
  for (let i = 0; i < str.length; i++) v = ((v << 5) + v) ^ str.charCodeAt(i);
  return (v >>> 0).toString(36);
}
const uid    = email => h(email.toLowerCase().trim());
const pwHash = (pw, id) => h(pw + id + "anitechai2026");

const getSession  = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; } };
const saveSession = u  => localStorage.setItem(SESSION_KEY, JSON.stringify(u));
const clearSess   = () => localStorage.removeItem(SESSION_KEY);

// ─── Trial ────────────────────────────────────────────────────────────────────
function daysLeft(ts) {
  return Math.max(0, TRIAL_DAYS - Math.floor((Date.now() - new Date(ts).getTime()) / 86400000));
}

function renderTrial(ts) {
  const d    = daysLeft(ts);
  const pct  = (d / TRIAL_DAYS) * 100;
  const banner = document.getElementById("trialBanner");
  const dEl    = document.getElementById("trialDays");
  const fill   = document.getElementById("trialBarFill");
  const plan   = document.getElementById("userPlan");
  if (!banner) return;
  if (dEl)  dEl.textContent  = d;
  if (fill) fill.style.width = pct + "%";
  banner.classList.remove("warning", "expired");
  if (d === 0)     { banner.classList.add("expired");  if (plan) plan.textContent = "Trial expired"; }
  else if (d <= 7) { banner.classList.add("warning");  if (plan) plan.textContent = `Trial — ${d}d left`; }
  else             {                                    if (plan) plan.textContent = `Free Trial — ${d}d left`; }
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

function hideErr(id) {
  const el = document.getElementById(id);
  if (el) { el.textContent = ""; el.classList.add("hidden"); }
}

function setBusy(btnId, yes, label) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = yes;
  btn.innerHTML = yes
    ? `<div class="spinner sm" style="border-top-color:#000"></div><span>Please wait…</span>`
    : `<span>${label}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
}

// ─── Login ────────────────────────────────────────────────────────────────────
async function handleLogin() {
  const email = (document.getElementById("liEmail").value || "").trim().toLowerCase();
  const pass  = document.getElementById("liPass").value || "";
  hideErr("liErr");
  if (!email || !pass) { showErr("liErr", "Fill in all fields."); return; }
  setBusy("loginBtn", true);
  try {
    await dbInit();
    const id = uid(email);
    const u  = DB.users[id];
    if (!u || u.pw !== pwHash(pass, id)) {
      showErr("liErr", "Incorrect email or password."); return;
    }
    const user = { uid: id, name: u.name, email, trialStart: u.trialStart };
    saveSession(user);
    boot(user);
  } catch (e) {
    console.error("Login:", e);
    showErr("liErr", e.message || "Connection error — try again.");
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
  if (!name || !email || !pass) { showErr("suErr", "Fill in all fields."); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showErr("suErr", "Enter a valid email."); return; }
  if (pass.length < 6) { showErr("suErr", "Password must be at least 6 characters."); return; }
  setBusy("signupBtn", true);
  try {
    await dbInit();
    const id = uid(email);
    if (DB.users[id]) { showErr("suErr", "An account with this email already exists."); return; }
    DB.users[id] = { name, email, pw: pwHash(pass, id), trialStart: new Date().toISOString() };
    DB.chats[id] = {};
    await dbSave();
    const user = { uid: id, name, email, trialStart: DB.users[id].trialStart };
    saveSession(user);
    boot(user);
  } catch (e) {
    console.error("Signup:", e);
    showErr("suErr", e.message || "Signup failed — try again.");
  } finally {
    setBusy("signupBtn", false, "Create Account");
  }
}

function logout() {
  clearSess(); curUser = null; activeId = null;
  document.getElementById("app").classList.add("hidden");
  document.getElementById("authOverlay").classList.remove("hidden");
  document.getElementById("liEmail").value = "";
  document.getElementById("liPass").value  = "";
  switchTab("login");
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
function boot(user) {
  curUser = user;
  document.getElementById("authOverlay").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("userNm").textContent = user.name;
  const av = document.getElementById("userAv");
  av.textContent = user.name.charAt(0).toUpperCase();
  if (user.trialStart) renderTrial(user.trialStart);
  renderChatList();
  const ids = Object.keys(myChats());
  if (ids.length) loadChat(ids[ids.length - 1]); else showWelcome();
  if (!eventsOn) setupEvents();
}

// ─── Chats ────────────────────────────────────────────────────────────────────
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
  if (!c.history.length) { showWelcome(); return; }
  document.getElementById("welcome").style.display = "none";
  c.history.forEach(m => m.role === "user" ? renderUser(m.text) : renderAI(m.text));
  scrollDown();
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
const scrollDown = () => { const a = document.getElementById("chatArea"); setTimeout(() => a.scrollTop = a.scrollHeight, 60); };
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

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
  setTimeout(() => t.classList.remove("show"), 4500);
}

// ─── Markdown ─────────────────────────────────────────────────────────────────
function md(text) {
  if (!text) return "";
  // Fenced code blocks
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const l = esc(lang || ""), c = esc(code.trim()), enc = encodeURIComponent(code.trim());
    return `<div class="code-wrap"><pre><code class="lang-${l}">${c}</code></pre><button class="copy-btn" data-code="${enc}">Copy</button></div>`;
  });
  text = text.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  text = text.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  text = text.replace(/^## (.+)$/gm,  "<h2>$1</h2>");
  text = text.replace(/^# (.+)$/gm,   "<h1>$1</h1>");
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  text = text.replace(/\*\*(.+?)\*\*/g,     "<strong>$1</strong>");
  text = text.replace(/\*(.+?)\*/g,          "<em>$1</em>");
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  text = text.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--bd);margin:10px 0">');
  text = text.replace(/^([ \t]*[-*+] .+\n?)+/gm, m =>
    `<ul>${m.trim().split("\n").map(l => `<li>${l.replace(/^[ \t]*[-*+] /, "")}</li>`).join("")}</ul>`);
  text = text.replace(/^([ \t]*\d+\. .+\n?)+/gm, m =>
    `<ol>${m.trim().split("\n").map(l => `<li>${l.replace(/^[ \t]*\d+\. /, "")}</li>`).join("")}</ol>`);
  text = text.replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");
  text = "<p>" + text + "</p>";
  text = text.replace(/<p>(<(?:h[123]|ul|ol|pre|hr|div))/g, "$1");
  text = text.replace(/(<\/(?:h[123]|ul|ol|pre|div)>)<\/p>/g, "$1");
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

// ─── Send ─────────────────────────────────────────────────────────────────────
async function send() {
  if (busy) return;
  const ta   = document.getElementById("inputTa");
  const text = ta.value.trim();
  if (!text) return;

  // Trial check
  if (curUser?.trialStart && daysLeft(curUser.trialStart) === 0) {
    toast("Your 30-day free trial has expired. Contact ANICADE Tech to renew.", "warn");
    return;
  }

  // Create a new chat automatically if none active
  if (!activeId || !myChats()[activeId]) {
    const id = "c" + Date.now();
    myChats()[id] = { title: "New Chat", history: [] };
    activeId = id;
    renderChatList();
  }

  const isFirst = !myChats()[activeId].history.length;
  if (isFirst) setTitle(activeId, text);

  // Store as simple {role, text} — no Gemini-style parts nesting
  myChats()[activeId].history.push({ role: "user", text });
  renderUser(text);
  ta.value = ""; ta.style.height = "auto";

  busy = true;
  document.getElementById("sendBtn").disabled = true;
  const thinkEl = renderThinking();

  try {
    const reply = await callGroq(myChats()[activeId].history);
    thinkEl.remove();
    myChats()[activeId].history.push({ role: "assistant", text: reply });
    renderAI(reply);
    scheduleSave();
  } catch (e) {
    thinkEl.remove();
    const errMsg = "Error: " + e.message;
    myChats()[activeId].history.push({ role: "assistant", text: errMsg });
    renderAI(errMsg);
    toast(e.message);
    console.error("send:", e);
  } finally {
    busy = false;
    document.getElementById("sendBtn").disabled = false;
    document.getElementById("inputTa").focus();
  }
}

// ─── Groq API ─────────────────────────────────────────────────────────────────
async function callGroq(history) {
  if (!GROQ_KEY || GROQ_KEY === "YOUR_GROQ_KEY_HERE") {
    throw new Error("No Groq API key set. Get a free one at console.groq.com and paste it in app.js line 13.");
  }

  // Convert our flat history to OpenAI-style messages
  const messages = [
    { role: "system", content: SYSTEM },
    ...history.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text }))
  ];

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_KEY}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 4096,
      top_p: 0.95
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || "";
    if (res.status === 401) throw new Error("Invalid Groq API key. Get a free one at console.groq.com");
    if (res.status === 429) throw new Error("Rate limit reached. Wait a moment, then try again. (Groq free: 30 req/min)");
    if (res.status === 503) throw new Error("Groq is temporarily unavailable. Try again in a moment.");
    throw new Error(msg || `Groq error ${res.status}`);
  }

  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error("Empty response from Groq.");
  return reply;
}

// ─── Events ───────────────────────────────────────────────────────────────────
function setupEvents() {
  eventsOn = true;
  document.getElementById("newChatBtn").addEventListener("click", newChat);
  document.getElementById("sendBtn").addEventListener("click", send);

  const sb = document.getElementById("sidebar");
  const mb = document.getElementById("menuBtn");
  mb.addEventListener("click", () => sb.classList.toggle("open"));
  document.addEventListener("click", e => {
    if (!sb.contains(e.target) && !mb.contains(e.target)) sb.classList.remove("open");
  });

  const ta = document.getElementById("inputTa");
  ta.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  ta.addEventListener("input", () => {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
  });

  document.querySelectorAll(".sug").forEach(b => {
    b.addEventListener("click", () => { ta.value = b.dataset.q; send(); });
  });
}

// ─── Startup ──────────────────────────────────────────────────────────────────
(async function startup() {
  const loading   = document.getElementById("authLoading");
  const authTabs  = document.getElementById("authTabs");
  const formLogin = document.getElementById("formLogin");

  loading.classList.remove("hidden");
  authTabs.classList.add("hidden");
  formLogin.classList.add("hidden");

  try {
    await dbInit();
  } catch (e) {
    console.error("DB init:", e);
    dbSetStatus("err", "DB offline");
    // Still show auth — errors surface per-action with real messages
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
