/**
 * PEAK AI — by ANICADE Tech
 * Real-time AI with web search · Coding focused
 * Uses Anthropic claude-sonnet-4-20250514 with web search tool
 */

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const API_URL   = "https://api.anthropic.com/v1/messages";
const API_MODEL = "claude-sonnet-4-20250514";
const STORAGE_KEY = "peak_ai_chats";

const SYSTEM_PROMPT = `You are Peak AI, a sharp, precise, and highly capable AI assistant built by ANICADE Tech.
Your primary expertise is in coding, software development, and technology. You use real-time web search to provide up-to-date information.
Persona:
- Sharp, concise, and technically precise — no fluff
- Use code examples liberally; always use proper code blocks with language tags
- For coding questions: provide working, production-quality code
- For non-coding questions: still answer accurately and helpfully using web search when needed
- Be direct: lead with the answer, then explain
- Format responses in clear Markdown with headers, bullets, and code blocks
When answering coding questions:
1. Show working code first
2. Explain key concepts after
3. Mention common pitfalls or best practices
You have access to real-time web search. Use it for current docs, latest frameworks, recent news, and anything that benefits from up-to-date info.`;

// ─── STATE ───────────────────────────────────────────────────────────────────
let chats      = {};        // { id: { title, messages: [{role, content}] } }
let activeChatId = null;
let isThinking = false;

// ─── DOM REFS ─────────────────────────────────────────────────────────────────
const chatListEl       = document.getElementById("chatList");
const messagesEl       = document.getElementById("messages");
const userInputEl      = document.getElementById("userInput");
const sendBtnEl        = document.getElementById("sendBtn");
const newChatBtnEl     = document.getElementById("newChatBtn");
const welcomeScreenEl  = document.getElementById("welcomeScreen");
const chatTitleDisplay = document.getElementById("chatTitleDisplay");
const sidebarEl        = document.getElementById("sidebar");
const sidebarToggleEl  = document.getElementById("sidebarToggle");

// ─── INIT ─────────────────────────────────────────────────────────────────────
(function init() {
  loadChats();
  renderChatList();

  // If we have chats, load the most recent one
  const ids = Object.keys(chats);
  if (ids.length > 0) {
    loadChat(ids[ids.length - 1]);
  } else {
    showWelcome();
  }

  // Event listeners
  sendBtnEl.addEventListener("click", handleSend);
  newChatBtnEl.addEventListener("click", createNewChat);
  sidebarToggleEl.addEventListener("click", () => sidebarEl.classList.toggle("open"));
  document.addEventListener("click", e => {
    if (!sidebarEl.contains(e.target) && !sidebarToggleEl.contains(e.target)) {
      sidebarEl.classList.remove("open");
    }
  });

  userInputEl.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });

  userInputEl.addEventListener("input", () => {
    userInputEl.style.height = "auto";
    userInputEl.style.height = Math.min(userInputEl.scrollHeight, 160) + "px";
  });

  // Suggestion cards
  document.querySelectorAll(".suggestion-card").forEach(card => {
    card.addEventListener("click", () => {
      userInputEl.value = card.dataset.q;
      handleSend();
    });
  });
})();

// ─── STORAGE ─────────────────────────────────────────────────────────────────
function loadChats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    chats = raw ? JSON.parse(raw) : {};
  } catch { chats = {}; }
}

function saveChats() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(chats)); } catch {}
}

// ─── CHAT MANAGEMENT ─────────────────────────────────────────────────────────
function createNewChat() {
  const id = "chat_" + Date.now();
  chats[id] = { title: "New Chat", messages: [] };
  saveChats();
  renderChatList();
  loadChat(id);
  sidebarEl.classList.remove("open");
  userInputEl.focus();
}

function loadChat(id) {
  activeChatId = id;
  messagesEl.innerHTML = "";

  const chat = chats[id];
  if (!chat) return;

  chatTitleDisplay.textContent = chat.title;

  if (chat.messages.length === 0) {
    showWelcome();
  } else {
    welcomeScreenEl.style.display = "none";
    chat.messages.forEach(msg => {
      if (msg.role === "user") renderUserMessage(msg.content);
      else if (msg.role === "assistant") renderAIMessage(msg.content);
    });
    scrollBottom();
  }

  // Highlight active item
  document.querySelectorAll(".chat-item").forEach(el => {
    el.classList.toggle("active", el.dataset.id === id);
  });
}

function deleteChat(id, e) {
  e.stopPropagation();
  delete chats[id];
  saveChats();
  renderChatList();
  if (activeChatId === id) {
    const ids = Object.keys(chats);
    if (ids.length > 0) loadChat(ids[ids.length - 1]);
    else { activeChatId = null; showWelcome(); chatTitleDisplay.textContent = "New Chat"; }
  }
}

function renderChatList() {
  chatListEl.innerHTML = "";
  const ids = Object.keys(chats).reverse();
  if (ids.length === 0) {
    chatListEl.innerHTML = `<p style="color:var(--text3);font-size:0.78rem;padding:8px 10px;">No chats yet</p>`;
    return;
  }
  ids.forEach(id => {
    const chat = chats[id];
    const el = document.createElement("div");
    el.className = "chat-item" + (id === activeChatId ? " active" : "");
    el.dataset.id = id;
    el.innerHTML = `
      <span class="chat-item-title">${escapeHtml(chat.title)}</span>
      <button class="chat-item-del" title="Delete">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/>
        </svg>
      </button>`;
    el.addEventListener("click", () => { loadChat(id); sidebarEl.classList.remove("open"); });
    el.querySelector(".chat-item-del").addEventListener("click", e => deleteChat(id, e));
    chatListEl.appendChild(el);
  });
}

function updateChatTitle(id, firstMessage) {
  // Use first 40 chars of first user message as title
  const title = firstMessage.slice(0, 42) + (firstMessage.length > 42 ? "…" : "");
  chats[id].title = title;
  chatTitleDisplay.textContent = title;
  saveChats();
  renderChatList();
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────────
function showWelcome() {
  welcomeScreenEl.style.display = "flex";
  messagesEl.innerHTML = "";
}

function scrollBottom() {
  const area = document.getElementById("chatArea");
  setTimeout(() => { area.scrollTop = area.scrollHeight; }, 50);
}

function renderUserMessage(text) {
  welcomeScreenEl.style.display = "none";
  const el = document.createElement("div");
  el.className = "message user-msg";
  el.innerHTML = `
    <div class="msg-body" style="order:1">
      <div class="msg-sender user">You</div>
      <div class="msg-content">${escapeHtml(text).replace(/\n/g,"<br>")}</div>
    </div>
    <div class="msg-avatar user" style="order:2">YOU</div>`;
  messagesEl.appendChild(el);
  scrollBottom();
}

function renderAIMessage(html, el) {
  if (el) {
    el.querySelector(".msg-content").innerHTML = renderMarkdown(html);
    attachCopyButtons(el);
    scrollBottom();
    return;
  }
  welcomeScreenEl.style.display = "none";
  const newEl = document.createElement("div");
  newEl.className = "message ai-msg";
  newEl.innerHTML = `
    <div class="msg-avatar ai">
      <svg viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 2 L28 18 Q34 22 30 30 Q26 36 20 34 Q14 32 16 24 L20 2Z" fill="url(#b2)" stroke="#00FFD1" stroke-width="0.8"/>
        <line x1="20" y1="2" x2="20" y2="46" stroke="#00FFD1" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="20" cy="2" r="2" fill="#00FFD1"/>
        <defs><linearGradient id="b2" x1="20" y1="2" x2="32" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#00FFD1"/><stop offset="100%" stop-color="#0044AA" stop-opacity="0.3"/>
        </linearGradient></defs>
      </svg>
    </div>
    <div class="msg-body">
      <div class="msg-sender ai">Peak AI</div>
      <div class="msg-content">${renderMarkdown(html)}</div>
    </div>`;
  messagesEl.appendChild(newEl);
  attachCopyButtons(newEl);
  scrollBottom();
  return newEl;
}

function renderThinking() {
  welcomeScreenEl.style.display = "none";
  const el = document.createElement("div");
  el.className = "message ai-msg";
  el.id = "thinkingMsg";
  el.innerHTML = `
    <div class="msg-avatar ai">
      <svg viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 2 L28 18 Q34 22 30 30 Q26 36 20 34 Q14 32 16 24 L20 2Z" fill="url(#b3)" stroke="#00FFD1" stroke-width="0.8"/>
        <line x1="20" y1="2" x2="20" y2="46" stroke="#00FFD1" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="20" cy="2" r="2" fill="#00FFD1"/>
        <defs><linearGradient id="b3" x1="20" y1="2" x2="32" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#00FFD1"/><stop offset="100%" stop-color="#0044AA" stop-opacity="0.3"/>
        </linearGradient></defs>
      </svg>
    </div>
    <div class="msg-body">
      <div class="msg-sender ai">Peak AI</div>
      <div class="msg-content"><div class="thinking"><span></span><span></span><span></span></div></div>
    </div>`;
  messagesEl.appendChild(el);
  scrollBottom();
  return el;
}

function showToast(msg) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3500);
}

// ─── MARKDOWN RENDERER (lightweight) ─────────────────────────────────────────
function renderMarkdown(text) {
  if (!text) return "";

  // Code blocks (``` ... ```)
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const l = lang || "code";
    return `<div class="code-block-wrap"><pre><code class="lang-${l}">${escapeHtml(code.trim())}</code></pre><button class="copy-btn" data-code="${encodeURIComponent(code.trim())}">Copy</button></div>`;
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
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Horizontal rule
  text = text.replace(/^---$/gm, '<hr style="border-color:var(--border);margin:12px 0">');

  // Unordered lists
  text = text.replace(/^(\s*[-*+] .+(\n|$))+/gm, match => {
    const items = match.trim().split("\n").map(l => `<li>${l.replace(/^\s*[-*+] /, "")}</li>`).join("");
    return `<ul>${items}</ul>`;
  });

  // Ordered lists
  text = text.replace(/^(\s*\d+\. .+(\n|$))+/gm, match => {
    const items = match.trim().split("\n").map(l => `<li>${l.replace(/^\s*\d+\. /, "")}</li>`).join("");
    return `<ol>${items}</ol>`;
  });

  // Paragraphs (double newline)
  text = text.replace(/\n{2,}/g, "</p><p>");
  text = text.replace(/\n/g, "<br>");
  text = "<p>" + text + "</p>";

  // Clean up empty paragraphs around block elements
  text = text.replace(/<p>(<(?:h[123]|ul|ol|pre|hr|div)[^>]*>)/g, '$1');
  text = text.replace(/<\/(?:h[123]|ul|ol|pre|hr|div)><\/p>/g, '</$1>');

  return text;
}

function attachCopyButtons(container) {
  container.querySelectorAll(".copy-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const code = decodeURIComponent(btn.dataset.code);
      navigator.clipboard.writeText(code).then(() => {
        btn.textContent = "Copied!";
        setTimeout(() => { btn.textContent = "Copy"; }, 1800);
      });
    });
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── API CALL ─────────────────────────────────────────────────────────────────
// ⚠️  Replace with your Anthropic API key: https://console.anthropic.com
const ANTHROPIC_API_KEY = "YOUR_ANTHROPIC_API_KEY_HERE";

const API_HEADERS = {
  "Content-Type": "application/json",
  "x-api-key": ANTHROPIC_API_KEY,
  "anthropic-version": "2023-06-01",
  "anthropic-dangerous-direct-browser-access": "true"
};

async function callAPI(messages) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: API_HEADERS,
    body: JSON.stringify({
      model: API_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: messages,
      tools: [{ type: "web_search_20250305", name: "web_search" }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();

  // Handle tool use (web search) in response
  let textContent = "";
  let usedSearch = false;
  const toolUseBlocks = [];

  for (const block of data.content) {
    if (block.type === "text") {
      textContent += block.text;
    } else if (block.type === "tool_use") {
      usedSearch = true;
      toolUseBlocks.push(block);
    }
  }

  // If model used web search, we need to handle tool results
  if (usedSearch && toolUseBlocks.length > 0 && data.stop_reason === "tool_use") {
    // Build tool results - the web_search tool returns results automatically via the API
    // We pass the assistant's tool_use back as tool_result
    const toolResults = toolUseBlocks.map(block => ({
      type: "tool_result",
      tool_use_id: block.id,
      content: block.input?.query ? `Search query: "${block.input.query}" executed.` : "Search executed."
    }));

    // Continue the conversation with tool results
    const continueMessages = [
      ...messages,
      { role: "assistant", content: data.content },
      { role: "user", content: toolResults }
    ];

    const resp2 = await fetch(API_URL, {
      method: "POST",
      headers: API_HEADERS,
      body: JSON.stringify({
        model: API_MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: continueMessages,
        tools: [{ type: "web_search_20250305", name: "web_search" }]
      })
    });

    if (!resp2.ok) throw new Error("Search follow-up failed");
    const data2 = await resp2.json();
    textContent = data2.content.filter(b => b.type === "text").map(b => b.text).join("");
  }

  return textContent || "I couldn't generate a response. Please try again.";
}

// ─── SEND HANDLER ─────────────────────────────────────────────────────────────
async function handleSend() {
  if (isThinking) return;
  const text = userInputEl.value.trim();
  if (!text) return;

  // Create chat if none active
  if (!activeChatId) {
    const id = "chat_" + Date.now();
    chats[id] = { title: "New Chat", messages: [] };
    activeChatId = id;
    saveChats();
    renderChatList();
  }

  // Update title on first message
  const isFirst = chats[activeChatId].messages.length === 0;
  if (isFirst) updateChatTitle(activeChatId, text);

  // Add user message
  chats[activeChatId].messages.push({ role: "user", content: text });
  renderUserMessage(text);
  userInputEl.value = "";
  userInputEl.style.height = "auto";
  saveChats();

  // Show thinking
  isThinking = true;
  sendBtnEl.disabled = true;
  const thinkingEl = renderThinking();

  try {
    // Build message history for API (only role/content needed)
    const apiMessages = chats[activeChatId].messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    const reply = await callAPI(apiMessages);

    // Remove thinking, add real reply
    thinkingEl.remove();
    chats[activeChatId].messages.push({ role: "assistant", content: reply });
    renderAIMessage(reply);
    saveChats();

  } catch (err) {
    thinkingEl.remove();
    const errMsg = `⚠️ Error: ${err.message}. Check your API key or try again.`;
    chats[activeChatId].messages.push({ role: "assistant", content: errMsg });
    renderAIMessage(errMsg);
    saveChats();
    showToast("Something went wrong. Check console for details.");
    console.error("Peak AI error:", err);
  } finally {
    isThinking = false;
    sendBtnEl.disabled = false;
    userInputEl.focus();
  }
}
