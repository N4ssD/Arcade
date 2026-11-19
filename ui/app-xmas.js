// Arcade — thème de Noël : guirlande, neige, sapin, bonnet sur le logo et accent rouge (du 1er décembre au 6 janvier, ou selon le réglage)
'use strict';

const XMAS_RED = '#e8505b';
// 0 = jamais, 1 = automatique (période de Noël), 2 = toujours
function xmasOn() {
  const m = state.settings.xmasMode == null ? 1 : state.settings.xmasMode;
  if (m === 2) return true;
  if (m === 0) return false;
  const d = new Date();
  return d.getMonth() === 11 || (d.getMonth() === 0 && d.getDate() <= 6);
}

const XM_TREE = ['.......YY.......', '.......YY.......', '......GGGG......', '.....GGRGGG.....', '....GGGGGBGG....', '.....GGGGGG.....', '....GGBGGGRG....', '...GGGGGGGGGG...', '..GGRGGGGGBGGG..', '....GGGGGGGG....', '...GGGGBGGGGRG..', '..GGGGGGGGGGGG..', '.GGBGGGGRGGGGGG.', 'GGGGGGGGGGGGGGGG', '.......TT.......', '.......TT.......'];
const XM_COL = { Y: '#ffd166', G: '#2f9e5b', R: '#ff4d5e', B: '#5ec2ff', T: '#7a4a2a' };
const XM_HAT = ['....RRRR....', '..RRRRRRR...', '.RRRRRRRRR..', 'RRRRRRRRRRRR', 'WWWWWWWWWWWW', 'WWWWWWWWWWWW'];
const SVG_ST = 'stroke:none;overflow:visible'; // le style global « svg » impose une taille et un trait : on les neutralise

function xmTreeSvg() {
  let r = '';
  XM_TREE.forEach((row, y) => [...row].forEach((c, x) => { if (c !== '.') r += `<rect x="${x * 5}" y="${y * 5}" width="5" height="5" fill="${XM_COL[c]}"/>`; }));
  r += '<rect x="3" y="70" width="20" height="10" fill="#ff4d5e"/><rect x="11" y="70" width="4" height="10" fill="#ffd166"/><rect x="58" y="66" width="18" height="14" fill="#5ec2ff"/><rect x="65" y="66" width="4" height="14" fill="#fff"/>';
  return `<svg viewBox="0 0 80 80" shape-rendering="crispEdges" style="width:80px;height:80px;${SVG_ST}">${r}</svg>`;
}
function xmHatSvg() {
  let r = '';
  XM_HAT.forEach((row, y) => [...row].forEach((c, x) => { if (c !== '.') r += `<rect x="${x * 3}" y="${y * 3}" width="3" height="3" fill="${c === 'R' ? '#ff4d5e' : '#fff'}"/>`; }));
  r += '<rect x="30" y="0" width="6" height="6" fill="#fff"/>';
  return `<svg viewBox="0 0 36 18" shape-rendering="crispEdges" style="width:36px;height:18px;${SVG_ST}">${r}</svg>`;
}
function xmGarlandSvg(W) {
  const cols = ['#ff4d5e', '#ffd166', '#58d68d', '#5ec2ff', '#ff8f5e'];
  const n = Math.max(3, Math.round(W / 160)), seg = W / n, top = 3, sag = 12;
  let d = `M0,${top}`, bulbs = '';
  for (let i = 0; i < n; i++) d += ` Q${(i + 0.5) * seg},${top + sag * 2} ${(i + 1) * seg},${top}`;
  for (let i = 0; i < n; i++) for (let k = 1; k <= 5; k++) {
    const t = k / 6, x = Math.round(i * seg + seg * t), y = Math.round((1 - t) * (1 - t) * top + 2 * t * (1 - t) * (top + sag * 2) + t * t * top);
    const c = cols[(i * 5 + k) % cols.length];
    bulbs += `<g class="xm-b" style="animation-delay:${((i * 5 + k) % 7) * 0.45}s"><rect x="${x - 3}" y="${y + 1}" width="6" height="3" fill="#1b2a1f"/><rect x="${x - 4}" y="${y + 4}" width="8" height="9" fill="${c}"/><rect x="${x - 4}" y="${y + 4}" width="2" height="3" fill="#fff" opacity=".55"/></g>`;
  }
  return `<svg width="${W}" height="34" style="width:${W}px;height:34px;${SVG_ST}" shape-rendering="crispEdges"><path d="${d}" fill="none" stroke="#2f6b43" stroke-width="2"/>${bulbs}</svg>`;
}

let xmW = 0;
function buildXmas() {
  let box = document.getElementById('xmas');
  const W = Math.round(window.innerWidth);
  if (box && xmW === W) return;
  xmW = W;
  if (!box) { box = document.createElement('div'); box.id = 'xmas'; box.setAttribute('aria-hidden', 'true'); document.body.appendChild(box); }
  let flakes = '';
  for (let i = 0; i < 34; i++) {
    const sz = 3 + (i % 3), left = (i * 29) % 100, dur = 9 + (i * 7) % 9, delay = -((i * 5) % 14), dx = ((i % 5) - 2) * 30;
    flakes += `<i style="left:${left}%;width:${sz}px;height:${sz}px;animation-duration:${dur}s;animation-delay:${delay}s;--dx:${dx}px;opacity:${(0.45 + (i % 4) * 0.15).toFixed(2)}"></i>`;
  }
  box.innerHTML = `<div class="xm-garland">${xmGarlandSvg(W)}</div><div class="xm-snow">${flakes}</div><div class="xm-tree">${xmTreeSvg()}</div>`;
}

function applyXmas() {
  const on = xmasOn();
  document.body.classList.toggle('xmas', on);
  const old = document.getElementById('xmas');
  const hat = document.getElementById('xm-hat');
  if (!on) { if (old) old.remove(); if (hat) hat.remove(); xmW = 0; return; }
  buildXmas();
  if (!hat) { const b = document.querySelector('.brand-btn'); if (b) { const e = document.createElement('i'); e.id = 'xm-hat'; e.innerHTML = xmHatSvg(); b.appendChild(e); } }
}
let xmT = 0;
window.addEventListener('resize', () => { if (!xmasOn()) return; clearTimeout(xmT); xmT = setTimeout(buildXmas, 250); });
