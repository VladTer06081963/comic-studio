// ui/app.js — dashboard logic
// ── Create Form Handler ──────────────────────────────────────────────────────
document.getElementById('create-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const content = document.getElementById('content').value;
  const imageStyle = document.getElementById('image-style').value;
  const result = document.getElementById('create-result');

  result.innerHTML = '⏳ Создаю сценарий...';

  try {
    const res = await fetch('/api/scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, image_style: imageStyle }),
    });
    const data = await res.json();
    if (data.ok) {
      result.innerHTML = `✅ Сценарий создан! <code>${data.id}</code>`;
      document.getElementById('content').value = '';
      // Refresh draft tab
      loadTab('draft');
    } else {
      result.innerHTML = `❌ Ошибка: ${data.error}`;
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
  const res = await fetch(`/api/scenarios?status=${name}`);
  const scenarios = await res.json();
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
  const tags = `<span class="tag ${sc.style}">${sc.style}</span><span class="tag">${sc.tone}</span>`;
  const actions = status === 'draft' ? `
    <div class="actions">
      <button class="approve" data-id="${sc.id}" data-action="approve">✅ Утвердить</button>
      <button class="reject" data-id="${sc.id}" data-action="reject">❌ Отклонить</button>
    </div>` : '';
  return `
    <div class="card">
      <h3>${escapeHtml(sc.title)}</h3>
      <div class="meta">${tags} <code>${sc.id}</code></div>
      <div class="panels">${panels}${more}</div>
      ${actions}
    </div>`;
}

function attachHandlers(status) {
  if (status !== 'draft') return;
  document.querySelectorAll(`#${status}-list .actions button`).forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      btn.disabled = true;
      btn.textContent = '⏳';
      const res = await fetch(`/api/scenarios/${id}/${action}`, { method: 'POST' });
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
  const res = await fetch('/api/comics');
  const comics = await res.json();
  const container = document.getElementById('comics-list');
  if (!comics.length) {
    container.innerHTML = '<div class="empty">Нет выпусков</div>';
    return;
  }
  container.innerHTML = comics.map(c => `
    <div class="card comic-card">
      <img src="${c.url}" alt="${c.filename}" loading="lazy">
      <div class="meta">${c.filename}</div>
    </div>`).join('');
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