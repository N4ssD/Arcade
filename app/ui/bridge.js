// Pont entre l'interface et le serveur local PowerShell (remplace Electron)
(() => {
  'use strict';
  const token = new URLSearchParams(location.search).get('t') || '';
  document.body.classList.add('web');

  // Dans l'application Rust (Tauri), on passe par invoke ; sinon par le serveur local PowerShell.
  const tauri = window.__TAURI__ && window.__TAURI__.core;
  async function call(name, body = {}) {
    if (tauri) {
      try { return await tauri.invoke('api', { name, body }); }
      catch (e) { throw new Error(typeof e === 'string' ? e : (e && e.message) || 'Erreur'); }
    }
    const r = await fetch('/api/' + name, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Arcade-Token': token },
      body: JSON.stringify(body)
    });
    if (!r.ok) { let t = ''; try { t = (await r.text()).slice(0, 220); } catch {} throw new Error(t || ('Erreur ' + r.status)); }
    return r.json();
  }

  const previews = new Map();
  let changedCb = null;
  let noticeCb = null;

  window.arcade = {
    canDrop: true, // un navigateur ne donne pas le chemin complet : on envoie le raccourci (.lnk / .url) lui-même
    getLibrary: () => call('library'),
    pickGame: async () => (await call('pickGame')).paths || [],
    pickCover: async () => {
      const r = await call('pickCover');
      if (r.path) previews.set(r.path, r.data);
      return r.path || null;
    },
    previewUrl: (p) => previews.get(p) || null,
    pickFolder: async () => (await call('pickFolder')).path || null,
    addGames: (items) => call('add', { items }),
    updateGame: (id, patch) => call('update', { id, patch }),
    removeGame: (id) => call('remove', { id }),
    launch: (id) => call('launch', { id }),
    reveal: (id) => call('reveal', { id }),
    setCategories: (payload) => call('categories', payload),
    refreshIcon: (id) => call('refreshIcon', { id }),
    fetchCover: (id, opts = {}) => call('fetchCover', { id, ...opts }),
    detectLaunchers: () => call('detectLaunchers'),
    resetAll: () => call('resetAll'),
    scanFolder: async (folder) => (await call('scan', { folder })).items || [],
    setSettings: (patch) => call('settings', patch),
    pathForFile: () => '',
    addDropped: (name, data) => call('addDropped', { name, data }),
    onChanged: (cb) => { changedCb = cb; },
    onNotice: (cb) => { noticeCb = cb; }
  };

  // Battement de cœur : sert à fermer le serveur quand la fenêtre est fermée,
  // et à rafraîchir la bibliothèque quand un jeu se termine (temps de jeu).
  const beat = async () => {
    try {
      const r = await call('ping');
      if (r.changed && changedCb) changedCb();
      if (r.notices && r.notices.length && noticeCb) r.notices.forEach((n) => noticeCb(n));
    } catch {}
  };
  beat();
  setInterval(beat, 3000);
  // Fenêtre fermée : on prévient le serveur pour qu'il s'arrête (sinon il resterait en arrière-plan)
  if (!tauri) window.addEventListener('pagehide', () => { try { navigator.sendBeacon('/api/bye?t=' + encodeURIComponent(token), new Blob(['{}'], { type: 'text/plain' })); } catch {} });
})();
