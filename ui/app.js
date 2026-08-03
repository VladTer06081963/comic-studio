// ui/app.js — dashboard logic

const apiFetch = (...args) => window.comicStudio.apiFetch(...args);
const apiError = data => window.comicStudio.errorMessage(data);

const IMAGE_STYLE_EMOJI = {
  cartoon: '🎬',
  anime: '🎌',
  comic: '📚',
  realistic: '📷',
  watercolor: '🎨',
};

const IMAGE_STYLE_COLORS = {
  cartoon: '#ff6b35',
  anime: '#e91e63',
  comic: '#2196f3',
  realistic: '#4caf50',
  watercolor: '#9c27b0',
};

function getImageStyleBadge(style) {
  const emoji = IMAGE_STYLE_EMOJI[style] || '🎨';
  const color = IMAGE_STYLE_COLORS[style] || '#666';
  return `<span class="tag image-style" style="background:${color};color:white">${emoji} ${style}</span>`;
}

function getFeedbackBadge(count) {
  if (!count || count === 0) return '';
  return `<span class="feedback-badge" title="Запросы на правку">💬 ${count} запрос${count === 1 ? '' : count < 5 ? 'а' : 'ов'}</span>`;
}

// Edit Modal Logic
let currentEditId = null;
let currentDeleteId = null;

function openDeleteModal(id) {
  currentDeleteId = id;
  document.getElementById('delete-id').textContent = id;
  document.getElementById('delete-modal').classList.remove('hidden');
}

function closeDeleteModal() {
  currentDeleteId = null;
  document.getElementById('delete-modal').classList.add('hidden');
}

document.getElementById('delete-cancel')?.addEventListener('click', closeDeleteModal);
document.getElementById('delete-confirm')?.addEventListener('click', async () => {
  if (!currentDeleteId) return;
  const btn = document.getElementById('delete-confirm');
  btn.disabled = true;
  btn.textContent = '⏳ Удаление...';
  try {
    const res = await apiFetch(`/api/scenarios/${currentDeleteId}?confirm=true`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      closeDeleteModal();
      const activeTab = document.querySelector('nav button.active').dataset.tab;
      loadTab(activeTab);
    } else {
      alert(`Ошибка: ${apiError(data)}`);
    }
  } catch (err) {
    alert(`Ошибка: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = '🗑 Удалить';
  }
});

document.getElementById('delete-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'delete-modal') closeDeleteModal();
});

function openEditModal(id) {
  currentEditId = id;
  document.getElementById('edit-id').textContent = id;
  document.getElementById('edit-text').value = '';
  document.getElementById('edit-modal').classList.remove('hidden');
}

function closeEditModal() {
  currentEditId = null;
  document.getElementById('edit-modal').classList.add('hidden');
}

// Example button handlers
document.querySelectorAll('.example-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const ta = document.getElementById('edit-text');
    ta.value = ta.value ? `${ta.value}\n${btn.textContent}` : btn.textContent;
  });
});

// Modal buttons
document.getElementById('edit-cancel')?.addEventListener('click', closeEditModal);
document.getElementById('edit-save')?.addEventListener('click', async () => {
  const text = document.getElementById('edit-text').value.trim();
  if (!text) return alert('Введите текст правки');
  if (!currentEditId) return;

  const btn = document.getElementById('edit-save');
  btn.disabled = true;
  btn.textContent = '⏳ Revision...';

  try {
    const res = await apiFetch(`/api/scenarios/${currentEditId}/revise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: [{ text, source: 'web-ui' }] }),
    });
    const data = await res.json();
    if (data.ok) {
      closeEditModal();
      alert('Revision инициирован. После перегенерации потребуется повторное approval.');
      // Reload current tab
      const activeTab = document.querySelector('nav button.active').dataset.tab;
      loadTab(activeTab);
    } else {
      alert(`Ошибка: ${apiError(data)}`);
    }
  } catch (err) {
    alert(`Ошибка: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 Revision';
  }
});

// Close modal on backdrop click
document.getElementById('edit-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'edit-modal') closeEditModal();
});
// ── Create Form Handler ──────────────────────────────────────────────────────
document.getElementById('create-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const content = document.getElementById('content').value;
  const imageStyle = document.getElementById('image-style').value;
  const captionStyle = document.getElementById('caption-style').value;
  const result = document.getElementById('create-result');

  result.innerHTML = '⏳ Создаю сценарий...';

  try {
    const res = await apiFetch('/api/scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, image_style: imageStyle, caption_style: captionStyle }),
    });
    const data = await res.json();
    if (data.ok) {
      result.innerHTML = `✅ Сценарий создан! <code>${data.id}</code>`;
      document.getElementById('content').value = '';
      // Refresh draft tab
      loadTab('draft');
    } else {
      result.innerHTML = `❌ Ошибка: ${escapeHtml(apiError(data))}`;
    }
  } catch (err) {
    result.innerHTML = `❌ Ошибка: ${err.message}`;
  }
});

const tabs = document.querySelectorAll('nav button');
const contents = document.querySelectorAll('.tab-content');

tabs.forEach(t => t.addEventListener('click', () => {
  tabs.forEach(x => x.classList.remove('active'));
  contents.forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  document.getElementById(`tab-${t.dataset.tab}`).classList.add('active');
  loadTab(t.dataset.tab);
}));

async function loadTab(name) {
  if (name === 'comics') return loadComics();
  if (name === 'help' || name === 'create') return; // Static/local form content, no fetch needed
  const res = await apiFetch(`/api/scenarios?status=${name}`);
  const payload = await res.json();
  const scenarios = Array.isArray(payload) ? payload : (payload.items || []);
  const container = document.getElementById(`${name}-list`);
  if (!scenarios.length) {
    container.innerHTML = '<div class="empty">Пусто</div>';
    return;
  }
  container.innerHTML = scenarios.map(sc => scenarioCard(sc, name)).join('');
  attachHandlers(name);
}

function scenarioCard(sc, status) {
  const panels = sc.panels.slice(0, 3).map(p => `<div>${p.n}. ${escapeHtml(p.caption)}</div>`).join('');
  const more = sc.panels.length > 3 ? `<div>…+${sc.panels.length - 3}</div>` : '';
  const imageStyleBadge = getImageStyleBadge(sc.image_style || 'comic');
  const feedbackBadge = getFeedbackBadge(sc.feedback_count ?? (sc.feedback || []).length);
  const seedBadge = sc.seed !== undefined ? `<span class="tag">🎲 ${sc.seed}</span>` : '';
  const tags = `<span class="tag ${sc.style}">${sc.style}</span><span class="tag">${sc.tone}</span> ${imageStyleBadge} ${feedbackBadge} ${seedBadge}`;
  const renderBtn = status === 'rendered'
    ? `<button class="render" data-id="${sc.id}" data-action="render">🔄 Re-render</button>`
    : `<button class="render" data-id="${sc.id}" data-action="render">🎨 Рендер</button>`;
  const seedBtn = status === 'rendered'
    ? `<button class="seed" data-id="${sc.id}" data-action="seed">🎲 Seed + re-render</button>`
    : `<button class="seed" data-id="${sc.id}" data-action="seed">🎲 Seed</button>`;
  const editBtn = (status === 'approved' || status === 'rendered')
    ? `<button class="edit" data-id="${sc.id}" data-action="edit">🔄 Revision</button>`
    : status === 'published'
      ? `<button class="edit" data-id="${sc.id}" data-action="edit">🎨 Remix</button>`
      : '';
  let actions;
  if (status === 'draft') {
    actions = `
    <div class="actions">
      <button class="approve" data-id="${sc.id}" data-action="approve">✅ Утвердить</button>
      <button class="reject" data-id="${sc.id}" data-action="reject">❌ Отклонить</button>
      <button class="delete" data-id="${sc.id}" data-action="delete">🗑 Удалить</button>
    </div>`;
  } else if (status === 'approved' || status === 'rendered') {
    actions = `
    <div class="actions">
      ${editBtn}
      ${renderBtn}
      ${seedBtn}
      <button class="delete" data-id="${sc.id}" data-action="delete">🗑 Удалить</button>
    </div>`;
  } else {
    actions = `
    <div class="actions">
      ${editBtn}
      <span class="tag">🔒 Только чтение</span>
    </div>`;
  }
  // HTML/PNG ссылки для rendered и published (только когда есть артефакт)
  const htmlLink = (status === 'rendered' || status === 'published')
    ? `<div class="actions comic-links">
        <a class="comic-html-btn" href="/comics/${sc.id}.html" target="_blank" rel="noopener" title="Открыть HTML-версию (self-contained, inline CSS)">🔗 HTML</a>
        <a class="comic-png-btn" href="/comics/${sc.id}.png" target="_blank" rel="noopener" title="Открыть PNG-версию">🖼 PNG</a>
      </div>`
    : '';
  return `
    <div class="card">
      <h3>${escapeHtml(sc.title)}</h3>
      <div class="meta">${tags} <code>${sc.id}</code></div>
      <div class="panels">${panels}${more}</div>
      ${actions}
      ${htmlLink}
    </div>`;
}

function attachHandlers(status) {
  // Edit button works for all statuses
  document.querySelectorAll(`#${status}-list .actions button.edit`).forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id));
  });

  // Delete button
  document.querySelectorAll(`#${status}-list .actions button.delete`).forEach(btn => {
    btn.addEventListener('click', () => openDeleteModal(btn.dataset.id));
  });

  // Render button (not for draft)
  if (status !== 'draft') {
    document.querySelectorAll(`#${status}-list .actions button.render`).forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        btn.disabled = true;
        btn.textContent = '⏳ Рендер...';
        try {
          const res = await apiFetch(`/api/scenarios/${id}/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: status === 'rendered' ? 'rerender' : 'initial' }),
          });
          const data = await res.json();
          if (res.ok && data.ok) {
            btn.textContent = '🎨 Рендер запущен';
            setTimeout(() => loadTab(status), 1000);
          } else if (res.status === 409) {
            // Различаем 409 причины — раньше все мапились на «Уже в процессе»
            const code = data?.error?.code || '';
            if (code === 'BUSY') btn.textContent = '⏳ Уже в процессе';
            else if (code === 'RERENDER_CONFIRMATION_REQUIRED') btn.textContent = '🔄 Нужен re-render';
            else if (code === 'APPROVAL_REQUIRED') btn.textContent = '⛔ Утверди сначала';
            else if (code === 'PUBLISHED_IMMUTABLE') btn.textContent = '🔒 Только чтение';
            else btn.textContent = `⚠️ ${code || '409'}`;
          } else {
            btn.textContent = 'Ошибка';
            console.error('Render error:', data.error);
          }
        } catch (err) {
          btn.textContent = 'Ошибка';
          console.error('Render fetch error:', err);
        }
      });
    });

    // Seed button
    document.querySelectorAll(`#${status}-list .actions button.seed`).forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const newSeed = prompt('Введи seed (число) или оставь пустым для рандома:');
        if (newSeed === null) return; // Cancel
        const seed = newSeed.trim() === '' ? Math.floor(Math.random() * 1000000) : parseInt(newSeed);
        if (isNaN(seed)) return alert('Некорректный seed');
        try {
          const res = status === 'rendered'
            ? await apiFetch(`/api/scenarios/${id}/render`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'rerender', seed }),
              })
            : await apiFetch(`/api/scenarios/${id}/seed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ seed }),
              });
          const data = await res.json();
          if (data.ok) {
            loadTab(status);
          }
        } catch (err) {
          alert(`Ошибка: ${err.message}`);
        }
      });
    });
  }

  // Approve/reject only for draft
  if (status !== 'draft') return;
  document.querySelectorAll(`#${status}-list .actions button.approve, #${status}-list .actions button.reject`).forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      btn.disabled = true;
      btn.textContent = '⏳';
      const res = await apiFetch(`/api/scenarios/${id}/${action}`, { method: 'POST' });
      const result = await res.json();
      if (result.ok) {
        btn.textContent = action === 'approve' ? '✅' : '❌';
        setTimeout(() => loadTab(status), 500);
      } else {
        btn.textContent = 'Ошибка';
      }
    });
  });
}

async function loadComics() {
  const res = await apiFetch('/api/comics');
  const comics = await res.json();
  const container = document.getElementById('comics-list');
  if (!comics.length) {
    container.innerHTML = '<div class="empty">Нет выпусков</div>';
    return;
  }
  container.innerHTML = comics.map(c => {
    const id = c.scenario_id || c.filename.replace(/\.png$/, '');
    const htmlUrl = `/comics/${id}.html`;
    return `
    <div class="card comic-card">
      <a href="${c.url}" target="_blank" rel="noopener"><img src="${c.url}" alt="${escapeHtml(c.filename)}" loading="lazy"></a>
      <div class="meta">${escapeHtml(c.filename)}</div>
      <div class="actions">
        <a class="comic-html-btn" href="${htmlUrl}" target="_blank" rel="noopener" title="Открыть HTML-версию (self-contained, inline CSS)">🔗 Открыть HTML</a>
        <a class="comic-png-btn" href="${c.url}" target="_blank" rel="noopener" title="Открыть PNG-версию">🖼 PNG</a>
      </div>
    </div>`;
  }).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

// Initial load
loadTab('draft');

// Auto-refresh every 10 seconds
setInterval(() => {
  const active = document.querySelector('nav button.active').dataset.tab;
  loadTab(active);
}, 10000);