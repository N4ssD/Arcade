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
    hair: [{ id: 'h0', n: 'Court' }, { id: 'h1', n: 'Long' }, { id: 'h3', n: 'Frange' }, { id: 'h2', n: 'Pointes', price: 60 }],
    face: [{ id: 'f0', n: 'Sourire' }, { id: 'f1', n: 'Heureux' }, { id: 'f2', n: 'Sérieux' }, { id: 'f3', n: 'Surpris', price: 40 }],
    top: [{ id: 'hoodie', n: 'Sweat' }, { id: 'tee', n: 'T-shirt' }, { id: 'jacket', n: 'Veste' }, { id: 'stripe', n: 'Marinière', price: 120 },
      { id: 'star', n: 'Étoilé', price: 150 }, { id: 'medal', n: 'Centurion', ach: 't100', need: '100 h de jeu' }, { id: 'flame', n: 'Flamme', ach: 's7', need: '7 jours d\'affilée' }],
    bottom: [{ id: 'pants', n: 'Pantalon' }, { id: 'shorts', n: 'Short', price: 90 }],
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

  // view : full | head | top | bottom | shoes
  function svg(a, view, size) {
    a = sanitize(a);
    const g = [];
    const R = (x, y, w, h, c) => g.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + c + '"/>');
    const sk = a.skin, hr = a.hair, tp = a.topC, bt = a.bottomC, sc = a.shoesC;
    // jambes (short : les jambes sont de la couleur de la peau) et chaussures
    if (a.bottom === 'shorts') {
      R(4, 18, 8, 2, bt); R(7, 19, 2, 1, NS); R(4, 20, 3, 2, sk); R(9, 20, 3, 2, sh(sk, -18));
    } else {
      R(4, 18, 8, 4, bt); R(7, 19, 2, 3, NS); R(4, 18, 8, 1, shade(bt, 18)); R(11, 18, 1, 4, shade(bt, -22));
    }
    if (a.shoes === 'boot') {
      R(4, 21, 4, 3, sc); R(8, 21, 4, 3, sc); R(4, 21, 4, 1, shade(sc, 35)); R(8, 21, 4, 1, shade(sc, 35)); R(4, 23, 4, 1, shade(sc, -40)); R(8, 23, 4, 1, shade(sc, -40));
    } else {
      R(4, 22, 4, 2, sc); R(8, 22, 4, 2, sc); R(4, 23, 4, 1, shade(sc, -40)); R(8, 23, 4, 1, shade(sc, -40)); R(4, 22, 3, 1, shade(sc, 40)); R(8, 22, 3, 1, shade(sc, 40));
    }
    function sh(c, v) { return shade(c, v); }
    // haut
    R(3, 11, 10, 7, tp); R(3, 11, 10, 1, shade(tp, 25)); R(12, 12, 1, 6, shade(tp, -28));
    if (a.top === 'hoodie' || a.top === 'flame') { R(6, 12, 4, 1, shade(tp, -30)); R(7, 13, 1, 3, '#f0f0f6'); R(9, 13, 1, 3, '#f0f0f6'); R(6, 16, 4, 2, shade(tp, -25)); }
    if (a.top === 'flame') { R(7, 16, 2, 1, '#ffd166'); R(7, 15, 1, 1, '#E8663D'); }
    if (a.top === 'stripe') { R(3, 13, 10, 1, '#fff'); R(3, 15, 10, 1, '#fff'); }
    if (a.top === 'jacket') { R(7, 11, 2, 7, '#f0f0f6'); R(3, 17, 10, 1, shade(tp, -30)); }
    if (a.top === 'star') { [[5, 13], [10, 15], [8, 17], [4, 16], [10, 12]].forEach(([x, y]) => R(x, y, 1, 1, '#ffd166')); }
    if (a.top === 'tee') { R(7, 13, 2, 3, shade(tp, 60)); R(6, 14, 4, 1, shade(tp, 60)); }
    if (a.top === 'medal') { R(7, 13, 2, 3, '#ffd166'); R(6, 14, 4, 1, '#ffd166'); R(7, 14, 2, 1, '#fff2c0'); }
    // bras et mains
    R(2, 12, 1, 5, tp); R(13, 12, 1, 5, shade(tp, -28)); R(2, 17, 1, 2, sk); R(13, 17, 1, 2, shade(sk, -25));
    // cou, tête
    R(7, 10, 2, 2, shade(sk, -22)); R(4, 3, 8, 8, sk); R(11, 4, 1, 6, shade(sk, -18));
    R(5, 8, 1, 1, 'rgba(255,120,140,.45)'); R(10, 8, 1, 1, 'rgba(255,120,140,.45)');
    const mouth = shade(sk, -75);
    if (a.face === 'f1') { R(5, 7, 2, 1, NS); R(9, 7, 2, 1, NS); R(6, 9, 4, 1, mouth); R(5, 8, 1, 1, mouth); R(10, 8, 1, 1, mouth); }
    else if (a.face === 'f2') { R(5, 6, 1, 2, NS); R(10, 6, 1, 2, NS); R(5, 5, 2, 1, shade(hr, 0)); R(9, 5, 2, 1, shade(hr, 0)); R(7, 9, 2, 1, mouth); }
    else if (a.face === 'f3') { R(5, 6, 2, 2, '#fff'); R(9, 6, 2, 2, '#fff'); R(6, 7, 1, 1, NS); R(10, 7, 1, 1, NS); R(7, 9, 2, 2, '#7a3b45'); }
    else { R(5, 6, 1, 2, NS); R(10, 6, 1, 2, NS); R(5, 6, 1, 1, '#fff'); R(10, 6, 1, 1, '#fff'); R(7, 9, 2, 1, mouth); }
    // cheveux
    if (a.hs === 'h0') { R(4, 2, 8, 2, hr); R(3, 3, 1, 4, hr); R(12, 3, 1, 4, hr); R(4, 4, 3, 1, hr); R(8, 3, 4, 1, hr); }
    if (a.hs === 'h1') { R(4, 2, 8, 2, hr); R(3, 3, 2, 8, hr); R(11, 3, 2, 8, hr); R(4, 4, 2, 1, hr); R(8, 4, 3, 1, hr); }
    if (a.hs === 'h2') { R(4, 2, 8, 3, hr); R(3, 4, 1, 3, hr); R(12, 4, 1, 3, hr); R(4, 1, 1, 1, hr); R(6, 0, 1, 2, hr); R(8, -1, 1, 3, hr); R(10, 0, 1, 2, hr); R(11, 1, 1, 1, hr); }
    if (a.hs === 'h3') { R(4, 2, 8, 2, hr); R(3, 3, 1, 3, hr); R(12, 3, 1, 3, hr); R(4, 4, 8, 1, hr); R(5, 5, 2, 1, hr); }
    // accessoire
    if (a.acc === 'phones') { R(2, 5, 2, 4, '#2b2b3a'); R(12, 5, 2, 4, '#2b2b3a'); R(3, 1, 10, 1, '#2b2b3a'); R(2, 6, 1, 2, '#9C7CF0'); R(13, 6, 1, 2, '#9C7CF0'); R(2, 4, 1, 1, '#2b2b3a'); R(13, 4, 1, 1, '#2b2b3a'); }
    if (a.acc === 'glasses') { R(4, 6, 4, 3, NS); R(8, 6, 4, 3, NS); R(5, 7, 2, 1, '#8fd0ff'); R(9, 7, 2, 1, '#8fd0ff'); }
    if (a.acc === 'cap') { R(3, 1, 10, 3, '#E8663D'); R(3, 4, 10, 1, '#b8472a'); R(11, 3, 4, 1, '#b8472a'); R(6, 2, 3, 1, '#fff'); }
    if (a.acc === 'crown') { R(4, -1, 8, 2, '#ffd166'); R(4, -2, 1, 1, '#ffd166'); R(7, -3, 2, 2, '#ffd166'); R(11, -2, 1, 1, '#ffd166'); }
    const VB = { full: [0, -3, 16, 28], head: [2, -3, 12, 14], top: [1, 9, 14, 11], bottom: [3, 17, 10, 8], shoes: [3, 20, 10, 5] }[view || 'full'] || [0, -3, 16, 28];
    const w = size || 100, hgt = Math.round(w * VB[3] / VB[2]);
    return '<svg width="' + w + '" height="' + hgt + '" style="width:' + w + 'px;height:' + hgt + 'px;stroke:none" viewBox="' + VB.join(' ') + '" shape-rendering="crispEdges" aria-hidden="true">' + g.join('') + '</svg>';
  }

  // Niveau : 1 + racine de (heures jouées + 5 par succès). Pièces : 1 par heure + 10 par succès, moins ce qui a été dépensé.
  function progress(sec, achCount) {
    const xp = sec / 3600 + 5 * achCount;
    const level = 1 + Math.floor(Math.sqrt(xp));
    const lo = (level - 1) ** 2, hi = level ** 2;
    return { level, pct: Math.max(0, Math.min(1, (xp - lo) / (hi - lo))), earned: Math.floor(sec / 3600) + 10 * achCount };
  }

  window.ARCAV = { ITEMS, BGS, SKINS, HAIRS, CLOTHES, BOTTOMS, SHOES, DEFAULT, sanitize, svg, progress, free, has };
})();
