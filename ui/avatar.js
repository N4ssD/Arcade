// Avatar d'Arcade : personnage en pixels, boutique et niveau. Aucune dépendance.
// Tout est dessiné ici (SVG fabriqué à partir de valeurs validées : couleurs hexadécimales et identifiants connus).
(() => {
  'use strict';
  const NS = '#14141c';
  const HEX = /^#[0-9a-fA-F]{6}$/;

  const SKINS = ['#F6D9BC', '#F2C9A0', '#D9A57A', '#C68E63', '#8A5A3C', '#5C3B28', '#7ED0A6'];
  const HAIRS = ['#1b1b22', '#5a3a22', '#9a6a3a', '#E8C26A', '#E8663D', '#F29BBE', '#C9B8FF', '#ECECF1'];
  const CLOTHES = ['#8B6BE8', '#C9B8FF', '#27a37d', '#E8663D', '#F4C46A', '#4a90d9', '#d94f7a', '#ECECF1', '#2a2a36'];
  const BOTTOMS = ['#2c2c3a', '#3a5a8c', '#4a4a5a', '#5a3a22', '#8B6BE8', '#d94f7a', '#ECECF1'];
  const SHOES = ['#ECECF1', '#2a2a36', '#E8663D', '#7a5cd0', '#F4C46A', '#4a90d9'];

  // price : pièces ; ach : id du succès à débloquer (voir ACH dans app.js)
  const ITEMS = {
    hair: [{ id: 'h0', n: 'Court' }, { id: 'h1', n: 'Long' }, { id: 'h3', n: 'Frange' }, { id: 'h2', n: 'Pointes', price: 60 },
      { id: 'h4', n: 'Queue de cheval', price: 40 }, { id: 'h5', n: 'Chignon', price: 40 }, { id: 'h8', n: 'Carré', price: 50 }, { id: 'h6', n: 'Crête', price: 70 }, { id: 'h7', n: 'Afro', price: 70 }],
    face: [{ id: 'f0', n: 'Sourire' }, { id: 'f1', n: 'Heureux' }, { id: 'f2', n: 'Sérieux' }, { id: 'f3', n: 'Surpris', price: 40 }],
    top: [{ id: 'hoodie', n: 'Sweat' }, { id: 'tee', n: 'T-shirt' }, { id: 'jacket', n: 'Veste' }, { id: 'tank', n: 'Débardeur', price: 60 }, { id: 'shirt', n: 'Chemise', price: 80 }, { id: 'hawaii', n: 'Hawaï', price: 100 }, { id: 'stripe', n: 'Marinière', price: 120 },
      { id: 'overalls', n: 'Salopette', price: 130 },
      { id: 'star', n: 'Étoilé', price: 150 }, { id: 'knight', n: 'Armure', price: 220 }, { id: 'medal', n: 'Centurion', ach: 't100', need: '100 h de jeu' }, { id: 'flame', n: 'Flamme', ach: 's7', need: '7 jours d\'affilée' }],
    bottom: [{ id: 'pants', n: 'Pantalon' }, { id: 'shorts', n: 'Short', price: 90 }, { id: 'skirt', n: 'Jupe', price: 90 }],
    shoes: [{ id: 'sneaker', n: 'Baskets' }, { id: 'boot', n: 'Bottes', price: 60 }],
    acc: [{ id: 'none', n: 'Aucun' }, { id: 'phones', n: 'Casque' }, { id: 'glasses', n: 'Lunettes', price: 40 }, { id: 'cap', n: 'Casquette', price: 80 },
      { id: 'crown', n: 'Couronne', ach: 'g50', need: '50 jeux' }],
    bg: [{ id: 'b0', n: 'Violet' }, { id: 'b1', n: 'Nuit' }, { id: 'b2', n: 'Aurore', price: 100 }, { id: 'b3', n: 'Couchant', price: 100 }, { id: 'b4', n: 'Néon', ach: 't10', need: '10 h de jeu' }],
  };
  const BGS = {
    b0: ['#3b2f66', '#17141f'], b1: ['#1f3a66', '#0e1424'], b2: ['#1f6a5a', '#0e1f1c'], b3: ['#a64a52', '#2a1424'], b4: ['#7a2fa0', '#0f0a1a'],
  };
  const DEFAULT = { skin: '#F2C9A0', hair: '#5a3a22', hs: 'h0', face: 'f0', top: 'hoodie', topC: '#8B6BE8', bottom: 'pants', bottomC: '#2c2c3a', shoes: 'sneaker', shoesC: '#ECECF1', acc: 'phones', bg: 'b0' };

  const has = (cat, id) => ITEMS[cat].some((i) => i.id === id);
  const free = (i) => !i.price && !i.ach;
  // Valeurs inconnues ou mal formées remplacées par celles par défaut ; la liste « owned » ne garde que des objets existants
  function sanitize(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const col = (k) => (typeof r[k] === 'string' && HEX.test(r[k]) ? r[k] : DEFAULT[k]);
    const pick = (k, cat) => (typeof r[k] === 'string' && has(cat, r[k]) ? r[k] : DEFAULT[k]);
    const all = Object.values(ITEMS).flat().map((i) => i.id);
    return {
      skin: col('skin'), hair: col('hair'), hs: pick('hs', 'hair'), face: pick('face', 'face'), top: pick('top', 'top'), topC: col('topC'),
      bottom: pick('bottom', 'bottom'), bottomC: col('bottomC'), shoes: pick('shoes', 'shoes'), shoesC: col('shoesC'), acc: pick('acc', 'acc'), bg: pick('bg', 'bg'),
      owned: Array.isArray(r.owned) ? r.owned.filter((x) => all.includes(x)) : [],
      spent: Number.isFinite(r.spent) ? Math.max(0, Math.floor(r.spent)) : 0,
    };
  }

  function shade(c, a) {
    const n = parseInt(c.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(v + a)));
    return '#' + ((1 << 24) | (f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1);
  }

  // view : full | head | face | top | bottom | shoes. Le personnage est dessiné en calques (jambes, torse, bras, tête, yeux) pour pouvoir être animé en CSS.
  function svg(a, view, size, over) {
    a = Object.assign(sanitize(a), over || {}); // over : tenue ou humeur temporaire (valeurs internes, jamais saisies par l'utilisateur)
    const G = { legL: [], legR: [], torso: [], armL: [], armR: [], head: [], eyes: [] };
    let t = G.legL;
    const rect = (x, y, w, h, c) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + c + '"/>';
    const R = (x, y, w, h, c) => t.push(rect(x, y, w, h, c));
    const E = (x, y, w, h, c) => G.eyes.push(rect(x, y, w, h, c));
    const sk = a.skin, hr = a.hair, tp = a.topC, bt = a.bottomC, sc = a.shoesC, skd = shade(sk, -18);
    const hl = shade(bt, 18), dk = shade(bt, -22);
    // jambes (une moitié chacune) : pantalon, short ou jupe
    if (a.bottom === 'shorts') {
      t = G.legL; R(4, 18, 4, 2, bt); R(7, 19, 1, 1, NS); R(4, 20, 3, 2, sk);
      t = G.legR; R(8, 18, 4, 2, bt); R(8, 19, 1, 1, NS); R(9, 20, 3, 2, skd);
    } else if (a.bottom === 'skirt') {
      t = G.legL; R(3, 18, 5, 2, bt); R(3, 19, 5, 1, dk); R(4, 20, 3, 2, sk);
      t = G.legR; R(8, 18, 5, 2, bt); R(8, 19, 5, 1, dk); R(9, 20, 3, 2, skd);
    } else {
      t = G.legL; R(4, 18, 4, 4, bt); R(4, 18, 4, 1, hl); R(7, 19, 1, 3, NS);
      t = G.legR; R(8, 18, 4, 4, bt); R(8, 18, 4, 1, hl); R(8, 19, 1, 3, NS); R(11, 18, 1, 4, dk);
    }
    [[G.legL, 4], [G.legR, 8]].forEach(([arr, x]) => {
      t = arr;
      if (a.shoes === 'boot') { R(x, 21, 4, 3, sc); R(x, 21, 4, 1, shade(sc, 35)); R(x, 23, 4, 1, shade(sc, -40)); }
      else { R(x, 22, 4, 2, sc); R(x, 23, 4, 1, shade(sc, -40)); R(x, 22, 3, 1, shade(sc, 40)); }
    });
    // torse
    t = G.torso;
    const T = a.top, armC = T === 'tank' ? sk : T === 'knight' ? '#9aa0b8' : tp;
    if (T === 'tank') { R(3, 11, 10, 7, sk); R(11, 11, 2, 7, skd); R(5, 11, 6, 7, tp); R(7, 11, 2, 1, sk); R(5, 11, 6, 1, shade(tp, 25)); }
    else if (T === 'knight') { R(3, 11, 10, 7, '#9aa0b8'); R(3, 11, 10, 1, '#c3c8de'); R(12, 12, 1, 6, '#7b819a'); R(3, 16, 10, 1, '#6b7088'); R(7, 13, 2, 2, '#ffd166'); R(2, 11, 2, 2, '#c3c8de'); R(12, 11, 2, 2, '#aab0c8'); }
    else {
      R(3, 11, 10, 7, tp); R(3, 11, 10, 1, shade(tp, 25)); R(12, 12, 1, 6, shade(tp, -28));
      if (T === 'hoodie' || T === 'flame') { R(6, 12, 4, 1, shade(tp, -30)); R(7, 13, 1, 3, '#f0f0f6'); R(9, 13, 1, 3, '#f0f0f6'); R(6, 16, 4, 2, shade(tp, -25)); }
      if (T === 'flame') { R(7, 16, 2, 1, '#ffd166'); R(7, 15, 1, 1, '#E8663D'); }
      if (T === 'stripe') { R(3, 13, 10, 1, '#fff'); R(3, 15, 10, 1, '#fff'); }
      if (T === 'jacket') { R(7, 11, 2, 7, '#f0f0f6'); R(3, 17, 10, 1, shade(tp, -30)); }
      if (T === 'star') { [[5, 13], [10, 15], [8, 17], [4, 16], [10, 12]].forEach(([x, y]) => R(x, y, 1, 1, '#ffd166')); }
      if (T === 'tee') { R(7, 13, 2, 3, shade(tp, 60)); R(6, 14, 4, 1, shade(tp, 60)); }
      if (T === 'medal') { R(7, 13, 2, 3, '#ffd166'); R(6, 14, 4, 1, '#ffd166'); R(7, 14, 2, 1, '#fff2c0'); }
      if (T === 'pajama') { R(3, 13, 10, 1, shade(tp, 40)); R(3, 16, 10, 1, shade(tp, 40)); R(5, 12, 1, 1, '#ffd166'); R(10, 14, 1, 1, '#ffd166'); R(7, 17, 1, 1, '#ffd166'); }
      if (T === 'pumpkin') { R(5, 13, 1, 1, NS); R(10, 13, 1, 1, NS); R(6, 15, 4, 1, NS); R(5, 14, 1, 1, NS); R(10, 14, 1, 1, NS); }
      if (T === 'shirt') { R(6, 11, 4, 1, '#f0f0f6'); R(7, 12, 2, 1, '#f0f0f6'); R(8, 12, 1, 6, shade(tp, -25)); R(8, 14, 1, 1, '#f0f0f6'); R(8, 16, 1, 1, '#f0f0f6'); R(10, 14, 2, 2, shade(tp, -20)); }
      if (T === 'hawaii') { R(6, 11, 2, 2, shade(tp, 40)); R(8, 11, 2, 2, shade(tp, 40)); [[5, 14, '#ffd166'], [9, 14, '#ff9fb8'], [11, 16, '#ffd166'], [6, 16, '#ff9fb8'], [4, 15, '#7ED0A6'], [8, 17, '#7ED0A6']].forEach(([x, y, c]) => R(x, y, 1, 1, c)); }
      if (T === 'overalls') { const dn = '#3a5a8c'; R(5, 11, 1, 3, dn); R(10, 11, 1, 3, dn); R(5, 14, 6, 4, dn); R(7, 15, 2, 2, shade(dn, 25)); R(5, 14, 1, 1, '#ffd166'); R(10, 14, 1, 1, '#ffd166'); }
    }
    // bras et mains
    t = G.armL; R(2, 12, 1, 5, armC); R(2, 17, 1, 2, sk);
    t = G.armR; R(13, 12, 1, 5, shade(armC, -28)); R(13, 17, 1, 2, shade(sk, -25));
    // cou, tête, visage
    t = G.head;
    R(7, 10, 2, 2, shade(sk, -22)); R(4, 3, 8, 8, sk); R(11, 4, 1, 6, skd);
    R(5, 8, 1, 1, 'rgba(255,120,140,.45)'); R(10, 8, 1, 1, 'rgba(255,120,140,.45)');
    const mouth = shade(sk, -75), mood = a.mood;
    if (mood === 'sleep') { E(5, 7, 2, 1, NS); E(9, 7, 2, 1, NS); R(7, 9, 2, 1, mouth); }
    else if (mood === 'happy') { E(5, 7, 1, 1, NS); E(6, 6, 1, 1, NS); E(7, 7, 1, 1, NS); E(9, 7, 1, 1, NS); E(10, 6, 1, 1, NS); E(11, 7, 1, 1, NS); R(6, 9, 4, 1, mouth); R(5, 8, 1, 1, mouth); R(10, 8, 1, 1, mouth); R(7, 10, 2, 1, '#c4636b'); }
    else if (mood === 'impatient') { E(5, 6, 1, 2, NS); E(10, 6, 1, 2, NS); R(5, 5, 2, 1, hr); R(9, 5, 2, 1, hr); R(6, 9, 4, 1, mouth); R(13, 5, 1, 2, '#8fd0ff'); }
    else if (a.face === 'f1') { E(5, 7, 2, 1, NS); E(9, 7, 2, 1, NS); R(6, 9, 4, 1, mouth); R(5, 8, 1, 1, mouth); R(10, 8, 1, 1, mouth); }
    else if (a.face === 'f2') { E(5, 6, 1, 2, NS); E(10, 6, 1, 2, NS); R(5, 5, 2, 1, hr); R(9, 5, 2, 1, hr); R(7, 9, 2, 1, mouth); }
    else if (a.face === 'f3') { E(5, 6, 2, 2, '#fff'); E(9, 6, 2, 2, '#fff'); E(6, 7, 1, 1, NS); E(10, 7, 1, 1, NS); R(7, 9, 2, 2, '#7a3b45'); }
    else { E(5, 6, 1, 2, NS); E(10, 6, 1, 2, NS); E(5, 6, 1, 1, '#fff'); E(10, 6, 1, 1, '#fff'); R(7, 9, 2, 1, mouth); }
    t.push('<g class="av-eyes">' + G.eyes.join('') + '</g>');
    // cheveux
    const H = a.hs;
    if (H === 'h0') { R(4, 2, 8, 2, hr); R(3, 3, 1, 4, hr); R(12, 3, 1, 4, hr); R(4, 4, 3, 1, hr); R(8, 3, 4, 1, hr); }
    if (H === 'h1') { R(4, 2, 8, 2, hr); R(3, 3, 2, 8, hr); R(11, 3, 2, 8, hr); R(4, 4, 2, 1, hr); R(8, 4, 3, 1, hr); }
    if (H === 'h2') { R(4, 2, 8, 3, hr); R(3, 4, 1, 3, hr); R(12, 4, 1, 3, hr); R(4, 1, 1, 1, hr); R(6, 0, 1, 2, hr); R(8, -1, 1, 3, hr); R(10, 0, 1, 2, hr); R(11, 1, 1, 1, hr); }
    if (H === 'h3') { R(4, 2, 8, 2, hr); R(3, 3, 1, 3, hr); R(12, 3, 1, 3, hr); R(4, 4, 8, 1, hr); R(5, 5, 2, 1, hr); }
    if (H === 'h4') { R(4, 2, 8, 2, hr); R(3, 3, 1, 3, hr); R(12, 3, 1, 3, hr); R(4, 4, 8, 1, hr); R(13, 3, 1, 1, hr); R(13, 4, 2, 5, hr); R(14, 9, 1, 1, hr); R(12, 3, 1, 2, shade(hr, -30)); }
    if (H === 'h5') { R(4, 2, 8, 2, hr); R(3, 3, 1, 4, hr); R(12, 3, 1, 4, hr); R(4, 4, 3, 1, hr); R(6, 0, 4, 2, hr); R(7, -1, 2, 1, hr); R(7, 0, 1, 1, shade(hr, 40)); }
    if (H === 'h6') { R(6, 0, 4, 4, hr); R(7, -2, 2, 2, hr); R(4, 3, 8, 1, shade(hr, -40)); R(3, 4, 1, 2, shade(hr, -40)); R(12, 4, 1, 2, shade(hr, -40)); }
    if (H === 'h7') { R(3, -2, 10, 1, hr); R(2, -1, 12, 4, hr); R(1, 0, 1, 6, hr); R(14, 0, 1, 6, hr); R(2, 3, 2, 3, hr); R(12, 3, 2, 3, hr); R(4, 3, 8, 1, hr); R(5, -1, 2, 1, shade(hr, 35)); }
    if (H === 'h8') { R(4, 2, 8, 2, hr); R(3, 3, 2, 6, hr); R(11, 3, 2, 6, hr); R(3, 9, 3, 1, hr); R(10, 9, 3, 1, hr); R(4, 4, 8, 1, hr); }
    // accessoire
    if (a.acc === 'phones') { R(2, 5, 2, 4, '#2b2b3a'); R(12, 5, 2, 4, '#2b2b3a'); R(3, 1, 10, 1, '#2b2b3a'); R(2, 6, 1, 2, '#9C7CF0'); R(13, 6, 1, 2, '#9C7CF0'); R(2, 4, 1, 1, '#2b2b3a'); R(13, 4, 1, 1, '#2b2b3a'); }
    if (a.acc === 'glasses') { R(4, 6, 4, 3, NS); R(8, 6, 4, 3, NS); R(5, 7, 2, 1, '#8fd0ff'); R(9, 7, 2, 1, '#8fd0ff'); }
    if (a.acc === 'cap') { R(3, 1, 10, 3, '#E8663D'); R(3, 4, 10, 1, '#b8472a'); R(11, 3, 4, 1, '#b8472a'); R(6, 2, 3, 1, '#fff'); }
    if (a.acc === 'nightcap') { R(4, 1, 8, 2, '#4a5fd0'); R(3, 3, 10, 1, '#ECECF1'); R(5, 0, 6, 1, '#4a5fd0'); R(11, -1, 3, 2, '#4a5fd0'); R(13, -1, 2, 2, '#ECECF1'); }
    if (a.acc === 'shades') { R(4, 6, 4, 2, NS); R(8, 6, 4, 2, NS); R(7, 6, 2, 1, NS); R(5, 6, 1, 1, '#5b5b78'); R(9, 6, 1, 1, '#5b5b78'); }
    if (a.acc === 'beanie') { R(3, 1, 10, 3, '#d94f7a'); R(3, 3, 10, 1, '#ECECF1'); R(7, -1, 2, 2, '#ECECF1'); R(5, 1, 1, 2, '#e8739a'); R(8, 1, 1, 2, '#e8739a'); }
    if (a.acc === 'witch') { R(2, 2, 12, 1, '#2a1a3a'); R(4, 0, 8, 2, '#3a2450'); R(6, -2, 4, 2, '#3a2450'); R(7, -4, 2, 2, '#3a2450'); R(4, 1, 8, 1, '#E8663D'); }
    if (a.acc === 'crown') { R(4, -1, 8, 2, '#ffd166'); R(4, -2, 1, 1, '#ffd166'); R(7, -3, 2, 2, '#ffd166'); R(11, -2, 1, 1, '#ffd166'); }
    const body = ['legL', 'legR', 'torso', 'armL', 'armR', 'head'].map((k) => '<g class="av-' + k + '">' + G[k].join('') + '</g>').join('');
    const VB = { full: [0, -5, 16, 30], head: [2, -3, 12, 14], face: [3, 0, 10, 10], top: [1, 9, 14, 11], bottom: [3, 17, 10, 8], shoes: [3, 20, 10, 5] }[view || 'full'] || [0, -5, 16, 30];
    const w = size || 100, hgt = Math.round(w * VB[3] / VB[2]);
    return '<svg width="' + w + '" height="' + hgt + '" style="width:' + w + 'px;height:' + hgt + 'px;stroke:none" viewBox="' + VB.join(' ') + '" shape-rendering="crispEdges" aria-hidden="true">' + body + '</svg>';
  }

  // Niveau : 1 + racine de (heures jouées + 5 par succès). Pièces gagnées : 1 par heure jouée + la récompense de chaque succès ; on en retire ce qui a été dépensé.
  function progress(sec, achCount, rewards) {
    const xp = sec / 3600 + 5 * achCount;
    const level = 1 + Math.floor(Math.sqrt(xp));
    const lo = (level - 1) ** 2, hi = level ** 2;
    return { level, pct: Math.max(0, Math.min(1, (xp - lo) / (hi - lo))), earned: Math.floor(sec / 3600) + (rewards || 0) };
  }

  window.ARCAV = { ITEMS, BGS, SKINS, HAIRS, CLOTHES, BOTTOMS, SHOES, DEFAULT, sanitize, svg, progress, free, has };
})();
