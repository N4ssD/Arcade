// Arcade — catégories : sélecteur, gestionnaire, glisser-déposer
// Scripts classiques : les const/let/function du niveau supérieur sont partagés entre les fichiers app-*.js (chargés dans l'ordre de index.html).
'use strict';

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

  let busy = false; // évite un double envoi (double clic, Entrée + clic) qui ajoutait le jeu puis affichait « déjà dans ta bibliothèque »
  const save = h('button', { class: 'btn primary', text: editing ? 'Enregistrer' : 'Ajouter', onClick: async () => {
    if (busy) return;
    const target = inTarget.value.trim();
    if (!target) { inTarget.focus(); return toast('Indique le fichier ou le lien du jeu.', 'error'); }
    busy = true; save.disabled = true;
    try {
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
    } finally { busy = false; save.disabled = false; }
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
