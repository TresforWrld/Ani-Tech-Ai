/**
 * PEAK AI — by ANICADE Tech
 * app.js — Auth + Chat + Anthropic API
 *
 * HOW THE API WORKS:
 * This app calls the Anthropic API directly. To use it:
 *   1. Set your API key in the ANTHROPIC_API_KEY constant below
 *   2. For production, proxy through a backend to keep the key secret
 *
 * ⚠️  Replace "YOUR_KEY_HERE" with your key from https://console.anthropic.com
 */

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY = "YOUR_KEY_HERE"; // ← paste your key here
const API_URL   = "https://api.anthropic.com/v1/messages";
const API_MODEL = "claude-sonnet-4-20250514";

const USERS_KEY  = "peak_ai_users";
const SESSION_KEY= "peak_ai_session";
const CHATS_KEY  = "peak_ai_chats";

const SYSTEM_PROMPT = `You are Peak AI, a sharp, precise, and highly capable AI assistant built by ANICADE Tech.
Your primary expertise is coding, software development, and technology. You provide real-time accurate information.

Rules:
- Be direct and concise — lead with the answer, then explain
- Use code blocks with language tags for ALL code examples
- Write working, production-quality code
- Format in clean Markdown: headers, bullets, code blocks
- For non-coding questions, still answer fully and accurately
- When you need current information, use web search

When answering coding questions:
1. Provide working code first
2. Briefly explain key concepts
3. Note important gotchas or best practices`;

// ─── STATE ───────────────────────────────────────────────────────────────────
let currentUser  = null;
let chats        = {};
let activeChatId = null;
let isThinking   = false;

// ─── AUTH HELPERS ────────────────────────────────────────────────────────────
function getUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || "{}"); } catch { return {}; }
}
function saveUsers(u) { localStorage.setItem(USERS_KEY, JSON.stringify(u)); }
function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
}
function saveSession(u) { localStorage.setItem(SESSION_KEY, JSON.stringify(u)); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }

function userChatsKey(uid) { return CHATS_KEY + "_" + uid; }

// ─── AUTH UI HELPERS ─────────────────────────────────────────────────────────
function switchTab(tab) {
  document.getElementById("tabLogin").classList.toggle("active", tab === "login");
  document.getElementById("tabSignup").classList.toggle("active", tab === "signup");
  document.getElementById("formLogin").classList.toggle("hidden", tab !== "login");
  document.getElementById("formSignup").classList.toggle("hidden", tab !== "signup");
  document.getElementById("loginError").classList.add("hidden");
  document.getElementById("signupError").classList.add("hidden");
}

function showAuthError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove("hidden");
}

function togglePw(inputId, btn) {
  const inp = document.getElementById(inputId);
  const isText = inp.type === "text";
  inp.type = isText ? "password" : "text";
  btn.querySelector(".eye-open").classList.toggle("hidden", !isText);
  btn.querySelector(".eye-closed").classList.toggle("hidden", isText);
}

function handleLogin() {
  const email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const pass  = document.getElementById("loginPassword").value;
  document.getElementById("loginError").classList.add("hidden");

  if (!email || !pass) { showAuthError("loginError", "Please fill in all fields."); return; }

  const users = getUsers();
  const uid = btoa(email);
  if (!users[uid] || users[uid].password !== btoa(pass)) {
    showAuthError("loginError", "Incorrect email or password.");
    return;
  }

  const user = { uid, name: users[uid].name, email };
  saveSession(user);
  bootApp(user);
}

function handleSignup() {
  const name  = document.getElementById("signupName").value.trim();
  const email = document.getElementById("signupEmail").value.trim().toLowerCase();
  const pass  = document.getElementById("signupPassword").value;
  document.getElementById("signupError").classList.add("hidden");

  if (!name || !email || !pass) { showAuthError("signupError", "Please fill in all fields."); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showAuthError("signupError", "Enter a valid email address."); return; }
  if (pass.length < 6) { showAuthError("signupError", "Password must be at least 6 characters."); return; }

  const users = getUsers();
  const uid = btoa(email);
  if (users[uid]) { showAuthError("signupError", "An account with this email already exists."); return; }

  users[uid] = { name, email, password: btoa(pass) };
  saveUsers(users);

  const user = { uid, name, email };
  saveSession(user);
  bootApp(user);
}

function handleLogout() {
  clearSession();
  currentUser = null;
  chats = {};
  activeChatId = null;
  document.getElementById("appShell").classList.add("hidden");
  document.getElementById("authOverlay").classList.remove("hidden");
  // Clear form
  document.getElementById("loginEmail").value = "";
  document.getElementById("loginPassword").value = "";
  switchTab("login");
}

// ─── APP BOOT ─────────────────────────────────────────────────────────────────
function bootApp(user) {
  currentUser = user;
  document.getElementById("authOverlay").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");
  document.getElementById("userNameDisplay").textContent = user.name;
  // Set avatar initial
  const av = document.getElementById("userAvatar");
  av.textContent = user.name.charAt(0).toUpperCase();
  av.style.fontSize = ".9rem";
  av.style.fontWeight = "700";
  av.style.color = "var(--accent)";
  av.querySelector && av.querySelector("svg") && (av.innerHTML = user.name.charAt(0).toUpperCase());

  loadChats();
  renderChatList();

  const ids = Object.keys(chats);
  if (ids.length > 0) loadChat(ids[ids.length - 1]);
  else showWelcome();

  setupAppListeners();
}

let listenersAttached = false;
function setupAppListeners() {
  if (listenersAttached) return;
  listenersAttached = true;

  document.getElementById("sendBtn").addEventListener("click", handleSend);
  document.getElementById("newChatBtn").addEventListener("click", createNewChat);

  const st = document.getElementById("sidebarToggle");
  const sb = document.getElementById("sidebar");
  st.addEventListener("click", () => sb.classList.toggle("open"));
  document.addEventListener("click", e => {
    if (!sb.contains(e.target) && !st.contains(e.target)) sb.classList.remove("open");
  });

  const ta = document.getElementById("userInput");
  ta.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } });
  ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 150) + "px"; });

  document.querySelectorAll(".suggestion-card").forEach(c => {
    c.addEventListener("click", () => { document.getElementById("userInput").value = c.dataset.q; handleSend(); });
  });
}

// ─── STORAGE ─────────────────────────────────────────────────────────────────
function loadChats() {
  try { chats = JSON.parse(localStorage.getItem(userChatsKey(currentUser.uid)) || "{}"); } catch { chats = {}; }
}
function saveChats() {
  try { localStorage.setItem(userChatsKey(currentUser.uid), JSON.stringify(chats)); } catch {}
}

// ─── CHAT MANAGEMENT ─────────────────────────────────────────────────────────
function createNewChat() {
  const id = "c" + Date.now();
  chats[id] = { title: "New Chat", messages: [] };
  saveChats();
  renderChatList();
  loadChat(id);
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("userInput").focus();
}

function loadChat(id) {
  activeChatId = id;
  const msg = document.getElementById("messages");
  msg.innerHTML = "";
  const chat = chats[id];
  if (!chat) return;

  document.getElementById("chatTitleDisplay").textContent = chat.title;
  if (chat.messages.length === 0) {
    showWelcome();
  } else {
    document.getElementById("welcomeScreen").style.display = "none";
    chat.messages.forEach(m => {
      if (m.role === "user") renderUserMessage(m.content);
      else renderAIMessage(m.content);
    });
    scrollBottom();
  }
  document.querySelectorAll(".chat-item").forEach(el => el.classList.toggle("active", el.dataset.id === id));
}

function deleteChat(id, e) {
  e.stopPropagation();
  delete chats[id];
  saveChats();
  renderChatList();
  if (activeChatId === id) {
    const ids = Object.keys(chats);
    if (ids.length > 0) loadChat(ids[ids.length - 1]);
    else { activeChatId = null; showWelcome(); document.getElementById("chatTitleDisplay").textContent = "New Chat"; }
  }
}

function renderChatList() {
  const el = document.getElementById("chatList");
  el.innerHTML = "";
  const ids = Object.keys(chats).reverse();
  if (ids.length === 0) {
    el.innerHTML = `<p style="color:var(--text3);font-size:.77rem;padding:8px 10px;text-align:center">No chats yet</p>`;
    return;
  }
  ids.forEach(id => {
    const chat = chats[id];
    const div = document.createElement("div");
    div.className = "chat-item" + (id === activeChatId ? " active" : "");
    div.dataset.id = id;
    div.innerHTML = `
      <span class="chat-item-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </span>
      <span class="chat-item-title">${escHtml(chat.title)}</span>
      <button class="chat-item-del" title="Delete chat">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
      </button>`;
    div.addEventListener("click", () => { loadChat(id); document.getElementById("sidebar").classList.remove("open"); });
    div.querySelector(".chat-item-del").addEventListener("click", e => deleteChat(id, e));
    el.appendChild(div);
  });
}

function updateTitle(id, firstMsg) {
  chats[id].title = firstMsg.slice(0, 44) + (firstMsg.length > 44 ? "…" : "");
  document.getElementById("chatTitleDisplay").textContent = chats[id].title;
  saveChats();
  renderChatList();
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────────
function showWelcome() {
  document.getElementById("welcomeScreen").style.display = "flex";
  document.getElementById("messages").innerHTML = "";
}

function scrollBottom() {
  const a = document.getElementById("chatArea");
  setTimeout(() => { a.scrollTop = a.scrollHeight; }, 60);
}

const AI_AVATAR_SVG = `
  <svg viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 2 L28 18 Q34 22 30 30 Q26 36 20 34 Q14 32 16 24 L20 2Z" fill="url(#avBlade)" stroke="#00FFD1" stroke-width="0.8"/>
    <line x1="20" y1="2" x2="20" y2="46" stroke="#00FFD1" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="20" cy="2" r="2" fill="#00FFD1"/>
    <defs><linearGradient id="avBlade" x1="20" y1="2" x2="32" y2="34" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#00FFD1"/><stop offset="100%" stop-color="#0044AA" stop-opacity="0.3"/>
    </linearGradient></defs>
  </svg>`;

const USER_AVATAR_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;

function renderUserMessage(text) {
  document.getElementById("welcomeScreen").style.display = "none";
  const el = document.createElement("div");
  el.className = "message user-msg";
  el.innerHTML = `
    <div class="msg-body" style="order:1">
      <div class="msg-sender user">You</div>
      <div class="msg-content">${escHtml(text).replace(/\n/g, "<br>")}</div>
    </div>
    <div class="msg-avatar user" style="order:2">${USER_AVATAR_SVG}</div>`;
  document.getElementById("messages").appendChild(el);
  scrollBottom();
}

function renderAIMessage(content) {
  document.getElementById("welcomeScreen").style.display = "none";
  const el = document.createElement("div");
  el.className = "message ai-msg";
  el.innerHTML = `
    <div class="msg-avatar ai">${AI_AVATAR_SVG}</div>
    <div class="msg-body">
      <div class="msg-sender ai">Peak AI</div>
      <div class="msg-content">${renderMd(content)}</div>
    </div>`;
  document.getElementById("messages").appendChild(el);
  attachCopyBtns(el);
  scrollBottom();
  return el;
}

function renderThinking() {
  document.getElementById("welcomeScreen").style.display = "none";
  const el = document.createElement("div");
  el.className = "message ai-msg";
  el.id = "thinkingMsg";
  el.innerHTML = `
    <div class="msg-avatar ai">${AI_AVATAR_SVG}</div>
    <div class="msg-body">
      <div class="msg-sender ai">Peak AI</div>
      <div class="msg-content"><div class="thinking"><span></span><span></span><span></span></div></div>
    </div>`;
  document.getElementById("messages").appendChild(el);
  scrollBottom();
  return el;
}

function showToast(msg, type = "error") {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.className = `toast ${type}`;
  t.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${escHtml(msg)}`;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3500);
}

// ─── MARKDOWN ────────────────────────────────────────────────────────────────
function renderMd(text) {
  if (!text) return "";

  // Fenced code blocks
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const l = escHtml(lang || "");
    const c = escHtml(code.trim());
    const enc = encodeURIComponent(code.trim());
    return `<div class="code-block-wrap"><pre><code class="lang-${l}">${c}</code></pre><button class="copy-btn" data-code="${enc}">Copy</button></div>`;
  });

  // Inline code
  text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // Headers
  text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  text = text.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold / Italic
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // HR
  text = text.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:12px 0">');

  // Unordered lists
  text = text.replace(/^([ \t]*[-*+] .+\n?)+/gm, match => {
    const items = match.trim().split("\n").map(l => `<li>${l.replace(/^[ \t]*[-*+] /, "")}</li>`).join("");
    return `<ul>${items}</ul>`;
  });

  // Ordered lists
  text = text.replace(/^([ \t]*\d+\. .+\n?)+/gm, match => {
    const items = match.trim().split("\n").map(l => `<li>${l.replace(/^[ \t]*\d+\. /, "")}</li>`).join("");
    return `<ol>${items}</ol>`;
  });

  // Paragraphs
  text = text.replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");
  text = "<p>" + text + "</p>";
  text = text.replace(/<p>(<(?:h[123]|ul|ol|pre|hr|div))/g, '$1');
  text = text.replace(/(<\/(?:h[123]|ul|ol|pre|div)>)<\/p>/g, '$1');

  return text;
}

function attachCopyBtns(container) {
  container.querySelectorAll(".copy-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const code = decodeURIComponent(btn.dataset.code);
      navigator.clipboard.writeText(code).then(() => {
        btn.textContent = "Copied!";
        setTimeout(() => { btn.textContent = "Copy"; }, 1800);
      }).catch(() => showToast("Copy failed"));
    });
  });
}

function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ─── SEND ─────────────────────────────────────────────────────────────────────
async function handleSend() {
  if (isThinking) return;
  const ta = document.getElementById("userInput");
  const text = ta.value.trim();
  if (!text) return;

  if (!activeChatId) {
    const id = "c" + Date.now();
    chats[id] = { title: "New Chat", messages: [] };
    activeChatId = id;
    saveChats();
    renderChatList();
  }

  const isFirst = chats[activeChatId].messages.length === 0;
  if (isFirst) updateTitle(activeChatId, text);

  chats[activeChatId].messages.push({ role: "user", content: text });
  renderUserMessage(text);
  ta.value = ""; ta.style.height = "auto";
  saveChats();

  isThinking = true;
  document.getElementById("sendBtn").disabled = true;
  const thinkEl = renderThinking();

  try {
    const apiMsgs = chats[activeChatId].messages.map(m => ({ role: m.role, content: m.content }));
    const reply = await callAPI(apiMsgs);
    thinkEl.remove();
    chats[activeChatId].messages.push({ role: "assistant", content: reply });
    renderAIMessage(reply);
    saveChats();
  } catch (err) {
    thinkEl.remove();
    const errMsg = "I encountered an error: " + err.message;
    chats[activeChatId].messages.push({ role: "assistant", content: errMsg });
    renderAIMessage(errMsg);
    saveChats();
    showToast(err.message, "error");
    console.error("Peak AI error:", err);
  } finally {
    isThinking = false;
    document.getElementById("sendBtn").disabled = false;
    document.getElementById("userInput").focus();
  }
}

// ─── ANTHROPIC API ────────────────────────────────────────────────────────────
async function callAPI(messages) {
  // Check key
  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === "YOUR_KEY_HERE") {
    throw new Error("No API key set. Open app.js and add your Anthropic API key.");
  }

  const headers = {
    "Content-Type": "application/json",
    "x-api-key": ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true"
  };

  const body = {
    model: API_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages,
    tools: [{ type: "web_search_20250305", name: "web_search" }]
  };

  const res = await fetch(API_URL, { method: "POST", headers, body: JSON.stringify(body) });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  const data = await res.json();
  return await resolveResponse(data, messages, headers);
}

// Handle multi-turn tool use (web search)
async function resolveResponse(data, originalMessages, headers, depth = 0) {
  if (depth > 4) throw new Error("Too many tool-use rounds");

  let text = "";
  const toolBlocks = [];

  for (const block of (data.content || [])) {
    if (block.type === "text") text += block.text;
    else if (block.type === "tool_use") toolBlocks.push(block);
    else if (block.type === "tool_result") text += block.content || "";
  }

  // If no tool use or text exists, return what we have
  if (data.stop_reason !== "tool_use" || toolBlocks.length === 0) {
    return text || "No response received.";
  }

  // Build tool result messages and continue
  const toolResults = toolBlocks.map(b => ({
    type: "tool_result",
    tool_use_id: b.id,
    content: b.output || b.content || `Search for "${b.input?.query}" completed.`
  }));

  const nextMessages = [
    ...originalMessages,
    { role: "assistant", content: data.content },
    { role: "user", content: toolResults }
  ];

  const body2 = {
    model: API_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: nextMessages,
    tools: [{ type: "web_search_20250305", name: "web_search" }]
  };

  const res2 = await fetch(API_URL, { method: "POST", headers, body: JSON.stringify(body2) });
  if (!res2.ok) {
    const e2 = await res2.json().catch(() => ({}));
    throw new Error(e2?.error?.message || `HTTP ${res2.status} on tool followup`);
  }
  const data2 = await res2.json();
  return resolveResponse(data2, nextMessages, headers, depth + 1);
}

// ─── STARTUP ──────────────────────────────────────────────────────────────────
(function startup() {
  const session = getSession();
  if (session) {
    const users = getUsers();
    if (users[session.uid]) {
      bootApp(session);
      return;
    }
  }
  // Show auth
  document.getElementById("authOverlay").classList.remove("hidden");
  document.getElementById("appShell").classList.add("hidden");
})();
