// Arcade — reprise, import Steam/Epic/GOG, surprise, glisser-déposer de fichiers
// Scripts classiques : les const/let/function du niveau supérieur sont partagés entre les fichiers app-*.js (chargés dans l'ordre de index.html).
'use strict';

// ---------- Reprendre : les 3 derniers jeux joués ----------
function resumeTile(g) {
  const running = state.running.has(g.id);
  const useIcon = !g.coverUrl && !!g.iconUrl;
  const thumb = h('div', { class: 'rs-thumb' + (useIcon ? ' iconcover' : ''), style: useIcon ? { '--ico': `url("${g.iconUrl}")` } : coverBackground(g) },
    useIcon ? h('img', { class: 'gicon', src: g.iconUrl, alt: '', draggable: 'false' })
      : g.coverUrl ? null : h('span', { class: 'letter', text: g.name.trim().charAt(0).toUpperCase() || '?' }));
  const meta = running ? 'En cours' : g.iconPending ? 'Création de l\'icône…' : [fmtLast(g.lastPlayed), g.playtime ? fmtPlaytime(g.playtime) : ''].filter(Boolean).join(' · ');
  return h('article', {
    class: 'rs-tile' + (running ? ' running' : ''), tabindex: '0', 'data-id': g.id,
    onClick: () => openDetail(g.id),
    onKeydown: (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) openDetail(g.id); },
    onMouseenter: () => setAmbient(g)
  }, thumb,
    h('div', { class: 'rs-info' }, h('div', { class: 'name', title: g.name, text: g.name }), h('div', { class: 'meta', text: meta })),
    h('button', { class: 'btn primary rs-play', 'data-snd': 'none', title: 'Jouer', 'aria-label': 'Jouer', onClick: (e) => { e.stopPropagation(); launch(g); } }, icon('play')));
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
let lastDropAdd = 0;
if (window.__TAURI__ && window.__TAURI__.event) {
  const ev = window.__TAURI__.event;
  ev.listen('arcade-drag', (e) => { $('#dropzone').classList.toggle('show', !!(e.payload && e.payload.over)); });
  ev.listen('arcade-dropped', async (e) => {
    const { added = 0, skipped = 0 } = e.payload || {};
    if (added) { lastDropAdd = Date.now(); Sound.play('success'); toast(`${added} jeu(x) ajouté(s).`, 'ok'); await load(); }
    else if (skipped) toast('Dépose des raccourcis (.lnk, .url) ou des .exe.', 'error');
    else if (Date.now() - lastDropAdd > 5000) toast('Ce jeu est déjà dans ta bibliothèque.', ''); // Windows peut envoyer le dépôt deux fois : on ignore le doublon juste après un ajout
  });
}
