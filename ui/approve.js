// ui/approve.js — экспортирует функции для других UI страниц
window.comicStudio = {
  approve: (id) => fetch(`/api/scenarios/${id}/approve`, { method: 'POST' }).then(r => r.json()),
  reject: (id) => fetch(`/api/scenarios/${id}/reject`, { method: 'POST' }).then(r => r.json()),
  list: (status) => fetch(`/api/scenarios?status=${status || 'all'}`).then(r => r.json()),
  get: (id) => fetch(`/api/scenarios/${id}`).then(r => r.json()),
  comics: () => fetch('/api/comics').then(r => r.json()),
};