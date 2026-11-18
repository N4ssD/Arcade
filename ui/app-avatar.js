// Arcade — avatar : bande, éditeur, humeurs
// Scripts classiques : les const/let/function du niveau supérieur sont partagés entre les fichiers app-*.js (chargés dans l'ordre de index.html).
'use strict';

// ---------- Avatar (personnage, niveau, pièces, éditeur) ----------
const AV = window.ARCAV;
const avOn = () => !!AV && state.settings.avatarOn !== false;
const avData = () => AV.sanitize(state.settings.avatar);
function avStats() { const done = achDone(); return AV.progress(achStats(done, achBase()).sec, Object.keys(done).length, rewardSum(done)); }
const avCoins = (a) => Math.max(0, avStats().earned - a.spent);
function svgNode(str) { const t = document.createElement('template'); t.innerHTML = str; return t.content.firstChild; } // str vient de ARCAV.svg (valeurs validées)
let avMsgIdx = 0;
// Vie de l'avatar : humeur (dort, content, impatient) et tenue automatique (heure, saison)
const mood = { lastInput: Date.now(), baseline: Date.now(), navCount: 0, happyUntil: 0, impatientUntil: 0, impMsg: '', say: null, prevRun: 0, key: '' };
function avOutfit() {
  if (state.settings.avatarAuto === false) return null;
  const d = new Date(), m = d.getMonth() + 1, day = d.getDate(), hr = d.getHours();
  if ((m === 10 && day >= 25) || (m === 11 && day === 1)) return { name: 'halloween', over: { acc: 'witch', top: 'pumpkin', topC: '#E8663D', bottomC: '#2a1a3a' }, say: 'Joyeux Halloween ! Bonbon ou sort ?' };
  if (hr >= 23 || hr < 6) return { name: 'night', over: { acc: 'nightcap', top: 'pajama', topC: '#3B2F8F', bottom: 'pants', bottomC: '#3B2F8F' }, say: 'Il est tard… une dernière partie avant de dormir ?' };
  if (m === 12 || m <= 2) return { name: 'winter', over: { acc: 'beanie' }, say: 'Il fait froid dehors, reste au chaud avec un jeu !' };
  if (hr >= 13 && hr < 18) return { name: 'sun', over: { acc: 'shades' }, say: 'Beau temps pour une partie à l\'ombre !' };
  return null;
}
function avMood() {
  const now = Date.now();
  if (state.running && state.running.size) return 'happy';
  if (now < mood.happyUntil) return 'happy';
  if (now - mood.lastInput > 90000) return 'sleep';
  if (now < mood.impatientUntil) return 'impatient';
  return '';
}
function avRunWatch() {
  const n = state.running ? state.running.size : 0, now = Date.now();
  if (n > mood.prevRun) { mood.baseline = now; mood.navCount = 0; mood.say = null; }
  if (n === 0 && mood.prevRun > 0) { mood.happyUntil = now + 30000; mood.lastInput = now; mood.say = { text: 'Alors, c\'était bien ?', until: now + 30000 }; }
  mood.prevRun = n;
}
function avTick() {
  const now = Date.now();
  if (avMood() === '' && !(state.running && state.running.size) && (mood.navCount >= 8 || (now - mood.baseline > 180000 && now - mood.lastInput < 30000))) {
    mood.impatientUntil = now + 25000; mood.navCount = 0; mood.baseline = now; mood.impMsg = ['Alors, on se décide ?', 'Je m\'impatiente… on joue ?', 'Tu cherches encore ? Lance-en un au hasard !'][Math.floor(Math.random() * 3)];
  }
  const o = avOutfit(), key = avMood() + '|' + (o ? o.name : '');
  if (key !== mood.key && avOn()) renderAvatar();
}
const avInput = () => {
  const now = Date.now(), asleep = now - mood.lastInput > 90000;
  mood.lastInput = now;
  if (asleep && avOn()) { mood.happyUntil = now + 6000; mood.say = { text: 'Oh, te revoilà !', until: now + 6000 }; avTick(); }
};
['pointermove', 'pointerdown', 'keydown', 'wheel', 'focus'].forEach((ev) => addEventListener(ev, () => { if (Date.now() - mood.lastInput > 400) avInput(); }, { passive: true, capture: true }));
setInterval(() => { if (!document.hidden && booted) avTick(); }, 5000);
function avatarSays() {
  const games = state.games || [], now = Date.now(), msgs = [];
  const mo = avMood();
  if (mo === 'sleep') return ['Zzz…'];
  if (mood.say && now < mood.say.until) return [mood.say.text];
  if (mo === 'impatient') return [mood.impMsg];
  const hour = new Date().getHours();
  if (!games.length) return ['Ajoute ton premier jeu, je t\'attends !'];
  if (state.running && state.running.size) return ['Bon jeu ! Je garde la place au chaud.', 'Amuse-toi bien, je t\'attends ici.'];
  const idle = games.filter((g) => g.lastPlayed && g.playtime > 3600 && now - g.lastPlayed > 3 * 86400000).sort((a, b) => b.playtime - a.playtime)[0];
  if (idle) msgs.push('Ça fait ' + Math.floor((now - idle.lastPlayed) / 86400000) + ' jours que tu n\'as pas relancé ' + idle.name + '.');
  const st = achStats();
  if (st.streak >= 3) msgs.push('Tu as joué ' + st.streak + ' jours d\'affilée, bravo !');
  const a = avData(), coins = avCoins(a);
  const wish = Object.values(AV.ITEMS).flat().filter((i) => i.price && !a.owned.includes(i.id)).sort((x, y) => x.price - y.price)[0];
  if (wish && coins >= wish.price) msgs.push('Tu as ' + coins + ' pièces : va voir les nouveaux objets !');
  const fav = games.filter((g) => g.favorite)[0];
  if (fav) msgs.push('Et si on relançait ' + fav.name + ' ?');
  const fit = avOutfit(); if (fit) msgs.unshift(fit.say);
  msgs.push(hour >= 18 || hour < 5 ? 'Bonsoir ! Prêt pour une partie ?' : hour < 12 ? 'Bonjour ! Qu\'est-ce qu\'on joue aujourd\'hui ?' : 'Salut ! Une petite partie ?');
  return msgs;
}
function renderAvatar() {
  const on = avOn();
  const navBtn = $('#btn-avatar'), panel = $('#av-panel');
  if (!navBtn || !panel) return;
  navBtn.hidden = !on;
  const lib = !(state.view === 'settings' || state.view === 'stats');
  const open = on && lib && state.settings.avatarPanel !== false;
  document.body.classList.toggle('av-open', open);
  panel.hidden = !open;
  if (!on) return;
  const a = avData(), pr = avStats();
  navBtn.querySelector('.av-ic').replaceChildren(svgNode(AV.svg(a, 'face', 20, { mood: avMood() })));
  $('#av-lv').textContent = 'Niv. ' + pr.level;
  if (!open) return;
  const curMood = avMood(), outfit = avOutfit();
  mood.key = curMood + '|' + (outfit ? outfit.name : '');
  panel.classList.toggle('still', reducedMotion());
  const msgs = avatarSays(), msg = msgs[avMsgIdx % msgs.length];
  const bg = AV.BGS[a.bg] || AV.BGS.b0;
  panel.style.setProperty('--bg1', bg[0]); panel.style.setProperty('--bg2', bg[1]);
  panel.replaceChildren(
    h('button', { class: 'av-who mood-' + (curMood || 'calm'), title: 'Clique pour me parler', 'data-snd': 'none', onClick: () => { avMsgIdx++; renderAvatar(); const c = $('#av-panel .av-who span'); if (c) c.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-7px)' }, { transform: 'translateY(0)' }], { duration: 260, easing: 'ease-out' }); } },
      h('span', {}, svgNode(AV.svg(a, 'full', 40, { ...(outfit ? outfit.over : {}), mood: curMood }))), curMood === 'sleep' ? [h('i', { class: 'av-z z1', text: 'z' }), h('i', { class: 'av-z z2', text: 'Z' })] : null),
    h('div', { class: 'av-bubble', text: msg }),
    h('span', { class: 'av-sp' }),
    h('span', { class: 'av-coins' }, h('i', { class: 'av-coin' }), String(avCoins(a))),
    h('div', { class: 'av-lvl' }, h('div', {}, h('span', { text: 'Niv. ' + pr.level }), h('em', { text: Math.round(pr.pct * 100) + ' %' })), h('div', { class: 'd-bar' }, h('i', { style: { width: Math.max(3, Math.round(pr.pct * 100)) + '%' } }))),
    h('button', { class: 'btn primary av-edit', text: 'Personnaliser', onClick: openAvatarEditor }),
    h('button', { class: 'av-x', title: 'Masquer la bande', 'aria-label': 'Masquer la bande', 'data-snd': 'none', text: '✕', onClick: () => { setSetting({ avatarPanel: false }); renderAvatar(); } }));
}
function toggleAvatarPanel() {
  if (state.view === 'settings' || state.view === 'stats') { setView('all'); setSetting({ avatarPanel: true }); renderAvatar(); return; }
  setSetting({ avatarPanel: state.settings.avatarPanel === false }); renderAvatar();
}

const AV_CATS = [
  { id: 'skin', n: 'Peau', col: ['skin', 'SKINS'] },
  { id: 'hair', n: 'Cheveux', key: 'hs', view: 'head', col: ['hair', 'HAIRS'] },
  { id: 'face', n: 'Visage', key: 'face', view: 'head' },
  { id: 'top', n: 'Haut', key: 'top', view: 'top', col: ['topC', 'CLOTHES'] },
  { id: 'bottom', n: 'Bas', key: 'bottom', view: 'bottom', col: ['bottomC', 'BOTTOMS'] },
  { id: 'shoes', n: 'Chaussures', key: 'shoes', view: 'shoes', col: ['shoesC', 'SHOES'] },
  { id: 'acc', n: 'Accessoires', key: 'acc', view: 'head' },
  { id: 'bg', n: 'Fond', key: 'bg' },
];
function openAvatarEditor() {
  let d = avData(), cat = 'top';
  const done = achDone(), earned = avStats().earned;
  const coins = () => Math.max(0, earned - d.spent);
  const unlocked = (it) => (!it.price && !it.ach) || d.owned.includes(it.id) || (it.ach && !!done[it.ach]);
  const prev = h('div', { class: 'av-prev' }), side = h('div', { class: 'av-cats' }), pane = h('div', { class: 'av-pane' }), coinEl = h('span', { class: 'av-coins big' });
  function pick(c, it) {
    if (!unlocked(it)) {
      if (it.ach) return toast('Verrouillé : ' + it.need + ' pour le débloquer.');
      if (coins() < it.price) return toast('Il te manque ' + (it.price - coins()) + ' pièces pour « ' + it.n + ' ».');
      d.spent += it.price; d.owned = [...d.owned, it.id]; bump('purchases'); Sound.play('success'); toast('Acheté : ' + it.n, 'ok');
    } else Sound.play('tick');
    d[c.key] = it.id; paint();
  }
  function paint() {
    const bg = AV.BGS[d.bg] || AV.BGS.b0;
    prev.style.setProperty('--bg1', bg[0]); prev.style.setProperty('--bg2', bg[1]);
    prev.replaceChildren(svgNode(AV.svg(d, 'full', 230)), h('div', { class: 'av-prev-acts' },
      h('button', { class: 'btn ghost', text: 'Aléatoire', 'data-snd': 'none', onClick: () => {
        const r = (arr) => arr[Math.floor(Math.random() * arr.length)];
        const ok = (cat) => AV.ITEMS[cat].filter(unlocked).map((i) => i.id);
        d = { ...d, skin: r(AV.SKINS), hair: r(AV.HAIRS), hs: r(ok('hair')), face: r(ok('face')), top: r(ok('top')), topC: r(AV.CLOTHES), bottom: r(ok('bottom')), bottomC: r(AV.BOTTOMS), shoes: r(ok('shoes')), shoesC: r(AV.SHOES), acc: r(ok('acc')), bg: r(ok('bg')) };
        Sound.play('pop'); paint();
      } }),
      h('button', { class: 'btn ghost', text: 'Réinitialiser', 'data-snd': 'none', onClick: () => { d = { ...AV.sanitize({}), owned: d.owned, spent: d.spent, claimed: d.claimed }; paint(); } })));
    coinEl.replaceChildren(h('i', { class: 'av-coin' }), coins() + ' pièces');
    side.replaceChildren(...AV_CATS.map((c) => h('button', { class: 'av-cat' + (c.id === cat ? ' on' : ''), 'data-snd': 'nav', text: c.n, onClick: () => { cat = c.id; paint(); } })));
    const c = AV_CATS.find((x) => x.id === cat);
    const kids = [h('div', { class: 'av-lab', text: c.n })];
    if (c.key) kids.push(h('div', { class: 'av-items' }, AV.ITEMS[c.id === 'bg' ? 'bg' : c.id].map((it) => {
      const un = unlocked(it), sel = d[c.key] === it.id;
      const thumb = c.id === 'bg' ? h('i', { class: 'av-bgthumb', style: { background: 'linear-gradient(160deg,' + AV.BGS[it.id][0] + ',' + AV.BGS[it.id][1] + ')' } }) : svgNode(AV.svg({ ...d, [c.key]: it.id }, c.view, c.view === 'head' ? 70 : 76));
      const tag = sel ? h('span', { class: 'av-tag own', text: 'Porté' }) : un ? h('span', { class: 'av-tag own', text: 'Possédé' })
        : it.ach ? h('span', { class: 'av-tag ach', text: '🔒 ' + it.need }) : h('span', { class: 'av-tag buy' }, h('i', { class: 'av-coin' }), String(it.price));
      return h('button', { class: 'av-item' + (sel ? ' on' : '') + (un ? '' : ' lock'), title: it.n, 'data-snd': 'none', onClick: () => pick(c, it) }, h('span', { class: 'av-thumb' }, thumb), h('b', { text: it.n }), tag);
    })));
    if (c.col) {
      kids.push(h('div', { class: 'av-lab', text: 'Couleur' }), h('div', { class: 'av-sw' }, AV[c.col[1]].map((col) =>
        h('button', { class: 'av-col' + (d[c.col[0]] === col ? ' on' : ''), style: { '--c': col }, 'aria-label': col, 'data-snd': 'tick', onClick: () => { d[c.col[0]] = col; paint(); } }))));
    }
    kids.push(h('p', { class: 'av-help', text: 'Les pièces se gagnent en jouant (1 par heure) et en débloquant des succès (10 chacun). Certains objets se débloquent avec un succès.' }));
    pane.replaceChildren(...kids);
  }
  paint();
  openModal(h('div', { class: 'modal av-modal' },
    h('div', { class: 'av-mh' }, h('h3', { text: 'Mon avatar' }), h('small', { text: 'Niveau ' + avStats().level }), h('span', { style: { flex: 1 } }), coinEl),
    h('div', { class: 'av-body' }, side, prev, pane),
    h('div', { class: 'modal-foot' },
      h('button', { class: 'btn', text: 'Annuler', onClick: closeModal }),
      h('button', { class: 'btn primary', text: 'Enregistrer', onClick: async () => {
        try { await setSetting({ avatar: d }); bump('avatarSaves'); closeModal(); renderAvatar(); toast('Avatar enregistré.', 'ok'); } catch (e) { toast(e.message || String(e), 'error'); }
      } }))));
}
document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('#btn-avatar')) toggleAvatarPanel(); });
addEventListener('resize', () => { if (booted) renderAvatar(); });
