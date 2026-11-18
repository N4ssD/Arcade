// Arcade — succès, récompenses en pièces
// Scripts classiques : les const/let/function du niveau supérieur sont partagés entre les fichiers app-*.js (chargés dans l'ordre de index.html).
'use strict';

// ---------- Succès Arcade ----------
// tier : 1 bronze, 2 argent, 3 or, 4 légende (violet). Chaque succès rapporte des pièces selon son palier.
const ACH_REWARD = { 1: 10, 2: 25, 3: 50, 4: 100 };
const H = 3600;
// Les 18 succès d'origine comptent en valeur absolue ; tous les autres ne comptent que ce que tu fais APRÈS ta première ouverture (voir achBase)
const ACH_LEGACY = ['g1', 'g10', 'g25', 'g50', 't1', 't10', 't100', 't500', 's3', 's7', 's30', 'l10', 'l100', 'm10', 'f5', 'd1', 'd10', 'c3'];
const ACH = [
  { id: 'g1', n: 'Premier pas', d: 'Ajoute ton premier jeu.', ic: 'folder', t: 1, goal: 1, unit: 'jeu', k: 'games' },
  { id: 'g10', n: 'Collectionneur', d: 'Ajoute 10 jeux.', ic: 'folder', t: 1, goal: 10, unit: 'jeux', k: 'games' },
  { id: 'g25', n: 'Grande collection', d: 'Ajoute 25 jeux.', ic: 'crown', t: 2, goal: 25, unit: 'jeux', k: 'games' },
  { id: 'g50', n: 'Bibliothécaire', d: 'Ajoute 50 jeux.', ic: 'crown', t: 3, goal: 50, unit: 'jeux', k: 'games' },
  { id: 't1', n: 'Échauffement', d: 'Cumule 1 h de jeu.', ic: 'clock', t: 1, goal: 3600, unit: 'h', k: 'sec' },
  { id: 't10', n: 'Habitué', d: 'Cumule 10 h de jeu.', ic: 'clock', t: 2, goal: 36000, unit: 'h', k: 'sec' },
  { id: 't100', n: 'Centurion', d: 'Cumule 100 h de jeu.', ic: 'clock', t: 3, goal: 360000, unit: 'h', k: 'sec' },
  { id: 't500', n: 'Légende vivante', d: 'Cumule 500 h de jeu.', ic: 'crown', t: 4, goal: 1800000, unit: 'h', k: 'sec' },
  { id: 's3', n: 'Sur la lancée', d: 'Joue 3 jours d\'affilée.', ic: 'flame', t: 1, goal: 3, unit: 'jours', k: 'streak' },
  { id: 's7', n: 'Une semaine d\'affilée', d: 'Joue 7 jours d\'affilée.', ic: 'flame', t: 2, goal: 7, unit: 'jours', k: 'streak' },
  { id: 's30', n: 'Mois sans faute', d: 'Joue 30 jours d\'affilée.', ic: 'flame', t: 4, goal: 30, unit: 'jours', k: 'streak' },
  { id: 'l10', n: 'Prêt à jouer', d: 'Lance des jeux 10 fois.', ic: 'rocket', t: 1, goal: 10, unit: 'lancements', k: 'launches' },
  { id: 'l100', n: 'Toujours partant', d: 'Lance des jeux 100 fois.', ic: 'rocket', t: 3, goal: 100, unit: 'lancements', k: 'launches' },
  { id: 'm10', n: 'Marathon', d: 'Passe 10 h sur un seul jeu.', ic: 'hist', t: 3, goal: 36000, unit: 'h', k: 'maxGame' },
  { id: 'f5', n: 'Coups de cœur', d: 'Mets 5 jeux en favoris.', ic: 'star', t: 1, goal: 5, unit: 'favoris', k: 'favs' },
  { id: 'd1', n: 'Générique de fin', d: 'Marque un jeu comme terminé.', ic: 'check', t: 1, goal: 1, unit: 'terminé', k: 'finished' },
  { id: 'd10', n: 'Complétionniste', d: 'Marque 10 jeux comme terminés.', ic: 'check', t: 3, goal: 10, unit: 'terminés', k: 'finished' },
  { id: 'c3', n: 'Organisé', d: 'Crée 3 catégories.', ic: 'tag', t: 1, goal: 3, unit: 'catégories', k: 'cats' },
].concat([
  // [id, nom, description, name, description, icône, palier, objectif, unité, unit, clé]
  ['g5', 'Petit début', 'Ajoute 5 jeux.', 'Small start', 'Add 5 games.', 'folder', 1, 5, 'jeux', 'games', 'games'],
  ['g100', 'Ludothèque géante', 'Ajoute 100 jeux.', 'Giant library', 'Add 100 games.', 'crown', 4, 100, 'jeux', 'games', 'games'],
  ['t5', 'Mise en jambes', 'Cumule 5 h de jeu.', 'Limbering up', 'Play 5 hours in total.', 'clock', 1, 5 * H, 'h', 'h', 'sec'],
  ['t25', 'Joueur assidu', 'Cumule 25 h de jeu.', 'Dedicated player', 'Play 25 hours in total.', 'clock', 2, 25 * H, 'h', 'h', 'sec'],
  ['t50', 'Demi-centurion', 'Cumule 50 h de jeu.', 'Half-centurion', 'Play 50 hours in total.', 'clock', 2, 50 * H, 'h', 'h', 'sec'],
  ['t250', 'Vétéran', 'Cumule 250 h de jeu.', 'Veteran', 'Play 250 hours in total.', 'clock', 3, 250 * H, 'h', 'h', 'sec'],
  ['t1000', 'Mille heures', 'Cumule 1 000 h de jeu.', 'A thousand hours', 'Play 1,000 hours in total.', 'crown', 4, 1000 * H, 'h', 'h', 'sec'],
  ['s2', 'Deux jours de suite', 'Joue 2 jours d\'affilée.', 'Two in a row', 'Play 2 days in a row.', 'flame', 1, 2, 'jours', 'days', 'streakS'],
  ['s5', 'Cinq à la suite', 'Joue 5 jours d\'affilée.', 'Five in a row', 'Play 5 days in a row.', 'flame', 1, 5, 'jours', 'days', 'streakS'],
  ['s14', 'Quinzaine', 'Joue 14 jours d\'affilée.', 'Fortnight', 'Play 14 days in a row.', 'flame', 3, 14, 'jours', 'days', 'streakS'],
  ['s21', 'Trois semaines', 'Joue 21 jours d\'affilée.', 'Three weeks', 'Play 21 days in a row.', 'flame', 3, 21, 'jours', 'days', 'streakS'],
  ['s60', 'Deux mois', 'Joue 60 jours d\'affilée.', 'Two months', 'Play 60 days in a row.', 'flame', 4, 60, 'jours', 'days', 'streakS'],
  ['s100', 'Centenaire', 'Joue 100 jours d\'affilée.', 'Centenarian', 'Play 100 days in a row.', 'flame', 4, 100, 'jours', 'days', 'streakS'],
  ['p3', 'Retour gagnant', 'Joue pendant 3 jours différents.', 'Winning return', 'Play on 3 different days.', 'calendar', 1, 3, 'jours', 'days', 'daysS'],
  ['p10', 'Fidèle au poste', 'Joue pendant 10 jours différents.', 'Faithful', 'Play on 10 different days.', 'calendar', 1, 10, 'jours', 'days', 'daysS'],
  ['p30', 'Une habitude', 'Joue pendant 30 jours différents.', 'A habit', 'Play on 30 different days.', 'calendar', 2, 30, 'jours', 'days', 'daysS'],
  ['p60', 'Bien installé', 'Joue pendant 60 jours différents.', 'Settled in', 'Play on 60 different days.', 'calendar', 3, 60, 'jours', 'days', 'daysS'],
  ['p100', 'Pilier du lanceur', 'Joue pendant 100 jours différents.', 'Pillar of the launcher', 'Play on 100 different days.', 'calendar', 3, 100, 'jours', 'days', 'daysS'],
  ['p200', 'Vieux de la vieille', 'Joue pendant 200 jours différents.', 'Old-timer', 'Play on 200 different days.', 'calendar', 4, 200, 'jours', 'days', 'daysS'],
  ['p365', 'Une année entière', 'Joue pendant 365 jours différents.', 'A whole year', 'Play on 365 different days.', 'calendar', 4, 365, 'jours', 'days', 'daysS'],
  ['l25', 'Rampe de lancement', 'Lance des jeux 25 fois.', 'Launch pad', 'Launch games 25 times.', 'rocket', 1, 25, 'lancements', 'launches', 'launches'],
  ['l50', 'Décollage réussi', 'Lance des jeux 50 fois.', 'Successful liftoff', 'Launch games 50 times.', 'rocket', 2, 50, 'lancements', 'launches', 'launches'],
  ['l250', 'Pilote confirmé', 'Lance des jeux 250 fois.', 'Seasoned pilot', 'Launch games 250 times.', 'rocket', 3, 250, 'lancements', 'launches', 'launches'],
  ['l500', 'Commandant de bord', 'Lance des jeux 500 fois.', 'Flight commander', 'Launch games 500 times.', 'rocket', 3, 500, 'lancements', 'launches', 'launches'],
  ['l1000', 'Maître de la flotte', 'Lance des jeux 1 000 fois.', 'Fleet master', 'Launch games 1,000 times.', 'rocket', 4, 1000, 'lancements', 'launches', 'launches'],
  ['m5', 'Accro', 'Passe 5 h de plus sur un même jeu.', 'Hooked', 'Spend 5 more hours on a single game.', 'hist', 1, 5 * H, 'h', 'h', 'maxGame'],
  ['m25', 'Fidèle à un jeu', 'Passe 25 h de plus sur un même jeu.', 'Loyal to one game', 'Spend 25 more hours on a single game.', 'hist', 2, 25 * H, 'h', 'h', 'maxGame'],
  ['m50', 'Passion dévorante', 'Passe 50 h de plus sur un même jeu.', 'Burning passion', 'Spend 50 more hours on a single game.', 'hist', 3, 50 * H, 'h', 'h', 'maxGame'],
  ['m100', 'Cent heures, un seul jeu', 'Passe 100 h de plus sur un même jeu.', 'One game, a hundred hours', 'Spend 100 more hours on a single game.', 'hist', 4, 100 * H, 'h', 'h', 'maxGame'],
  ['r2', 'Grosse session', 'Joue 2 h en une journée.', 'Big session', 'Play 2 hours in a single day.', 'clock', 1, 2 * H, 'h', 'h', 'maxDayS'],
  ['r4', 'Journée de gamer', 'Joue 4 h en une journée.', 'Gamer day', 'Play 4 hours in a single day.', 'clock', 2, 4 * H, 'h', 'h', 'maxDayS'],
  ['r6', 'Week-end sur canapé', 'Joue 6 h en une journée.', 'Couch weekend', 'Play 6 hours in a single day.', 'clock', 3, 6 * H, 'h', 'h', 'maxDayS'],
  ['r10', 'Marathonien', 'Joue 10 h en une journée.', 'Marathon runner', 'Play 10 hours in a single day.', 'clock', 4, 10 * H, 'h', 'h', 'maxDayS'],
  ['v3', 'Curieux', 'Joue à 3 jeux différents.', 'Curious', 'Play 3 different games.', 'play', 1, 3, 'jeux', 'games', 'playedS'],
  ['v10', 'Papillon', 'Joue à 10 jeux différents.', 'Butterfly', 'Play 10 different games.', 'play', 2, 10, 'jeux', 'games', 'playedS'],
  ['v25', 'Touche-à-tout', 'Joue à 25 jeux différents.', 'Jack of all trades', 'Play 25 different games.', 'play', 3, 25, 'jeux', 'games', 'playedS'],
  ['v50', 'Globe-trotter', 'Joue à 50 jeux différents.', 'Globetrotter', 'Play 50 different games.', 'play', 4, 50, 'jeux', 'games', 'playedS'],
  ['f1', 'Premier favori', 'Mets un jeu en favori.', 'First favorite', 'Mark a game as a favorite.', 'star', 1, 1, 'favori', 'favorite', 'favs'],
  ['f15', 'Cœur d\'artichaut', 'Mets 15 jeux en favoris.', 'Soft spot', 'Mark 15 games as favorites.', 'star', 2, 15, 'favoris', 'favorites', 'favs'],
  ['f30', 'Tout en favoris', 'Mets 30 jeux en favoris.', 'Everything is a favorite', 'Mark 30 games as favorites.', 'star', 3, 30, 'favoris', 'favorites', 'favs'],
  ['d5', 'Terminator', 'Marque 5 jeux comme terminés.', 'Terminator', 'Mark 5 games as finished.', 'check', 2, 5, 'terminés', 'finished', 'finished'],
  ['d25', 'Chasseur de crédits', 'Marque 25 jeux comme terminés.', 'Credits hunter', 'Mark 25 games as finished.', 'check', 4, 25, 'terminés', 'finished', 'finished'],
  ['c1', 'Première catégorie', 'Crée une catégorie.', 'First category', 'Create a category.', 'tag', 1, 1, 'catégorie', 'category', 'cats'],
  ['c6', 'Maniaque du rangement', 'Crée 6 catégories.', 'Tidy freak', 'Create 6 categories.', 'tag', 2, 6, 'catégories', 'categories', 'cats'],
  ['c10', 'Archiviste', 'Crée 10 catégories.', 'Archivist', 'Create 10 categories.', 'tag', 3, 10, 'catégories', 'categories', 'cats'],
  ['o3', 'De retour', 'Ouvre Arcade 3 fois.', 'Back again', 'Open Arcade 3 times.', 'play', 1, 3, 'ouvertures', 'times', 'opens'],
  ['o10', 'Habitué des lieux', 'Ouvre Arcade 10 fois.', 'Regular', 'Open Arcade 10 times.', 'play', 1, 10, 'ouvertures', 'times', 'opens'],
  ['o30', 'Comme à la maison', 'Ouvre Arcade 30 fois.', 'Like home', 'Open Arcade 30 times.', 'play', 2, 30, 'ouvertures', 'times', 'opens'],
  ['o100', 'Fidèle d\'Arcade', 'Ouvre Arcade 100 fois.', 'Arcade loyalist', 'Open Arcade 100 times.', 'play', 3, 100, 'ouvertures', 'times', 'opens'],
  ['o365', 'Résident permanent', 'Ouvre Arcade 365 fois.', 'Permanent resident', 'Open Arcade 365 times.', 'play', 4, 365, 'ouvertures', 'times', 'opens'],
  ['lk1', 'Coup de dé', 'Utilise « Surprends-moi » une fois.', 'Roll of the dice', 'Use “Surprise me” once.', 'dice', 1, 1, 'fois', 'times', 'lucky'],
  ['lk10', 'Joueur de hasard', 'Utilise « Surprends-moi » 10 fois.', 'Gambler', 'Use “Surprise me” 10 times.', 'dice', 2, 10, 'fois', 'times', 'lucky'],
  ['lk50', 'Roi du hasard', 'Utilise « Surprends-moi » 50 fois.', 'King of chance', 'Use “Surprise me” 50 times.', 'dice', 3, 50, 'fois', 'times', 'lucky'],
  ['sc1', 'Explorateur', 'Scanne un dossier à la recherche de jeux.', 'Explorer', 'Scan a folder for games.', 'folder', 1, 1, 'scan', 'scan', 'scans'],
  ['sc5', 'Cartographe', 'Scanne 5 dossiers.', 'Cartographer', 'Scan 5 folders.', 'folder', 2, 5, 'scans', 'scans', 'scans'],
  ['im1', 'Importateur', 'Lance un import Steam / Epic / GOG.', 'Importer', 'Start a Steam / Epic / GOG import.', 'folder', 1, 1, 'import', 'import', 'imports'],
  ['im3', 'Grand déménagement', 'Lance 3 imports.', 'Big move', 'Start 3 imports.', 'folder', 2, 3, 'imports', 'imports', 'imports'],
  ['nl1', 'Noctambule', 'Lance un jeu entre 22 h et 5 h.', 'Night owl', 'Launch a game between 10 pm and 5 am.', 'moon', 1, 1, 'lancement', 'launch', 'nightLaunch'],
  ['nl10', 'Oiseau de nuit', 'Lance 10 jeux entre 22 h et 5 h.', 'Nighthawk', 'Launch 10 games between 10 pm and 5 am.', 'moon', 2, 10, 'lancements', 'launches', 'nightLaunch'],
  ['nl50', 'Hibou', 'Lance 50 jeux entre 22 h et 5 h.', 'Owl', 'Launch 50 games between 10 pm and 5 am.', 'moon', 3, 50, 'lancements', 'launches', 'nightLaunch'],
  ['ml1', 'Lève-tôt', 'Lance un jeu entre 5 h et 9 h.', 'Early bird', 'Launch a game between 5 am and 9 am.', 'sun', 1, 1, 'lancement', 'launch', 'morningLaunch'],
  ['ml10', 'Café et manette', 'Lance 10 jeux entre 5 h et 9 h.', 'Coffee and controller', 'Launch 10 games between 5 am and 9 am.', 'sun', 2, 10, 'lancements', 'launches', 'morningLaunch'],
  ['ml30', 'Aube numérique', 'Lance 30 jeux entre 5 h et 9 h.', 'Digital dawn', 'Launch 30 games between 5 am and 9 am.', 'sun', 3, 30, 'lancements', 'launches', 'morningLaunch'],
  ['av1', 'Nouveau look', 'Enregistre ton avatar.', 'New look', 'Save your avatar.', 'user', 1, 1, 'fois', 'times', 'avatarSaves'],
  ['av10', 'Styliste', 'Enregistre ton avatar 10 fois.', 'Stylist', 'Save your avatar 10 times.', 'user', 2, 10, 'fois', 'times', 'avatarSaves'],
  ['sh1', 'Premier achat', 'Achète un objet pour ton avatar.', 'First purchase', 'Buy an item for your avatar.', 'bag', 1, 1, 'achat', 'purchase', 'purchases'],
  ['sh5', 'Client fidèle', 'Achète 5 objets.', 'Loyal customer', 'Buy 5 items.', 'bag', 2, 5, 'achats', 'purchases', 'purchases'],
  ['sh15', 'Accro au shopping', 'Achète 15 objets.', 'Shopaholic', 'Buy 15 items.', 'bag', 3, 15, 'achats', 'purchases', 'purchases'],
  ['sh30', 'Garde-robe infinie', 'Achète 30 objets.', 'Endless wardrobe', 'Buy 30 items.', 'bag', 4, 30, 'achats', 'purchases', 'purchases'],
  ['th3', 'Caméléon', 'Change 3 fois le thème d\'Arcade.', 'Chameleon', 'Change Arcade\'s theme 3 times.', 'sun', 1, 3, 'fois', 'times', 'themeChanges'],
  ['ac5', 'Coloriste', 'Change 5 fois la couleur d\'accent.', 'Colorist', 'Change the accent color 5 times.', 'user', 2, 5, 'fois', 'times', 'accentChanges'],
  ['lv3', 'Montée en puissance', 'Gagne 3 niveaux.', 'Power up', 'Gain 3 levels.', 'crown', 1, 3, 'niveaux', 'levels', 'level'],
  ['lv6', 'Aventurier', 'Gagne 6 niveaux.', 'Adventurer', 'Gain 6 levels.', 'crown', 2, 6, 'niveaux', 'levels', 'level'],
  ['lv12', 'Héros', 'Gagne 12 niveaux.', 'Hero', 'Gain 12 levels.', 'crown', 3, 12, 'niveaux', 'levels', 'level'],
  ['lv25', 'Légende', 'Gagne 25 niveaux.', 'Legend', 'Gain 25 levels.', 'crown', 4, 25, 'niveaux', 'levels', 'level'],
  ['e100', 'Tirelire', 'Gagne 100 pièces.', 'Piggy bank', 'Earn 100 coins.', 'bag', 1, 100, 'pièces', 'coins', 'earned'],
  ['e500', 'Petit pécule', 'Gagne 500 pièces.', 'Nest egg', 'Earn 500 coins.', 'bag', 2, 500, 'pièces', 'coins', 'earned'],
  ['e1500', 'Fortune', 'Gagne 1 500 pièces.', 'Fortune', 'Earn 1,500 coins.', 'bag', 3, 1500, 'pièces', 'coins', 'earned'],
  ['e5000', 'Roi de l\'or', 'Gagne 5 000 pièces.', 'Gold king', 'Earn 5,000 coins.', 'bag', 4, 5000, 'pièces', 'coins', 'earned'],
  ['a10', 'Chasseur de succès', 'Débloque 10 succès.', 'Achievement hunter', 'Unlock 10 achievements.', 'trophy', 2, 10, 'succès', 'achievements', 'achCount'],
  ['a25', 'Collectionneur de trophées', 'Débloque 25 succès.', 'Trophy collector', 'Unlock 25 achievements.', 'trophy', 3, 25, 'succès', 'achievements', 'achCount'],
  ['a50', 'Maître des succès', 'Débloque 50 succès.', 'Achievement master', 'Unlock 50 achievements.', 'trophy', 4, 50, 'succès', 'achievements', 'achCount'],
  ['a75', 'Platine', 'Débloque 75 succès.', 'Platinum', 'Unlock 75 achievements.', 'trophy', 4, 75, 'succès', 'achievements', 'achCount'],
].map(([id, n, d, en, ed, ic, t, goal, unit, ue, k]) => ({ id, n, d, en, ed, ic, t, goal, unit, ue, k })));
ACH.forEach((a) => { a.reward = ACH_REWARD[a.t]; a.legacy = ACH_LEGACY.includes(a.id); });
const achName = (a) => (ARC.lang === 'en' && a.en) || a.n;
const achDesc = (a) => (ARC.lang === 'en' && a.ed) || a.d;
const achUnit = (a) => (ARC.lang === 'en' && a.ue) || a.unit;
const dayNum = (s) => Number(String(s).replace(/-/g, '')) || 0;
const counters = () => (state.settings && state.settings.counters) || {};
let bumpT = null, evalT = null;
function bump(k, n = 1) {
  const c = { ...counters() }; c[k] = (c[k] || 0) + n;
  state.settings.counters = c;
  clearTimeout(bumpT); bumpT = setTimeout(() => api.setSettings({ counters: state.settings.counters }).catch(() => {}), 800);
  clearTimeout(evalT); evalT = setTimeout(evalAchievements, 700);
}
const claimedIds = () => (AV ? avData().claimed : []);
const rewardSum = (done) => { const c = claimedIds(); return ACH.reduce((s, a) => s + (done[a.id] && c.includes(a.id) ? a.reward : 0), 0); };
async function claimAch(ids) {
  const done = achDone(), d = avData(), have = new Set(d.claimed);
  const add = ACH.filter((a) => ids.includes(a.id) && done[a.id] && !have.has(a.id));
  if (!add.length) return;
  const gain = add.reduce((s, a) => s + a.reward, 0);
  d.claimed = [...d.claimed, ...add.map((a) => a.id)];
  try { await setSetting({ avatar: d }); Sound.play('success'); toast('+' + gain + ' pièces récupérées', 'ok'); renderAvatar(); openAch(); } catch (e) { toast(e.message || String(e), 'error'); }
}
// Statistiques brutes. `since` (numéro de jour) limite certaines mesures aux jours postérieurs à la première ouverture.
function achStats(done, base) {
  done = done || achDone();
  const g = state.games || [], daily = state.daily || {};
  const days = Object.keys(daily).filter((k) => daily[k] > 0).sort();
  const streakOf = (list) => {
    let best = 0, run = 0, prev = null;
    for (const k of list) {
      const t = Date.parse(k + 'T12:00:00');
      run = prev !== null && Math.round((t - prev) / 86400000) === 1 ? run + 1 : 1;
      best = Math.max(best, run); prev = t;
    }
    return best;
  };
  const since = base && base.day ? base.day : 0;
  const after = days.filter((k) => dayNum(k) >= since);
  const sec = g.reduce((s, x) => s + (x.playtime || 0), 0);
  const c = counters();
  const a0 = avData();
  const pr = AV ? AV.progress(sec, Object.keys(done).length, rewardSum(done)) : { level: 1, earned: Math.floor(sec / 3600) };
  return { games: g.length, sec, launches: g.reduce((s, x) => s + (x.launches || 0), 0),
    favs: g.filter((x) => x.favorite).length, finished: g.filter((x) => x.finished).length, cats: (state.categories || []).length,
    maxGame: g.reduce((m, x) => Math.max(m, x.playtime || 0), 0), streak: streakOf(days), streakS: streakOf(after), daysS: after.length,
    maxDayS: after.reduce((m, k) => Math.max(m, daily[k] || 0), 0), playedS: g.filter((x) => (x.playtime || 0) > 0).length,
    achCount: Object.keys(done).length, level: pr.level, earned: pr.earned, ownedItems: a0 ? a0.owned.length : 0,
    opens: c.opens || 0, lucky: c.lucky || 0, scans: c.scans || 0, imports: c.imports || 0, nightLaunch: c.nightLaunch || 0, morningLaunch: c.morningLaunch || 0,
    avatarSaves: c.avatarSaves || 0, purchases: c.purchases || 0, themeChanges: c.themeChanges || 0, accentChanges: c.accentChanges || 0 };
}
const achBase = () => (state.settings && state.settings.achBase) || {};
// Valeur d'un succès : les 18 d'origine en absolu (sauf toute première ouverture), les autres seulement depuis la première ouverture
function achVal(a, st, base) {
  if (a.legacy && !base.first) return st[a.k] || 0;
  if (a.k === 'streakS' || a.k === 'daysS' || a.k === 'maxDayS') return st[a.k] || 0;
  return Math.max(0, (st[a.k] || 0) - (base[a.k] || 0));
}
const achDone = () => (state.settings && state.settings.achievements) || {};
function updateAchCount() { const e = $('#ach-count'); if (e) e.textContent = Object.keys(achDone()).length + '/' + ACH.length; }
let achBusy = false;
async function evalAchievements() {
  if (achBusy || !state.settings) return; achBusy = true;
  try {
    let done = { ...achDone() };
    let base = achBase();
    // Toute première fois : on note où tu en es. Rien ne se débloque d'avance : seuls tes progrès à partir de maintenant comptent.
    if (typeof base.first === 'undefined') {
      const first = Object.keys(done).length === 0 ? 1 : 0;
      const raw = achStats(done, null);
      base = { first, day: dayNum(new Date().toISOString().slice(0, 10)) };
      for (const [k, v] of Object.entries(raw)) if (Number.isFinite(v)) base[k] = Math.floor(v);
      state.settings.achBase = base;
      try { await api.setSettings({ achBase: base }); } catch (_) {}
    }
    const fresh = {}, now = new Date().toISOString().slice(0, 10);
    for (let pass = 0; pass < 6; pass++) {
      const st = achStats(done, base);
      let any = false;
      for (const a of ACH) if (!done[a.id] && achVal(a, st, base) >= a.goal) { fresh[a.id] = now; done[a.id] = now; any = true; }
      if (!any) break;
    }
    const ids = Object.keys(fresh);
    if (ids.length) {
      state.settings.achievements = { ...achDone(), ...fresh };
      try { await api.setSettings({ achievements: fresh }); } catch (_) {}
      const coins = ids.reduce((s, id) => s + ACH.find((a) => a.id === id).reward, 0), en = ARC.lang === 'en';
      if (ids.length > 3) toast(en ? `${ids.length} achievements unlocked (+${coins} coins)! Open “Achievements” to see them.` : `${ids.length} succès débloqués (+${coins} pièces) ! Ouvre « Succès » pour les voir.`, 'ok');
      else ids.forEach((id, i) => setTimeout(() => { const a = ACH.find((x) => x.id === id); toast(en ? `Achievement unlocked: ${achName(a)} (+${a.reward} coins)` : `Succès débloqué : ${achName(a)} (+${a.reward} pièces)`, 'ok'); }, i * 700));
      Sound.play('success');
      if (!$('#modal-root').hidden && $('#modal-root').querySelector('.ach-modal')) openAch();
      if (typeof renderAvatar === 'function') renderAvatar();
    }
  } finally { achBusy = false; updateAchCount(); }
}
const achFmt = (a, v) => a.unit === 'h' ? (Math.floor(v / 360) / 10).toString().replace('.', ARC.decimal) : String(Math.floor(v));
let achFilter = 'all';
function openAch() {
  const base = achBase(), st = achStats(achDone(), base), done = achDone();
  const total = ACH.length, got = ACH.filter((a) => done[a.id]).length, won = rewardSum(done);
  const cl = claimedIds(), pending = ACH.filter((a) => done[a.id] && !cl.includes(a.id)), pendSum = pending.reduce((s, a) => s + a.reward, 0);
  const list = ACH.filter((a) => achFilter === 'all' || (achFilter === 'done' ? !!done[a.id] : !done[a.id]));
  const tab = (id, label) => h('button', { class: 'ach-tab' + (achFilter === id ? ' on' : ''), 'data-snd': 'tick', text: label, onClick: () => { achFilter = id; openAch(); } });
  openModal(h('div', { class: 'modal ach-modal' },
    h('h3', { text: 'Succès' }),
    h('div', { class: 'ach-sum' }, h('div', { class: 'ach-sum-top' }, h('b', { text: got + ' / ' + total + ' débloqués' }), h('span', { class: 'av-coins' }, h('i', { class: 'av-coin' }), won + ' pièces gagnées')),
      h('div', { class: 'd-bar' }, h('i', { style: { width: Math.max(2, Math.round(got / total * 100)) + '%' } }))),
    pending.length ? h('div', { class: 'ach-claim' }, h('span', {}, h('i', { class: 'av-coin' }), pendSum + ' pièces à récupérer'), h('button', { class: 'btn primary', 'data-snd': 'none', text: 'Tout récupérer', onClick: () => claimAch(pending.map((a) => a.id)) })) : null,
    h('div', { class: 'ach-tabs' }, tab('all', 'Tous'), tab('todo', 'À débloquer'), tab('done', 'Débloqués')),
    h('div', { class: 'modal-body ach-grid' }, list.map((a) => {
      const ok = !!done[a.id], cur = Math.min(achVal(a, st, base), a.goal);
      return h('div', { class: 'ach t' + a.t + (ok ? ' ok' : '') },
        h('div', { class: 'ach-ic' }, icon(ok ? a.ic : 'trophy')),
        h('div', { class: 'ach-tx' },
          h('div', { class: 'ach-name' }, h('b', { text: achName(a) }), h('span', { class: 'ach-rw' }, h('i', { class: 'av-coin' }), '+' + a.reward)),
          h('small', { text: achDesc(a) }),
          ok ? h('div', { class: 'ach-done' }, h('span', { class: 'ach-date', text: 'Débloqué le ' + done[a.id].split('-').reverse().join('/') }),
               cl.includes(a.id) ? h('span', { class: 'ach-got', text: 'Récupéré' }) : h('button', { class: 'btn primary ach-take', 'data-snd': 'none', text: 'Récupérer', onClick: () => claimAch([a.id]) }))
             : h('div', { class: 'ach-prog' }, h('div', { class: 'd-bar' }, h('i', { style: { width: Math.round(cur / a.goal * 100) + '%' } })), h('span', { text: achFmt(a, cur) + ' / ' + achFmt(a, a.goal) + ' ' + achUnit(a) }))));
    })),
    h('div', { class: 'modal-foot' }, h('button', { class: 'btn primary', onClick: closeModal, text: 'Fermer' }))
  ));
}
setInterval(() => { if (!document.hidden) api.getLibrary().then((lib) => { state.games = lib.games; state.daily = lib.daily || {}; evalAchievements(); }).catch(() => {}); }, 30000);
