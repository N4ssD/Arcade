// Pont entre l'interface et le code Rust (Tauri) : tout passe par la commande « api ».
(() => {
  'use strict';
  const tauri = window.__TAURI__ && window.__TAURI__.core;
  document.body.classList.add('web');

  async function call(name, body = {}) {
    if (!tauri) throw new Error('Arcade doit être lancé depuis Arcade.exe.');
    try { return await tauri.invoke('api', { name, body }); }
    catch (e) { throw new Error(typeof e === 'string' ? e : (e && e.message) || 'Erreur'); }
  }

  const previews = new Map();
  let changedCb = null;
  let noticeCb = null;

  window.arcade = {
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
    onChanged: (cb) => { changedCb = cb; },
    onNotice: (cb) => { noticeCb = cb; }
  };

  // Battement régulier : rafraîchit la bibliothèque quand quelque chose a changé en arrière-plan
  const beat = async () => {
    try {
      const r = await call('ping');
      if (r.changed && changedCb) changedCb();
      if (r.notices && r.notices.length && noticeCb) r.notices.forEach((n) => noticeCb(n));
    } catch {}
  };
  beat();
  setInterval(beat, 3000);
})();
