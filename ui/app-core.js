// Arcade — noyau : état, aides DOM, formats, notifications, données, performances, mises à jour
// Scripts classiques : les const/let/function du niveau supérieur sont partagés entre les fichiers app-*.js (chargés dans l'ordre de index.html).
'use strict';

const api = window.arcade;
const APP_VERSION = '2.8.0';

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
  settings: { cardSize: 200, volume: 30, sounds: true, hoverSounds: true, clickSounds: true, autoCovers: true, sidebarCollapsed: false, introAnim: true },
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
  moon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></svg>',
  bag: '<svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>',
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
  if (typeof avRunWatch === 'function') avRunWatch();
  state.installed = !!lib.installed;
  setTimeout(applyIdle, 0);
  state.settings = { ...state.settings, ...lib.settings };
  // Une seule fois : le volume par défaut passe à 30 % (aussi pour les installations existantes)
  if (state.settings.volumeV !== 1) { state.settings.volume = 30; state.settings.volumeV = 1; api.setSettings({ volume: 30, volumeV: 1 }).catch(() => {}); }
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
