// ui/aipult.js — AiPULT chat panel logic (vanilla ES modules).
// NO external deps. NO build step. NO inline event handlers.

import {
  formatCard,
  formatCandidate,
  formatStatus,
  formatIntent,
  formatTimestamp,
  formatDuration,
  escapeHtml,
  truncate,
} from '../web/lib/aipult/ui_format.js';
import {
  validateCard,
  validateCommandString,
  AipultValidationError,
} from '../web/lib/aipult/validator.js';

// === Config ===================================================================

const STORAGE_KEY = 'aipult:history';
const MAX_HISTORY = 50;
const ENDPOINTS = {
  chat: '/api/aipult/chat',
  resolve: '/api/aipult/resolve',
  execute: '/api/aipult/execute',
  list: '/api/aipult/list',
};

// === State ====================================================================

let history = []; // [{ ts, role, content, card_id? }]

// === DOM refs (lazy, after DOMContentLoaded) =================================

let messagesEl, formEl, inputEl, sendEl, suggestionsEl, clearEl;

// === Storage ==================================================================

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_HISTORY)));
  } catch (err) {
    console.warn('aipult: localStorage save failed', err);
  }
}

function clearHistory() {
  history = [];
  saveHistory();
  if (messagesEl) messagesEl.innerHTML = '';
  if (suggestionsEl) suggestionsEl.style.display = '';
}

// === Render: messages ========================================================

function appendUserBubble(text) {
  const el = document.createElement('div');
  el.className = 'aipult-bubble aipult-bubble--user';
  el.textContent = text;
  const meta = document.createElement('span');
  meta.className = 'aipult-bubble-meta';
  meta.textContent = formatTimestamp(new Date().toISOString());
  el.appendChild(meta);
  messagesEl.appendChild(el);
  scrollToEnd();
  history.push({ ts: new Date().toISOString(), role: 'user', content: text });
  saveHistory();
}

function appendSystemBubble(text) {
  const el = document.createElement('div');
  el.className = 'aipult-bubble aipult-bubble--system';
  el.textContent = text;
  messagesEl.appendChild(el);
  scrollToEnd();
}

function appendErrorBubble(text) {
  const el = document.createElement('div');
  el.className = 'aipult-bubble aipult-bubble--assistant';
  el.style.borderLeft = '3px solid var(--red)';
  el.textContent = `❌ ${text}`;
  messagesEl.appendChild(el);
  scrollToEnd();
}

function scrollToEnd() {
  if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
}

function hideSuggestionsIfHistory() {
  if (history.length > 0 && suggestionsEl) {
    suggestionsEl.style.display = 'none';
  }
}

// === Render: CommandCard =====================================================

function renderCard(card) {
  const f = formatCard(card);
  const root = document.createElement('div');
  root.className = 'aipult-card';
  root.dataset.cardId = card.card_id || '';

  // Title (PRIMARY)
  if (f.title) {
    const h = document.createElement('h3');
    h.className = 'aipult-card-title';
    h.textContent = f.title;
    root.appendChild(h);
  }

  // Subtitle (intent + status)
  if (f.subtitle) {
    const p = document.createElement('p');
    p.className = 'aipult-card-subtitle';
    p.textContent = f.subtitle;
    root.appendChild(p);
  }

  // Scenario line (id + status, monospace)
  if (f.scenarioLine) {
    const p = document.createElement('p');
    p.className = 'aipult-card-scenario-line';
    p.textContent = f.scenarioLine;
    root.appendChild(p);
  }

  // Command (TERTIARY, monospace, in <pre>)
  if (f.command) {
    const pre = document.createElement('pre');
    pre.className = 'aipult-card-command';
    pre.textContent = f.command;
    root.appendChild(pre);
  }

  // Meta (time, cost, reversible)
  const metaParts = [];
  if (f.time) metaParts.push(`⏱ ${f.time}`);
  if (f.cost) metaParts.push(`💰 ${f.cost}`);
  if (f.reversible) metaParts.push('↩️ reversible');
  if (metaParts.length > 0) {
    const meta = document.createElement('div');
    meta.className = 'aipult-card-meta';
    meta.textContent = metaParts.join(' · ');
    root.appendChild(meta);
  }

  // Warnings
  if (f.warnings.length > 0) {
    const w = document.createElement('div');
    w.className = 'aipult-card-warnings';
    const head = document.createElement('strong');
    head.textContent = '⚠️ Предупреждения:';
    w.appendChild(head);
    const ul = document.createElement('ul');
    for (const warn of f.warnings) {
      const li = document.createElement('li');
      li.textContent = warn;
      ul.appendChild(li);
    }
    w.appendChild(ul);
    root.appendChild(w);
  }

  // Actions
  const actions = document.createElement('div');
  actions.className = 'aipult-card-actions';

  const btnRead = makeBtn('📖 Подробнее', 'aipult-card-btn', () => onRead(card));
  const btnEdit = makeBtn('✏️ Ред.', 'aipult-card-btn', () => onEdit(root, card));
  const btnRun = makeBtn('▶️ Run', 'aipult-card-btn aipult-card-btn--run', () => onRun(root, card, card.command));
  const btnReject = makeBtn('❌', 'aipult-card-btn aipult-card-btn--reject', () => onReject(root));

  actions.append(btnRead, btnEdit, btnRun, btnReject);
  root.appendChild(actions);

  messagesEl.appendChild(root);
  scrollToEnd();

  // Persist assistant + card_id
  history.push({ ts: new Date().toISOString(), role: 'assistant', content: f.subtitle, card_id: card.card_id });
  saveHistory();
}

function makeBtn(text, cls, handler) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = text;
  b.addEventListener('click', handler);
  return b;
}

// === Render: candidate list (disambiguation) ==================================

function renderCandidateList(candidates, message) {
  if (message) appendSystemBubble(message);
  const root = document.createElement('div');
  root.className = 'aipult-candidates';
  const head = document.createElement('p');
  head.className = 'aipult-candidates-header';
  head.textContent = `⚠️ Найдено ${candidates.length} кандидатов. Выбери:`;
  root.appendChild(head);

  candidates.forEach((cand, idx) => {
    const f = formatCandidate(cand);
    const card = document.createElement('div');
    card.className = 'aipult-candidate';
    const info = document.createElement('div');
    info.className = 'aipult-candidate-info';
    const titleEl = document.createElement('div');
    titleEl.className = 'aipult-candidate-title';
    titleEl.textContent = `${idx + 1}. ${f.title}`;
    const metaEl = document.createElement('div');
    metaEl.className = 'aipult-candidate-meta';
    metaEl.textContent = `${f.idLine} · ${f.status} · ${f.confidencePct}%`;
    info.append(titleEl, metaEl);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'aipult-card-btn aipult-card-btn--run';
    btn.textContent = '✅ Выбрать';
    btn.addEventListener('click', () => {
      // Send "use this id" back to LLM as a follow-up message
      const followUp = `используй ${cand.id}`;
      appendUserBubble(followUp);
      sendToChat(followUp, [cand]);
    });
    card.append(info, btn);
    root.appendChild(card);
  });

  messagesEl.appendChild(root);
  scrollToEnd();
}

// === Action handlers =========================================================

async function onRead(card) {
  const id = card.resolved_scenario?.id;
  if (!id) return;
  try {
    const resp = await fetch(`/api/scenarios/${encodeURIComponent(id)}`);
    const body = await resp.json();
    appendSystemBubble(`📖 ${id} → ${body.title || ''} (${body.status || '?'})`);
    const pre = document.createElement('pre');
    pre.className = 'aipult-card-command';
    pre.textContent = JSON.stringify(body, null, 2).slice(0, 4000);
    messagesEl.appendChild(pre);
    scrollToEnd();
  } catch (err) {
    appendErrorBubble(`Read failed: ${err.message}`);
  }
}

function onEdit(cardEl, card) {
  // Replace command <pre> with <textarea>
  const pre = cardEl.querySelector('.aipult-card-command');
  if (!pre) return;
  const original = card.command || '';
  const ta = document.createElement('textarea');
  ta.className = 'aipult-card-edit-textarea';
  ta.value = original;
  ta.rows = Math.max(2, original.split('\n').length);
  pre.replaceWith(ta);

  // Status line
  const status = document.createElement('p');
  status.className = 'aipult-card-edit-status';
  status.textContent = '☑ ID валиден';
  ta.after(status);

  // Validate on input
  ta.addEventListener('input', () => {
    try {
      validateCommandString(ta.value);
      status.textContent = '☑ Команда валидна';
      status.className = 'aipult-card-edit-status aipult-card-edit-status--ok';
    } catch (err) {
      status.textContent = `☒ ${err.code || 'INVALID'}: ${err.message}`;
      status.className = 'aipult-card-edit-status aipult-card-edit-status--err';
    }
  });

  // Replace actions with [Отмена] [▶️ Run с правкой]
  const actions = cardEl.querySelector('.aipult-card-actions');
  const newActions = document.createElement('div');
  newActions.className = 'aipult-card-actions';
  const cancel = makeBtn('Отмена', 'aipult-card-btn', () => {
    // Restore: rebuild card by re-rendering
    cardEl.remove();
    renderCard({ ...card, command: original });
  });
  const run = makeBtn('▶️ Run с правкой', 'aipult-card-btn aipult-card-btn--run', () => {
    try {
      validateCommandString(ta.value);
    } catch (err) {
      appendErrorBubble(`${err.code}: ${err.message}`);
      return;
    }
    onRun(cardEl, card, ta.value);
  });
  newActions.append(cancel, run);
  actions.replaceWith(newActions);

  ta.focus();
}

async function onRun(cardEl, card, command) {
  // Client-side validation (defense-in-depth)
  try {
    validateCard({ ...card, command });
  } catch (err) {
    appendErrorBubble(`${err.code || 'INVALID'}: ${err.message}`);
    return;
  }
  appendSystemBubble(`▶️ Запускаю: ${truncate(command, 80)}`);
  try {
    const resp = await fetch(ENDPOINTS.execute, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        card_id: card.card_id || '',
        command,
        intent: card.intent,
        scenario_id: card.resolved_scenario?.id,
        style: card.style,
      }),
    });
    const body = await resp.json();
    renderResult(cardEl, body, resp.status, card);
  } catch (err) {
    appendErrorBubble(`Execute failed: ${err.message}`);
  }
}

function renderResult(cardEl, body, httpStatus, card) {
  const ok = httpStatus >= 200 && httpStatus < 300 && body.ok !== false;
  const root = document.createElement('div');
  root.className = `aipult-result${ok ? '' : ' aipult-result--failed'}`;
  const head = document.createElement('p');
  head.className = 'aipult-result-header';
  const icon = ok ? '✅' : '❌';
  const exit = body.exit_code ?? (ok ? 0 : -1);
  const dur = body.duration_ms != null ? formatDuration(body.duration_ms) : '';
  head.textContent = `${icon} ${ok ? 'Выполнено' : 'Ошибка'} · exit ${exit}${dur ? ' · ' + dur : ''}`;
  root.appendChild(head);

  if (body.stdout || body.stderr) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = '📄 stdout / stderr';
    details.appendChild(summary);
    const pre = document.createElement('pre');
    pre.className = 'aipult-result-stdout';
    const out = [body.stdout && 'STDOUT:\n' + body.stdout, body.stderr && 'STDERR:\n' + body.stderr]
      .filter(Boolean).join('\n\n');
    pre.textContent = truncate(out, 4000);
    details.appendChild(pre);
    root.appendChild(details);
  }

  // Action buttons: primary "Open comic" link + secondary actions
  // After successful restyle, user wants to SEE the comic — make HTML/PNG
  // links prominent.
  const scenarioId = card?.resolved_scenario?.id;
  const scenarioStatus = card?.resolved_scenario?.status;
  const canOpenComic = ok && scenarioId && (scenarioStatus === 'rendered' || scenarioStatus === 'published');

  if (canOpenComic) {
    const openRow = document.createElement('div');
    openRow.className = 'aipult-result-open';
    const htmlLink = document.createElement('a');
    htmlLink.className = 'aipult-result-open-btn aipult-result-open-btn--primary';
    htmlLink.href = `/comics/${scenarioId}.html?t=${Date.now()}`;
    htmlLink.target = '_blank';
    htmlLink.rel = 'noopener';
    htmlLink.textContent = '🔗 Открыть HTML комикс';
    const pngLink = document.createElement('a');
    pngLink.className = 'aipult-result-open-btn';
    pngLink.href = `/comics/${scenarioId}.png?t=${Date.now()}`;
    pngLink.target = '_blank';
    pngLink.rel = 'noopener';
    pngLink.textContent = '🖼 PNG';
    openRow.append(htmlLink, pngLink);
    root.appendChild(openRow);
  }

  // Secondary actions: rerun + view scenario
  const actions = document.createElement('div');
  actions.className = 'aipult-result-actions';
  if (ok && card?.intent && card?.resolved_scenario) {
    const rerunBtn = document.createElement('button');
    rerunBtn.type = 'button';
    rerunBtn.className = 'aipult-card-btn';
    rerunBtn.textContent = '🔄 Ещё раз';
    rerunBtn.addEventListener('click', () => onRun(cardEl, card, card.command || ''));
    actions.appendChild(rerunBtn);
  }
  if (scenarioId) {
    const viewBtn = document.createElement('button');
    viewBtn.type = 'button';
    viewBtn.className = 'aipult-card-btn';
    viewBtn.textContent = '📖 Сценарий';
    viewBtn.addEventListener('click', () => onRead(card));
    actions.appendChild(viewBtn);
  }
  if (actions.children.length > 0) root.appendChild(actions);

  messagesEl.appendChild(root);
  scrollToEnd();
}

function onReject(cardEl) {
  cardEl.style.transition = 'opacity 300ms, transform 300ms';
  cardEl.style.opacity = '0';
  cardEl.style.transform = 'translateX(20px)';
  setTimeout(() => {
    cardEl.remove();
    appendSystemBubble('❌ Rejected');
  }, 300);
}

// === Send message ============================================================

async function sendToChat(message, forcedCandidates = null) {
  hideSuggestionsIfHistory();
  try {
    const resp = await fetch(ENDPOINTS.chat, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    const body = await resp.json();

    if (!resp.ok) {
      const code = body.error?.code || 'HTTP_ERROR';
      const msg = body.error?.message || `HTTP ${resp.status}`;
      appendErrorBubble(`${code}: ${msg}`);
      return;
    }

    // 4 response shapes:
    if (body.card) {
      renderCard(body.card);
      return;
    }
    if (body.disambiguation && body.candidates?.length) {
      renderCandidateList(body.candidates, body.message);
      return;
    }
    if (body.candidates?.length === 0) {
      appendSystemBubble(body.message || 'Кандидаты не найдены.');
      return;
    }
    if (forcedCandidates?.length) {
      // After user picked from disambiguation, we re-send with chosen id
      // The LLM should return a card now. If it doesn't, surface that.
      appendSystemBubble('⚠️ Не удалось получить карточку после выбора.');
      return;
    }
    appendSystemBubble('ℹ️ Нет данных для отображения.');
  } catch (err) {
    appendErrorBubble(`Network error: ${err.message}`);
  }
}

async function onSubmit(e) {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  sendEl.disabled = true;
  try {
    appendUserBubble(text);
    await sendToChat(text);
  } finally {
    sendEl.disabled = false;
    inputEl.focus();
  }
}

function onSuggestionClick(e) {
  const btn = e.target.closest('.aipult-chip');
  if (!btn) return;
  const text = btn.dataset.suggestion || btn.textContent;
  inputEl.value = text;
  formEl.requestSubmit();
}

function onClearClick() {
  if (!confirm('Очистить всю историю чата? Это действие нельзя отменить.')) return;
  clearHistory();
}

// === Init =====================================================================

function rehydrate() {
  history = loadHistory();
  hideSuggestionsIfHistory();
  for (const entry of history) {
    if (entry.role === 'user') {
      const el = document.createElement('div');
      el.className = 'aipult-bubble aipult-bubble--user';
      el.textContent = entry.content;
      const meta = document.createElement('span');
      meta.className = 'aipult-bubble-meta';
      meta.textContent = formatTimestamp(entry.ts);
      el.appendChild(meta);
      messagesEl.appendChild(el);
    } else if (entry.role === 'system') {
      appendSystemBubble(entry.content);
    }
    // assistant entries are meta-only (card_id), not re-rendered
  }
  scrollToEnd();
}

export function initAipult() {
  messagesEl = document.getElementById('aipult-messages');
  formEl = document.getElementById('aipult-form');
  inputEl = document.getElementById('aipult-input');
  sendEl = document.getElementById('aipult-send');
  suggestionsEl = document.getElementById('aipult-suggestions');
  clearEl = document.getElementById('aipult-clear');

  if (!messagesEl || !formEl || !inputEl || !sendEl) {
    console.warn('aipult: required DOM elements missing');
    return;
  }

  formEl.addEventListener('submit', onSubmit);
  if (suggestionsEl) suggestionsEl.addEventListener('click', onSuggestionClick);
  if (clearEl) clearEl.addEventListener('click', onClearClick);

  rehydrate();
  console.info('aipult: chat panel initialized');
}

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAipult);
} else {
  initAipult();
}

// Expose for debugging / testing
window.AipultUI = { initAipult, clearHistory, formatCard, formatCandidate, escapeHtml };
