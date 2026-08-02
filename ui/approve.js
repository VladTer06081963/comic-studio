// ui/approve.js — authenticated API wrapper and reusable operations.
(function () {
  const TOKEN_KEY = 'comic-studio-api-token';

  async function apiFetch(input, init = {}, canRetry = true) {
    const headers = new Headers(init.headers || {});
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await window.fetch(input, { ...init, headers });
    if (response.status === 401 && canRetry) {
      const entered = window.prompt('API token для удалённого Comic Studio:');
      if (entered && entered.trim()) {
        sessionStorage.setItem(TOKEN_KEY, entered.trim());
        return apiFetch(input, init, false);
      }
    }
    return response;
  }

  function errorMessage(data, fallback = 'Ошибка API') {
    if (typeof data?.error === 'string') return data.error;
    if (data?.error?.message) return `${data.error.message}${data.error.request_id ? ` (request ${data.error.request_id})` : ''}`;
    return fallback;
  }

  async function json(input, init) {
    const response = await apiFetch(input, init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(errorMessage(data, `HTTP ${response.status}`));
    return data;
  }

  window.comicStudio = {
    apiFetch,
    json,
    errorMessage,
    clearToken: () => sessionStorage.removeItem(TOKEN_KEY),
    approve: id => json(`/api/scenarios/${id}/approve`, { method: 'POST' }),
    reject: id => json(`/api/scenarios/${id}/reject`, { method: 'POST' }),
    delete: id => json(`/api/scenarios/${id}?confirm=true`, { method: 'DELETE' }),
    feedback: (id, text) => json(`/api/scenarios/${id}/feedback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
    }),
    list: status => json(`/api/scenarios?status=${status || 'all'}`),
    get: id => json(`/api/scenarios/${id}`),
    comics: () => json('/api/comics'),
    jobs: () => json('/api/jobs'),
  };
})();
