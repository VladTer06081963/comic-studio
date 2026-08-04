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

// Fast Edit (Restyle) Modal Logic
let currentRestyleId = null;

async function openRestyleModal(id) {
  currentRestyleId = id;
  document.getElementById('restyle-id').textContent = id;
  const container = document.getElementById('restyle-captions-container');
  container.innerHTML = '⏳ Загрузка...';
  document.getElementById('restyle-modal').classList.remove('hidden');

  try {
    const res = await apiFetch(`/api/scenarios/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(apiError(data));
    
    document.getElementById('restyle-style').value = data.style || 'bubble';
    
    container.innerHTML = data.panels.map((p, i) => `
      <div style="margin-bottom:10px;">
        <label>Панель ${p.n}:</label>
        <textarea class="restyle-caption-input" rows="2" style="width:100%">${escapeHtml(p.caption)}</textarea>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `❌ Ошибка: ${err.message}`;
  }
}

function closeRestyleModal() {
  currentRestyleId = null;
  document.getElementById('restyle-modal').classList.add('hidden');
}

document.getElementById('restyle-cancel')?.addEventListener('click', closeRestyleModal);
document.getElementById('restyle-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'restyle-modal') closeRestyleModal();
});

document.getElementById('restyle-save')?.addEventListener('click', async () => {
  if (!currentRestyleId) return;
  const style = document.getElementById('restyle-style').value;
  const captionInputs = document.querySelectorAll('.restyle-caption-input');
  const captions = Array.from(captionInputs).map(input => input.value.trim());

  const btn = document.getElementById('restyle-save');
  btn.disabled = true;
  btn.textContent = '⏳ Сохраняю...';

  try {
    const res = await apiFetch(`/api/scenarios/${currentRestyleId}/restyle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ style, captions }),
    });
    const data = await res.json();
    if (data.ok) {
      closeRestyleModal();
      const activeTab = document.querySelector('nav button.active').dataset.tab;
      loadTab(activeTab);
    } else {
      alert(`Ошибка: ${apiError(data)}`);
    }
  } catch (err) {
    alert(`Ошибка: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = '⚡️ Сохранить';
  }
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

function activateTab(name) {
  for (const t of tabs) {
    t.classList.toggle('active', t.dataset.tab === name);
  }
  for (const c of contents) {
    c.classList.toggle('active', c.id === `tab-${name}`);
  }
  loadTab(name);
}

tabs.forEach(t => t.addEventListener('click', () => {
  activateTab(t.dataset.tab);
}));

// Initial activation: respect ?tab=... query param (so links from AiPULT
// chat panel can deep-link to a specific tab). Defaults to "draft" otherwise.
const initialTab = new URLSearchParams(location.search).get('tab');
const knownTab = [...tabs].some((t) => t.dataset.tab === initialTab);
activateTab(knownTab ? initialTab : 'draft');

async function loadTab(name) {
  if (name === 'comics') return loadComics();
  if (name === 'help' || name === 'create') return; // Static/local form content, no fetch needed
  const [resScen, resJobs] = await Promise.all([
    apiFetch(`/api/scenarios?status=${name}`),
    apiFetch(`/api/jobs`)
  ]);
  const payload = await resScen.json();
  const scenarios = Array.isArray(payload) ? payload : (payload.items || []);
  const payloadJobs = await resJobs.json();
  const jobs = Array.isArray(payloadJobs) ? payloadJobs : (payloadJobs.items || []);
  const activeJobs = jobs.filter(j => j.status === 'queued' || j.status === 'running');

  const container = document.getElementById(`${name}-list`);
  if (!scenarios.length) {
    container.innerHTML = '<div class="empty">Пусто</div>';
    return;
  }
  container.innerHTML = scenarios.map(sc => scenarioCard(sc, name, activeJobs)).join('');
  attachHandlers(name);

  // Highlight focused card if URL has ?focus=<id> (deep-link from AiPULT chat).
  // Runs in next frame so the freshly-inserted DOM is measurable.
  const focusId = new URLSearchParams(location.search).get('focus');
  if (focusId) {
    requestAnimationFrame(() => {
      const card = document.querySelector(`.card[data-scenario-id="${CSS.escape(focusId)}"]`);
      if (card) {
        card.classList.add('card--focused');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => card.classList.remove('card--focused'), 3000);
      }
      // Strip ?focus= from URL so F5 doesn't re-trigger the highlight.
      const url = new URL(location.href);
      url.searchParams.delete('focus');
      history.replaceState({}, '', url);
    });
  }
}

function scenarioCard(sc, status, activeJobs = []) {
  const activeJob = activeJobs.find(j => j.scenario_id === sc.id);
  const isBusy = !!activeJob;

  const panels = sc.panels.slice(0, 3).map(p => `<div>${p.n}. ${escapeHtml(p.caption)}</div>`).join('');
  const more = sc.panels.length > 3 ? `<div>…+${sc.panels.length - 3}</div>` : '';
  const imageStyleBadge = getImageStyleBadge(sc.image_style || 'comic');
  const feedbackBadge = getFeedbackBadge(sc.feedback_count ?? (sc.feedback || []).length);
  const seedBadge = sc.seed !== undefined ? `<span class="tag">🎲 ${sc.seed}</span>` : '';
  
  let jobBadge = '';
  if (isBusy) {
    jobBadge = `<span class="tag" style="background:#ff9800;color:white">⏳ ${activeJob.type === 'render' ? 'Рендер...' : 'Обработка...'}</span>`;
  }
  const tags = `<span class="tag ${sc.style}">${sc.style}</span><span class="tag">${sc.tone}</span> ${imageStyleBadge} ${feedbackBadge} ${seedBadge} ${jobBadge}`;
  
  const renderBtn = isBusy
    ? `<button class="render" disabled>⏳ В процессе</button>`
    : status === 'rendered'
      ? `<button class="render" data-id="${sc.id}" data-action="render">🔄 Re-render</button>`
      : `<button class="render" data-id="${sc.id}" data-action="render">🎨 Рендер</button>`;
  
  const seedBtn = isBusy
    ? `<button class="seed" disabled>⏳</button>`
    : status === 'rendered'
      ? `<button class="seed" data-id="${sc.id}" data-action="seed">🎲 Seed + re-render</button>`
      : `<button class="seed" data-id="${sc.id}" data-action="seed">🎲 Seed</button>`;
  
  const editBtn = isBusy
    ? `<button class="edit" disabled>⏳</button>`
    : (status === 'approved' || status === 'rendered')
      ? `<button class="edit" data-id="${sc.id}" data-action="edit">🔄 Revision</button>`
      : status === 'published'
        ? `<button class="edit" data-id="${sc.id}" data-action="edit">🎨 Remix</button>`
        : '';
        
  const fastEditBtn = (status === 'rendered' || status === 'published') && !isBusy
    ? `<button class="restyle-btn" data-id="${sc.id}">⚡️ Быстрая правка</button>`
    : '';
    
  const publishBtn = (status === 'rendered') && !isBusy
    ? `<button class="publish" data-id="${sc.id}" data-action="publish">🚀 Опубликовать</button>`
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
    const topActions = (publishBtn || fastEditBtn) 
      ? `<div class="actions" style="margin-bottom: 0.5rem;">${publishBtn}${fastEditBtn}</div>` 
      : '';
    actions = `
    ${topActions}
    <div class="actions">
      ${editBtn}
      ${renderBtn}
      ${seedBtn}
      <button class="delete" data-id="${sc.id}" data-action="delete">🗑 Удалить</button>
    </div>`;
  } else {
    const topActions = fastEditBtn 
      ? `<div class="actions" style="margin-bottom: 0.5rem;">${fastEditBtn}</div>` 
      : '';
    actions = `
    ${topActions}
    <div class="actions">
      ${editBtn}
      <span class="tag">🔒 Только чтение</span>
    </div>`;
  }
  // HTML/PNG ссылки для rendered и published (только когда есть артефакт)
  const htmlLink = (status === 'rendered' || status === 'published')
    ? `<div class="actions comic-links">
        <a class="comic-html-btn" href="viewer.html?id=${sc.id}&type=html" title="Открыть HTML-версию (self-contained, inline CSS)">🔗 HTML</a>
        <a class="comic-png-btn" href="viewer.html?id=${sc.id}&type=png" title="Открыть PNG-версию">🖼 PNG</a>
      </div>`
    : '';
  return `
    <div class="card" data-scenario-id="${sc.id}">
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

  // Fast Edit button
  document.querySelectorAll(`#${status}-list .actions button.restyle-btn`).forEach(btn => {
    btn.addEventListener('click', () => openRestyleModal(btn.dataset.id));
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

  // Status transition buttons (approve, reject, publish)
  document.querySelectorAll(`#${status}-list .actions button.approve, #${status}-list .actions button.reject, #${status}-list .actions button.publish`).forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      btn.disabled = true;
      btn.textContent = '⏳';
      try {
        const res = await apiFetch(`/api/scenarios/${id}/${action}`, { method: 'POST' });
        const result = await res.json();
        if (result.ok) {
          btn.textContent = action === 'approve' ? '✅' : action === 'publish' ? '🚀' : '❌';
          setTimeout(() => loadTab(status), 500);
        } else {
          btn.textContent = 'Ошибка';
          alert(`Ошибка: ${result.error?.message || 'Неизвестная ошибка'}`);
        }
      } catch (e) {
        btn.textContent = 'Ошибка';
        alert(`Ошибка сети: ${e.message}`);
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
        <a class="comic-html-btn" href="viewer.html?id=${id}&type=html" title="Открыть HTML-версию (self-contained, inline CSS)">🔗 Открыть HTML</a>
        <a class="comic-png-btn" href="viewer.html?id=${id}&type=png" title="Открыть PNG-версию">🖼 PNG</a>
      </div>
    </div>`;
  }).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

// Auto-refresh every 10 seconds (current active tab, respects URL deep-link)
setInterval(() => {
  const active = document.querySelector('nav button.active')?.dataset?.tab || 'draft';
  loadTab(active);
}, 10000);