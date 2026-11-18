// Arcade — vues : plein écran/manette, statistiques, page de détail, lancement, menu contextuel, modales
// Scripts classiques : les const/let/function du niveau supérieur sont partagés entre les fichiers app-*.js (chargés dans l'ordre de index.html).
'use strict';

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

function setView(v) { mood.navCount++; detailId = null; document.getElementById('detail')?.remove(); state.view = v; render(); }

// ---------- Lancement ----------
async function launch(g) {
  const r = await api.launch(g.id);
  if (!r.ok) return toast(r.error || 'Impossible de lancer ce jeu.', 'error');
  Sound.play('launch');
  { const hr = new Date().getHours(); if (hr >= 22 || hr < 5) bump('nightLaunch'); else if (hr >= 5 && hr < 9) bump('morningLaunch'); }
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
