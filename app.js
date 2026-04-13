/**
 * ANI-TECH AI — by ANICADE Tech
 * Uses Google Gemini API (FREE — no credit card needed)
 *
 * ─────────────────────────────────────────────────
 *  HOW TO GET YOUR FREE API KEY (5 minutes):
 *  1. Go to https://aistudio.google.com/apikey
 *  2. Sign in with any Google account
 *  3. Click "Create API Key"
 *  4. Copy the key and paste it below
 *  No credit card. No billing. Completely free.
 * ─────────────────────────────────────────────────
 */

const GEMINI_KEY   = "AIzaSyA64p41nz-OhlfWw_WHixKGGu77Y8mFncc"; // ← paste your free key here
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;

const SYSTEM_INSTRUCTION = `You are Ani-Tech AI, a sharp, precise, and highly capable coding assistant built by ANICADE Tech (short for Animated Arcade Technology).

Your speciality is coding, software development, and technology. You give direct, accurate, real-world answers.

Personality & Style:
- Lead with the answer — never waste the user's time with preamble
- Use proper Markdown formatting: headers, bullets, bold for key terms
- Write all code inside triple-backtick code blocks with the language specified
- Code must be complete, working, and production-quality
- Be concise but thorough — cover the important edge cases
- For non-coding questions, still answer fully and helpfully

When answering coding questions:
1. Show the complete working code first
2. Briefly explain what it does and why key choices were made
3. Mention important gotchas, best practices, or alternatives`;

// ─── Storage Keys ────────────────────────────────────────────────────────────
const USERS_KEY   = "anitechai_users";
const SESSION_KEY = "anitechai_session";
const chatKey = uid => "anitechai_chats_" + uid;

// ─── State ───────────────────────────────────────────────────────────────────
let user    = null;
let chats   = {};
let activeId = null;
let busy    = false;
let eventsOn = false;

// ─── AUTH: Helpers ───────────────────────────────────────────────────────────
const getUsers   = () => { try { return JSON.parse(localStorage.getItem(USERS_KEY) || "{}"); } catch { return {}; } };
const saveUsers  = u => localStorage.setItem(USERS_KEY, JSON.stringify(u));
const getSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; } };
const saveSession= u => localStorage.setItem(SESSION_KEY, JSON.stringify(u));
const clearSess  = () => localStorage.removeItem(SESSION_KEY);

function switchTab(tab) {
  ["login","signup"].forEach(t => {
    document.getElementById("tab" + (t === "login" ? "Login" : "Signup")).classList.toggle("active", t === tab);
    document.getElementById("form" + (t === "login" ? "Login" : "Signup")).classList.toggle("hidden", t !== tab);
  });
  ["liErr","suErr"].forEach(id => { const el = document.getElementById(id); if (el) { el.textContent = ""; el.classList.add("hidden"); } });
}

function togglePw(id, btn) {
  const inp = document.getElementById(id);
  inp.type = inp.type === "password" ? "text" : "password";
  btn.querySelector(".eye-show").classList.toggle("hidden", inp.type === "text");
  btn.querySelector(".eye-hide").classList.toggle("hidden", inp.type === "password");
}

function showErr(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove("hidden");
}

function handleLogin() {
  const email = (document.getElementById("liEmail").value || "").trim().toLowerCase();
  const pass  = document.getElementById("liPass").value || "";
  document.getElementById("liErr").classList.add("hidden");
  if (!email || !pass) { showErr("liErr", "Please fill in all fields."); return; }
  const users = getUsers();
  const uid = btoa(unescape(encodeURIComponent(email)));
  if (!users[uid] || users[uid].pass !== btoa(unescape(encodeURIComponent(pass)))) {
    showErr("liErr", "Incorrect email or password."); return;
  }
  const u = { uid, name: users[uid].name, email };
  saveSession(u);
  boot(u);
}

function handleSignup() {
  const name  = (document.getElementById("suName").value || "").trim();
  const email = (document.getElementById("suEmail").value || "").trim().toLowerCase();
  const pass  = document.getElementById("suPass").value || "";
  document.getElementById("suErr").classList.add("hidden");
  if (!name || !email || !pass) { showErr("suErr", "Please fill in all fields."); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showErr("suErr", "Enter a valid email address."); return; }
  if (pass.length < 6) { showErr("suErr", "Password must be at least 6 characters."); return; }
  const users = getUsers();
  const uid = btoa(unescape(encodeURIComponent(email)));
  if (users[uid]) { showErr("suErr", "An account with this email already exists."); return; }
  users[uid] = { name, pass: btoa(unescape(encodeURIComponent(pass))) };
  saveUsers(users);
  const u = { uid, name, email };
  saveSession(u);
  boot(u);
}

function logout() {
  clearSess(); user = null; chats = {}; activeId = null;
  document.getElementById("app").classList.add("hidden");
  document.getElementById("authOverlay").classList.remove("hidden");
  document.getElementById("liEmail").value = "";
  document.getElementById("liPass").value = "";
  switchTab("login");
}

// ─── Boot App ────────────────────────────────────────────────────────────────
function boot(u) {
  user = u;
  document.getElementById("authOverlay").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("userNm").textContent = u.name;
  const av = document.getElementById("userAv");
  av.textContent = u.name.charAt(0).toUpperCase();
  loadChats(); renderChatList();
  const ids = Object.keys(chats);
  if (ids.length) loadChat(ids[ids.length - 1]); else showWelcome();
  if (!eventsOn) setupEvents();
}

// ─── Storage ─────────────────────────────────────────────────────────────────
const loadChats = () => { try { chats = JSON.parse(localStorage.getItem(chatKey(user.uid)) || "{}"); } catch { chats = {}; } };
const saveChats = () => { try { localStorage.setItem(chatKey(user.uid), JSON.stringify(chats)); } catch {} };

// ─── Chat Management ─────────────────────────────────────────────────────────
function newChat() {
  const id = "c" + Date.now();
  chats[id] = { title: "New Chat", history: [] };
  saveChats(); renderChatList(); loadChat(id);
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
    c.history.forEach(m => m.role === "user" ? renderUser(m.parts[0].text) : renderAI(m.parts[0].text));
    scrollDown();
  }
  document.querySelectorAll(".chat-item").forEach(el => el.classList.toggle("active", el.dataset.id === id));
}

function delChat(id, e) {
  e.stopPropagation();
  delete chats[id]; saveChats(); renderChatList();
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
    el.innerHTML = `<p style="color:var(--tx3);font-size:.76rem;padding:10px 12px;text-align:center">No chats yet — start one!</p>`;
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
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
      </button>`;
    div.addEventListener("click", () => { loadChat(id); document.getElementById("sidebar").classList.remove("open"); });
    div.querySelector(".chat-item-del").addEventListener("click", e => delChat(id, e));
    el.appendChild(div);
  });
}

function setTitle(id, text) {
  chats[id].title = text.slice(0, 46) + (text.length > 46 ? "…" : "");
  document.getElementById("chatTitle").textContent = chats[id].title;
  saveChats(); renderChatList();
}

// ─── UI ───────────────────────────────────────────────────────────────────────
function showWelcome() {
  document.getElementById("welcome").style.display = "flex";
  document.getElementById("messages").innerHTML = "";
}
const scrollDown = () => { const a = document.getElementById("chatArea"); setTimeout(() => a.scrollTop = a.scrollHeight, 60); };

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
  return el;
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
  setTimeout(() => t.classList.remove("show"), 3600);
}

// ─── Markdown ────────────────────────────────────────────────────────────────
function md(text) {
  if (!text) return "";
  // Code blocks
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const l = esc(lang || "");
    const c = esc(code.trim());
    const enc = encodeURIComponent(code.trim());
    return `<div class="code-wrap"><pre><code class="lang-${l}">${c}</code></pre><button class="copy-btn" data-code="${enc}">Copy</button></div>`;
  });
  // Inline code
  text = text.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  // Headers
  text = text.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  text = text.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  text = text.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  // Bold + italic
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // HR
  text = text.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--bd);margin:11px 0">');
  // Lists
  text = text.replace(/^([ \t]*[-*+] .+\n?)+/gm, m => `<ul>${m.trim().split("\n").map(l=>`<li>${l.replace(/^[ \t]*[-*+] /,"")}</li>`).join("")}</ul>`);
  text = text.replace(/^([ \t]*\d+\. .+\n?)+/gm, m => `<ol>${m.trim().split("\n").map(l=>`<li>${l.replace(/^[ \t]*\d+\. /,"")}</li>`).join("")}</ol>`);
  // Paragraphs
  text = text.replace(/\n{2,}/g,"</p><p>").replace(/\n/g,"<br>");
  text = "<p>" + text + "</p>";
  text = text.replace(/<p>(<(?:h[123]|ul|ol|pre|hr|div))/g,"$1");
  text = text.replace(/(<\/(?:h[123]|ul|ol|pre|div)>)<\/p>/g,"$1");
  return text;
}

function attachCopy(container) {
  container.querySelectorAll(".copy-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const code = decodeURIComponent(btn.dataset.code);
      navigator.clipboard.writeText(code).then(() => {
        btn.textContent = "Copied!";
        setTimeout(() => btn.textContent = "Copy", 1800);
      }).catch(() => toast("Copy failed"));
    });
  });
}

const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

// ─── Send ─────────────────────────────────────────────────────────────────────
async function send() {
  if (busy) return;
  const ta = document.getElementById("inputTa");
  const text = ta.value.trim();
  if (!text) return;

  // Create chat if needed
  if (!activeId) {
    const id = "c" + Date.now();
    chats[id] = { title: "New Chat", history: [] };
    activeId = id; saveChats(); renderChatList();
  }

  const isFirst = !chats[activeId].history.length;
  if (isFirst) setTitle(activeId, text);

  // Add to history
  chats[activeId].history.push({ role: "user", parts: [{ text }] });
  renderUser(text);
  ta.value = ""; ta.style.height = "auto";
  saveChats();

  busy = true;
  document.getElementById("sendBtn").disabled = true;
  const thinkEl = renderThinking();

  try {
    const reply = await callGemini(chats[activeId].history);
    thinkEl.remove();
    chats[activeId].history.push({ role: "model", parts: [{ text: reply }] });
    renderAI(reply);
    saveChats();
  } catch (err) {
    thinkEl.remove();
    const errMsg = "Sorry, I hit an error: " + err.message;
    chats[activeId].history.push({ role: "model", parts: [{ text: errMsg }] });
    renderAI(errMsg);
    saveChats();
    toast(err.message);
    console.error("Ani-Tech AI error:", err);
  } finally {
    busy = false;
    document.getElementById("sendBtn").disabled = false;
    document.getElementById("inputTa").focus();
  }
}

// ─── Gemini API Call ─────────────────────────────────────────────────────────
async function callGemini(history) {
  if (!GEMINI_KEY || GEMINI_KEY === "YOUR_GEMINI_KEY_HERE") {
    throw new Error("No API key set! Open app.js and add your free Gemini key from aistudio.google.com/apikey");
  }

  const body = {
    system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: history,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
      topP: 0.95
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
    ]
  };

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `HTTP ${res.status}`;
    // Friendly messages for common errors
    if (res.status === 400) throw new Error("Bad request — check your API key format.");
    if (res.status === 403) throw new Error("Invalid API key. Get a free one at aistudio.google.com/apikey");
    if (res.status === 429) throw new Error("Rate limit hit — wait a moment and try again.");
    throw new Error(msg);
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];

  if (!candidate) throw new Error("No response from Gemini.");

  // Check for blocked content
  if (candidate.finishReason === "SAFETY") {
    return "I can't answer that particular question due to safety guidelines. Try rephrasing or ask something else!";
  }

  const parts = candidate?.content?.parts || [];
  return parts.map(p => p.text || "").join("") || "No response text received.";
}

// ─── Events ───────────────────────────────────────────────────────────────────
function setupEvents() {
  eventsOn = true;
  document.getElementById("newChatBtn").addEventListener("click", newChat);
  document.getElementById("sendBtn").addEventListener("click", send);

  const sb  = document.getElementById("sidebar");
  const mb  = document.getElementById("menuBtn");
  mb.addEventListener("click", () => sb.classList.toggle("open"));
  document.addEventListener("click", e => { if (!sb.contains(e.target) && !mb.contains(e.target)) sb.classList.remove("open"); });

  const ta = document.getElementById("inputTa");
  ta.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
  ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 145) + "px"; });

  document.querySelectorAll(".sug").forEach(btn => {
    btn.addEventListener("click", () => { document.getElementById("inputTa").value = btn.dataset.q; send(); });
  });
}

// ─── Startup ─────────────────────────────────────────────────────────────────
(function startup() {
  const s = getSession();
  if (s) {
    const users = getUsers();
    if (users[s.uid]) { boot(s); return; }
  }
  document.getElementById("authOverlay").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
})();
