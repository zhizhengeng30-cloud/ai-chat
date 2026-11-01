const STORAGE_KEY = 'ai_chat_conversations_v1';

const messagesEl = document.getElementById('messages');
const emptyState = document.getElementById('emptyState');
const historyListEl = document.getElementById('historyList');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const newChatBtn = document.getElementById('newChatBtn');
const menuBtn = document.getElementById('menuBtn');
const sidebar = document.getElementById('sidebar');
const sidebarMask = document.getElementById('sidebarMask');
const modelNameEl = document.getElementById('modelName');

let conversations = loadConversations();
let currentId = null;
let sending = false;

marked.setOptions({
  breaks: true,
  gfm: true,
});

function loadConversations() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}
function saveConversations() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}
function currentConv() {
  return conversations.find((c) => c.id === currentId) || null;
}
function newConversation() {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: '新对话',
    messages: [],
    createdAt: Date.now(),
  };
}

/* ---------- 渲染 ---------- */
function renderHistory() {
  historyListEl.innerHTML = '';
  if (conversations.length === 0) {
    historyListEl.innerHTML = '<div class="history-empty">暂无历史对话</div>';
    return;
  }
  // 最新的在上面
  const sorted = [...conversations].sort((a, b) => b.createdAt - a.createdAt);
  for (const conv of sorted) {
    const item = document.createElement('div');
    item.className = 'history-item' + (conv.id === currentId ? ' active' : '');
    item.innerHTML = `<span class="title"></span><button class="del" title="删除">✕</button>`;
    item.querySelector('.title').textContent = conv.title;
    item.addEventListener('click', () => switchConv(conv.id));
    item.querySelector('.del').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteConv(conv.id);
    });
    historyListEl.appendChild(item);
  }
}

function renderMessages() {
  const conv = currentConv();
  messagesEl.innerHTML = '';
  if (!conv || conv.messages.length === 0) {
    messagesEl.appendChild(emptyState);
    emptyState.style.display = 'flex';
    return;
  }
  emptyState.style.display = 'none';
  for (const msg of conv.messages) {
    appendMessageEl(msg.role, msg.content, msg.error);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function appendMessageEl(role, content, isError = false) {
  const row = document.createElement('div');
  row.className = 'msg-row';
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + role;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (isError) {
    bubble.className = 'bubble error-tip';
    bubble.textContent = content;
  } else if (role === 'user') {
    bubble.textContent = content;
  } else {
    bubble.innerHTML = renderMarkdown(content);
  }
  wrap.appendChild(bubble);
  row.appendChild(wrap);
  messagesEl.appendChild(row);
  return bubble;
}

function renderMarkdown(text) {
  try {
    const html = marked.parse(text || '');
    return html;
  } catch {
    return escapeHtml(text || '');
  }
}
function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ---------- 对话操作 ---------- */
function startNewChat() {
  currentId = null;
  renderMessages();
  renderHistory();
  inputEl.focus();
  closeSidebar();
}
function switchConv(id) {
  currentId = id;
  renderMessages();
  renderHistory();
  closeSidebar();
}
function deleteConv(id) {
  conversations = conversations.filter((c) => c.id !== id);
  if (currentId === id) currentId = null;
  saveConversations();
  renderMessages();
  renderHistory();
}

/* ---------- 发送消息 ---------- */
async function send() {
  const text = inputEl.value.trim();
  if (!text || sending) return;

  let conv = currentConv();
  if (!conv) {
    conv = newConversation();
    conversations.unshift(conv);
    currentId = conv.id;
  }

  conv.messages.push({ role: 'user', content: text });
  if (conv.title === '新对话') conv.title = text.slice(0, 20);
  saveConversations();
  renderHistory();
  inputEl.value = '';
  autoResize();

  // 渲染用户消息
  appendMessageEl('user', text);
  emptyState.style.display = 'none';

  // 创建 assistant 占位
  const assistantBubble = appendMessageEl('assistant', '');
  assistantBubble.innerHTML = '<span class="cursor"></span>';
  messagesEl.scrollTop = messagesEl.scrollHeight;

  sending = true;
  sendBtn.disabled = true;

  // 构造上下文（当前对话的全部消息）
  const payload = { messages: conv.messages.map(({ role, content }) => ({ role, content })) };

  let assistantText = '';
  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `请求失败 (${resp.status})`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // 按 SSE 事件分割
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of rawEvent.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content || '';
            if (delta) {
              assistantText += delta;
              assistantBubble.innerHTML = renderMarkdown(assistantText) + '<span class="cursor"></span>';
              messagesEl.scrollTop = messagesEl.scrollHeight;
            }
          } catch {
            // 忽略不完整的 JSON 片段
          }
        }
      }
    }

    if (!assistantText) {
      assistantBubble.className = 'bubble error-tip';
      assistantBubble.textContent = 'AI 没有返回内容。';
    } else {
      assistantBubble.innerHTML = renderMarkdown(assistantText);
    }
    conv.messages.push({ role: 'assistant', content: assistantText });
    saveConversations();
  } catch (err) {
    assistantBubble.className = 'bubble error-tip';
    assistantBubble.textContent = '错误：' + err.message;
    conv.messages.push({ role: 'assistant', content: assistantText, error: true });
    saveConversations();
  } finally {
    sending = false;
    sendBtn.disabled = false;
    messagesEl.scrollTop = messagesEl.scrollHeight;
    renderHistory();
  }
}

/* ---------- 输入框 ---------- */
function autoResize() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + 'px';
}
inputEl.addEventListener('input', autoResize);
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    send();
  }
});
sendBtn.addEventListener('click', send);

newChatBtn.addEventListener('click', startNewChat);

/* ---------- 移动端侧边栏 ---------- */
function openSidebar() { sidebar.classList.add('open'); sidebarMask.classList.add('show'); }
function closeSidebar() { sidebar.classList.remove('open'); sidebarMask.classList.remove('show'); }
menuBtn.addEventListener('click', () => sidebar.classList.contains('open') ? closeSidebar() : openSidebar());
sidebarMask.addEventListener('click', closeSidebar);

/* ---------- 初始化 ---------- */
renderHistory();
renderMessages();
inputEl.focus();
