// Arcade — événements, fond animé, animations, raccourcis, démarrage
// Scripts classiques : les const/let/function du niveau supérieur sont partagés entre les fichiers app-*.js (chargés dans l'ordre de index.html).
'use strict';

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
$('#btn-scan').addEventListener('click', () => { bump('scans'); scanFlow(); });
$('#btn-import').addEventListener('click', () => { bump('imports'); importFlow(); });
$('#btn-import-empty').addEventListener('click', () => { bump('imports'); importFlow(); });
$('#btn-lucky').addEventListener('click', () => { bump('lucky'); luckyFlow(); });
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
  bump('opens');
  const reduce = reducedMotion();
  if (state.settings.introAnim === false || reduce) { splash.classList.add('quick'); endSplash(); return; }
  const n = state.games.length, st = $('#splash-status');
  if (st) st.textContent = n ? n + (n > 1 ? ' jeux prêts' : ' jeu prêt') : 'Bienvenue';
  setTimeout(() => Sound.play('start'), 150);
  setTimeout(endSplash, Math.max(0, 2100 - (performance.now() - bootStart)));
  if (state.settings.checkUpdates !== false) setTimeout(() => checkUpdate(false), 5000);
  setTimeout(pollPerf, 1500);
}).catch(() => endSplash());
