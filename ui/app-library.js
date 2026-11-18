// Arcade — bibliothèque : menu latéral, couvertures, catégories (aides), rendu, thème, ambiance
// Scripts classiques : les const/let/function du niveau supérieur sont partagés entre les fichiers app-*.js (chargés dans l'ordre de index.html).
'use strict';

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
    try { const lib = await api.getLibrary(); state.games = lib.games; state.categories = lib.categories || state.categories; state.running = new Set(lib.running); Music.release(state.running.size); } catch {}
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
  renderAvatar();
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

// Curseur en pixels (flèche + main) à la couleur du logo / de l'accent
const CUR_ARROW = ['X...........', 'XX..........', 'XOX.........', 'XOOX........', 'XOOOX.......', 'XOOOOX......', 'XOOOOOX.....', 'XOOOOOOX....', 'XOOOOOOOX...', 'XOOOOOOOOX..', 'XOOOOOXXXXX.', 'XOOXOOX.....', 'XOX.XOOX....', 'XX..XOOX....', 'X....XOOX...', '.....XOOX...', '......XX....'];
const CUR_HAND = ['....XX........', '...XOOX.......', '...XOOX.......', '...XOOX.......', '...XOOXXX.....', '...XOOXOOXX...', 'XX.XOOXOOXOOX.', 'XOXXOOOOOOOOOX', 'XOOXOOOOOOOOOX', '.XOOOOOOOOOOOX', '.XOOOOOOOOOOOX', '..XOOOOOOOOOX.', '..XOOOOOOOOOX.', '...XOOOOOOOX..', '...XOOOOOOOX..', '...XXXXXXXXX..'];
let curColor = '#9c7cf0';
function curUrl(bm, fill) {
  const px = 2, w = bm[0].length * px, h = bm.length * px;
  let r = '';
  bm.forEach((row, y) => [...row].forEach((c, x) => { if (c !== '.') r += `<rect x="${x * px}" y="${y * px}" width="${px}" height="${px}" fill="${c === 'X' ? '#121218' : fill}"/>`; }));
  return 'url("data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" shape-rendering="crispEdges">${r}</svg>`) + '")';
}
function applyCursor(color) {
  if (color && /^#[0-9a-f]{6}$/i.test(color)) curColor = color;
  const on = state.settings.cursor !== false, root = document.documentElement;
  document.body.classList.toggle('pxcur', on);
  if (!on) return;
  root.style.setProperty('--cur-arrow', curUrl(CUR_ARROW, curColor));
  root.style.setProperty('--cur-hand', curUrl(CUR_HAND, curColor));
}
let lastLogoKey = '';
function applyLogo(acc) {
  const own = /^#[0-9a-f]{6}$/i.test(state.settings.logo || '') ? state.settings.logo.toLowerCase() : acc;
  applyCursor(own);
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
        try { const big = made.find((m) => m[0] === 152) || made[made.length - 1]; api.setIcon(big[1]).catch(() => {}); } catch (_) {}
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
