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

  // Images : Rust renvoie un jeton « arc:cover/nom.jpg?x » ; l'image est lue en octets bruts puis affichée via un Blob (rapide, mis en cache)
  const blobs = new Map();
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp' };
  async function resolveImage(tok) {
    if (typeof tok !== 'string' || !tok.startsWith('arc:')) return tok;
    if (blobs.has(tok)) return blobs.get(tok);
    const m = /^arc:(cover|icon)\/([^?]*)/.exec(tok);
    if (!m) return null;
    const p = (async () => {
      try {
        const name = decodeURIComponent(m[2]);
        const buf = await tauri.invoke('image', { kind: m[1], name });
        const ext = (name.split('.').pop() || '').toLowerCase();
        return URL.createObjectURL(new Blob([buf], { type: MIME[ext] || 'image/png' }));
      } catch { return null; }
    })();
    blobs.set(tok, p);
    return p;
  }
  async function withImages(lib) {
    const games = lib && lib.games;
    if (Array.isArray(games)) {
      await Promise.all(games.map(async (g) => {
        g.coverUrl = await resolveImage(g.coverUrl);
        g.iconUrl = await resolveImage(g.iconUrl);
      }));
    }
    return lib;
  }

  const previews = new Map();
  let changedCb = null;
  let noticeCb = null;

  window.arcade = {
    getLibrary: async () => withImages(await call('library')),
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
    setIcon: (png) => call('setIcon', { png }),
    perf: () => call('perf'),
    checkLibrary: () => call('checkLibrary'),
    mergeGames: (keep, remove) => call('mergeGames', { keep, remove }),
    uninstall: (wipe) => call('uninstall', { wipe: !!wipe }),
    checkUpdate: () => call('checkUpdate'),
    installUpdate: () => call('installUpdate'),
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
  // Fenêtre réduite : on vérifie beaucoup moins souvent pour ne rien consommer
  const loop = () => { beat(); setTimeout(loop, document.hidden ? 15000 : 1500); };
  loop();
  document.addEventListener('visibilitychange', () => { document.body.classList.toggle('idle', document.hidden); if (!document.hidden) beat(); });
})();
