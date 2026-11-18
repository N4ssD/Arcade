// Arcade — paramètres
// Scripts classiques : les const/let/function du niveau supérieur sont partagés entre les fichiers app-*.js (chargés dans l'ordre de index.html).
'use strict';

// ---------- Paramètres ----------
function switchRow(label, hint, key, extra) {
  const input = h('input', { type: 'checkbox' });
  input.checked = !!state.settings[key];
  input.addEventListener('change', async () => {
    const want = input.checked;
    try { await setSetting({ [key]: want }); }
    catch (e) { input.checked = !want; state.settings[key] = !want; return toast(e.message || String(e), 'error'); }
    Sound.play(want ? 'toggleOn' : 'toggleOff');
    if (extra) extra(want);
  });
  return h('label', { class: 'setting', id: 'row-' + key },
    h('div', { class: 'setting-text' }, h('b', { text: label }), hint ? h('small', { text: hint }) : null),
    h('span', { class: 'switch' }, input, h('i')));
}

function autoMenuRow() {
  const input = h('input', { type: 'checkbox' });
  input.checked = autoMenu();
  input.addEventListener('change', () => {
    try { localStorage.setItem('arcade.autoMenu', input.checked ? '1' : '0'); } catch {}
    Sound.play(input.checked ? 'toggleOn' : 'toggleOff');
    applySidebar();
  });
  return h('label', { class: 'setting', id: 'row-autoMenu' },
    h('div', { class: 'setting-text' }, h('b', { text: 'Menu automatique' }), h('small', { text: 'Le menu se réduit tout seul quand la souris n\'est pas dessus, et se déploie dès que tu passes dessus.' })),
    h('span', { class: 'switch' }, input, h('i')));
}

function langRow() {
  const opts = [['fr', 'Français'], ['en', 'English']];
  const btns = opts.map(([v, t]) => h('button', { type: 'button', class: 'seg-b' + (ARC.lang === v ? ' on' : ''), 'data-snd': 'none', text: t, onClick: () => { if (ARC.lang !== v) ARC.set(v); } }));
  return h('div', { class: 'setting' }, h('div', { class: 'setting-text' }, h('b', { text: 'Langue' }), h('small', { text: 'Choisis la langue de l\'interface.' })), h('div', { class: 'seg' }, ...btns));
}

function themeRow() {
  const opts = [['dark', 'Sombre'], ['light', 'Clair'], ['auto', 'Auto']];
  const btns = opts.map(([v, t]) => h('button', { type: 'button', class: 'seg-b', 'data-snd': 'none', text: t, onClick: async () => {
    state.settings.theme = v; sync(); applyAppearance(); Sound.play('tick'); bump('themeChanges');
    try { await api.setSettings({ theme: v }); } catch (e) { toast(e.message || String(e), 'error'); }
  } }));
  const sync = () => btns.forEach((b, i) => b.classList.toggle('on', (state.settings.theme || 'dark') === opts[i][0]));
  sync();
  return h('div', { class: 'setting' }, h('div', { class: 'setting-text' }, h('b', { text: 'Thème' }), h('small', { text: 'Sombre, clair, ou comme Windows (Auto).' })), h('div', { class: 'seg' }, ...btns));
}
function accentRow() {
  const cur = () => (state.settings.accent || '#9c7cf0').toLowerCase();
  const colorInput = h('input', { type: 'color', value: cur() });
  const custom = h('label', { class: 'pcol custom', title: 'Couleur personnalisée' }, colorInput);
  let saveT = null;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => api.setSettings({ accent: state.settings.accent }).catch((e) => toast(e.message || String(e), 'error')), 250); };
  const sw = ACCENTS.map(([c, n]) => h('button', { type: 'button', class: 'pcol', style: { '--c': c }, title: n, 'data-snd': 'none', onClick: () => { state.settings.accent = c; colorInput.value = c; sync(); applyAppearance(); Sound.play('tick'); save(); bump('accentChanges'); } }));
  const sync = () => {
    const c = cur(), known = ACCENTS.some(([x]) => x === c);
    sw.forEach((el, i) => el.classList.toggle('on', ACCENTS[i][0] === c));
    custom.classList.toggle('on', !known); custom.style.setProperty('--c', known ? '#9c7cf0' : c);
  };
  colorInput.addEventListener('input', () => { state.settings.accent = colorInput.value; sync(); applyAppearance(); save(); });
  sync();
  return h('div', { class: 'setting' }, h('div', { class: 'setting-text' }, h('b', { text: 'Couleur d\'accent' }), h('small', { text: 'La couleur des boutons, de la sélection et des détails.' })), h('div', { class: 'palette' }, ...sw, custom));
}

function logoRow() {
  const cur = () => (/^#[0-9a-f]{6}$/i.test(state.settings.logo || '') ? state.settings.logo.toLowerCase() : '');
  const colorInput = h('input', { type: 'color', value: cur() || (state.settings.accent || '#9c7cf0') });
  const custom = h('label', { class: 'pcol custom', title: 'Couleur personnalisée' }, colorInput);
  let saveT = null;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => api.setSettings({ logo: state.settings.logo || '' }).catch((e) => toast(e.message || String(e), 'error')), 250); };
  const follow = h('button', { type: 'button', class: 'btn', text: 'Comme l\'accent', 'data-snd': 'none', onClick: () => { state.settings.logo = ''; sync(); applyAppearance(); Sound.play('tick'); save(); } });
  const sw = ACCENTS.map(([c, n]) => h('button', { type: 'button', class: 'pcol', style: { '--c': c }, title: n, 'data-snd': 'none', onClick: () => { state.settings.logo = c; colorInput.value = c; sync(); applyAppearance(); Sound.play('tick'); save(); } }));
  const sync = () => {
    const c = cur(), known = ACCENTS.some(([x]) => x === c);
    sw.forEach((el, i) => el.classList.toggle('on', ACCENTS[i][0] === c));
    custom.classList.toggle('on', !!c && !known); custom.style.setProperty('--c', c && !known ? c : '#9c7cf0');
    follow.classList.toggle('on', !c);
  };
  colorInput.addEventListener('input', () => { state.settings.logo = colorInput.value; sync(); applyAppearance(); save(); });
  sync();
  return h('div', { class: 'setting', id: 'row-logo' }, h('div', { class: 'setting-text' }, h('b', { text: 'Couleur du logo' }), h('small', { text: 'Par défaut, le logo prend la couleur d\'accent.' })), h('div', { class: 'palette' }, follow, ...sw, custom));
}

function reminderRow() {
  const sel = h('select', {},
    ...[[0, 'Désactivé'], [1, 'Toutes les heures'], [2, 'Toutes les 2 heures'], [3, 'Toutes les 3 heures'], [4, 'Toutes les 4 heures']]
      .map(([v, t]) => h('option', { value: String(v), text: t })));
  sel.value = String(state.settings.breakReminder || 0);
  sel.addEventListener('change', async () => {
    try { await setSetting({ breakReminder: Number(sel.value) }); Sound.play('nav'); }
    catch (e) { toast(e.message || String(e), 'error'); }
  });
  return h('div', { class: 'setting', id: 'row-breakReminder' },
    h('div', { class: 'setting-text' }, h('b', { text: 'Rappel de pause' }), h('small', { text: 'Une notification Windows (et un message dans Arcade) quand tu joues depuis longtemps.' })), sel);
}

const SHORTCUTS = [
  ['Entrée', 'Ouvrir la fiche du jeu sélectionné'],
  ['Ctrl + Entrée', 'Lancer le jeu sélectionné'],
  ['Espace', 'Lancer le jeu sélectionné'],
  ['← ↑ → ↓', 'Se déplacer entre les jeux'],
  ['F', 'Ajouter / retirer des favoris'],
  ['E', 'Modifier le jeu'],
  ['Suppr', 'Retirer de la bibliothèque'],
  ['Échap', 'Fermer / revenir à la bibliothèque'],
  ['/  ou  Ctrl + F', 'Rechercher'],
  ['Ctrl + N', 'Ajouter un jeu'],
  ['Ctrl + B', 'Réduire / agrandir le menu'],
  ['F11', 'Plein écran'],
  ['?', 'Afficher cette liste']
];
function shortcutsList() {
  return h('div', { class: 'kb-list' }, ...SHORTCUTS.map(([k, t]) => h('div', { class: 'kb-row' }, h('span', { class: 'kb-keys' }, ...k.split(/\s{2,}ou\s{2,}/).flatMap((alt, i) => [i ? h('em', { text: 'ou' }) : null, h('kbd', { text: alt })]).filter(Boolean)), h('span', { text: t }))));
}
function openShortcuts() {
  openModal(h('div', { class: 'modal' },
    h('h3', { text: 'Raccourcis clavier' }),
    h('div', { class: 'modal-sub', text: 'Survole ou sélectionne un jeu, puis utilise ces touches.' }),
    h('div', { class: 'modal-body' }, shortcutsList()),
    h('div', { class: 'modal-foot' }, h('button', { class: 'btn primary', text: 'Fermer', onClick: closeModal }))));
}

function renderSettings() {
  const s = state.settings;
  const vol = h('input', { type: 'range', min: '0', max: '100', step: '1', value: String(s.volume) });
  const volVal = h('span', { class: 'val', text: s.volume + '%' });
  const volRow = h('div', { class: 'setting' + (s.sounds ? '' : ' disabled'), id: 'row-volume' },
    h('div', { class: 'setting-text' }, h('b', { text: 'Volume' }), h('small', { text: 'Règle le volume des sons du lanceur.' })),
    vol, volVal,
    h('button', { class: 'btn ghost', text: 'Tester', title: 'Jouer un son', 'data-snd': 'none', onClick: () => Sound.play('success') }));
  vol.addEventListener('input', () => {
    volVal.textContent = vol.value + '%';
    state.settings.volume = Number(vol.value);
    applySound();
  });
  vol.addEventListener('change', async () => { await api.setSettings({ volume: Number(vol.value) }); Sound.play('nav'); });

  const mvol = h('input', { type: 'range', min: '0', max: '100', step: '1', value: String(s.musicVol == null ? 20 : s.musicVol) });
  const mvolVal = h('span', { class: 'val', text: mvol.value + '%' });
  const mvolRow = h('div', { class: 'setting' + (s.music === false ? ' disabled' : ''), id: 'row-musicVol' },
    h('div', { class: 'setting-text' }, h('b', { text: 'Volume de la musique' }), h('small', { text: 'Indépendant du volume des sons.' })),
    mvol, mvolVal);
  mvol.addEventListener('input', () => { mvolVal.textContent = mvol.value + '%'; state.settings.musicVol = Number(mvol.value); applySound(); });
  mvol.addEventListener('change', async () => { await api.setSettings({ musicVol: Number(mvol.value) }); });

  const missing = h('button', { class: 'btn ghost', text: 'Rechercher les couvertures manquantes', onClick: () => {
    const todo = state.games.filter((g) => !g.cover && !g.coverUrl);
    if (!todo.length) return toast('Tous tes jeux ont déjà une couverture.', 'ok');
    todo.forEach((g) => { state.attempted.add(g.id); state.queue.push(g.id); });
    toast(`Recherche de ${todo.length} couverture(s)…`);
    pumpCovers();
  } });

  $('#settings').replaceChildren(
    h('div', { class: 'set-group' },
      h('h2', { text: 'Sons' }),
      switchRow('Sons de l\'interface', 'Petits sons doux lors des clics, des ouvertures et du lancement des jeux.', 'sounds', (on) => {
        $('#row-volume').classList.toggle('disabled', !on);
        $('#row-hoverSounds').classList.toggle('disabled', !on);
        $('#row-clickSounds').classList.toggle('disabled', !on);
      }),
      volRow,
      (() => { const r = switchRow('Sons au clic', 'Un petit son doux quand tu cliques sur un bouton ou changes de section.', 'clickSounds'); if (!s.sounds) r.classList.add('disabled'); return r; })(),
      switchRow('Musique d\'ambiance', 'Une douce musique de fond, générée en direct. S\'arrête quand Arcade est réduit.', 'music', (on) => { $('#row-musicVol').classList.toggle('disabled', !on); applySound(); }),
      mvolRow,
      (() => { const r = switchRow('Sons au survol', 'Un léger tic quand la souris passe sur un jeu.', 'hoverSounds'); if (!s.sounds) r.classList.add('disabled'); return r; })()
    ),
    h('div', { class: 'set-group' },
      h('h2', { text: 'Performance' }),
      switchRow('Animations', 'Désactive les transitions et animations (survols, ouvertures, clics, défilements). Idéal sur un PC modeste.', 'animations', () => applyAppearance()),
      switchRow('Effets visuels', 'Désactive les effets lourds : flous, lueurs, fond animé et ambiance. Plus fluide, un peu moins joli.', 'effects', () => applyAppearance())
    ),
    h('div', { class: 'set-group' },
      h('h2', { text: 'Apparence' }),
      switchRow('Curseur en pixels', 'Remplace la flèche de la souris par un curseur pixel à ta couleur d\'accent, dans la fenêtre d\'Arcade seulement.', 'cursor', () => applyCursor()),
      langRow(),
      themeRow(),
      autoMenuRow(),
      AV ? switchRow('Avatar', 'Affiche ton personnage (menu et panneau à droite de la bibliothèque), son niveau et sa boutique. Désactive-le pour retrouver Arcade sans avatar.', 'avatarOn', () => renderAvatar()) : null,
      AV ? switchRow('Tenues automatiques', 'L\'avatar s\'habille selon l\'heure et la saison : pyjama la nuit, lunettes de soleil l\'après-midi, bonnet en hiver, costume à Halloween. Il s\'endort aussi quand tu es inactif.', 'avatarAuto', () => renderAvatar()) : null,
      accentRow(),
      logoRow(),
      switchRow('Fond animé', 'Grille pixel, lueurs et petits pixels qui scintillent derrière le lanceur (comme à l\'écran de chargement).', 'bgfx', () => applyAppearance()),
      switchRow('Ambiance', 'L\'image du jeu survolé s\'étend en fond, flou et discret, derrière la bibliothèque.', 'ambient', () => applyAppearance()),
      switchRow('Diaporama au repos', 'Si tu ne touches à rien pendant un moment, les images de tes jeux défilent doucement en fond.', 'slideshow', () => stopShow()),
      switchRow("Animation de démarrage", "Petite animation du logo à l'ouverture d'Arcade.", 'introAnim')
    ),
    h('div', { class: 'set-group' },
      h('h2', { text: 'Affichage et manette' }),
      h('div', { class: 'setting' }, h('div', { class: 'setting-text' }, h('b', { text: 'Plein écran' }), h('small', { text: 'Raccourci : F11. Échap pour en sortir.' })),
        h('button', { class: 'btn ghost', text: 'Basculer', 'data-snd': 'none', onClick: toggleFullscreen })),
      (() => { const r = h('label', { class: 'setting', id: 'row-tv' }, h('div', { class: 'setting-text' }, h('b', { text: 'Mode télé' }), h('small', { text: 'Plein écran, menu réduit, sélection bien visible, curseur masqué quand tu ne bouges pas la souris. Idéal avec une manette (croix : naviguer, A : jouer, Y : fiche, X : favori, LB/RB : sections, Start : plein écran).' })),
        h('span', { class: 'switch' }, (() => { const i = h('input', { type: 'checkbox' }); i.checked = document.body.classList.contains('tv'); i.addEventListener('change', () => { Sound.play(i.checked ? 'toggleOn' : 'toggleOff'); setTv(i.checked); }); return i; })(), h('i'))); return r; })()
    ),
    h('div', { class: 'set-group' },
      h('h2', { text: 'Système' }),
      switchRow('Réduire Arcade quand un jeu se lance', 'Arcade se cache du bureau (il reste dans la zone de notification, clique sur son icône pour le rouvrir) et la musique se coupe pendant que tu joues.', 'minimizeOnLaunch'),
      switchRow('Vérifier les mises à jour au démarrage', 'Arcade regarde en arrière-plan s\'il existe une nouvelle version et te le propose.', 'checkUpdates'),
      updateRow(),
      switchRow('Lancer Arcade au démarrage de Windows', 'Arcade s\'ouvre tout seul quand tu allumes ton PC.', 'startWithWindows'),
      switchRow('Garder Arcade dans la zone de notification', 'Quand tu fermes la fenêtre, Arcade reste en arrière-plan (icône près de l\'horloge) : clique dessus pour le rouvrir. Avec le démarrage Windows, il démarre alors discrètement.', 'trayMode', (on) => {
        toast(on ? 'Arcade restera actif dans la zone de notification quand tu fermes la fenêtre.' : 'Arcade se fermera complètement avec sa fenêtre.', 'ok');
      }),
      reminderRow()
    ),
    h('div', { class: 'set-group' },
      h('h2', { text: 'Raccourcis clavier' }),
      h('div', { class: 'setting stack' }, shortcutsList())
    ),
    h('div', { class: 'set-group' },
      h('h2', { text: 'Couvertures' }),
      switchRow('Couvertures automatiques', 'À l\'ajout d\'un jeu, télécharge une couverture HD depuis Steam. Seul le nom du jeu est envoyé.', 'autoCovers'),
      h('div', { class: 'setting' }, h('div', { class: 'setting-text' }, h('b', { text: 'Couvertures manquantes' }), h('small', { text: 'Relance la recherche pour les jeux sans image.' })), missing)
    ),
    perfPanel(),
    h('div', { class: 'set-group' },
      h('h2', { text: 'Entretien' }),
      h('div', { class: 'setting' }, h('div', { class: 'setting-text' }, h('b', { text: 'Vérifier la bibliothèque' }), h('small', { text: 'Repère les jeux dont le fichier a disparu et les jeux ajoutés en double, et te propose de les nettoyer.' })),
        h('button', { class: 'btn ghost', text: 'Vérifier', 'data-snd': 'none', onClick: () => libraryCheck(false) })),
      state.installed ? h('div', { class: 'setting' }, h('div', { class: 'setting-text' }, h('b', { text: 'Désinstaller Arcade' }), h('small', { text: 'Supprime Arcade de ton ordinateur. Tu peux garder ta bibliothèque pour une future installation.' })),
        h('button', { class: 'btn danger', text: 'Désinstaller', 'data-snd': 'none', onClick: confirmUninstall })) : null
    ),
    h('div', { class: 'set-group danger-zone' },
      h('h2', { text: 'Réinitialisation' }),
      h('div', { class: 'setting' }, h('div', { class: 'setting-text' }, h('b', { text: 'Tout remettre à zéro' }), h('small', { text: 'Efface ta bibliothèque, tes catégories, tes statistiques, tes couvertures et tous tes réglages : Arcade redevient comme neuf. Les fichiers de tes jeux ne sont pas touchés.' })),
        h('button', { class: 'btn danger', 'data-snd': 'none', onClick: confirmReset }, icon('trash'), 'Tout réinitialiser'))
    ),
    h('div', { class: 'set-group' },
      h('h2', { text: 'À propos' }),
      h('div', { class: 'setting' }, h('div', { class: 'setting-text' }, h('b', { text: 'Arcade ' + APP_VERSION }), h('small', { text: 'Tes données sont dans le sous-dossier data du dossier d\'installation.' })), h('button', { class: 'btn', 'data-snd': 'none', onClick: openNews }, icon('check'), 'Voir les nouveautés'))
    )
  );
}
