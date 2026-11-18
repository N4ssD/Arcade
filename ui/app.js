(() => {
  'use strict';

  const api = window.arcade;
  const APP_VERSION = '2.3.2';

  // Toute erreur du serveur est affichée (plus d'échec silencieux)
  window.addEventListener('unhandledrejection', (e) => {
    const m = (e.reason && e.reason.message) || String(e.reason || 'erreur inconnue');
    toast('Erreur : ' + m, 'error');
  });

  // ---------- État ----------
  const state = {
    games: [],
    categories: [],
    running: new Set(),
    view: 'all', // all | fav | recent | cat:<nom>
    query: '',
    sort: 'name',
    settings: { cardSize: 200, volume: 60, sounds: true, hoverSounds: true, clickSounds: true, autoCovers: true, sidebarCollapsed: false, introAnim: true },
    fetching: new Set(), // jeux dont la couverture est en cours de recherche
    attempted: new Set(), // évite de relancer une recherche en boucle
    queue: [],
    lastKey: ''
  };

  // ---------- Helpers DOM ----------
  const $ = (s, r = document) => r.querySelector(s);

  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === false || v == null) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  // Les icônes sont des chaînes statiques (aucune donnée utilisateur)
  const ICONS = {
    dice: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="9" cy="15" r="1"/><circle cx="15" cy="15" r="1"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    trophy: '<svg viewBox="0 0 24 24"><path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5v1.5A3 3 0 0 0 8 10.5M16 6h3v1.5A3 3 0 0 1 16 10.5M12 13v4M8.5 20h7M10 17h4"/></svg>',
    flame: '<svg viewBox="0 0 24 24"><path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4 .2 1.3.9 2 1.7 2.3C10.5 8.3 11 5.5 12 3z"/></svg>',
    crown: '<svg viewBox="0 0 24 24"><path d="M4 8l4 4 4-6 4 6 4-4-2 10H6z"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>',
    rocket: '<svg viewBox="0 0 24 24"><path d="M12 3.5c3.2 2 4.8 5 4.8 8.5l-2 3.5H9.2l-2-3.5C7.2 8.5 8.8 5.5 12 3.5z"/><circle cx="12" cy="10" r="1.4"/><path d="M9.2 15.5L7 19l3-1M14.8 15.5L17 19l-3-1"/></svg>',
    hist: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.6-5.9L4 8.5"/><path d="M4 4v4.5h4.5M12 8v4.5l3 1.5"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
    dots: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/></svg>',
    folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
    image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/></svg>',
    tag: '<svg viewBox="0 0 24 24"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1"/></svg>'
  };
  const icon = (name) => {
    const s = document.createElement('span');
    s.style.display = 'inline-flex';
    s.innerHTML = ICONS[name];
    return s.firstElementChild;
  };

  // ---------- Formats ----------
  function fmtPlaytime(sec) {
    if (!sec || sec < 60) return 'Jamais joué';
    const m = Math.round(sec / 60);
    if (m < 60) return `${m} min`;
    const hrs = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${hrs} h ${String(rest).padStart(2, '0')}` : `${hrs} h`;
  }

  function fmtLast(ts) {
    if (!ts) return '';
    const days = Math.floor((startOfDay(Date.now()) - startOfDay(ts)) / 86400000);
    if (days <= 0) return "Aujourd'hui";
    if (days === 1) return 'Hier';
    if (days < 30) return `Il y a ${days} j`;
    return new Date(ts).toLocaleDateString(ARC.locale);
  }
  const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

  function hash(str) {
    let x = 0;
    for (let i = 0; i < str.length; i++) x = (x * 31 + str.charCodeAt(i)) >>> 0;
    return x;
  }

  function coverBackground(g) {
    if (g.coverUrl) return { backgroundImage: `url("${g.coverUrl}")` };
    const hu = 235 + (hash(g.name) % 110); // bleu → violet → rose
    return { backgroundImage: `linear-gradient(145deg, hsl(${hu} 70% 62%), hsl(${(hu + 35) % 360} 62% 32%))` };
  }

  // ---------- Toasts ----------
  function toast(msg, kind = '') {
    const t = h('div', { class: `toast ${kind}`, text: msg });
    $('#toasts').append(t);
    if (kind === 'error') Sound.play('error');
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3200);
  }

  // ---------- Données ----------
  // Si une ancienne version d'Arcade tourne encore en arrière-plan, on le dit clairement
  function checkVersion(serverVersion) {
    const old = serverVersion !== APP_VERSION;
    let bar = document.getElementById('verbar');
    if (!old) { if (bar) bar.remove(); return; }
    if (bar) return;
    bar = h('div', { id: 'verbar', class: 'verbar' },
      h('b', { text: 'Ancienne version d\'Arcade détectée. ' }),
      "Certaines fonctions (catégories…) ne seront pas enregistrées. Ferme toutes les fenêtres Arcade, attends 10 secondes, puis relance Arcade (Arcade.vbs).");
    document.body.append(bar);
  }

  // ---------- Performances ----------
  // Pause des animations quand la fenêtre est cachée, ou (mode économie) pendant qu'un jeu tourne
  function applyIdle() {
    const eco = state.settings.ecoMode !== false && state.running && state.running.size > 0;
    document.body.classList.toggle('idle', document.hidden || !!eco);
  }
  document.addEventListener('visibilitychange', applyIdle);
  const fmtMb = (n) => (n >= 1024 ? (n / 1024).toFixed(1).replace('.', ARC.decimal || '.') + ' Go' : Math.round(n) + ' Mo');
  let perfTimer = null;
  async function pollPerf() {
    clearTimeout(perfTimer);
    const chip = $('#perf-chip'), live = document.getElementById('perf-mem');
    const wantChip = state.settings.perfChip === true;
    if (chip) chip.hidden = !wantChip;
    if ((wantChip || live) && !document.hidden) {
      try {
        const r = await api.perf();
        if (wantChip) $('#perf-chip-t').textContent = 'Arcade · ' + fmtMb(r.memMb) + ' · ' + String(r.cpu).replace('.', ARC.decimal || '.') + ' % CPU';
        if (live) {
          live.textContent = fmtMb(r.memMb);
          document.getElementById('perf-mem-bar').style.width = Math.min(100, r.memMb / 5) + '%';
          document.getElementById('perf-cpu').textContent = String(r.cpu).replace('.', ARC.decimal || '.') + ' %';
          document.getElementById('perf-cpu-bar').style.width = Math.min(100, r.cpu * 4) + '%';
          document.getElementById('perf-open').textContent = r.openMs ? (r.openMs / 1000).toFixed(1).replace('.', ARC.decimal || '.') + ' s' : '—';
          document.getElementById('perf-open-bar').style.width = Math.min(100, (r.openMs / 100) || 0) + '%';
          const pill = document.getElementById('perf-state');
          const sleeping = state.running.size > 0;
          pill.className = 'pill' + (sleeping ? ' sleep' : '');
          pill.lastChild.textContent = sleeping ? 'Veille pendant le jeu' : 'Actif';
        }
      } catch (_) {}
    }
    perfTimer = setTimeout(pollPerf, live ? 2000 : 5000);
  }
  function perfPanel() {
    setTimeout(pollPerf, 150);
    const tile = (l, id, bar) => h('div', { class: 'tile' }, h('div', { class: 'l', text: l }), h('div', { class: 'n', id, text: '…' }), h('div', { class: 'bar' }, h('b', { id: bar })));
    return h('div', { class: 'set-group' },
      h('h2', { text: 'Performances' }),
      h('div', { class: 'perf-tiles' }, tile('Mémoire', 'perf-mem', 'perf-mem-bar'), tile('Processeur', 'perf-cpu', 'perf-cpu-bar'), tile('Ouverture', 'perf-open', 'perf-open-bar')),
      h('div', { class: 'setting' }, h('div', { class: 'setting-text' }, h('b', { text: 'État d\'Arcade' }), h('small', { text: 'La mémoire comprend le moteur d\'affichage d\'Arcade. Pendant un jeu, Arcade se réduit et met ses animations en pause.' })),
        h('span', { class: 'pill', id: 'perf-state' }, h('span', { class: 'dot' }), h('span', { text: 'Actif' }))),
      switchRow('Mode économie automatique', 'Coupe les animations quand la fenêtre est cachée ou qu\'un jeu tourne.', 'ecoMode', () => applyIdle()),
      switchRow('Indicateur dans le menu', 'Affiche discrètement la mémoire et le processeur utilisés par Arcade en bas du menu.', 'perfChip', () => pollPerf())
    );
  }

  // ---------- Mises à jour ----------
  let updating = false;
  function showUpdate(latest) {
    if (document.getElementById('updbar')) return;
    const go = h('button', { class: 'btn', text: 'Mettre à jour', 'data-snd': 'none' });
    const later = h('button', { class: 'btn ghost', text: 'Plus tard', 'data-snd': 'none' });
    const bar = h('div', { id: 'updbar', class: 'updbar' },
      h('div', { class: 'upd-t' }, h('b', { text: 'Arcade ' + latest + ' est disponible' }), h('small', { text: 'Ta bibliothèque et tes réglages sont conservés.' })),
      h('div', { class: 'upd-b' }, later, go));
    later.addEventListener('click', () => bar.remove());
    go.addEventListener('click', async () => {
      if (updating) return;
      updating = true; go.disabled = true; later.disabled = true; go.textContent = 'Téléchargement…';
      try { await api.installUpdate(); }
      catch (e) { updating = false; go.disabled = false; later.disabled = false; go.textContent = 'Mettre à jour'; toast(e.message || String(e), 'error'); }
    });
    document.body.append(bar);
  }
  async function checkUpdate(manual) {
    try {
      const r = await api.checkUpdate();
      if (r.available) showUpdate(r.latest);
      else if (manual) toast('Arcade est à jour (version ' + r.current + ').');
    } catch (e) { if (manual) toast(e.message || String(e), 'error'); }
  }
  function updateRow() {
    return h('div', { class: 'setting' },
      h('div', { class: 'setting-text' }, h('b', { text: 'Rechercher une mise à jour' }), h('small', { text: 'Version actuelle : ' + APP_VERSION + '. Si une nouvelle version existe, Arcade la télécharge et s\'installe tout seul.' })),
      h('button', { class: 'btn ghost', text: 'Rechercher', 'data-snd': 'none', onClick: () => checkUpdate(true) }));
  }

  function applySound() {
    Sound.configure({ enabled: state.settings.sounds, volume: state.settings.volume / 100, hover: state.settings.hoverSounds, click: state.settings.clickSounds });
  }

  // Le zoom agrandit la CASE du jeu ; l'icône au centre et le décor flou derrière gardent leur taille
  function applyCardSize(v) {
    v = Math.max(140, Math.min(320, Number(v) || 200)); v = 140 + Math.round((v - 140) / 20) * 20;
    const root = document.documentElement;
    root.style.setProperty('--card-w', v + 'px');
    const pv = document.getElementById('size-val'); if (pv) pv.textContent = Math.round(v / 2) + ' %';
    const sz = document.getElementById('size'); if (sz) sz.title = 'Taille des cases : ' + v + ' px';
  }
  async function load() {
    const lib = await api.getLibrary();
    state.games = lib.games;
    state.categories = lib.categories || [];
    state.daily = lib.daily || {};
    state.running = new Set(lib.running);
    state.installed = !!lib.installed;
    setTimeout(applyIdle, 0);
    state.settings = { ...state.settings, ...lib.settings };
    checkVersion(lib.version);
    applyCardSize(state.settings.cardSize);
    $('#size').value = state.settings.cardSize;
    applySound();
    applySidebar();
    applyAppearance();
    render();
    if (detailId) renderDetail();
    evalAchievements();
    queueCovers();
  }

  // ---------- Menu latéral réductible ----------
  // Menu automatique : réduit quand la souris n'est pas dessus, déployé (par-dessus le contenu) dès qu'elle y passe
  const autoMenu = () => { try { return localStorage.getItem('arcade.autoMenu') !== '0'; } catch { return true; } };
  function applySidebar() {
    const auto = autoMenu();
    document.body.classList.toggle('automenu', auto);
    if (!auto) document.body.classList.remove('menu-open');
    const c = auto || !!state.settings.sidebarCollapsed;
    document.body.classList.toggle('collapsed', c);
    const label = c ? 'Agrandir le menu' : 'Réduire le menu (Ctrl+B)';
    $('#btn-collapse').title = label;
    const tip = auto ? 'Menu automatique — clique pour le garder déplié' : c ? 'Menu fermé en permanence — clique pour le mode automatique' : 'Menu déplié en permanence — clique pour le garder fermé';
    $('#btn-brand').title = tip;
    $('#btn-brand').setAttribute('aria-label', tip);
    $('#btn-collapse svg').style.transform = c ? 'rotate(180deg)' : '';
    // pas d'animation au tout premier affichage
    if (document.body.classList.contains('preload')) requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('preload')));
  }
  // Le menu se déplace seul (largeur) ; la zone de droite change de mise en page UNE fois,
  // puis chaque élément glisse de son ancienne position vers la nouvelle (technique « FLIP »).
  // Résultat : aucune carte ne se redimensionne image par image, donc rien ne saute.
  function toggleSidebar() {
    if (autoMenu()) return;
    const c = !state.settings.sidebarCollapsed;
    Sound.play('pop');
    const main = document.querySelector('.main');
    const reduce = reducedMotion();
    const cards = reduce ? [] : [...document.querySelectorAll('#grid .card')];
    const before = cards.map((el) => el.getBoundingClientRect());
    const mainBefore = main.getBoundingClientRect().left;
    main.getAnimations().forEach((an) => an.cancel());
    cards.forEach((el) => el.getAnimations().forEach((an) => an.cancel()));

    setSetting({ sidebarCollapsed: c });
    applySidebar();
    if (reduce) return;

    const dx0 = mainBefore - main.getBoundingClientRect().left; // décalage de la zone de droite
    const opts = { duration: 420, easing: 'cubic-bezier(.32, .72, 0, 1)' };
    const vh = innerHeight;
    const after = cards.map((el) => el.getBoundingClientRect()); // mesuré AVANT de lancer le glissement du conteneur
    if (dx0) main.animate([{ transform: `translateX(${dx0}px)` }, { transform: 'none' }], opts);
    cards.forEach((el, i) => {
      const f = before[i], l = after[i];
      if (f.bottom < -50 || f.top > vh + 50) return; // hors écran : inutile
      const dx = f.left - l.left - dx0, dy = f.top - l.top;
      const s = l.width ? f.width / l.width : 1;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(s - 1) < 0.002) return;
      el.style.transformOrigin = '0 0';
      const an = el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${s})` }, { transform: 'none' }], opts);
      an.onfinish = an.oncancel = () => { el.style.transformOrigin = ''; };
    });
  }

  async function setSetting(patch) {
    Object.assign(state.settings, patch);
    applySound();
    await api.setSettings(patch);
  }

  // ---------- Couvertures automatiques ----------
  function queueCovers() {
    if (!state.settings.autoCovers) return;
    for (const g of state.games) {
      if (!g.cover && !g.coverUrl && !g.coverTried && !state.attempted.has(g.id)) {
        state.attempted.add(g.id);
        state.queue.push(g.id);
      }
    }
    pumpCovers();
  }

  let pumping = false;
  async function pumpCovers() {
    if (pumping || !state.queue.length) return;
    pumping = true;
    let found = 0;
    while (state.queue.length) {
      const id = state.queue.shift();
      state.fetching.add(id);
      render();
      try {
        const r = await api.fetchCover(id, {});
        if (r.found) found++;
        if (r.offline) state.queue.length = 0; // pas de connexion : on réessaiera au prochain démarrage
      } catch {}
      state.fetching.delete(id);
      try { const lib = await api.getLibrary(); state.games = lib.games; state.categories = lib.categories || state.categories; state.running = new Set(lib.running); } catch {}
      render();
    }
    pumping = false;
    if (found) Sound.play('success');
  }

  async function refetchCover(g, query) {
    state.fetching.add(g.id);
    render();
    let r;
    try { r = await api.fetchCover(g.id, { force: true, query: query || '' }); } catch { r = { offline: true }; }
    state.fetching.delete(g.id);
    if (r.offline) toast('Impossible de contacter Steam. Vérifie ta connexion Internet.', 'error');
    else if (r.found) { toast('Couverture trouvée !', 'ok'); Sound.play('success'); }
    else toast("Aucune couverture trouvée pour ce nom. Essaie un autre nom, ou choisis une image.", 'error');
    await load();
  }

  // ---------- Catégories : helpers ----------
  const PALETTE = ['#9c7cf0', '#5ec2ff', '#58d68d', '#ffd166', '#ff8f5e', '#ff6b9a', '#3fd0c9', '#e0a3ff'];
  const SUGGESTIONS = ['Jeux', 'Logiciels', 'Émulateurs', 'Outils', 'Médias'];
  const COLORS = ['#9c7cf0', '#7c8cff', '#5ec2ff', '#3fd0c9', '#58d68d', '#a3e04f', '#ffd166', '#ff8f5e', '#ff6b6b', '#ff6b9a', '#e0a3ff', '#c9c3dd'];
  const CAT_ICONS = {
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1"/>',
    gamepad: '<rect x="2" y="6" width="20" height="12" rx="5"/><path d="M6.5 12h4M8.5 10v4"/><circle cx="15.5" cy="11" r="1"/><circle cx="18" cy="13.5" r="1"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>',
    tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    code: '<path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    headphones: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
    film: '<rect x="2" y="2" width="20" height="20" rx="2.2"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    cloud: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    zap: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2z"/>',
    smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    layers: '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>'
  };
  const CAT_ICON_KEYS = Object.keys(CAT_ICONS);
  // Icône de catégorie colorée (les clés viennent d'une liste fermée : aucune donnée externe dans le SVG)
  function catIcon(key, color, size) {
    const wrap = document.createElement('span');
    wrap.innerHTML = `<svg viewBox="0 0 24 24">${CAT_ICONS[key] || CAT_ICONS.tag}</svg>`;
    const svg = wrap.firstElementChild;
    if (color) svg.style.color = color;
    if (size) { svg.style.width = size + 'px'; svg.style.height = size + 'px'; }
    return svg;
  }
  const defaultColor = (name) => PALETTE[hash(name) % PALETTE.length]; // identique au serveur
  // Liste complète : catégories enregistrées + celles déjà utilisées par des jeux
  function allCats() {
    const map = new Map(state.categories.map((c) => [c.name, { icon: 'tag', ...c }]));
    for (const g of state.games) if (g.category && !map.has(g.category)) map.set(g.category, { name: g.category, color: defaultColor(g.category), icon: 'tag' });
    return [...map.values()];
  }
  const catByName = (name) => allCats().find((c) => c.name === name) || { name, color: defaultColor(name || ''), icon: 'tag' };
  const colorFor = (name) => (allCats().find((c) => c.name === name) || {}).color || defaultColor(name || '');

  function visibleGames() {
    let list = state.games.slice();
    const v = state.view;
    if (v === 'fav') list = list.filter((g) => g.favorite);
    else if (v === 'recent') list = list.filter((g) => g.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 24);
    else if (v === 'uncat') list = list.filter((g) => !g.category);
    else if (v.startsWith('cat:')) list = list.filter((g) => g.category === v.slice(4));

    const q = state.query.trim().toLowerCase();
    if (q) list = list.filter((g) => g.name.toLowerCase().includes(q) || (g.category || '').toLowerCase().includes(q));

    if (v !== 'recent') {
      const by = {
        name: (a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }),
        recent: (a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || a.name.localeCompare(b.name, 'fr'),
        playtime: (a, b) => (b.playtime || 0) - (a.playtime || 0) || a.name.localeCompare(b.name, 'fr'),
        added: (a, b) => b.addedAt - a.addedAt
      };
      list.sort(by[state.sort]);
    }
    return list;
  }

  // ---------- Rendu ----------
  function render() {
    // Navigation
    $('#count-all').textContent = state.games.length;
    $('#count-fav').textContent = state.games.filter((g) => g.favorite).length;

    const cats = allCats();
    if (state.view.startsWith('cat:') && !cats.some((c) => c.name === state.view.slice(4))) state.view = 'all';
    if (state.view === 'uncat' && !state.games.some((g) => !g.category)) state.view = 'all';
    $('#cat-title').hidden = cats.length === 0;
    const catsEl = $('#cats');
    catsEl.replaceChildren(
      ...cats.map((c) => {
        const ic = catIcon(c.icon, c.color);
        const el = h('button', { class: 'nav-item', title: c.name, style: { '--c': c.color }, 'data-view': 'cat:' + c.name, onClick: () => setView('cat:' + c.name) },
          ic, h('span', { text: c.name }), h('em', { text: state.games.filter((g) => g.category === c.name).length }));
        makeDrop(el, c.name);
        return el;
      })
    );

    // Puces de filtre au-dessus de la grille
    const chipsEl = $('#chips');
    const showChips = cats.length > 0 && (state.view === 'all' || state.view === 'uncat' || state.view.startsWith('cat:'));
    chipsEl.hidden = !showChips;
    if (showChips) {
      const uncat = state.games.filter((g) => !g.category).length;
      const chip = (label, view, count, cat, dropTo) => {
        const el = h('button', { class: 'fchip' + (state.view === view ? ' on' : ''), style: cat ? { '--c': cat.color } : {}, 'data-snd': 'none',
          onClick: () => { Sound.play('tick'); setView(view); } }, cat ? catIcon(cat.icon, cat.color, 14) : null, label, h('em', { text: count }));
        if (dropTo !== undefined) makeDrop(el, dropTo);
        return el;
      };
      chipsEl.replaceChildren(...[
        chip('Tout', 'all', state.games.length, null),
        ...cats.map((c) => chip(c.name, 'cat:' + c.name, state.games.filter((g) => g.category === c.name).length, c, c.name)),
        uncat ? chip('Sans catégorie', 'uncat', uncat, null, '') : null
      ].filter(Boolean));
    }
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));

    const titles = { all: 'Bibliothèque', fav: 'Favoris', recent: 'Joués récemment', settings: 'Paramètres', stats: 'Statistiques', uncat: 'Sans catégorie' };
    $('#view-title').textContent = titles[state.view] || state.view.slice(4);

    const isSettings = state.view === 'settings', isStats = state.view === 'stats';
    const isPage = isSettings || isStats;
    $('.toolbar').hidden = isPage;
    $('#grid').hidden = isPage;
    $('#settings').hidden = !isSettings;
    $('#stats').hidden = !isStats;
    if (isPage) { $('#empty').hidden = true; if (isSettings) renderSettings(); else renderStats(); return; }

    // Grille
    const list = visibleGames();
    const grid = $('#grid');
    const key = state.view + '|' + state.sort;
    grid.classList.toggle('noanim', key === state.lastKey);
    state.lastKey = key;
    const focusedId = document.activeElement?.closest?.('.card')?.dataset.id; // le clavier garde sa place après un nouveau rendu
    grid.replaceChildren(...[resumeBlock(), ...list.map(card)].filter(Boolean));
    if (!grid.dataset.amb) { grid.dataset.amb = '1'; grid.addEventListener('mouseleave', () => { clearTimeout(amb.timer); amb.timer = setTimeout(() => { if (!amb.show) setAmbient(null); }, 350); }); }
    if (focusedId) grid.querySelector(`.card[data-id="${CSS.escape(focusedId)}"]`)?.focus({ preventScroll: true });
    if (grid.classList.contains('stagger')) [...grid.children].forEach((c, i) => c.style.setProperty('--i', Math.min(i, 14)));

    const empty = $('#empty');
    empty.hidden = list.length > 0;
    if (!empty.hidden) {
      const noGames = state.games.length === 0;
      $('#empty-title').textContent = noGames ? 'Ta bibliothèque est vide' : 'Aucun résultat';
      $('#empty-text').textContent = noGames
        ? 'Ajoute un jeu, scanne un dossier, ou glisse-dépose tes fichiers ici.'
        : state.query ? 'Essaie une autre recherche.'
        : state.view.startsWith('cat:') ? 'Aucun jeu ici pour le moment. Glisse un jeu sur cette catégorie, ou fais un clic droit sur un jeu puis « Catégorie… ».'
        : 'Rien à afficher dans cette section pour le moment.';
      $('#btn-add-empty').hidden = !noGames;
    }
  }

  function card(g) {
    const isRunning = state.running.has(g.id);
    const favBtn = h('button', {
      class: 'fav' + (g.favorite ? ' on' : ''), title: g.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris',
      'data-snd': 'none',
      onClick: (e) => { e.stopPropagation(); Sound.play(g.favorite ? 'unfav' : 'fav'); api.updateGame(g.id, { favorite: !g.favorite }).then(load); }
    }, icon('star'));
    const moreBtn = h('button', { class: 'more', title: 'Options', onClick: (e) => { e.stopPropagation(); openMenu(g, e.clientX, e.clientY, e.currentTarget); } }, icon('dots'));
    const playBtn = h('button', { class: 'play', title: 'Jouer', 'data-snd': 'none', onClick: (e) => { e.stopPropagation(); launch(g); } }, icon('play'));

    const useIcon = !g.coverUrl && !!g.iconUrl;
    const cover = h('div', { class: 'cover' + (useIcon ? ' iconcover' : ''), style: useIcon ? { '--ico': `url("${g.iconUrl}")` } : coverBackground(g) },
      useIcon ? [h('div', { class: 'bgtint' }), h('img', { class: 'gicon', src: g.iconUrl, alt: '', draggable: 'false' })]
        : g.coverUrl ? null : h('span', { class: 'letter', text: g.name.trim().charAt(0).toUpperCase() || '?' }),
      favBtn, moreBtn, playBtn,
      isRunning ? h('span', { class: 'badge' }, h('i'), 'En cours')
        : state.fetching.has(g.id) ? h('span', { class: 'badge info' }, h('i'), 'Couverture…')
        : (!g.exists ? h('span', { class: 'badge warn', text: 'Introuvable' }) : g.finished ? h('span', { class: 'badge done' }, icon('check'), 'Terminé') : null)
    );

    const meta = [fmtPlaytime(g.playtime), g.lastPlayed ? fmtLast(g.lastPlayed) : ''].filter(Boolean).join(' · ');
    return h('article', {
      class: 'card', tabindex: '0', draggable: 'true',
      onDragstart: (e) => { e.dataTransfer.setData('text/arcade-id', g.id); e.dataTransfer.effectAllowed = 'move'; e.currentTarget.classList.add('dragging'); Sound.play('pop'); },
      onDragend: (e) => e.currentTarget.classList.remove('dragging'),
      'data-id': g.id,
      onMouseenter: () => { hoverGameId = g.id; Sound.play('hover'); setAmbient(g); },
      onFocus: () => setAmbient(g),
      onMouseleave: () => { if (hoverGameId === g.id) hoverGameId = null; },
      onClick: () => openDetail(g.id),
      onKeydown: (e) => { if (e.key === 'Enter') { if (e.ctrlKey) launch(g); else openDetail(g.id); } },
      onContextmenu: (e) => { e.preventDefault(); openMenu(g, e.clientX, e.clientY); }
    }, cover, h('div', { class: 'info' }, h('div', { class: 'name', title: g.name, text: g.name }), h('div', { class: 'meta' }, g.category ? catIcon(catByName(g.category).icon, colorFor(g.category), 13) : null, g.category ? `${g.category} · ${meta}` : meta)));
  }



  // ---------- Apparence : thème, couleur d'accent ----------
  const ACCENTS = [['#9c7cf0', 'Violet'], ['#fac775', 'Ambre'], ['#5ea8ff', 'Bleu'], ['#3fd0c9', 'Turquoise'], ['#58d68d', 'Vert'], ['#ffd166', 'Jaune'], ['#ff8f5e', 'Orange'], ['#ff6b9a', 'Rose'], ['#ff6b6b', 'Rouge']];
  function hexToHsl(hex) {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    let hh = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      hh = (hh * 60 + 360) % 360;
    }
    return [hh, s * 100, l * 100];
  }
  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12, aa = s * Math.min(l, 1 - l);
    const f = (n) => Math.round(255 * (l - aa * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
    return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(n >> 16 & 255) + 0.7152 * f(n >> 8 & 255) + 0.0722 * f(n & 255); };
  // Logo : suit la couleur d'accent, sauf si une couleur de logo est choisie dans les réglages
  function logoCols(hex) {
    const [h0, s0] = hexToHsl(hex), s = Math.max(40, Math.min(90, s0));
    return [hslToHex(h0, s, 82), hslToHex(h0, Math.max(35, s - 12), 58)];
  }
  let lastLogoKey = '';
  function applyLogo(acc) {
    const own = /^#[0-9a-f]{6}$/i.test(state.settings.logo || '') ? state.settings.logo.toLowerCase() : acc;
    const [a, b] = logoCols(own), root = document.documentElement;
    root.style.setProperty('--logo-a', a); root.style.setProperty('--logo-b', b);
    // icône de la fenêtre / barre des tâches : PNG nets dessinés à la couleur du logo.
    // Tailles multiples de 19 : chaque case pixel tombe sur des pixels entiers (bords francs, aucun flou).
    const key = a + b;
    if (key === lastLogoKey) return;
    lastLogoKey = key;
    try {
      const P = document.querySelector('#arc-logo path');
      if (!P) return;
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="608" height="608" viewBox="0 0 19 19"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient></defs><rect width="19" height="19" rx="4.2" fill="url(#g)"/><path fill="#1e1828" shape-rendering="crispEdges" d="' + P.getAttribute('d') + '"/></svg>';
      const img = new Image();
      img.onload = () => {
        try {
          const made = [];
          for (const S of [38, 76, 152, 304, 608]) {
            const c = document.createElement('canvas'); c.width = c.height = S;
            c.getContext('2d').drawImage(img, 0, 0, S, S);
            made.push([S, c.toDataURL('image/png')]);
          }
          document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach((l) => l.remove());
          for (const [S, href] of made) {
            const l = document.createElement('link'); l.rel = 'icon'; l.type = 'image/png'; l.sizes = S + 'x' + S; l.href = href;
            document.head.appendChild(l);
          }
        } catch (_) {}
      };
      img.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
    } catch (_) {}
  }
  function reducedMotion() { return (state.settings && state.settings.animations === false) || !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function applyAppearance() {
    const s = state.settings, root = document.documentElement;
    const mode = s.theme === 'light' ? 'light' : s.theme === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : 'dark';
    root.dataset.theme = mode;
    const acc = /^#[0-9a-f]{6}$/i.test(s.accent || '') ? s.accent.toLowerCase() : '#9c7cf0';
    const [hh, ss, ll] = hexToHsl(acc);
    const sat = Math.max(35, Math.min(95, ss));
    root.style.setProperty('--accent', acc);
    const light = mode === 'light';
    // thème clair : tons plus soutenus pour que les textes colorés restent lisibles sur fond blanc
    const l2 = light ? Math.min(60, Math.max(38, ll - 4)) : Math.min(84, ll + (ll > 68 ? 6 : 16)), l3 = light ? Math.max(26, l2 - 16) : Math.max(28, ll - 14);
    root.style.setProperty('--accent-2', `hsl(${hh.toFixed(0)} ${sat.toFixed(0)}% ${l2.toFixed(0)}%)`);
    root.style.setProperty('--accent-3', `hsl(${hh.toFixed(0)} ${sat.toFixed(0)}% ${l3.toFixed(0)}%)`);
    root.style.setProperty('--on-accent', lum(light ? hslToHex(hh, sat, l2) : acc) > 0.34 ? '#121218' : '#ffffff');
    applyLogo(acc);
    const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.content = mode === 'light' ? '#f3f2f8' : '#121218';
    document.body.classList.toggle('ambient-off', s.ambient === false);
    document.body.classList.toggle('bgfx-off', s.bgfx === false);
    document.body.classList.toggle('no-anim', s.animations === false);
    document.body.classList.toggle('fx-off', s.effects === false);
    if (s.ambient === false && !amb.show) setAmbient(null);
  }
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => { if (state.settings.theme === 'auto') applyAppearance(); });

  // ---------- Ambiance : l'image du jeu survolé en grand arrière-plan, et diaporama au repos ----------
  function setAmbient(g, force) {
    if (!amb.layers.length) amb.layers = [...document.querySelectorAll('#ambient i')];
    if (!amb.layers.length) return;
    if (!force && state.settings.ambient === false) { amb.layers.forEach((l) => l.classList.remove('on')); amb.url = null; return; }
    const url = g ? (g.coverUrl || g.iconUrl || null) : null;
    if (url === amb.url) return;
    amb.url = url;
    const prev = amb.layers[amb.cur];
    if (!url) { amb.layers.forEach((l) => l.classList.remove('on')); return; }
    const next = amb.layers[1 - amb.cur];
    next.style.backgroundImage = `url("${url}")`;
    next.classList.remove('kb'); void next.offsetWidth; next.classList.add('on');
    if (amb.show) next.classList.add('kb');
    prev.classList.remove('on');
    amb.cur = 1 - amb.cur;
  }
  const lastInput = { t: performance.now() };
  function stopShow() {
    if (!amb.show) return;
    amb.show = false;
    document.body.classList.remove('show');
    $('#ambient-cap').textContent = '';
    amb.layers.forEach((l) => l.classList.remove('kb'));
    amb.url = null;
    setAmbient(null, true);
  }
  function nextShow() {
    const pool = state.games.filter((g) => g.coverUrl || g.iconUrl);
    if (!pool.length) return;
    if (!amb.order.length || amb.idx >= amb.order.length) { amb.order = pool.map((g) => g.id).sort(() => Math.random() - 0.5); amb.idx = 0; }
    const g = pool.find((x) => x.id === amb.order[amb.idx++]) || pool[0];
    setAmbient(g, true);
    const cap = $('#ambient-cap'); cap.classList.remove('in'); void cap.offsetWidth; cap.textContent = g.name; cap.classList.add('in');
  }
  function noteInput() { lastInput.t = performance.now(); if (amb.show) stopShow(); }
  ['pointerdown', 'keydown', 'wheel'].forEach((ev) => window.addEventListener(ev, noteInput, { capture: true, passive: true }));
  let lastMouse = [0, 0];
  window.addEventListener('pointermove', (e) => { if (Math.abs(e.clientX - lastMouse[0]) + Math.abs(e.clientY - lastMouse[1]) > 6) { lastMouse = [e.clientX, e.clientY]; noteInput(); } }, { passive: true });
  let showAt = 0;
  setInterval(() => {
    const idle = performance.now() - lastInput.t;
    if (!state.settings.slideshow || !booted || !$('#modal-root').hidden || state.view === 'settings') { if (amb.show) stopShow(); return; }
    if (idle < 25000) return;
    if (!amb.show) { amb.show = true; document.body.classList.add('show'); showAt = 0; }
    if (performance.now() - showAt > 9000) { showAt = performance.now(); nextShow(); }
  }, 1000);

  // ---------- Plein écran, mode télé, manette ----------
  function toggleFullscreen() {
    if (document.fullscreenElement) return document.exitFullscreen?.();
    document.documentElement.requestFullscreen?.().catch(() => toast('Le plein écran n\'est pas disponible ici.', 'error'));
  }
  let tvOn = false, tvPrev = null, cursorTimer = null;
  // Le curseur n'est masqué qu'en mode télé ET en plein écran, après quelques secondes sans bouger la souris
  const showCursor = () => {
    document.body.classList.remove('nocursor');
    clearTimeout(cursorTimer);
    if (tvOn && document.fullscreenElement) cursorTimer = setTimeout(() => document.body.classList.add('nocursor'), 2500);
  };
  const forceShowCursor = () => { clearTimeout(cursorTimer); document.body.classList.remove('nocursor'); };
  function syncTvSwitch() { const i = document.querySelector('#row-tv input'); if (i) i.checked = tvOn; }
  function setTv(on) {
    if (on === tvOn) return;
    tvOn = on;
    document.body.classList.toggle('tv', on);
    if (on) {
      tvPrev = !!state.settings.sidebarCollapsed;
      if (!tvPrev) toggleSidebar();
      if (!document.fullscreenElement) toggleFullscreen();
      window.addEventListener('pointermove', showCursor);
      showCursor();
    } else {
      window.removeEventListener('pointermove', showCursor);
      forceShowCursor();
      if (tvPrev === false && state.settings.sidebarCollapsed) toggleSidebar();
      tvPrev = null;
      if (document.fullscreenElement) document.exitFullscreen?.();
    }
    syncTvSwitch();
  }
  document.addEventListener('fullscreenchange', () => {
    document.body.classList.toggle('fs', !!document.fullscreenElement);
    // sortie du plein écran (Échap, F11, bouton…) : on quitte aussi le mode télé et on rend la souris
    if (!document.fullscreenElement) { forceShowCursor(); if (tvOn) setTv(false); }
    else showCursor();
  });
  // la souris doit toujours réapparaître quand on quitte la fenêtre ou qu'on y revient
  window.addEventListener('blur', forceShowCursor);
  window.addEventListener('focus', showCursor);
  document.addEventListener('visibilitychange', () => { if (document.hidden) forceShowCursor(); else showCursor(); });
  document.addEventListener('mouseleave', forceShowCursor);
  document.addEventListener('mouseenter', showCursor);

  const pad = { held: {}, next: {}, connected: false };
  const viewOrder = () => ['all', 'fav', 'recent', 'stats', ...allCats().map((c) => 'cat:' + c.name)];
  function padPress(name) {
    document.body.classList.add('pad');
    noteInput();
    if (!$('#modal-root').hidden) { if (name === 'B') closeModal(); return; }
    if (name === 'Start') return toggleFullscreen();
    if (name === 'LB' || name === 'RB') {
      const v = viewOrder(); let i = v.indexOf(state.view); if (i < 0) i = 0;
      i = (i + (name === 'RB' ? 1 : v.length - 1)) % v.length; Sound.play('nav'); return setView(v[i]);
    }
    if (detailId) {
      const g = state.games.find((x) => x.id === detailId); if (!g) return;
      if (name === 'A') return launch(g);
      if (name === 'B') return closeDetail();
      if (name === 'X') { Sound.play(g.favorite ? 'unfav' : 'fav'); return api.updateGame(g.id, { favorite: !g.favorite }).then(load); }
      return;
    }
    if (state.view === 'settings' || state.view === 'stats') { if (name === 'B') setView('all'); return; }
    if (name.startsWith('Arrow')) return moveFocus(name);
    const g = kbGame();
    if (name === 'B') { if (state.view !== 'all') setView('all'); return; }
    if (!g) return;
    if (name === 'A') return launch(g);
    if (name === 'Y') return openDetail(g.id);
    if (name === 'X') { Sound.play(g.favorite ? 'unfav' : 'fav'); api.updateGame(g.id, { favorite: !g.favorite }).then(load); }
  }
  function pollPad() {
    const gp = [...(navigator.getGamepads?.() || [])].find((x) => x && x.connected);
    if (gp) {
      const b = gp.buttons, ax = gp.axes;
      const st = {
        A: b[0]?.pressed, B: b[1]?.pressed, X: b[2]?.pressed, Y: b[3]?.pressed, LB: b[4]?.pressed, RB: b[5]?.pressed, Start: b[9]?.pressed,
        ArrowUp: b[12]?.pressed || (ax[1] < -0.6), ArrowDown: b[13]?.pressed || (ax[1] > 0.6),
        ArrowLeft: b[14]?.pressed || (ax[0] < -0.6), ArrowRight: b[15]?.pressed || (ax[0] > 0.6)
      };
      const now = performance.now();
      for (const k of Object.keys(st)) {
        if (st[k]) {
          if (!pad.held[k]) { pad.held[k] = true; pad.next[k] = now + 380; padPress(k); }
          else if (k.startsWith('Arrow') && now >= pad.next[k]) { pad.next[k] = now + 130; padPress(k); }
        } else pad.held[k] = false;
      }
    }
    requestAnimationFrame(pollPad);
  }
  window.addEventListener('gamepadconnected', () => {
    if (!pad.connected) { pad.connected = true; toast('Manette détectée : croix = naviguer, A = jouer, Y = fiche, X = favori, LB/RB = sections.', 'ok'); Sound.play('success'); }
  });
  requestAnimationFrame(pollPad);
  window.addEventListener('pointerdown', () => document.body.classList.remove('pad'), { capture: true });

  // ---------- Statistiques ----------
  function fmtHours(sec) {
    if (!sec || sec < 60) return '0 min';
    const m = Math.round(sec / 60);
    if (m < 60) return m + ' min';
    const hrs = Math.floor(m / 60), r = m % 60;
    return r ? `${hrs} h ${String(r).padStart(2, '0')}` : `${hrs} h`;
  }
  const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  let statsUpdated = Date.now();
  async function refreshStats(manual) {
    const btn = document.getElementById('st-refresh');
    if (btn) btn.classList.add('spin');
    try {
      const lib = await api.getLibrary();
      state.games = lib.games; state.daily = lib.daily || {}; state.running = new Set(lib.running);
      statsUpdated = Date.now();
      evalAchievements();
      if (state.view === 'stats') renderStats();
      if (manual) Sound.play('tick');
    } catch (e) { if (manual) toast(e.message || String(e), 'error'); }
    finally { setTimeout(() => document.getElementById('st-refresh')?.classList.remove('spin'), 500); }
  }
  setInterval(() => { if (state.view === 'stats' && !document.hidden && $('#modal-root').hidden) refreshStats(false); }, 4000);
  function statsHeader() {
    const live = [...state.running].map((id) => state.games.find((g) => g.id === id)?.name).filter(Boolean);
    return h('div', { class: 'st-top' },
      live.length ? h('span', { class: 'st-live' }, h('i'), 'En cours : ' + live.join(', ')) : h('span', { class: 'st-upd', text: 'Aucun jeu en cours' }),
      h('span', { class: 'spacer' }),
      h('span', { class: 'st-upd', text: 'Mis à jour à ' + new Date(statsUpdated).toLocaleTimeString(ARC.locale) }),
      h('button', { class: 'btn ghost', id: 'st-refresh', title: 'Actualiser les statistiques', 'data-snd': 'none', onClick: () => refreshStats(true) },
        h('span', { class: 'ico-r' }), 'Actualiser'));
  }
  function renderStats() {
    const sc = $('#stats').scrollTop;
    renderStatsBody();
    const top = statsHeader();
    top.querySelector('.ico-r').innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>';
    $('#stats').prepend(top);
    $('#stats').scrollTop = sc;
  }
  function renderStatsBody() {
    const games = state.games, daily = state.daily || {};
    const total = games.reduce((s, g) => s + (g.playtime || 0), 0);
    const launches = games.reduce((s, g) => s + (g.launches || 0), 0);
    const never = games.filter((g) => !g.playtime || g.playtime < 60).length;
    // 14 derniers jours
    const days = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i); days.push({ d, sec: daily[dayKey(d)] || 0 }); }
    const week = days.slice(7).reduce((s, x) => s + x.sec, 0), prevWeek = days.slice(0, 7).reduce((s, x) => s + x.sec, 0);
    // série de jours consécutifs (aujourd'hui, sinon depuis hier)
    let streak = 0; const cur = new Date(); cur.setHours(12, 0, 0, 0);
    if (!(daily[dayKey(cur)] > 0)) cur.setDate(cur.getDate() - 1);
    while (daily[dayKey(cur)] > 0 && streak < 400) { streak++; cur.setDate(cur.getDate() - 1); }
    const tile = (v, l, sub) => h('div', { class: 'st-tile' }, h('div', { class: 'st-v', text: v }), h('div', { class: 'st-l', text: l }), sub ? h('div', { class: 'st-s', text: sub }) : null);

    if (!games.length || (!total && !launches)) {
      $('#stats').replaceChildren(h('div', { class: 'st-empty' }, h('img', { src: 'logo.png', alt: '' }), h('h2', { text: 'Pas encore de statistiques' }), h('p', { text: 'Lance un jeu depuis Arcade : son temps de jeu, tes séries de jours et tes jeux préférés apparaîtront ici.' })));
      return;
    }
    const mx = Math.max(1, ...days.map((x) => x.sec));
    const bars = h('div', { class: 'st-bars' }, ...days.map((x, i) => h('div', { class: 'st-bar' + (i === 13 ? ' today' : ''), title: `${x.d.toLocaleDateString(ARC.locale, { weekday: 'long', day: 'numeric', month: 'long' })} : ${fmtHours(x.sec)}` },
      h('div', { class: 'st-col' }, h('i', { style: { height: x.sec ? Math.max(4, Math.round(x.sec / mx * 100)) + '%' : '0%' } })),
      h('span', { text: x.d.toLocaleDateString(ARC.locale, { weekday: 'short' }).slice(0, 3) }))));
    const delta = prevWeek ? Math.round((week - prevWeek) / prevWeek * 100) : null;
    const top = [...games].filter((g) => g.playtime >= 60).sort((a, b) => b.playtime - a.playtime).slice(0, 8);
    const topMax = top[0]?.playtime || 1;
    const thumb = (g) => g.coverUrl ? h('div', { class: 'st-th', style: { backgroundImage: `url("${g.coverUrl}")` } })
      : g.iconUrl ? h('div', { class: 'st-th ico' }, h('img', { src: g.iconUrl, alt: '' })) : h('div', { class: 'st-th', style: coverBackground(g) }, h('b', { text: g.name.trim().charAt(0).toUpperCase() }));
    const topList = h('div', { class: 'st-list' }, ...top.map((g, i) => h('button', { class: 'st-row', 'data-snd': 'none', onClick: () => openDetail(g.id) },
      h('span', { class: 'st-rank', text: String(i + 1) }), thumb(g),
      h('span', { class: 'st-name', text: g.name }),
      h('span', { class: 'st-meter' }, h('i', { style: { width: Math.max(3, g.playtime / topMax * 100) + '%' } })),
      h('span', { class: 'st-time', text: fmtHours(g.playtime) }))));
    // par catégorie
    const byCat = new Map();
    games.forEach((g) => { const k = g.category || ''; byCat.set(k, (byCat.get(k) || 0) + (g.playtime || 0)); });
    const catRows = [...byCat.entries()].filter(([, v]) => v >= 60).sort((a, b) => b[1] - a[1]);
    const catMax = catRows[0]?.[1] || 1;
    const catList = catRows.length ? h('div', { class: 'st-list' }, ...catRows.map(([k, v]) => {
      const c = k ? catByName(k) : null, col = k ? colorFor(k) : 'var(--muted)';
      return h('div', { class: 'st-row static' }, h('span', { class: 'st-cat', style: { '--c': col } }, k ? catIcon(c.icon, col, 16) : null), h('span', { class: 'st-name', text: k || 'Sans catégorie' }),
        h('span', { class: 'st-meter' }, h('i', { style: { width: Math.max(3, v / catMax * 100) + '%', background: col } })), h('span', { class: 'st-time', text: fmtHours(v) }));
    })) : null;
    const recent = [...games].filter((g) => g.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 5);
    $('#stats').replaceChildren(
      h('div', { class: 'st-tiles' },
        tile(fmtHours(total), 'Temps de jeu total', `sur ${games.length} jeu${games.length > 1 ? 'x' : ''}`),
        tile(String(streak), streak > 1 ? 'Jours d\'affilée' : 'Jour d\'affilée', streak ? 'Continue comme ça !' : 'Joue aujourd\'hui pour lancer une série'),
        tile(String(launches), 'Lancements', never ? `${never} jamais joué${never > 1 ? 's' : ''}` : 'Tout a été essayé'),
        tile(fmtHours(week), 'Cette semaine', delta === null ? '' : (delta >= 0 ? '+' : '') + delta + ' % vs semaine passée')),
      h('div', { class: 'st-card' }, h('div', { class: 'st-h' }, h('b', { text: '14 derniers jours' }), h('small', { text: 'Le détail jour par jour est enregistré à partir de cette version.' })), bars),
      h('div', { class: 'st-two' },
        h('div', { class: 'st-card' }, h('div', { class: 'st-h' }, h('b', { text: 'Les plus joués' })), top.length ? topList : h('div', { class: 'st-note', text: 'Pas encore assez de temps de jeu.' })),
        h('div', { class: 'st-card' }, h('div', { class: 'st-h' }, h('b', { text: 'Par catégorie' })), catList || h('div', { class: 'st-note', text: 'Ajoute des catégories à tes jeux pour voir la répartition.' }),
          recent.length ? h('div', { class: 'st-h sub' }, h('b', { text: 'Joués récemment' })) : null,
          recent.length ? h('div', { class: 'st-list' }, ...recent.map((g) => h('button', { class: 'st-row', 'data-snd': 'none', onClick: () => openDetail(g.id) }, thumb(g), h('span', { class: 'st-name', text: g.name }), h('span', { class: 'st-time', text: fmtLast(g.lastPlayed) })))) : null)));
  }

  // ---------- Page de détail d'un jeu ----------
  function fmtDate(ts) {
    if (!ts || ts < 1e11) return '—';
    return new Date(ts).toLocaleDateString(ARC.locale, { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function fmtLastLong(ts) {
    if (!ts) return 'Jamais';
    const rel = fmtLast(ts);
    const hm = new Date(ts).toLocaleTimeString(ARC.locale, { hour: '2-digit', minute: '2-digit' });
    return rel === "Aujourd'hui" || rel === 'Hier' ? `${rel} à ${hm}` : fmtDate(ts);
  }

  const amb = { layers: [], cur: 0, url: null, timer: null, show: false, idx: 0, order: [], tick: null };
  let detailId = null;
  let hoverGameId = null;
  function openDetail(id) {
    if (!state.games.some((g) => g.id === id)) return;
    detailId = id;
    Sound.play('open');
    renderDetail();
  }
  function closeDetail() {
    const el = document.getElementById('detail');
    if (!el) return;
    detailId = null;
    Sound.play('close');
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 220);
  }

  function renderDetail() {
    const old = document.getElementById('detail');
    const g = state.games.find((x) => x.id === detailId);
    if (!g) { if (old) old.remove(); detailId = null; return; }
    const keepScroll = old ? old.scrollTop : 0;
    const isRunning = state.running.has(g.id);
    const cat = g.category ? catByName(g.category) : null;
    const img = g.coverUrl || g.iconUrl || '';

    const hero = h('div', { class: 'd-hero' },
      img ? h('div', { class: 'd-blur', style: { backgroundImage: `url("${img}")` } }) : h('div', { class: 'd-blur', style: coverBackground(g) }),
      h('div', { class: 'd-shade' }));

    const art = g.coverUrl
      ? h('div', { class: 'd-art', style: { backgroundImage: `url("${g.coverUrl}")` } })
      : g.iconUrl
        ? h('div', { class: 'd-art iconcover', style: { '--ico': `url("${g.iconUrl}")` } }, h('div', { class: 'bgtint' }), h('img', { class: 'gicon', src: g.iconUrl, alt: '', draggable: 'false' }))
        : h('div', { class: 'd-art', style: coverBackground(g) }, h('span', { class: 'letter', text: g.name.trim().charAt(0).toUpperCase() || '?' }));

    const playBtn = h('button', { class: 'btn primary d-play', 'data-snd': 'none', onClick: () => launch(g) }, icon('play'), isRunning ? 'En cours…' : 'Jouer');
    if (isRunning) playBtn.disabled = true;
    const favBtn = h('button', { class: 'btn ghost d-fav' + (g.favorite ? ' on' : ''), 'data-snd': 'none', title: g.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris',
      onClick: async () => { Sound.play(g.favorite ? 'unfav' : 'fav'); await api.updateGame(g.id, { favorite: !g.favorite }); await load(); } }, icon('star'), g.favorite ? 'Favori' : 'Favoris');

    const stat = (ic, label, value, sub, bar) => h('div', { class: 'd-stat' },
      h('div', { class: 'd-stat-ic' }, icon(ic)),
      h('div', { class: 'd-stat-body' },
        h('div', { class: 'd-stat-l', text: label }),
        h('div', { class: 'd-stat-v', text: value }),
        bar != null ? h('div', { class: 'd-bar' }, h('i', { style: { width: Math.max(4, Math.round(bar * 100)) + '%' } })) : null,
        sub ? h('div', { class: 'd-stat-s', text: sub }) : null));
    const maxPlay = Math.max(1, ...state.games.map((x) => x.playtime || 0));
    const played = g.playtime && g.playtime >= 60;
    const stats = h('div', { class: 'd-stats' },
      stat('clock', 'Temps de jeu', played ? fmtPlaytime(g.playtime) : '0 min', played ? '' : 'Jamais joué', played ? g.playtime / maxPlay : null),
      stat('hist', 'Dernière session', g.lastPlayed ? fmtLast(g.lastPlayed) : 'Jamais', g.lastPlayed ? fmtLastLong(g.lastPlayed) : ''),
      stat('calendar', 'Ajouté le', fmtDate(g.addedAt)),
      stat('rocket', 'Lancements', String(g.launches || 0)));

    const el = h('section', { id: 'detail', class: 'detail' },
      hero,
      h('button', { class: 'd-back', 'data-snd': 'none', title: 'Retour (Échap)', onClick: closeDetail }, '←', h('span', { text: 'Bibliothèque' })),
      h('div', { class: 'd-content' },
        h('div', { class: 'd-head' },
          art,
          h('div', { class: 'd-title' },
            h('div', { class: 'd-tags' },
              cat ? h('span', { class: 'd-cat', style: { '--c': cat.color } }, catIcon(cat.icon, cat.color, 14), cat.name) : null,
              isRunning ? h('span', { class: 'd-run' }, h('i'), 'En cours') : null,
              g.finished ? h('span', { class: 'd-cat', style: { '--c': 'var(--ok)' } }, icon('check'), 'Terminé') : null,
              !g.exists ? h('span', { class: 'd-warn', text: 'Fichier introuvable' }) : null),
            h('h1', { text: g.name }),
            h('div', { class: 'd-actions' }, playBtn, favBtn),
            h('div', { class: 'd-tools' },
              h('button', { class: 'btn ghost', 'data-snd': 'none', onClick: () => openGameModal(g) }, icon('edit'), 'Modifier'),
              h('button', { class: 'btn ghost', 'data-snd': 'none', onClick: () => openCatPickModal(g) }, icon('tag'), 'Catégorie'),
              h('button', { class: 'btn ghost', 'data-snd': 'none', onClick: async () => { Sound.play(g.finished ? 'unfav' : 'success'); await api.updateGame(g.id, { finished: !g.finished }); await load(); } }, icon('check'), g.finished ? 'Pas terminé' : 'Terminé'),
              h('button', { class: 'btn ghost', 'data-snd': 'none', onClick: () => api.reveal(g.id) }, icon('folder'), 'Dossier')))),
        stats,
        h('div', { class: 'd-block' },
          h('div', { class: 'd-block-h' },
            h('div', { class: 'd-block-t', text: 'Emplacement' }),
            g.target ? h('button', { class: 'btn ghost d-copy', 'data-snd': 'none', title: 'Copier le chemin', onClick: () => { try { navigator.clipboard.writeText(g.target); toast('Chemin copié.', 'ok'); } catch (e) { toast('Copie impossible.', 'error'); } } }, icon('copy'), 'Copier') : null),
          h('div', { class: 'd-path', text: g.target || '—' }),
          g.args ? h('div', { class: 'd-path dim', text: 'Arguments : ' + g.args }) : null),
        h('div', { class: 'd-foot' },
          h('button', { class: 'btn danger', 'data-snd': 'none', onClick: () => confirmRemove(g) }, icon('trash'), 'Retirer de la bibliothèque'))));
    if (old) { old.replaceWith(el); el.classList.add('still'); } else $('.main').append(el);
    el.scrollTop = keepScroll;
  }

  function setView(v) { detailId = null; document.getElementById('detail')?.remove(); state.view = v; render(); }

  // ---------- Lancement ----------
  async function launch(g) {
    const r = await api.launch(g.id);
    if (!r.ok) return toast(r.error || 'Impossible de lancer ce jeu.', 'error');
    Sound.play('launch');
    toast(`${g.name} se lance…`, 'ok');
    await load();
  }

  // ---------- Menu contextuel ----------
  function openMenu(g, x, y, anchor) {
    const menu = $('#ctx');
    if (anchor) { const r = anchor.getBoundingClientRect(); x = r.left; y = r.bottom + 4; }
    const item = (label, ic, fn, cls = '') => h('button', { class: cls, onClick: () => { closeMenu(); fn(); } }, icon(ic), label);
    menu.replaceChildren(
      item('Jouer', 'play', () => launch(g)),
      item('Voir la fiche', 'folder', () => openDetail(g.id)),
      item(g.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris', 'star', () => api.updateGame(g.id, { favorite: !g.favorite }).then(load)),
      item(g.finished ? 'Pas terminé' : 'Marquer comme terminé', 'check', () => { Sound.play(g.finished ? 'unfav' : 'success'); toast(g.finished ? `${g.name} remis dans les jeux à finir.` : `${g.name} marqué comme terminé.`, 'ok'); api.updateGame(g.id, { finished: !g.finished }).then(load); }),
      h('hr'),
      item('Modifier…', 'edit', () => openGameModal(g)),
      item('Catégorie…', 'tag', () => openCatPickModal(g)),
      item('Retrouver la couverture', 'image', () => refetchCover(g)),
      item("Actualiser l'icône", 'image', async () => {
        const r = await api.refreshIcon(g.id);
        toast(r.found ? 'Icône mise à jour.' : "Aucune icône trouvée pour ce jeu.", r.found ? 'ok' : 'error');
        load();
      }),
      item('Ouvrir le dossier', 'folder', () => api.reveal(g.id)),
      h('hr'),
      item('Retirer de la bibliothèque', 'trash', () => confirmRemove(g), 'danger')
    );
    menu.hidden = false;
    Sound.play('pop');
    const w = menu.offsetWidth, hh = menu.offsetHeight;
    menu.style.left = Math.min(x, innerWidth - w - 10) + 'px';
    menu.style.top = Math.min(y, innerHeight - hh - 10) + 'px';
  }
  const closeMenu = () => { $('#ctx').hidden = true; };

  // ---------- Modales ----------
  function openModal(content) {
    const root = $('#modal-root');
    root.replaceChildren(content);
    if (root.hidden) Sound.play('open');
    root.hidden = false;
    root.onmousedown = (e) => { if (e.target === root) closeModal(); };
  }
  function closeModal() { const r = $('#modal-root'); if (!r.hidden) Sound.play('close'); r.hidden = true; r.replaceChildren(); }

  // ---------- Succès Arcade ----------
  // tier : 1 bronze, 2 argent, 3 or, 4 légende (violet)
  const ACH = [
    { id: 'g1', n: 'Premier pas', d: 'Ajoute ton premier jeu.', ic: 'folder', t: 1, goal: 1, unit: 'jeu', k: 'games' },
    { id: 'g10', n: 'Collectionneur', d: 'Ajoute 10 jeux.', ic: 'folder', t: 1, goal: 10, unit: 'jeux', k: 'games' },
    { id: 'g25', n: 'Grande collection', d: 'Ajoute 25 jeux.', ic: 'crown', t: 2, goal: 25, unit: 'jeux', k: 'games' },
    { id: 'g50', n: 'Bibliothécaire', d: 'Ajoute 50 jeux.', ic: 'crown', t: 3, goal: 50, unit: 'jeux', k: 'games' },
    { id: 't1', n: 'Échauffement', d: 'Cumule 1 h de jeu.', ic: 'clock', t: 1, goal: 3600, unit: 'h', k: 'sec' },
    { id: 't10', n: 'Habitué', d: 'Cumule 10 h de jeu.', ic: 'clock', t: 2, goal: 36000, unit: 'h', k: 'sec' },
    { id: 't100', n: 'Centurion', d: 'Cumule 100 h de jeu.', ic: 'clock', t: 3, goal: 360000, unit: 'h', k: 'sec' },
    { id: 't500', n: 'Légende vivante', d: 'Cumule 500 h de jeu.', ic: 'crown', t: 4, goal: 1800000, unit: 'h', k: 'sec' },
    { id: 's3', n: 'Sur la lancée', d: 'Joue 3 jours d\'affilée.', ic: 'flame', t: 1, goal: 3, unit: 'jours', k: 'streak' },
    { id: 's7', n: 'Une semaine d\'affilée', d: 'Joue 7 jours d\'affilée.', ic: 'flame', t: 2, goal: 7, unit: 'jours', k: 'streak' },
    { id: 's30', n: 'Mois sans faute', d: 'Joue 30 jours d\'affilée.', ic: 'flame', t: 4, goal: 30, unit: 'jours', k: 'streak' },
    { id: 'l10', n: 'Prêt à jouer', d: 'Lance des jeux 10 fois.', ic: 'rocket', t: 1, goal: 10, unit: 'lancements', k: 'launches' },
    { id: 'l100', n: 'Toujours partant', d: 'Lance des jeux 100 fois.', ic: 'rocket', t: 3, goal: 100, unit: 'lancements', k: 'launches' },
    { id: 'm10', n: 'Marathon', d: 'Passe 10 h sur un seul jeu.', ic: 'hist', t: 3, goal: 36000, unit: 'h', k: 'maxGame' },
    { id: 'f5', n: 'Coups de cœur', d: 'Mets 5 jeux en favoris.', ic: 'star', t: 1, goal: 5, unit: 'favoris', k: 'favs' },
    { id: 'd1', n: 'Générique de fin', d: 'Marque un jeu comme terminé.', ic: 'check', t: 1, goal: 1, unit: 'terminé', k: 'finished' },
    { id: 'd10', n: 'Complétionniste', d: 'Marque 10 jeux comme terminés.', ic: 'check', t: 3, goal: 10, unit: 'terminés', k: 'finished' },
    { id: 'c3', n: 'Organisé', d: 'Crée 3 catégories.', ic: 'tag', t: 1, goal: 3, unit: 'catégories', k: 'cats' },
  ];
  function achStats() {
    const g = state.games || [], daily = state.daily || {};
    const days = Object.keys(daily).filter((k) => daily[k] > 0).sort();
    let best = 0, run = 0, prev = null;
    for (const k of days) {
      const t = Date.parse(k + 'T12:00:00');
      run = prev !== null && Math.round((t - prev) / 86400000) === 1 ? run + 1 : 1;
      best = Math.max(best, run); prev = t;
    }
    return { games: g.length, sec: g.reduce((s, x) => s + (x.playtime || 0), 0), launches: g.reduce((s, x) => s + (x.launches || 0), 0),
      favs: g.filter((x) => x.favorite).length, finished: g.filter((x) => x.finished).length, cats: (state.categories || []).length,
      maxGame: g.reduce((m, x) => Math.max(m, x.playtime || 0), 0), streak: best };
  }
  const achDone = () => (state.settings && state.settings.achievements) || {};
  function updateAchCount() { const e = $('#ach-count'); if (e) e.textContent = Object.keys(achDone()).length + '/' + ACH.length; }
  let achBusy = false;
  async function evalAchievements() {
    if (achBusy || !state.settings) return; achBusy = true;
    try {
      const st = achStats(), done = achDone(), fresh = {};
      const now = new Date().toISOString().slice(0, 10);
      for (const a of ACH) if (!done[a.id] && st[a.k] >= a.goal) fresh[a.id] = now;
      const ids = Object.keys(fresh);
      if (ids.length) {
        state.settings.achievements = { ...done, ...fresh };
        try { await api.setSettings({ achievements: fresh }); } catch (_) {}
        if (ids.length > 3) toast(ids.length + ' succès débloqués ! Ouvre « Succès » pour les voir.', 'ok');
        else ids.forEach((id, i) => setTimeout(() => toast('Succès débloqué : ' + ACH.find((a) => a.id === id).n, 'ok'), i * 700));
        Sound.play('success');
        if (!$('#modal-root').hidden && $('#modal-root').querySelector('.ach-modal')) openAch();
      }
    } finally { achBusy = false; updateAchCount(); }
  }
  const achFmt = (a, v) => a.unit === 'h' ? (Math.floor(v / 360) / 10).toString().replace('.', ARC.decimal) : String(Math.floor(v));
  function openAch() {
    const st = achStats(), done = achDone();
    const total = ACH.length, got = ACH.filter((a) => done[a.id]).length;
    openModal(h('div', { class: 'modal ach-modal' },
      h('h3', { text: 'Succès' }),
      h('div', { class: 'ach-sum' }, h('b', { text: got + ' / ' + total + ' débloqués' }),
        h('div', { class: 'd-bar' }, h('i', { style: { width: Math.max(2, Math.round(got / total * 100)) + '%' } }))),
      h('div', { class: 'modal-body ach-grid' }, ACH.map((a) => {
        const ok = !!done[a.id], cur = Math.min(st[a.k] || 0, a.goal);
        return h('div', { class: 'ach t' + a.t + (ok ? ' ok' : '') },
          h('div', { class: 'ach-ic' }, icon(ok ? a.ic : 'trophy')),
          h('div', { class: 'ach-tx' },
            h('b', { text: a.n }), h('small', { text: a.d }),
            ok ? h('span', { class: 'ach-date', text: 'Débloqué le ' + done[a.id].split('-').reverse().join('/') })
               : h('div', { class: 'ach-prog' }, h('div', { class: 'd-bar' }, h('i', { style: { width: Math.round(cur / a.goal * 100) + '%' } })), h('span', { text: achFmt(a, cur) + ' / ' + achFmt(a, a.goal) + ' ' + a.unit }))));
      })),
      h('div', { class: 'modal-foot' }, h('button', { class: 'btn primary', onClick: closeModal, text: 'Fermer' }))
    ));
  }
  setInterval(() => { if (!document.hidden) api.getLibrary().then((lib) => { state.games = lib.games; state.daily = lib.daily || {}; evalAchievements(); }).catch(() => {}); }, 30000);

  // ---------- Nouveautés (historique des versions) ----------
  const CHANGELOG = [
    { v: '2.3.2', title: 'Couleur perso', items: ['Le bouton « couleur personnalisée » (le rond arc-en-ciel) est remplacé par un rond discret en pointillés avec un « + » ; une fois une couleur choisie, il prend cette couleur et affiche un crayon.'] },
    { v: '2.3.1', title: 'Finitions', items: ['Panneau Performances : les cadres sont mieux espacés.', 'L\'indicateur de performances s\'affiche bien dans le menu quand il s\'ouvre.'] },
    { v: '2.3.0', title: 'Performances', items: ['Nouveau panneau « Performances » dans les réglages : mémoire (moteur d\'affichage compris), processeur et temps d\'ouverture, mesurés en direct.', 'Mode économie : les animations se mettent en pause quand la fenêtre est cachée ou pendant un jeu. Indicateur optionnel en bas du menu.', 'Arcade se rouvre beaucoup plus vite quand tu quittes un jeu.', 'Installation plus rapide : copie des fichiers en parallèle et moins d\'attente.'] },
    { v: '2.2.0', title: 'Entretien et mises à jour', items: ['Arcade vérifie s\'il existe une nouvelle version et te propose de l\'installer en un clic : il se télécharge, se met à jour tout seul et se rouvre (réglable, avec un bouton « Rechercher » dans les réglages).', 'Lancement en administrateur : les arguments et le dossier de travail du jeu sont maintenant transmis.', 'Arguments de lancement pris en compte aussi pour les fichiers .bat et .cmd.', 'Nouveau dans les réglages : « Vérifier la bibliothèque » (jeux introuvables et doublons, avec fusion) et « Désinstaller Arcade » (avec ou sans ta bibliothèque).'] },
    { v: '2.0.0', title: 'Arcade devient une vraie application', items: ['Réécrit en Rust : Arcade a sa propre fenêtre et n\'a plus besoin d\'Edge ni du serveur PowerShell.', 'ArcadeSetup.exe : tu choisis le dossier d\'installation, et tes données (bibliothèque, pochettes, journal) sont rangées dans le sous-dossier data.', 'Menu automatique : il se réduit tout seul, et en s\'ouvrant au survol il pousse le contenu vers la droite (réglable).', 'Glisser-déposer de raccourcis et de .exe directement dans la fenêtre.', 'Temps de jeu compté en direct, rappel de pause et import Steam / Epic / GOG.', 'Arcade se réduit quand tu lances un jeu, et se rouvre tout seul quand le jeu se ferme.', 'Un clic sur le logo change le mode du menu : automatique, déplié en permanence ou fermé en permanence.', 'Démarrage avec Windows et zone de notification.', 'Choix de la langue : français ou anglais (Paramètres > Apparence).'] },
    { v: '1.19.0', title: 'Succès Arcade', items: ['Nouveau bouton « Succès » : 18 badges à débloquer (jeux ajoutés, heures cumulées, jours d\'affilée, favoris, jeux terminés…).', 'Une notification s\'affiche à chaque succès débloqué ; ta progression est enregistrée.'] },
    { v: '1.18.0', title: 'Nouveautés', items: ['Nouveau bouton « Nouveautés » : l\'historique des changements de chaque version.', 'Un point violet t\'indique quand une nouvelle version est arrivée.'] },
    { v: '1.17.0', title: 'Réinitialisation et installeur', items: ['Paramètres > Réinitialisation : remet Arcade à neuf (bibliothèque, catégories, statistiques, couvertures, réglages).', 'Arcade.exe : un vrai installeur avec choix du dossier, raccourcis Bureau et menu Démarrer, mise à jour et désinstallation.'] },
    { v: '1.16.0', title: 'Fiche d\'un jeu refaite', items: ['Fond coloré, grande jaquette lumineuse, boutons mieux rangés.', 'Statistiques avec icônes et barre de temps de jeu comparée à tes autres jeux.', 'Nouveau bouton « Terminé » et bouton pour copier le chemin du jeu.'] },
    { v: '1.15', title: 'Performance et finitions', items: ['Paramètres > Performance : coupe les animations et/ou les effets visuels (flous, lueurs, fond animé).', 'Le fond du lanceur reprend les pixels scintillants de l\'écran de chargement.', 'Signature N4ssD discrète en bas à droite.', 'Contour doux et lumineux autour d\'un jeu cliqué.', 'Le zoom agrandit aussi la rangée « Reprendre ».'] },
    { v: '1.14', title: 'Import, reprise et statistiques en direct', items: ['Import automatique des jeux Steam, Epic et GOG.', 'Rangée « Reprendre » en haut de la bibliothèque.', 'Bouton « Surprends-moi » : tire un jeu au hasard (jeux jamais finis ou jamais lancés).', 'Temps de jeu et statistiques mis à jour en direct, avec un bouton pour actualiser.', 'Zoom des cases par crans précis (seule la case grandit).', 'Nouveau logo pixel : couleur d\'origine violette, modifiable dans les réglages.', 'Animation sur tous les boutons, écran de chargement amélioré, icône de fenêtre en haute qualité.'] },
  ];
  const seenVer = () => { try { return localStorage.getItem('arcade.seenVersion') || ''; } catch (_) { return ''; } };
  function refreshNewsDot() { const d = $('#news-dot'); if (d) d.hidden = seenVer() === APP_VERSION; }
  function openNews() {
    try { localStorage.setItem('arcade.seenVersion', APP_VERSION); } catch (_) {}
    refreshNewsDot();
    openModal(h('div', { class: 'modal news-modal' },
      h('h3', { text: 'Nouveautés' }),
      h('div', { class: 'modal-body news-list' },
        CHANGELOG.map((e, i) => h('section', { class: 'news-ver' + (i === 0 ? ' latest' : '') },
          h('div', { class: 'news-head' }, h('span', { class: 'news-tag', text: 'v' + e.v }), h('b', { text: e.title }), i === 0 ? h('em', { class: 'news-cur', text: 'Actuelle' }) : null),
          h('ul', {}, e.items.map((t) => h('li', { text: t })))))),
      h('div', { class: 'modal-foot' }, h('button', { class: 'btn primary', onClick: closeModal, text: 'Fermer' }))
    ));
  }

  // ---------- Vérification de la bibliothèque ----------
  const hoursOf = (s) => (Math.round((s || 0) / 360) / 10) + ' h';
  async function libraryCheck(silent) {
    let r;
    try { r = await api.checkLibrary(); } catch (e) { return toast(e.message || String(e), 'error'); }
    const miss = r.missing || [], groups = r.duplicates || [];
    if (!miss.length && !groups.length) { if (!silent) toast('Tout est en ordre : aucun jeu introuvable, aucun doublon.', 'ok'); else closeModal(); return; }
    const sec = [];
    if (miss.length) {
      sec.push(h('div', { class: 'chk-sec' },
        h('h4', { text: `Jeux introuvables (${miss.length})` }),
        h('p', { class: 'dim', text: 'Le fichier du jeu n\'existe plus à son emplacement. Si le jeu est sur un disque externe, branche-le d\'abord.' }),
        h('div', { class: 'chk-list' }, ...miss.map((g) => h('div', { class: 'chk-item' }, h('b', { text: g.name }), h('small', { class: 'dim', text: g.target })))),
        h('button', { class: 'btn danger', text: `Retirer ces ${miss.length} jeu${miss.length > 1 ? 'x' : ''}`, onClick: async () => {
          for (const g of miss) await api.removeGame(g.id);
          Sound.play('delete'); await load(); libraryCheck(true);
        } })));
    }
    if (groups.length) {
      sec.push(h('div', { class: 'chk-sec' },
        h('h4', { text: `Doublons (${groups.length})` }),
        h('p', { class: 'dim', text: 'Fusionner garde le jeu le plus joué : les temps de jeu et les lancements sont additionnés.' }),
        ...groups.map((gr) => {
          const best = [...gr.games].sort((x, y) => (y.playtime || 0) - (x.playtime || 0))[0];
          return h('div', { class: 'chk-group' },
            h('div', { class: 'chk-list' }, ...gr.games.map((g) => h('div', { class: 'chk-item' }, h('b', { text: g.name }), h('small', { class: 'dim', text: hoursOf(g.playtime) + ' · ' + (g.target || '') })))),
            h('button', { class: 'btn', text: 'Fusionner', onClick: async () => {
              await api.mergeGames(best.id, gr.games.map((g) => g.id).filter((x) => x !== best.id));
              toast('Doublon fusionné.', 'ok'); await load(); libraryCheck(true);
            } }));
        })));
    }
    openModal(h('div', { class: 'modal chk-modal' },
      h('h3', { text: 'Vérification de la bibliothèque' }),
      h('div', { class: 'modal-body' }, ...sec),
      h('div', { class: 'modal-foot' }, h('button', { class: 'btn ghost', onClick: closeModal, text: 'Fermer' }))));
  }

  function confirmUninstall() {
    const go = async (wipe) => {
      try { await api.uninstall(wipe); toast('Désinstallation en cours…'); }
      catch (e) { toast(e.message || String(e), 'error'); }
    };
    openModal(h('div', { class: 'modal' },
      h('h3', { text: 'Désinstaller Arcade ?' }),
      h('div', { class: 'modal-body' },
        h('p', { text: 'Arcade se ferme et son dossier d\'installation est supprimé, ainsi que les raccourcis et le démarrage avec Windows.' }),
        h('p', { text: 'Les fichiers de tes jeux ne sont pas touchés.' })),
      h('div', { class: 'modal-foot' },
        h('button', { class: 'btn ghost', onClick: closeModal, text: 'Annuler' }),
        h('button', { class: 'btn', text: 'Désinstaller et garder ma bibliothèque', onClick: () => go(false) }),
        h('button', { class: 'btn danger', text: 'Tout supprimer', onClick: () => go(true) }))));
  }

  function confirmReset() {
    openModal(h('div', { class: 'modal' },
      h('h3', { text: 'Tout réinitialiser ?' }),
      h('div', { class: 'modal-body' },
        h('p', { text: 'Arcade redevient comme neuf : tous les jeux, catégories, statistiques, couvertures et réglages seront effacés. Cette action est définitive.' }),
        h('p', { text: 'Les fichiers de tes jeux ne sont pas supprimés de ton ordinateur.' })),
      h('div', { class: 'modal-foot' },
        h('button', { class: 'btn ghost', onClick: closeModal, text: 'Annuler' }),
        h('button', { class: 'btn danger', text: 'Tout effacer', onClick: async () => {
          const r = await api.resetAll();
          closeModal();
          if (!r || r.ok === false) return toast('La réinitialisation a échoué.', 'error');
          try { localStorage.removeItem('arcade.luckyMode'); } catch (_) {}
          Sound.play('delete');
          detailId = null; document.getElementById('detail')?.remove();
          await load();
          applyCardSize(state.settings.cardSize);
          setView('all');
          toast('Arcade est remis à neuf.', 'ok');
        } }))
    ));
  }

  function confirmRemove(g) {
    openModal(h('div', { class: 'modal' },
      h('h3', { text: 'Retirer ce jeu ?' }),
      h('div', { class: 'modal-body' }, h('p', { text: `« ${g.name} » sera retiré d'Arcade. Les fichiers du jeu ne sont pas supprimés de ton ordinateur.` })),
      h('div', { class: 'modal-foot' },
        h('button', { class: 'btn ghost', onClick: closeModal, text: 'Annuler' }),
        h('button', { class: 'btn danger', text: 'Retirer', onClick: async () => { await api.removeGame(g.id); closeModal(); Sound.play('delete'); toast('Jeu retiré.'); load(); } }))
    ));
  }

  // ---------- Catégories : sélecteur, gestionnaire, glisser-déposer ----------
  // Panneau « Couleur + Icône » : utilisé par le gestionnaire (en haut) ET par le sélecteur de catégorie d'un jeu
  // Met à jour la pastille d'aperçu (couleur ET icône) sans rien reconstruire
  function paintBadge(badge, c) {
    badge.style.setProperty('--c', c.color);
    const next = catIcon(c.icon, c.color, 20);
    const old = badge.querySelector('svg');
    if (old) old.replaceWith(next); else badge.append(next);
  }

  function catStylePanel(c, redraw, paint, touch) {
    // Tout est mis à jour « sur place » (classes + couleur) : on ne reconstruit rien, donc la fenêtre ne bouge pas.
    const colorInput = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color.toLowerCase() : '#9c7cf0' });
    const custom = h('label', { class: 'pcol custom', title: 'Couleur personnalisée' }, colorInput);
    const swatches = COLORS.map((col) => h('button', { type: 'button', class: 'pcol', style: { '--c': col }, title: col, 'data-snd': 'none', onClick: () => { c.color = col; colorInput.value = col; changed(); Sound.play('tick'); } }));
    const ibtns = CAT_ICON_KEYS.map((k) => h('button', { type: 'button', class: 'ibtn', 'data-snd': 'none',
      onClick: () => { c.icon = k; changed(); Sound.play('tick'); } }, catIcon(k, null, 20)));
    const sync = () => {
      const cur = c.color.toLowerCase();
      swatches.forEach((el, i) => el.classList.toggle('on', COLORS[i] === cur));
      const isCustom = !COLORS.includes(cur);
      custom.classList.toggle('on', isCustom);
      custom.style.setProperty('--c', isCustom ? c.color : '#9c7cf0');
      ibtns.forEach((el, i) => { el.classList.toggle('on', CAT_ICON_KEYS[i] === c.icon); el.style.setProperty('--c', c.color); });
    };
    const changed = () => { if (touch) touch(); sync(); paint(); };
    colorInput.addEventListener('input', () => { c.color = colorInput.value; changed(); }); // la fenêtre de couleur reste ouverte
    sync();
    const root = h('div', { class: 'cat-edit' },
      h('div', { class: 'cat-edit-label', text: 'Couleur' }),
      h('div', { class: 'palette' }, ...swatches, custom),
      h('div', { class: 'cat-edit-label', text: 'Icône' }),
      h('div', { class: 'icongrid' }, ...ibtns)
    );
    root.sync = sync;
    return root;
  }

  function catPicker(initial) {
    let value = initial || '';
    let creating = null; // { name, color, icon, touched } pendant la création d'une catégorie
    const wrap = h('div', { class: 'catpick' });

    // Même créateur que le bouton « Catégories » : nom + couleur + icône
    const creator = () => {
      const c = creating;
      let panelRef = null;
      const badge = h('div', { class: 'cat-badge', style: { '--c': c.color } }, catIcon(c.icon, c.color, 20));
      const paint = () => paintBadge(badge, c);
      const nameInp = h('input', { type: 'text', class: 'cat-name', placeholder: 'Nom de la catégorie (ex : Logiciels)', value: c.name, maxlength: '30' });
      nameInp.addEventListener('input', () => { c.name = nameInp.value; if (!c.touched) { c.color = defaultColor(c.name.trim() || 'x'); paint(); panelRef?.sync(); } });
      nameInp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); create(); }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); creating = null; draw(); }
      });
      const create = async () => {
        const name = c.name.trim();
        if (!name) { nameInp.focus(); return toast('Donne un nom à la catégorie.', 'error'); }
        const existing = allCats().find((x) => x.name.toLowerCase() === name.toLowerCase());
        if (existing) { value = existing.name; creating = null; toast('Cette catégorie existe déjà : elle est sélectionnée.'); draw(); return; }
        const list = [...allCats().map((x) => ({ name: x.name, color: x.color, icon: x.icon || 'tag' })), { name, color: c.touched ? c.color : defaultColor(name), icon: c.icon }];
        try {
          await api.setCategories({ list, renames: [] });
          const lib = await api.getLibrary();
          state.categories = lib.categories || [];
          checkVersion(lib.version);
          if (!state.categories.some((x) => x.name.toLowerCase() === name.toLowerCase())) throw new Error("Le serveur n'a pas enregistré la catégorie. Ferme complètement Arcade (toutes les fenêtres), attends 10 secondes, puis relance-le.");
        } catch (e) {
          return toast(e.message || String(e), 'error');
        }
        value = name; creating = null;
        Sound.play('success');
        draw();
        render(); // met à jour le menu et les pastilles derrière la fenêtre
      };
      const panel = catStylePanel(c, draw, paint, () => { c.touched = true; });
      panelRef = panel;
      setTimeout(() => { if (document.activeElement?.tagName !== 'INPUT') nameInp.focus(); }, 0);
      return h('div', { class: 'cat-creator' },
        h('div', { class: 'cat-creator-head' }, badge, nameInp),
        panel,
        h('div', { class: 'cat-creator-foot' },
          h('button', { type: 'button', class: 'btn ghost', 'data-snd': 'none', text: 'Annuler', onClick: () => { creating = null; draw(); } }),
          h('button', { type: 'button', class: 'btn primary', 'data-snd': 'none', text: 'Créer la catégorie', onClick: create })));
    };

    const draw = () => {
      wrap.replaceChildren();
      const cats = allCats();
      const names = cats.map((c) => c.name);
      const chip = (label, val, cat) => h('button', { type: 'button', class: 'cchip' + (value === val ? ' on' : ''), style: cat ? { '--c': cat.color } : {}, 'data-snd': 'none',
        onClick: () => { value = val; Sound.play('tick'); draw(); } }, cat ? catIcon(cat.icon, cat.color, 14) : null, label);
      wrap.append(chip('Aucune', '', null));
      if (value && !names.includes(value)) wrap.append(chip(value, value, { icon: 'tag', color: defaultColor(value) }));
      cats.forEach((c) => wrap.append(chip(c.name, c.name, c)));
      if (!creating) {
        wrap.append(h('button', { type: 'button', class: 'cchip add', 'data-snd': 'none', onClick: () => { creating = { name: '', color: COLORS[0], icon: 'tag', touched: false }; Sound.play('tick'); draw(); } }, '+ Nouvelle'));
      } else {
        wrap.append(creator());
      }
    };
    draw();
    return { el: wrap, get value() { return value; } };
  }

  function openCatPickModal(g) {
    const picker = catPicker(g.category || '');
    openModal(h('div', { class: 'modal' },
      h('h3', { text: 'Catégorie' }),
      h('div', { class: 'modal-sub', text: `Où ranger « ${g.name} » ?` }),
      h('div', { class: 'modal-body' }, picker.el),
      h('div', { class: 'modal-foot' },
        h('button', { class: 'btn ghost', text: 'Annuler', onClick: closeModal }),
        h('button', { class: 'btn primary', text: 'Enregistrer', onClick: async () => {
          await api.updateGame(g.id, { category: picker.value });
          closeModal(); Sound.play('success'); toast(picker.value ? `Rangé dans « ${picker.value} ».` : 'Catégorie retirée.', 'ok'); load();
        } }))
    ));
  }

  function openCatsModal() {
    const draft = allCats().map((c) => ({ orig: c.name, name: c.name, color: c.color, icon: c.icon || 'tag' }));
    let openIdx = -1; // catégorie dont le panneau couleur/icône est ouvert
    const countOf = (n) => state.games.filter((g) => g.category === n).length;
    const list = h('div', { class: 'cat-list' });
    const suggest = h('div', { class: 'suggest' });
    const newInput = h('input', { type: 'text', placeholder: 'Nom de la catégorie (ex : Logiciels, Jeux…)', maxlength: '30' });

    const addCat = (name) => {
      name = (name || '').trim();
      if (!name) return false;
      if (draft.some((c) => c.name.trim().toLowerCase() === name.toLowerCase())) { toast('Cette catégorie existe déjà.', 'error'); return false; }
      draft.push({ orig: null, name, color: defaultColor(name), icon: 'tag' });
      openIdx = draft.length - 1; // on ouvre tout de suite le choix couleur / icône
      Sound.play('success');
      draw();
      list.lastElementChild?.scrollIntoView({ block: 'nearest' });
      return true;
    };

    // Panneau couleur + icône (le même que dans le sélecteur de catégorie d'un jeu)
    const editor = (c, badge) => catStylePanel(c, draw, () => paintBadge(badge, c));

    const draw = () => {
      list.replaceChildren(...(draft.length ? draft.map((c, i) => {
        const badge = h('button', { class: 'cat-badge' + (openIdx === i ? ' open' : ''), title: 'Changer la couleur et l\'icône', 'data-snd': 'none', style: { '--c': c.color },
          onClick: () => { openIdx = openIdx === i ? -1 : i; Sound.play('tick'); draw(); } }, catIcon(c.icon, c.color, 20));
        const inp = h('input', { type: 'text', class: 'cat-name', value: c.name, maxlength: '30' });
        inp.addEventListener('input', () => { c.name = inp.value; });
        const n = c.orig ? countOf(c.orig) : 0;
        const row = h('div', { class: 'cat-row' }, badge, inp,
          h('span', { class: 'cat-count', text: c.orig ? `${n} jeu${n > 1 ? 'x' : ''}` : 'Nouvelle' }),
          h('button', { class: 'icon-btn danger', title: 'Supprimer', 'data-snd': 'none', onClick: () => { draft.splice(i, 1); openIdx = -1; Sound.play('delete'); draw(); } }, icon('trash')));
        return h('div', { class: 'cat-item' }, row, openIdx === i ? editor(c, badge) : null);
      }) : [h('div', { class: 'cat-empty', text: 'Aucune catégorie pour le moment. Crée-en une ci-dessous pour ranger tes jeux et logiciels.' })]));
      const missing = SUGGESTIONS.filter((s) => !draft.some((c) => c.name.trim().toLowerCase() === s.toLowerCase()));
      suggest.replaceChildren(...(missing.length ? [h('small', { text: 'Suggestions :' }), ...missing.map((s) => h('button', { class: 'cchip add', 'data-snd': 'none', onClick: () => addCat(s) }, '+ ' + s))] : []));
    };
    newInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (addCat(newInput.value)) newInput.value = ''; } });

    const save = async () => {
      // Un nom tapé mais pas encore validé avec « Ajouter » est pris en compte
      if (newInput.value.trim()) {
        if (!addCat(newInput.value)) return;
        newInput.value = '';
      }
      const names = draft.map((c) => c.name.trim());
      if (names.some((n) => !n)) return toast("Une catégorie n'a pas de nom.", 'error');
      if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) return toast('Deux catégories ont le même nom.', 'error');
      const keep = new Set(draft.filter((c) => c.orig).map((c) => c.orig));
      const orphans = state.games.filter((g) => g.category && !keep.has(g.category)).length;
      const renames = draft.filter((c) => c.orig && c.orig !== c.name.trim()).map((c) => ({ from: c.orig, to: c.name.trim() }));
      const payload = { list: draft.map((c) => ({ name: c.name.trim(), color: c.color, icon: c.icon })), renames };
      try {
        await api.setCategories(payload);
        // On relit la bibliothèque : si le serveur n'a rien gardé, on le dit au lieu d'afficher un faux succès
        const lib = await api.getLibrary();
        const have = new Set((lib.categories || []).map((c) => String(c.name).toLowerCase()));
        const missing = payload.list.filter((c) => !have.has(c.name.toLowerCase()));
        if (missing.length) {
          checkVersion(lib.version);
          return toast("Le serveur n'a pas enregistré la catégorie. Ferme complètement Arcade (toutes les fenêtres), attends 10 secondes, puis relance-le.", 'error');
        }
      } catch (e) {
        return toast("Impossible d'enregistrer les catégories : " + (e.message || e), 'error');
      }
      if (state.view.startsWith('cat:')) {
        const r = renames.find((x) => x.from === state.view.slice(4));
        if (r) state.view = 'cat:' + r.to;
      }
      closeModal(); Sound.play('success');
      toast(orphans ? `Catégories enregistrées. ${orphans} jeu(x) sans catégorie.` : 'Catégories enregistrées.', 'ok');
      load();
    };

    draw();
    openModal(h('div', { class: 'modal' },
      h('h3', { text: 'Catégories' }),
      h('div', { class: 'modal-sub', text: 'Range ta bibliothèque : Jeux, Logiciels, Émulateurs… Clique sur le badge d\'une catégorie pour changer sa couleur et son icône.' }),
      h('div', { class: 'modal-body' }, list,
        h('div', { class: 'cat-add' }, newInput, h('button', { class: 'btn ghost', text: 'Ajouter', onClick: () => { if (addCat(newInput.value)) newInput.value = ''; newInput.focus(); } })),
        suggest),
      h('div', { class: 'modal-foot' }, h('button', { class: 'btn ghost', text: 'Annuler', onClick: closeModal }), h('button', { class: 'btn primary', text: 'Enregistrer', onClick: save }))
    ));
    setTimeout(() => newInput.focus(), 30);
  }

  // Une carte glissée sur une catégorie (menu ou puce) change la catégorie du jeu
  function makeDrop(el, categoryName) {
    const ok = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('text/arcade-id');
    el.addEventListener('dragover', (e) => { if (!ok(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.classList.add('dragover'); });
    el.addEventListener('dragleave', () => el.classList.remove('dragover'));
    el.addEventListener('drop', async (e) => {
      if (!ok(e)) return;
      e.preventDefault(); e.stopPropagation();
      el.classList.remove('dragover');
      const id = e.dataTransfer.getData('text/arcade-id');
      const g = state.games.find((x) => x.id === id);
      if (!g || g.category === categoryName) return;
      await api.updateGame(id, { category: categoryName });
      Sound.play('success');
      toast(categoryName ? `« ${g.name} » rangé dans « ${categoryName} ».` : `« ${g.name} » n'a plus de catégorie.`, 'ok');
      load();
    });
  }

  // Ajout / édition d'un jeu
  function openGameModal(game, prefill = {}) {
    const editing = !!game;
    const data = {
      name: game?.name ?? prefill.name ?? '',
      target: game?.target ?? prefill.target ?? '',
      category: game?.category ?? '',
      args: game?.args ?? '',
      runAs: !!game?.runAs,
      cover: undefined // undefined = inchangé, null = retirer, string = nouveau fichier
    };

    const mk = (label, input, hint) => h('div', { class: 'field' }, h('label', { text: label }), input, hint ? h('div', { class: 'hint', text: hint }) : null);
    const inName = h('input', { type: 'text', value: data.name, placeholder: 'Nom du jeu', maxlength: '80' });
    const inTarget = h('input', { type: 'text', value: data.target, placeholder: 'C:\\Jeux\\MonJeu\\jeu.exe  ou  steam://rungameid/12345' });
    const inCat = catPicker(data.category);
    const inArgs = h('input', { type: 'text', value: data.args, placeholder: 'Optionnel (ex : -windowed)' });
    const inAdmin = h('input', { type: 'checkbox' });
    inAdmin.checked = data.runAs;
    const adminRow = h('label', { class: 'setting inline' }, h('div', { class: 'setting-text' }, h('b', { text: 'Exécuter en administrateur' }), h('small', { text: 'Windows te demandera une autorisation à chaque lancement. Pour les .exe et .bat uniquement.' })), h('span', { class: 'switch' }, inAdmin, h('i')));

    const prev = h('div', { class: 'cover-prev' });
    const paintPrev = () => {
      const name = inName.value || '?';
      const url = data.cover ? (api.previewUrl ? api.previewUrl(data.cover) : null) : data.cover === undefined ? (game?.coverUrl || null) : null;
      prev.replaceChildren();
      if (url) Object.assign(prev.style, { backgroundImage: `url("${url}")` });
      else {
        prev.style.backgroundImage = coverBackground({ name, coverUrl: null }).backgroundImage;
        prev.textContent = name.trim().charAt(0).toUpperCase() || '?';
      }
    };
    inName.addEventListener('input', paintPrev);

    const browse = h('button', { class: 'btn ghost', text: 'Parcourir…', onClick: async () => {
      const paths = await api.pickGame();
      if (!paths.length) return;
      if (paths.length > 1 && !editing) {
        const r = await api.addGames(paths.map((p) => ({ target: p, category: inCat.value })));
        closeModal(); Sound.play('success'); toast(`${r.added} jeu(x) ajouté(s).`, 'ok'); return load();
      }
      inTarget.value = paths[0];
      if (!inName.value.trim()) inName.value = paths[0].split(/[\\/]/).pop().replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' ');
      paintPrev();
    } });

    const pickCover = h('button', { class: 'btn ghost', text: 'Choisir une image…', onClick: async () => { const p = await api.pickCover(); if (p) { data.cover = p; paintPrev(); } } });
    const autoCover = editing ? h('button', { class: 'btn ghost', text: 'Chercher auto', title: 'Télécharge une couverture HD à partir du nom', onClick: async () => {
      const g = game; closeModal(); await refetchCover(g, inName.value);
    } }) : null;
    const clearCover = h('button', { class: 'btn ghost', text: 'Retirer', onClick: () => { data.cover = null; paintPrev(); } });

    const save = h('button', { class: 'btn primary', text: editing ? 'Enregistrer' : 'Ajouter', onClick: async () => {
      const target = inTarget.value.trim();
      if (!target) { inTarget.focus(); return toast('Indique le fichier ou le lien du jeu.', 'error'); }
      if (editing) {
        const patch = { name: inName.value, target, category: inCat.value, args: inArgs.value, runAs: inAdmin.checked };
        if (data.cover !== undefined) patch.cover = data.cover;
        await api.updateGame(game.id, patch);
        toast('Modifications enregistrées.', 'ok');
      } else {
        const r = await api.addGames([{ target, name: inName.value, category: inCat.value, cover: data.cover || null }]);
        if (!r.added) return toast('Ce jeu est déjà dans ta bibliothèque (ou le lien est invalide).', 'error');
        Sound.play('success');
        toast('Jeu ajouté ! Recherche de la couverture…', 'ok');
      }
      closeModal(); load();
    } });

    paintPrev();
    openModal(h('div', { class: 'modal' },
      h('h3', { text: editing ? 'Modifier le jeu' : 'Ajouter un jeu' }),
      h('div', { class: 'modal-sub', text: 'Un .exe, un raccourci .lnk, ou un lien (steam://, com.epicgames.launcher://…).' }),
      h('div', { class: 'modal-body' },
        mk('Fichier ou lien', h('div', { class: 'row' }, inTarget, browse)),
        mk('Nom', inName),
        mk('Catégorie', inCat.el),
        mk('Image de couverture', h('div', { class: 'cover-pick' }, prev, h('div', { class: 'row' }, pickCover, autoCover, clearCover)), 'Une couverture HD est cherchée automatiquement à l\'ajout. Sinon, une couverture colorée est générée.'),
        editing ? mk('Arguments de lancement', inArgs, 'Uniquement pour les fichiers .exe.') : null,
        editing ? adminRow : null
      ),
      h('div', { class: 'modal-foot' }, h('button', { class: 'btn ghost', text: 'Annuler', onClick: closeModal }), save)
    ));
    setTimeout(() => (editing ? inName : inTarget).focus(), 30);
  }

  // Scan de dossier
  async function scanFlow(folder) {
    if (!folder) folder = await api.pickFolder();
    if (!folder) return;
    toast('Analyse du dossier…');
    const found = await api.scanFolder(folder);
    if (!found.length) return toast('Aucun nouveau jeu (.exe) trouvé dans ce dossier.', 'error');

    const scanCat = catPicker('');
    const boxes = found.map((f) => h('input', { type: 'checkbox', checked: true }));
    const list = h('div', { class: 'scan-list' }, ...found.map((f, i) =>
      h('label', { class: 'scan-item' }, boxes[i], h('div', {}, h('b', { text: f.name }), h('small', { title: f.target, text: f.target })))));
    const addBtn = h('button', { class: 'btn primary', text: 'Ajouter la sélection', onClick: async () => {
      const items = found.filter((_, i) => boxes[i].checked).map((f) => ({ ...f, category: scanCat.value }));
      if (!items.length) return;
      const r = await api.addGames(items);
      closeModal(); Sound.play('success'); toast(`${r.added} jeu(x) ajouté(s).`, 'ok'); load();
    } });
    const toggle = h('button', { class: 'btn ghost', text: 'Tout désélectionner', onClick: (e) => {
      const any = boxes.some((b) => b.checked);
      boxes.forEach((b) => (b.checked = !any));
      e.currentTarget.textContent = any ? 'Tout sélectionner' : 'Tout désélectionner';
    } });

    openModal(h('div', { class: 'modal' },
      h('h3', { text: `${found.length} jeu(x) trouvé(s)` }),
      h('div', { class: 'modal-sub', text: 'Décoche ceux que tu ne veux pas ajouter (désinstalleurs et utilitaires déjà ignorés).' }),
      h('div', { class: 'modal-body' }, h('div', { class: 'field' }, h('label', { text: 'Ranger dans la catégorie' }), scanCat.el), list),
      h('div', { class: 'modal-foot' }, toggle, h('span', { class: 'spacer' }), h('button', { class: 'btn ghost', text: 'Annuler', onClick: closeModal }), addBtn)
    ));
  }


  // ---------- Reprendre : les 3 derniers jeux joués ----------
  function resumeTile(g) {
    const running = state.running.has(g.id);
    const useIcon = !g.coverUrl && !!g.iconUrl;
    const thumb = h('div', { class: 'rs-thumb' + (useIcon ? ' iconcover' : ''), style: useIcon ? { '--ico': `url("${g.iconUrl}")` } : coverBackground(g) },
      useIcon ? h('img', { class: 'gicon', src: g.iconUrl, alt: '', draggable: 'false' })
        : g.coverUrl ? null : h('span', { class: 'letter', text: g.name.trim().charAt(0).toUpperCase() || '?' }));
    const meta = running ? 'En cours' : [fmtLast(g.lastPlayed), g.playtime ? fmtPlaytime(g.playtime) : ''].filter(Boolean).join(' · ');
    return h('article', {
      class: 'rs-tile' + (running ? ' running' : ''), tabindex: '0', 'data-id': g.id,
      onClick: () => openDetail(g.id),
      onKeydown: (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) openDetail(g.id); },
      onMouseenter: () => setAmbient(g)
    }, thumb,
      h('div', { class: 'rs-info' }, h('div', { class: 'name', title: g.name, text: g.name }), h('div', { class: 'meta', text: meta })),
      h('button', { class: 'btn primary rs-play', 'data-snd': 'none', title: 'Jouer', onClick: (e) => { e.stopPropagation(); launch(g); } }, icon('play'), 'Jouer'));
  }
  function resumeBlock() {
    if (state.view !== 'all' || state.query.trim()) return null;
    const list = state.games.filter((g) => g.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 3);
    if (!list.length) return null;
    return h('section', { class: 'resume' },
      h('div', { class: 'rs-title', text: 'Reprendre' }),
      h('div', { class: 'rs-row' }, ...list.map(resumeTile)),
      h('div', { class: 'rs-title', text: 'Toute la bibliothèque' }));
  }

  // ---------- Importer Steam / Epic Games / GOG ----------
  const LAUNCHERS = { steam: 'Steam', epic: 'Epic Games', gog: 'GOG' };
  async function importFlow() {
    toast('Recherche de Steam, Epic Games et GOG…');
    let r;
    try { r = await api.detectLaunchers(); } catch (e) { return toast(e.message || String(e), 'error'); }
    const items = r.items || [];
    if (!items.length) {
      const any = Object.values(r.total || {}).some((n) => n > 0);
      return toast(any ? 'Tous tes jeux Steam, Epic Games et GOG sont déjà dans Arcade.' : 'Aucun jeu Steam, Epic Games ou GOG installé n\'a été trouvé sur ce PC.', any ? 'ok' : 'error');
    }
    const boxes = items.map(() => h('input', { type: 'checkbox', checked: true }));
    const catInput = h('input', { type: 'checkbox', checked: true });
    const catRow = h('label', { class: 'setting inline' }, h('div', { class: 'setting-text' }, h('b', { text: 'Une catégorie par lanceur' }), h('small', { text: 'Range les jeux dans « Steam », « Epic Games » ou « GOG ».' })), h('span', { class: 'switch' }, catInput, h('i')));
    const addBtn = h('button', { class: 'btn primary' });
    const refresh = () => { const n = boxes.filter((b) => b.checked).length; addBtn.textContent = n ? `Importer ${n} jeu${n > 1 ? 'x' : ''}` : 'Rien à importer'; addBtn.disabled = !n; };
    boxes.forEach((b) => b.addEventListener('change', refresh));
    const groups = Object.keys(LAUNCHERS).map((k) => {
      const idx = items.map((it, i) => (it.launcher === k ? i : -1)).filter((i) => i >= 0);
      if (!idx.length) return null;
      const tog = h('button', { class: 'btn ghost', text: 'Tout / rien', onClick: () => { const any = idx.some((i) => boxes[i].checked); idx.forEach((i) => (boxes[i].checked = !any)); refresh(); } });
      return h('div', { class: 'imp-group' },
        h('div', { class: 'imp-head' }, h('b', { text: `${LAUNCHERS[k]} · ${idx.length}` }), tog),
        h('div', { class: 'scan-list' }, ...idx.map((i) => h('label', { class: 'scan-item' }, boxes[i], h('div', {}, h('b', { text: items[i].name }), h('small', { text: LAUNCHERS[k] }))))));
    }).filter(Boolean);
    addBtn.addEventListener('click', async () => {
      addBtn.disabled = true;
      const sel = items.map((it, i) => (boxes[i].checked ? { name: it.name, target: it.target, category: catInput.checked ? LAUNCHERS[it.launcher] : '' } : null)).filter(Boolean);
      try {
        const res = await api.addGames(sel);
        closeModal(); Sound.play('success');
        toast(`${res.added} jeu${res.added > 1 ? 'x' : ''} importé${res.added > 1 ? 's' : ''}. Les couvertures arrivent…`, 'ok');
        await load();
      } catch (e) { addBtn.disabled = false; toast(e.message || String(e), 'error'); }
    });
    refresh();
    openModal(h('div', { class: 'modal' },
      h('h3', { text: `${items.length} jeu${items.length > 1 ? 'x' : ''} installé${items.length > 1 ? 's' : ''} trouvé${items.length > 1 ? 's' : ''}` }),
      h('div', { class: 'modal-sub', text: 'Seuls les jeux déjà installés sont listés. Les couvertures HD sont téléchargées ensuite, une par jeu.' }),
      h('div', { class: 'modal-body' }, catRow, ...groups),
      h('div', { class: 'modal-foot' }, h('span', { class: 'spacer' }), h('button', { class: 'btn ghost', text: 'Annuler', onClick: closeModal }), addBtn)
    ));
  }

  // ---------- Surprends-moi : roulette pixel ----------
  const LUCKY_MODES = [['all', 'Tous mes jeux'], ['new', 'Jamais lancés'], ['todo', 'Pas terminés']];
  function luckyFlow() {
    let mode = 'all', token = 0, last = null, current = null;
    try { const m = localStorage.getItem('arcade.luckyMode'); if (LUCKY_MODES.some(([k]) => k === m)) mode = m; } catch (_) {}
    const pool = () => state.games.filter((g) => g.exists !== false && (mode === 'all' || (mode === 'new' && !g.lastPlayed && !g.launches) || (mode === 'todo' && !g.finished)));
    const thumb = h('div', { class: 'rl-thumb' });
    const frame = h('div', { class: 'rl-frame' }, thumb);
    const nameEl = h('div', { class: 'rl-name', text: ' ' });
    const metaEl = h('div', { class: 'rl-meta', text: ' ' });
    const stage = h('div', { class: 'rl-stage' }, frame, nameEl, metaEl);
    const playBtn = h('button', { class: 'btn primary', disabled: true, onClick: () => { if (current) { const g = current; closeModal(); launch(g); } } }, icon('play'), 'Jouer');
    const againBtn = h('button', { class: 'btn', text: 'Relancer', disabled: true, onClick: () => spin() });
    const segBtns = LUCKY_MODES.map(([k, label]) => h('button', { class: 'seg-b' + (k === mode ? ' on' : ''), type: 'button', text: label, 'data-k': k, onClick: () => {
      mode = k; segBtns.forEach((b) => b.classList.toggle('on', b.dataset.k === k));
      try { localStorage.setItem('arcade.luckyMode', k); } catch (_) {}
      spin();
    } }));
    function paint(g) {
      const useIcon = !g.coverUrl && !!g.iconUrl;
      thumb.classList.toggle('iconcover', useIcon);
      thumb.style.backgroundImage = useIcon ? '' : coverBackground(g).backgroundImage;
      if (useIcon) thumb.style.setProperty('--ico', `url("${g.iconUrl}")`);
      thumb.replaceChildren(...(useIcon ? [h('img', { class: 'gicon', src: g.iconUrl, alt: '', draggable: 'false' })] : g.coverUrl ? [] : [h('span', { class: 'letter', text: g.name.trim().charAt(0).toUpperCase() || '?' })]));
      nameEl.textContent = g.name;
    }
    function burst() {
      for (let i = 0; i < 14; i++) {
        const a = (Math.PI * 2 * i) / 14 + Math.random() * .3, d = 120 + Math.random() * 70, s = [6, 8, 10][i % 3];
        const p = h('i', { class: 'rl-px', style: { width: s + 'px', height: s + 'px' } });
        stage.appendChild(p);
        const an = p.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(.2)`, opacity: 0 }], { duration: 700 + Math.random() * 300, easing: 'cubic-bezier(.2,.7,.3,1)' });
        an.onfinish = () => p.remove();
      }
    }
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    async function spin() {
      const my = ++token;
      current = null; playBtn.disabled = true; againBtn.disabled = true; frame.classList.remove('landed'); frame.classList.add('spinning');
      const list = pool();
      if (!list.length) {
        frame.classList.remove('spinning'); thumb.replaceChildren(); thumb.style.backgroundImage = '';
        nameEl.textContent = mode === 'new' ? 'Tu as déjà lancé tous tes jeux !' : mode === 'todo' ? 'Tout est terminé, bravo !' : 'Ta bibliothèque est vide.';
        metaEl.textContent = 'Choisis un autre filtre ci-dessus.'; return;
      }
      const others = list.length > 1 ? list.filter((g) => g.id !== last) : list;
      const final = others[Math.floor(Math.random() * others.length)];
      const reduce = reducedMotion();
      const steps = list.length === 1 || reduce ? 1 : 18;
      metaEl.textContent = 'Tirage en cours…';
      let prev = null;
      for (let i = 0; i < steps; i++) {
        if (my !== token || !frame.isConnected) return;
        let g = final;
        if (i < steps - 1) { const c = list.filter((x) => x.id !== prev); g = c[Math.floor(Math.random() * c.length)] || list[0]; }
        prev = g.id; paint(g); Sound.play('tick');
        if (i < steps - 1) await sleep(i < 9 ? 50 : 50 + Math.pow(i - 8, 2) * 6);
      }
      if (my !== token || !frame.isConnected) return;
      current = final; last = final.id;
      frame.classList.remove('spinning'); frame.classList.add('landed');
      metaEl.textContent = [final.lastPlayed ? fmtLast(final.lastPlayed) : 'Jamais lancé', final.playtime ? fmtPlaytime(final.playtime) : ''].filter(Boolean).join(' · ');
      Sound.play('success'); burst();
      playBtn.disabled = false; againBtn.disabled = false;
    }
    openModal(h('div', { class: 'modal lucky' },
      h('h3', { text: 'Surprends-moi' }),
      h('div', { class: 'modal-sub', text: 'Je choisis ton prochain jeu au hasard.' }),
      h('div', { class: 'modal-body' }, h('div', { class: 'seg rl-seg' }, ...segBtns), stage),
      h('div', { class: 'modal-foot' }, h('button', { class: 'btn ghost', text: 'Fermer', onClick: closeModal }), h('span', { class: 'spacer' }), againBtn, playBtn)
    ));
    spin();
  }

  // Rappel de pause envoyé par le serveur
  api.onNotice?.((n) => {
    toast(`Tu joues à ${n.game} depuis environ ${n.hours} h : pense à faire une pause !`, 'ok');
    Sound.play('success');
  });

  // ---------- Glisser-déposer ----------
  // Le système donne directement les chemins des fichiers déposés (raccourcis .lnk / .url, .exe)
  if (window.__TAURI__ && window.__TAURI__.event) {
    const ev = window.__TAURI__.event;
    ev.listen('arcade-drag', (e) => { $('#dropzone').classList.toggle('show', !!(e.payload && e.payload.over)); });
    ev.listen('arcade-dropped', async (e) => {
      const { added = 0, skipped = 0 } = e.payload || {};
      if (added) { Sound.play('success'); toast(`${added} jeu(x) ajouté(s).`, 'ok'); await load(); }
      else if (skipped) toast('Dépose des raccourcis (.lnk, .url) ou des .exe.', 'error');
      else toast('Ce jeu est déjà dans ta bibliothèque.', '');
    });
  }

  // ---------- Paramètres ----------
  function switchRow(label, hint, key, extra) {
    const input = h('input', { type: 'checkbox' });
    input.checked = !!state.settings[key];
    input.addEventListener('change', async () => {
      const want = input.checked;
      try { await setSetting({ [key]: want }); }
      catch (e) { input.checked = !want; state.settings[key] = !want; return toast(e.message || String(e), 'error'); }
      Sound.play(want ? 'toggleOn' : 'toggleOff');
      if (extra) extra(want);
    });
    return h('label', { class: 'setting', id: 'row-' + key },
      h('div', { class: 'setting-text' }, h('b', { text: label }), hint ? h('small', { text: hint }) : null),
      h('span', { class: 'switch' }, input, h('i')));
  }

  function autoMenuRow() {
    const input = h('input', { type: 'checkbox' });
    input.checked = autoMenu();
    input.addEventListener('change', () => {
      try { localStorage.setItem('arcade.autoMenu', input.checked ? '1' : '0'); } catch {}
      Sound.play(input.checked ? 'toggleOn' : 'toggleOff');
      applySidebar();
    });
    return h('label', { class: 'setting', id: 'row-autoMenu' },
      h('div', { class: 'setting-text' }, h('b', { text: 'Menu automatique' }), h('small', { text: 'Le menu se réduit tout seul quand la souris n\'est pas dessus, et se déploie dès que tu passes dessus.' })),
      h('span', { class: 'switch' }, input, h('i')));
  }

  function langRow() {
    const opts = [['fr', 'Français'], ['en', 'English']];
    const btns = opts.map(([v, t]) => h('button', { type: 'button', class: 'seg-b' + (ARC.lang === v ? ' on' : ''), 'data-snd': 'none', text: t, onClick: () => { if (ARC.lang !== v) ARC.set(v); } }));
    return h('div', { class: 'setting' }, h('div', { class: 'setting-text' }, h('b', { text: 'Langue' }), h('small', { text: 'Choisis la langue de l\'interface.' })), h('div', { class: 'seg' }, ...btns));
  }

  function themeRow() {
    const opts = [['dark', 'Sombre'], ['light', 'Clair'], ['auto', 'Auto']];
    const btns = opts.map(([v, t]) => h('button', { type: 'button', class: 'seg-b', 'data-snd': 'none', text: t, onClick: async () => {
      state.settings.theme = v; sync(); applyAppearance(); Sound.play('tick');
      try { await api.setSettings({ theme: v }); } catch (e) { toast(e.message || String(e), 'error'); }
    } }));
    const sync = () => btns.forEach((b, i) => b.classList.toggle('on', (state.settings.theme || 'dark') === opts[i][0]));
    sync();
    return h('div', { class: 'setting' }, h('div', { class: 'setting-text' }, h('b', { text: 'Thème' }), h('small', { text: 'Sombre, clair, ou comme Windows (Auto).' })), h('div', { class: 'seg' }, ...btns));
  }
  function accentRow() {
    const cur = () => (state.settings.accent || '#9c7cf0').toLowerCase();
    const colorInput = h('input', { type: 'color', value: cur() });
    const custom = h('label', { class: 'pcol custom', title: 'Couleur personnalisée' }, colorInput);
    let saveT = null;
    const save = () => { clearTimeout(saveT); saveT = setTimeout(() => api.setSettings({ accent: state.settings.accent }).catch((e) => toast(e.message || String(e), 'error')), 250); };
    const sw = ACCENTS.map(([c, n]) => h('button', { type: 'button', class: 'pcol', style: { '--c': c }, title: n, 'data-snd': 'none', onClick: () => { state.settings.accent = c; colorInput.value = c; sync(); applyAppearance(); Sound.play('tick'); save(); } }));
    const sync = () => {
      const c = cur(), known = ACCENTS.some(([x]) => x === c);
      sw.forEach((el, i) => el.classList.toggle('on', ACCENTS[i][0] === c));
      custom.classList.toggle('on', !known); custom.style.setProperty('--c', known ? '#9c7cf0' : c);
    };
    colorInput.addEventListener('input', () => { state.settings.accent = colorInput.value; sync(); applyAppearance(); save(); });
    sync();
    return h('div', { class: 'setting' }, h('div', { class: 'setting-text' }, h('b', { text: 'Couleur d\'accent' }), h('small', { text: 'La couleur des boutons, de la sélection et des détails.' })), h('div', { class: 'palette' }, ...sw, custom));
  }

  function logoRow() {
    const cur = () => (/^#[0-9a-f]{6}$/i.test(state.settings.logo || '') ? state.settings.logo.toLowerCase() : '');
    const colorInput = h('input', { type: 'color', value: cur() || (state.settings.accent || '#9c7cf0') });
    const custom = h('label', { class: 'pcol custom', title: 'Couleur personnalisée' }, colorInput);
    let saveT = null;
    const save = () => { clearTimeout(saveT); saveT = setTimeout(() => api.setSettings({ logo: state.settings.logo || '' }).catch((e) => toast(e.message || String(e), 'error')), 250); };
    const follow = h('button', { type: 'button', class: 'btn', text: 'Comme l\'accent', 'data-snd': 'none', onClick: () => { state.settings.logo = ''; sync(); applyAppearance(); Sound.play('tick'); save(); } });
    const sw = ACCENTS.map(([c, n]) => h('button', { type: 'button', class: 'pcol', style: { '--c': c }, title: n, 'data-snd': 'none', onClick: () => { state.settings.logo = c; colorInput.value = c; sync(); applyAppearance(); Sound.play('tick'); save(); } }));
    const sync = () => {
      const c = cur(), known = ACCENTS.some(([x]) => x === c);
      sw.forEach((el, i) => el.classList.toggle('on', ACCENTS[i][0] === c));
      custom.classList.toggle('on', !!c && !known); custom.style.setProperty('--c', c && !known ? c : '#9c7cf0');
      follow.classList.toggle('on', !c);
    };
    colorInput.addEventListener('input', () => { state.settings.logo = colorInput.value; sync(); applyAppearance(); save(); });
    sync();
    return h('div', { class: 'setting', id: 'row-logo' }, h('div', { class: 'setting-text' }, h('b', { text: 'Couleur du logo' }), h('small', { text: 'Par défaut, le logo prend la couleur d\'accent.' })), h('div', { class: 'palette' }, follow, ...sw, custom));
  }

  function reminderRow() {
    const sel = h('select', {},
      ...[[0, 'Désactivé'], [1, 'Toutes les heures'], [2, 'Toutes les 2 heures'], [3, 'Toutes les 3 heures'], [4, 'Toutes les 4 heures']]
        .map(([v, t]) => h('option', { value: String(v), text: t })));
    sel.value = String(state.settings.breakReminder || 0);
    sel.addEventListener('change', async () => {
      try { await setSetting({ breakReminder: Number(sel.value) }); Sound.play('nav'); }
      catch (e) { toast(e.message || String(e), 'error'); }
    });
    return h('div', { class: 'setting', id: 'row-breakReminder' },
      h('div', { class: 'setting-text' }, h('b', { text: 'Rappel de pause' }), h('small', { text: 'Une notification Windows (et un message dans Arcade) quand tu joues depuis longtemps.' })), sel);
  }

  const SHORTCUTS = [
    ['Entrée', 'Ouvrir la fiche du jeu sélectionné'],
    ['Ctrl + Entrée', 'Lancer le jeu sélectionné'],
    ['Espace', 'Lancer le jeu sélectionné'],
    ['← ↑ → ↓', 'Se déplacer entre les jeux'],
    ['F', 'Ajouter / retirer des favoris'],
    ['E', 'Modifier le jeu'],
    ['Suppr', 'Retirer de la bibliothèque'],
    ['Échap', 'Fermer / revenir à la bibliothèque'],
    ['/  ou  Ctrl + F', 'Rechercher'],
    ['Ctrl + N', 'Ajouter un jeu'],
    ['Ctrl + B', 'Réduire / agrandir le menu'],
    ['F11', 'Plein écran'],
    ['?', 'Afficher cette liste']
  ];
  function shortcutsList() {
    return h('div', { class: 'kb-list' }, ...SHORTCUTS.map(([k, t]) => h('div', { class: 'kb-row' }, h('span', { class: 'kb-keys' }, ...k.split(/\s{2,}ou\s{2,}/).flatMap((alt, i) => [i ? h('em', { text: 'ou' }) : null, h('kbd', { text: alt })]).filter(Boolean)), h('span', { text: t }))));
  }
  function openShortcuts() {
    openModal(h('div', { class: 'modal' },
      h('h3', { text: 'Raccourcis clavier' }),
      h('div', { class: 'modal-sub', text: 'Survole ou sélectionne un jeu, puis utilise ces touches.' }),
      h('div', { class: 'modal-body' }, shortcutsList()),
      h('div', { class: 'modal-foot' }, h('button', { class: 'btn primary', text: 'Fermer', onClick: closeModal }))));
  }

  function renderSettings() {
    const s = state.settings;
    const vol = h('input', { type: 'range', min: '0', max: '100', step: '1', value: String(s.volume) });
    const volVal = h('span', { class: 'val', text: s.volume + '%' });
    const volRow = h('div', { class: 'setting' + (s.sounds ? '' : ' disabled'), id: 'row-volume' },
      h('div', { class: 'setting-text' }, h('b', { text: 'Volume' }), h('small', { text: 'Règle le volume des sons du lanceur.' })),
      vol, volVal,
      h('button', { class: 'btn ghost', text: 'Tester', title: 'Jouer un son', 'data-snd': 'none', onClick: () => Sound.play('success') }));
    vol.addEventListener('input', () => {
      volVal.textContent = vol.value + '%';
      state.settings.volume = Number(vol.value);
      applySound();
    });
    vol.addEventListener('change', async () => { await api.setSettings({ volume: Number(vol.value) }); Sound.play('nav'); });

    const missing = h('button', { class: 'btn ghost', text: 'Rechercher les couvertures manquantes', onClick: () => {
      const todo = state.games.filter((g) => !g.cover && !g.coverUrl);
      if (!todo.length) return toast('Tous tes jeux ont déjà une couverture.', 'ok');
      todo.forEach((g) => { state.attempted.add(g.id); state.queue.push(g.id); });
      toast(`Recherche de ${todo.length} couverture(s)…`);
      pumpCovers();
    } });

    $('#settings').replaceChildren(
      h('div', { class: 'set-group' },
        h('h2', { text: 'Sons' }),
        switchRow('Sons de l\'interface', 'Petits sons doux lors des clics, des ouvertures et du lancement des jeux.', 'sounds', (on) => {
          $('#row-volume').classList.toggle('disabled', !on);
          $('#row-hoverSounds').classList.toggle('disabled', !on);
          $('#row-clickSounds').classList.toggle('disabled', !on);
        }),
        volRow,
        (() => { const r = switchRow('Sons au clic', 'Un petit son doux quand tu cliques sur un bouton ou changes de section.', 'clickSounds'); if (!s.sounds) r.classList.add('disabled'); return r; })(),
        (() => { const r = switchRow('Sons au survol', 'Un léger tic quand la souris passe sur un jeu.', 'hoverSounds'); if (!s.sounds) r.classList.add('disabled'); return r; })()
      ),
      h('div', { class: 'set-group' },
        h('h2', { text: 'Performance' }),
        switchRow('Animations', 'Désactive les transitions et animations (survols, ouvertures, clics, défilements). Idéal sur un PC modeste.', 'animations', () => applyAppearance()),
        switchRow('Effets visuels', 'Désactive les effets lourds : flous, lueurs, fond animé et ambiance. Plus fluide, un peu moins joli.', 'effects', () => applyAppearance())
      ),
      h('div', { class: 'set-group' },
        h('h2', { text: 'Apparence' }),
        langRow(),
        themeRow(),
        autoMenuRow(),
        accentRow(),
        logoRow(),
        switchRow('Fond animé', 'Grille pixel, lueurs et petits pixels qui scintillent derrière le lanceur (comme à l\'écran de chargement).', 'bgfx', () => applyAppearance()),
        switchRow('Ambiance', 'L\'image du jeu survolé s\'étend en fond, flou et discret, derrière la bibliothèque.', 'ambient', () => applyAppearance()),
        switchRow('Diaporama au repos', 'Si tu ne touches à rien pendant un moment, les images de tes jeux défilent doucement en fond.', 'slideshow', () => stopShow()),
        switchRow("Animation de démarrage", "Petite animation du logo à l'ouverture d'Arcade.", 'introAnim')
      ),
      h('div', { class: 'set-group' },
        h('h2', { text: 'Affichage et manette' }),
        h('div', { class: 'setting' }, h('div', { class: 'setting-text' }, h('b', { text: 'Plein écran' }), h('small', { text: 'Raccourci : F11. Échap pour en sortir.' })),
          h('button', { class: 'btn ghost', text: 'Basculer', 'data-snd': 'none', onClick: toggleFullscreen })),
        (() => { const r = h('label', { class: 'setting', id: 'row-tv' }, h('div', { class: 'setting-text' }, h('b', { text: 'Mode télé' }), h('small', { text: 'Plein écran, menu réduit, sélection bien visible, curseur masqué quand tu ne bouges pas la souris. Idéal avec une manette (croix : naviguer, A : jouer, Y : fiche, X : favori, LB/RB : sections, Start : plein écran).' })),
          h('span', { class: 'switch' }, (() => { const i = h('input', { type: 'checkbox' }); i.checked = document.body.classList.contains('tv'); i.addEventListener('change', () => { Sound.play(i.checked ? 'toggleOn' : 'toggleOff'); setTv(i.checked); }); return i; })(), h('i'))); return r; })()
      ),
      h('div', { class: 'set-group' },
        h('h2', { text: 'Système' }),
        switchRow('Réduire Arcade quand un jeu se lance', 'Arcade se réduit dans la barre des tâches pendant que tu joues, pour ne consommer aucune ressource.', 'minimizeOnLaunch'),
        switchRow('Vérifier les mises à jour au démarrage', 'Arcade regarde en arrière-plan s\'il existe une nouvelle version et te le propose.', 'checkUpdates'),
        updateRow(),
        switchRow('Lancer Arcade au démarrage de Windows', 'Arcade s\'ouvre tout seul quand tu allumes ton PC.', 'startWithWindows'),
        switchRow('Garder Arcade dans la zone de notification', 'Quand tu fermes la fenêtre, Arcade reste en arrière-plan (icône près de l\'horloge) : clique dessus pour le rouvrir. Avec le démarrage Windows, il démarre alors discrètement.', 'trayMode', (on) => {
          toast(on ? 'Arcade restera actif dans la zone de notification quand tu fermes la fenêtre.' : 'Arcade se fermera complètement avec sa fenêtre.', 'ok');
        }),
        reminderRow()
      ),
      h('div', { class: 'set-group' },
        h('h2', { text: 'Raccourcis clavier' }),
        h('div', { class: 'setting stack' }, shortcutsList())
      ),
      h('div', { class: 'set-group' },
        h('h2', { text: 'Couvertures' }),
        switchRow('Couvertures automatiques', 'À l\'ajout d\'un jeu, télécharge une couverture HD depuis Steam. Seul le nom du jeu est envoyé.', 'autoCovers'),
        h('div', { class: 'setting' }, h('div', { class: 'setting-text' }, h('b', { text: 'Couvertures manquantes' }), h('small', { text: 'Relance la recherche pour les jeux sans image.' })), missing)
      ),
      perfPanel(),
      h('div', { class: 'set-group' },
        h('h2', { text: 'Entretien' }),
        h('div', { class: 'setting' }, h('div', { class: 'setting-text' }, h('b', { text: 'Vérifier la bibliothèque' }), h('small', { text: 'Repère les jeux dont le fichier a disparu et les jeux ajoutés en double, et te propose de les nettoyer.' })),
          h('button', { class: 'btn ghost', text: 'Vérifier', 'data-snd': 'none', onClick: () => libraryCheck(false) })),
        state.installed ? h('div', { class: 'setting' }, h('div', { class: 'setting-text' }, h('b', { text: 'Désinstaller Arcade' }), h('small', { text: 'Supprime Arcade de ton ordinateur. Tu peux garder ta bibliothèque pour une future installation.' })),
          h('button', { class: 'btn danger', text: 'Désinstaller', 'data-snd': 'none', onClick: confirmUninstall })) : null
      ),
      h('div', { class: 'set-group danger-zone' },
        h('h2', { text: 'Réinitialisation' }),
        h('div', { class: 'setting' }, h('div', { class: 'setting-text' }, h('b', { text: 'Tout remettre à zéro' }), h('small', { text: 'Efface ta bibliothèque, tes catégories, tes statistiques, tes couvertures et tous tes réglages : Arcade redevient comme neuf. Les fichiers de tes jeux ne sont pas touchés.' })),
          h('button', { class: 'btn danger', 'data-snd': 'none', onClick: confirmReset }, icon('trash'), 'Tout réinitialiser'))
      ),
      h('div', { class: 'set-group' },
        h('h2', { text: 'À propos' }),
        h('div', { class: 'setting' }, h('div', { class: 'setting-text' }, h('b', { text: 'Arcade ' + APP_VERSION }), h('small', { text: 'Tes données sont dans le sous-dossier data du dossier d\'installation.' })), h('button', { class: 'btn', 'data-snd': 'none', onClick: openNews }, icon('check'), 'Voir les nouveautés'))
      )
    );
  }

  // ---------- Événements ----------
  document.querySelectorAll('#nav .nav-item').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $('#btn-settings').addEventListener('click', () => setView('settings'));
  $('#btn-news').addEventListener('click', openNews);
  $('#btn-ach').addEventListener('click', openAch);
  refreshNewsDot();
  $('#btn-collapse').addEventListener('click', toggleSidebar);
  (() => {
    const sb = $('.sidebar'); let t = null;
    sb.addEventListener('mouseenter', () => { if (!autoMenu()) return; clearTimeout(t); document.body.classList.add('menu-open'); });
    sb.addEventListener('mouseleave', () => { clearTimeout(t); t = setTimeout(() => document.body.classList.remove('menu-open'), 180); });
  })();
  $('#btn-cats').addEventListener('click', openCatsModal);
  $('#btn-full').addEventListener('click', toggleFullscreen);
  // Logo : change le mode du menu — automatique → déplié en permanence → fermé en permanence → automatique
  $('#btn-brand').addEventListener('click', () => {
    const setAuto = (v) => { try { localStorage.setItem('arcade.autoMenu', v ? '1' : '0'); } catch {} };
    Sound.play('pop');
    if (autoMenu()) { state.settings.sidebarCollapsed = true; setAuto(false); toggleSidebar(); }
    else if (!state.settings.sidebarCollapsed) toggleSidebar();
    else { setAuto(true); applySidebar(); }
    if (document.getElementById('row-autoMenu')) { const i = document.querySelector('#row-autoMenu input'); if (i) i.checked = autoMenu(); }
  });
  $('#btn-add').addEventListener('click', () => openGameModal(null));
  $('#btn-add-empty').addEventListener('click', () => openGameModal(null));
  $('#btn-scan').addEventListener('click', () => scanFlow());
  $('#btn-import').addEventListener('click', () => importFlow());
  $('#btn-import-empty').addEventListener('click', () => importFlow());
  $('#btn-lucky').addEventListener('click', () => luckyFlow());
  $('#search').addEventListener('input', (e) => { state.query = e.target.value; render(); });
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
  $('#size').addEventListener('input', (e) => {
    const v = Number(e.target.value);
    applyCardSize(v);
  });
  $('#size').addEventListener('change', (e) => api.setSettings({ cardSize: Number(e.target.value) }));

  // ---------- Fond animé : petits pixels qui scintillent (mêmes que l'écran de chargement) ----------
  (function buildBgPixels() {
    const box = document.getElementById('bgfx'); if (!box) return;
    const sizes = [6, 6, 6, 8, 10];
    for (let i = 0; i < 34; i++) {
      const p = document.createElement('i'); p.className = 'bg-px';
      const s = sizes[Math.floor(Math.random() * sizes.length)];
      p.style.cssText = `left:${(Math.random() * 98).toFixed(1)}%;top:${(Math.random() * 96).toFixed(1)}%;width:${s}px;height:${s}px;--d:${(Math.random() * 2.6).toFixed(2)}s`;
      box.appendChild(p);
    }
  })();

  // ---------- Animation de clic : tous les boutons (enfoncement + rebond + onde) ----------
  const PRESS_SEL = 'button, select, .switch, label.pcol, .scan-item, .card, .setting.inline, summary, [role="button"]';
  const pressed = new Map();
  const reduceMotion = () => reducedMotion();
  function pressTarget(e) {
    const el = e.target.closest && e.target.closest(PRESS_SEL);
    if (!el || el.disabled || el.closest('[data-nopress]') || el.closest('#splash')) return null;
    // un bouton à l'intérieur d'une carte : on anime le bouton, pas toute la carte
    return el;
  }
  function ring(x, y, big) {
    const r = document.createElement('i'); r.className = 'click-ring';
    r.style.left = x + 'px'; r.style.top = y + 'px';
    document.body.appendChild(r);
    const s = big ? 70 : 46;
    const a = r.animate([{ transform: 'translate(-50%,-50%) scale(.1)', opacity: .55 }, { transform: 'translate(-50%,-50%) scale(' + (s / 20) + ')', opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.2,.7,.3,1)' });
    a.onfinish = () => r.remove();
  }
  function pressDown(el, x, y) {
    if (reduceMotion()) return;
    const k = el.classList.contains('card') ? .975 : el.offsetWidth > 260 ? .985 : .93;
    pressed.get(el)?.cancel();
    const a = el.animate([{ scale: 1 }, { scale: k }], { duration: 110, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
    pressed.set(el, a);
    if (x != null && !el.classList.contains('card')) ring(x, y, el.offsetWidth > 120);
  }
  function pressUp(el) {
    const a = pressed.get(el); if (!a) return;
    pressed.delete(el);
    const cur = getComputedStyle(el).scale; const from = cur && cur !== 'none' ? cur : '1';
    a.cancel();
    el.animate([{ scale: from }, { scale: 1.05 }, { scale: 1 }], { duration: 280, easing: 'cubic-bezier(.34,1.56,.64,1)' });
  }
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const el = pressTarget(e); if (!el) return;
    pressDown(el, e.clientX, e.clientY);
    const up = () => { pressUp(el); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true); };
    window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', up, true);
  }, true);
  document.addEventListener('keydown', (e) => {
    if ((e.key !== 'Enter' && e.key !== ' ') || e.repeat) return;
    const el = e.target.closest && e.target.closest('button, .switch, summary, [role="button"]'); if (!el || el.disabled) return;
    const r = el.getBoundingClientRect(); pressDown(el, r.left + r.width / 2, r.top + r.height / 2);
    const up = () => { pressUp(el); el.removeEventListener('keyup', up); el.removeEventListener('blur', up); };
    el.addEventListener('keyup', up); el.addEventListener('blur', up);
  }, true);

  document.addEventListener('mousedown', (e) => { if (!e.target.closest('#ctx')) closeMenu(); });
  document.addEventListener('click', (e) => {
    const el = e.target.closest('button, select');
    if (!el || el.closest('[data-snd="none"]') || el.closest('.card')) return;
    if (el.classList.contains('nav-item')) return Sound.play('nav');
    Sound.play('click');
  });
  let lastTick = 0;
  $('#size').addEventListener('input', () => { const n = performance.now(); if (n - lastTick > 60) { lastTick = n; Sound.play('tick'); } });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeMenu(); if (!$('#modal-root').hidden) closeModal(); else if (detailId) closeDetail(); }
    if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); $('#search').focus(); $('#search').select(); }
    if (e.ctrlKey && e.key.toLowerCase() === 'b') { e.preventDefault(); toggleSidebar(); }
    if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); openGameModal(null); }
  });

  // ---------- Raccourcis clavier ----------
  const isTyping = (t) => !!t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable);
  function kbGame() {
    if (detailId) return state.games.find((g) => g.id === detailId) || null;
    const id = document.activeElement?.closest?.('.card')?.dataset.id || hoverGameId;
    return state.games.find((g) => g.id === id) || null;
  }
  function moveFocus(key) {
    const cards = [...document.querySelectorAll('#grid .card')];
    if (!cards.length) return;
    const cur = document.activeElement?.closest?.('.card');
    if (!cur) { cards[0].focus(); return; }
    const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bd = Infinity;
    for (const c of cards) {
      if (c === cur) continue;
      const b = c.getBoundingClientRect(), dx = b.left + b.width / 2 - cx, dy = b.top + b.height / 2 - cy;
      const horiz = key === 'ArrowLeft' || key === 'ArrowRight';
      const ok = key === 'ArrowRight' ? dx > r.width * 0.4 && Math.abs(dy) < r.height * 0.6
        : key === 'ArrowLeft' ? dx < -r.width * 0.4 && Math.abs(dy) < r.height * 0.6
        : key === 'ArrowDown' ? dy > r.height * 0.4 : dy < -r.height * 0.4;
      if (!ok) continue;
      const d = horiz ? Math.abs(dx) + Math.abs(dy) * 3 : Math.abs(dy) + Math.abs(dx) * 3;
      if (d < bd) { bd = d; best = c; }
    }
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest' }); Sound.play('tick'); }
  }
  document.addEventListener('keydown', (e) => {
    if (!booted || !$('#modal-root').hidden || isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === 'F11') { e.preventDefault(); return toggleFullscreen(); }
    if (k === '?' || (k === '/' && e.shiftKey)) { e.preventDefault(); return openShortcuts(); }
    if (k === '/') { e.preventDefault(); if (detailId) closeDetail(); $('#search').focus(); return; }
    if (state.view === 'settings' && !detailId) return;
    if (!detailId && k.startsWith('Arrow')) { e.preventDefault(); return moveFocus(k); }
    const g = kbGame();
    if (!g) return;
    const onButton = !!e.target.closest?.('button, a, label');
    if (detailId) { if ((k === 'Enter' || k === ' ') && !onButton) { e.preventDefault(); launch(g); return; } }
    else if (k === ' ' && document.activeElement?.closest?.('.card')) { e.preventDefault(); launch(g); return; }
    if (k === 'f' || k === 'F') { e.preventDefault(); Sound.play(g.favorite ? 'unfav' : 'fav'); api.updateGame(g.id, { favorite: !g.favorite }).then(load); }
    else if (k === 'e' || k === 'E') { e.preventDefault(); openGameModal(g); }
    else if (k === 'Delete') { e.preventDefault(); confirmRemove(g); }
  });

  document.addEventListener('visibilitychange', () => document.body.classList.toggle('paused', document.hidden));

  // ---------- Démarrage ----------
  const bootStart = performance.now();
  const splash = $('#splash');
  let booted = false;
  function endSplash() {
    if (booted) return;
    booted = true;
    $('#grid').classList.add('stagger');
    state.lastKey = '';
    render(); // relance la cascade des cartes pendant l'apparition
    document.querySelectorAll('.sidebar .brand, .sidebar .nav-item, .sidebar .btn.block').forEach((el, i) => el.style.setProperty('--i', i));
    $('.sidebar').classList.add('enter');
    $('.main').classList.add('enter');
    document.body.classList.remove('booting');
    splash.classList.add('out');
    setTimeout(() => {
      splash.remove();
      $('.sidebar').classList.remove('enter');
      $('.main').classList.remove('enter');
      $('#grid').classList.remove('stagger');
    }, 2200);
  }
  splash.addEventListener('pointerdown', endSplash);
  document.addEventListener('keydown', () => { if (!booted) endSplash(); }, { capture: true });

  api.onChanged(load);
  load().then(() => {
    const reduce = reducedMotion();
    if (state.settings.introAnim === false || reduce) { splash.classList.add('quick'); endSplash(); return; }
    const n = state.games.length, st = $('#splash-status');
    if (st) st.textContent = n ? n + (n > 1 ? ' jeux prêts' : ' jeu prêt') : 'Bienvenue';
    setTimeout(() => Sound.play('start'), 150);
    setTimeout(endSplash, Math.max(0, 2100 - (performance.now() - bootStart)));
    if (state.settings.checkUpdates !== false) setTimeout(() => checkUpdate(false), 5000);
    setTimeout(pollPerf, 1500);
  }).catch(() => endSplash());
})();
