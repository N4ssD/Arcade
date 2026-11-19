// Arcade — nouveautés (historique des versions) et vérification de la bibliothèque
// Scripts classiques : les const/let/function du niveau supérieur sont partagés entre les fichiers app-*.js (chargés dans l'ordre de index.html).
'use strict';

// ---------- Nouveautés (historique des versions) ----------
const CHANGELOG = [
  { v: '2.12.1', title: 'Thème auto et Reprendre', items: ['Le thème suit Windows par défaut (Paramètres > Apparence > Thème : Sombre, Clair ou Auto). Ton choix déjà enregistré est conservé.', 'Section Reprendre : le bouton Jouer devient une pastille ronde avec juste le triangle, pour laisser la place au nom du jeu.'] },
  { v: '2.12.0', title: 'Thème de Noël', items: ['Du 1er décembre au 6 janvier, Arcade se met à Noël tout seul : guirlande lumineuse, neige, sapin en pixels, bonnet de Père Noël sur le logo, accent rouge et avatar en tenue de fête.', 'Tu ne veux pas le voir ? Paramètres > Apparence > « Thème de Noël » : Auto, Toujours ou Jamais. La neige et la guirlande s\'arrêtent si tu as désactivé les animations ou les effets.'] },
  { v: '2.11.2', title: 'Taille du curseur', items: ['Le curseur en pixels est plus petit par défaut, et tu peux choisir sa taille : Petit, Moyen ou Grand (Paramètres > Apparence).'] },
  { v: '2.11.1', title: 'Pendant que tu joues', items: ['Au lancement d\'un jeu, la musique se coupe et Arcade se cache du bureau : il reste dans la zone de notification, un clic sur son icône le rouvre.', 'Arcade se rouvre tout seul à la fermeture du jeu et la musique reprend.'] },
  { v: '2.11.0', title: 'Curseur en pixels', items: ['Nouveau : un curseur en pixels (flèche + main au survol des boutons et des jeux) à ta couleur d\'accent. Il ne s\'applique que dans la fenêtre d\'Arcade.', 'Paramètres > Apparence > « Curseur en pixels » pour le désactiver.'] },
  { v: '2.10.1', title: 'Musique plus rapide', items: ['La musique d\'ambiance démarre dès la fin du chargement, sans attendre un clic, et monte plus vite.'] },
  { v: '2.10.0', title: 'Musique d\'ambiance et fiabilité', items: ['Nouveau : une douce musique d\'ambiance de fond, générée en direct. Paramètres > Sons : interrupteur et volume séparés. Elle se met en pause quand Arcade est réduit.', 'Ajout de jeux : plus de faux message « déjà dans ta bibliothèque » après un double clic ou un dépôt envoyé deux fois par Windows.', 'Les messages d\'erreur restent 12 secondes (clique pour les fermer) et sont écrits dans data\\arcade.log.', 'Icônes : les jeux sans icône sont retentés à chaque lancement d\'Arcade.'] },
  { v: '2.9.0', title: 'L\'icône suit ta couleur', items: ['L\'icône d\'Arcade dans la barre des tâches et dans la zone de notification prend maintenant la couleur d\'accent (ou la couleur du logo si tu en as choisi une).', 'Limite de Windows : si Arcade est épinglé dans la barre des tâches, l\'icône épinglée garde sa couleur d\'origine ; seule l\'icône de la fenêtre ouverte change.'] },
  { v: '2.8.3', title: 'Moteur : modules plus petits', items: ['Les commandes de la bibliothèque sont séparées des couvertures dans leur propre module.'] },
  { v: '2.8.2', title: 'Correctif de compilation', items: ['Finition du découpage du moteur en modules.'] },
  { v: '2.8.1', title: 'Moteur mieux rangé', items: ['Le code du moteur (Rust) est découpé en modules : utilitaires, réglages, bibliothèque, lancement, couvertures, installation, mises à jour, zone de notification… Rien ne change à l\'écran.'] },
  { v: '2.8.0', title: 'Code mieux rangé', items: ['Le code de l\'interface est découpé en plusieurs fichiers (noyau, bibliothèque, succès, avatar, catégories, paramètres…). Rien ne change à l\'écran.'] },
  { v: '2.7.2', title: 'Finitions', items: ['Le bandeau « pièces à récupérer » est mieux aligné et traduit en anglais.'] },
  { v: '2.7.1', title: 'Récupérer ses pièces', items: ['Succès : un bouton « Récupérer » sur chaque succès débloqué, et « Tout récupérer » en haut, pour encaisser les pièces.', 'Le bouton Personnaliser de la bande est plus discret.'] },
  { v: '2.7.0', title: '101 succès et des pièces à gagner', items: ['Plus de 80 nouveaux succès : temps de jeu, séries, jours joués, grosses sessions, jeux différents, lancements de nuit ou du matin, personnalisation, avatar, boutique, niveaux, pièces, et même des succès sur les succès.', 'Chaque succès rapporte des pièces selon son palier : 10 (bronze), 25 (argent), 50 (or) ou 100 (légende), à dépenser dans la boutique de l\'avatar.', 'Rien n\'est débloqué d\'avance : à ta première ouverture, Arcade note où tu en es, et seuls tes progrès à partir de là comptent (les 18 succès d\'origine gardent leur calcul habituel si tu les avais déjà).', 'Fenêtre Succès : filtres Tous / À débloquer / Débloqués, récompense de chaque succès et total de pièces gagnées.'] },
  { v: '2.6.0', title: 'Plus de looks, avatar plus fluide', items: ['5 nouvelles coiffures (queue de cheval, chignon, carré, crête, afro), 5 nouveaux hauts (débardeur, chemise, hawaï, salopette, armure) et une jupe.', 'Animations refaites : respiration douce, clignement des yeux, tête et bras qui bougent avec un léger décalage, saut avec écrasement quand il est content, tête qui penche quand il dort, pied qui tape quand il s\'impatiente.'] },
  { v: '2.5.1', title: 'Barre d\'outils harmonisée', items: ['Recherche, tri, Catégories, Surprends-moi et Plein écran ont maintenant la même hauteur, le même arrondi et le même fond.', 'La flèche de la liste de tri est décollée du bord.'] },
  { v: '2.5.0', title: 'Avatar vivant et volume à 30 %', items: ['L\'avatar réagit : il s\'endort quand tu es inactif, il est content quand tu lances un jeu (et quand tu reviens), il s\'impatiente si tu traînes dans les menus.', 'Tenues automatiques : pyjama la nuit, lunettes de soleil l\'après-midi, bonnet en hiver, costume de sorcière à Halloween (désactivable dans Paramètres > Apparence).', 'Le volume par défaut est maintenant de 30 % partout (une fois, y compris sur les installations existantes ; tu peux le changer dans Paramètres > Sons).'] },
  { v: '2.4.2', title: 'Avatar en bande', items: ['L\'avatar passe dans une bande fine sous la barre de recherche (personnage, phrase, pièces, niveau, bouton Personnaliser) : la bibliothèque garde toute sa largeur.', 'La croix masque la bande ; l\'entrée « Mon avatar » du menu la rouvre.'] },
  { v: '2.4.1', title: 'Avatar dans le menu', items: ['L\'icône de l\'avatar dans le menu est maintenant un petit visage dans un cadre, exactement aligné sur les autres icônes.'] },
  { v: '2.4.0', title: 'Ton avatar', items: ['Nouveau : un personnage en pixels qui te représente, avec un niveau (selon ton temps de jeu et tes succès) et des pièces à dépenser.', 'Panneau à droite de la bibliothèque : l\'avatar te parle de tes jeux (ça fait X jours que tu n\'as pas relancé…). Clique dessus pour changer de phrase, sur la flèche pour masquer le panneau.', 'Éditeur « Personnaliser » : peau, cheveux, visage, haut, bas, chaussures, accessoires et fond, avec des couleurs et des objets à acheter ou à débloquer avec des succès.', 'Tu n\'aimes pas ? Paramètres > Apparence > Avatar le désactive complètement.'] },
  { v: '2.3.7', title: 'Menu replié', items: ['Le séparateur en points sous les paramètres est retiré (celui entre Statistiques et les catégories reste).'] },
  { v: '2.3.6', title: 'Séparateurs en points', items: ['Menu replié : les lignes sont remplacées par trois petits points discrets, centrés entre les groupes d\'icônes.', 'Mise à jour : Arcade compare maintenant avec la version réellement publiée, il ne te propose plus une mise à jour qui n\'est pas encore compilée.'] },
  { v: '2.3.5', title: 'Séparateurs recentrés', items: ['Menu replié : les deux séparateurs sont maintenant exactement au milieu entre les icônes (ils suivent aussi automatiquement l\'ajout de catégories).'] },
  { v: '2.3.4', title: 'Séparateurs du menu', items: ['Menu replié : les séparateurs sont des lignes fines qui s\'estompent aux extrémités, centrées, avec le même espace au-dessus et au-dessous.'] },
  { v: '2.3.3', title: 'Menu', items: ['Menu replié : fines lignes de séparation entre les groupes.', 'Le point « nouveauté » ne recouvre plus l\'icône Nouveautés (il se place dans son coin).', 'Nouvelle icône pour « Scanner un dossier » (dossier avec une loupe), pour ne plus la confondre avec les catégories.'] },
  { v: '2.3.2', title: 'Couleur perso', items: ['Le bouton « couleur personnalisée » (le rond arc-en-ciel) est remplacé par un rond discret en pointillés avec un « + » ; une fois une couleur choisie, il prend cette couleur et affiche un crayon.'] },
  { v: '2.3.1', title: 'Finitions', items: ['Panneau Performances : les cadres sont mieux espacés.', 'L\'indicateur de performances s\'affiche bien dans le menu quand il s\'ouvre.'] },
  { v: '2.3.0', title: 'Performances', items: ['Nouveau panneau « Performances » dans les réglages : mémoire (moteur d\'affichage compris), processeur et temps d\'ouverture, mesurés en direct.', 'Mode économie : les animations se mettent en pause quand la fenêtre est cachée ou pendant un jeu. Indicateur optionnel en bas du menu.', 'Arcade se rouvre beaucoup plus vite quand tu quittes un jeu.', 'Installation plus rapide : copie des fichiers en parallèle et moins d\'attente.'] },
  { v: '2.2.0', title: 'Entretien et mises à jour', items: ['Arcade vérifie s\'il existe une nouvelle version et te propose de l\'installer en un clic : il se télécharge, se met à jour tout seul et se rouvre (réglable, avec un bouton « Rechercher » dans les réglages).', 'Lancement en administrateur : les arguments et le dossier de travail du jeu sont maintenant transmis.', 'Arguments de lancement pris en compte aussi pour les fichiers .bat et .cmd.', 'Nouveau dans les réglages : « Vérifier la bibliothèque » (jeux introuvables et doublons, avec fusion) et « Désinstaller Arcade » (avec ou sans ta bibliothèque).'] },
  { v: '2.0.0', title: 'Arcade devient une vraie application', items: ['Réécrit en Rust : Arcade a sa propre fenêtre et n\'a plus besoin d\'Edge ni du serveur PowerShell.', 'ArcadeSetup.exe : tu choisis le dossier d\'installation, et tes données (bibliothèque, pochettes, journal) sont rangées dans le sous-dossier data.', 'Menu automatique : il se réduit tout seul, et en s\'ouvrant au survol il pousse le contenu vers la droite (réglable).', 'Glisser-déposer de raccourcis et de .exe directement dans la fenêtre.', 'Temps de jeu compté en direct, rappel de pause et import Steam / Epic / GOG.', 'Arcade se réduit quand tu lances un jeu, et se rouvre tout seul quand le jeu se ferme.', 'Un clic sur le logo change le mode du menu : automatique, déplié en permanence ou fermé en permanence.', 'Démarrage avec Windows et zone de notification.', 'Choix de la langue : français ou anglais (Paramètres > Apparence).'] },
  { v: '1.19.0', title: 'Succès Arcade', items: ['Nouveau bouton « Succès » : 18 badges à débloquer (jeux ajoutés, heures cumulées, jours d\'affilée, favoris, jeux terminés…).', 'Une notification s\'affiche à chaque succès débloqué ; ta progression est enregistrée.'] },
  { v: '1.18.0', title: 'Nouveautés', items: ['Nouveau bouton « Nouveautés » : l\'historique des changements de chaque version.', 'Un point violet t\'indique quand une nouvelle version est arrivée.'] },
  { v: '1.17.0', title: 'Réinitialisation et installeur', items: ['Paramètres > Réinitialisation : remet Arcade à neuf (bibliothèque, catégories, statistiques, couvertures, réglages).', 'Arcade.exe : un vrai installeur avec choix du dossier, raccourcis Bureau et menu Démarrer, mise à jour et désinstallation.'] },
  { v: '1.16.0', title: 'Fiche d\'un jeu refaite', items: ['Fond coloré, grande jaquette lumineuse, boutons mieux rangés.', 'Statistiques avec icônes et barre de temps de jeu comparée à tes autres jeux.', 'Nouveau bouton « Terminé » et bouton pour copier le chemin du jeu.'] },
  { v: '1.15', title: 'Performance et finitions', items: ['Paramètres > Performance : coupe les animations et/ou les effets visuels (flous, lueurs, fond animé).', 'Le fond du lanceur reprend les pixels scintillants de l\'écran de chargement.', 'Signature N4ssD discrète en bas à droite.', 'Contour doux et lumineux autour d\'un jeu cliqué.', 'Le zoom agrandit aussi la rangée « Reprendre ».'] },
  { v: '1.14', title: 'Import, reprise et statistiques en direct', items: ['Import automatique des jeux Steam, Epic et GOG.', 'Rangée « Reprendre » en haut de la bibliothèque.', 'Bouton « Surprends-moi » : tire un jeu au hasard (jeux jamais finis ou jamais lancés).', 'Temps de jeu et statistiques mis à jour en direct, avec un bouton pour actualiser.', 'Zoom des cases par crans précis (seule la case grandit).', 'Nouveau logo pixel : couleur d\'origine violette, modifiable dans les réglages.', 'Animation sur tous les boutons, écran de chargement amélioré, icône de fenêtre en haute qualité.'] },
];
const seenVer = () => { try { return localStorage.getItem('arcade.seenVersion') || ''; } catch (_) { return ''; } };
function refreshNewsDot() { const d = $('#news-dot'); if (d) d.hidden = seenVer() === APP_VERSION; }
function openNews() {
  try { localStorage.setItem('arcade.seenVersion', APP_VERSION); } catch (_) {}
  refreshNewsDot();
  openModal(h('div', { class: 'modal news-modal' },
    h('h3', { text: 'Nouveautés' }),
    h('div', { class: 'modal-body news-list' },
      CHANGELOG.map((e, i) => h('section', { class: 'news-ver' + (i === 0 ? ' latest' : '') },
        h('div', { class: 'news-head' }, h('span', { class: 'news-tag', text: 'v' + e.v }), h('b', { text: e.title }), i === 0 ? h('em', { class: 'news-cur', text: 'Actuelle' }) : null),
        h('ul', {}, e.items.map((t) => h('li', { text: t })))))),
    h('div', { class: 'modal-foot' }, h('button', { class: 'btn primary', onClick: closeModal, text: 'Fermer' }))
  ));
}

// ---------- Vérification de la bibliothèque ----------
const hoursOf = (s) => (Math.round((s || 0) / 360) / 10) + ' h';
async function libraryCheck(silent) {
  let r;
  try { r = await api.checkLibrary(); } catch (e) { return toast(e.message || String(e), 'error'); }
  const miss = r.missing || [], groups = r.duplicates || [];
  if (!miss.length && !groups.length) { if (!silent) toast('Tout est en ordre : aucun jeu introuvable, aucun doublon.', 'ok'); else closeModal(); return; }
  const sec = [];
  if (miss.length) {
    sec.push(h('div', { class: 'chk-sec' },
      h('h4', { text: `Jeux introuvables (${miss.length})` }),
      h('p', { class: 'dim', text: 'Le fichier du jeu n\'existe plus à son emplacement. Si le jeu est sur un disque externe, branche-le d\'abord.' }),
      h('div', { class: 'chk-list' }, ...miss.map((g) => h('div', { class: 'chk-item' }, h('b', { text: g.name }), h('small', { class: 'dim', text: g.target })))),
      h('button', { class: 'btn danger', text: `Retirer ces ${miss.length} jeu${miss.length > 1 ? 'x' : ''}`, onClick: async () => {
        for (const g of miss) await api.removeGame(g.id);
        Sound.play('delete'); await load(); libraryCheck(true);
      } })));
  }
  if (groups.length) {
    sec.push(h('div', { class: 'chk-sec' },
      h('h4', { text: `Doublons (${groups.length})` }),
      h('p', { class: 'dim', text: 'Fusionner garde le jeu le plus joué : les temps de jeu et les lancements sont additionnés.' }),
      ...groups.map((gr) => {
        const best = [...gr.games].sort((x, y) => (y.playtime || 0) - (x.playtime || 0))[0];
        return h('div', { class: 'chk-group' },
          h('div', { class: 'chk-list' }, ...gr.games.map((g) => h('div', { class: 'chk-item' }, h('b', { text: g.name }), h('small', { class: 'dim', text: hoursOf(g.playtime) + ' · ' + (g.target || '') })))),
          h('button', { class: 'btn', text: 'Fusionner', onClick: async () => {
            await api.mergeGames(best.id, gr.games.map((g) => g.id).filter((x) => x !== best.id));
            toast('Doublon fusionné.', 'ok'); await load(); libraryCheck(true);
          } }));
      })));
  }
  openModal(h('div', { class: 'modal chk-modal' },
    h('h3', { text: 'Vérification de la bibliothèque' }),
    h('div', { class: 'modal-body' }, ...sec),
    h('div', { class: 'modal-foot' }, h('button', { class: 'btn ghost', onClick: closeModal, text: 'Fermer' }))));
}

function confirmUninstall() {
  const go = async (wipe) => {
    try { await api.uninstall(wipe); toast('Désinstallation en cours…'); }
    catch (e) { toast(e.message || String(e), 'error'); }
  };
  openModal(h('div', { class: 'modal' },
    h('h3', { text: 'Désinstaller Arcade ?' }),
    h('div', { class: 'modal-body' },
      h('p', { text: 'Arcade se ferme et son dossier d\'installation est supprimé, ainsi que les raccourcis et le démarrage avec Windows.' }),
      h('p', { text: 'Les fichiers de tes jeux ne sont pas touchés.' })),
    h('div', { class: 'modal-foot' },
      h('button', { class: 'btn ghost', onClick: closeModal, text: 'Annuler' }),
      h('button', { class: 'btn', text: 'Désinstaller et garder ma bibliothèque', onClick: () => go(false) }),
      h('button', { class: 'btn danger', text: 'Tout supprimer', onClick: () => go(true) }))));
}

function confirmReset() {
  openModal(h('div', { class: 'modal' },
    h('h3', { text: 'Tout réinitialiser ?' }),
    h('div', { class: 'modal-body' },
      h('p', { text: 'Arcade redevient comme neuf : tous les jeux, catégories, statistiques, couvertures et réglages seront effacés. Cette action est définitive.' }),
      h('p', { text: 'Les fichiers de tes jeux ne sont pas supprimés de ton ordinateur.' })),
    h('div', { class: 'modal-foot' },
      h('button', { class: 'btn ghost', onClick: closeModal, text: 'Annuler' }),
      h('button', { class: 'btn danger', text: 'Tout effacer', onClick: async () => {
        const r = await api.resetAll();
        closeModal();
        if (!r || r.ok === false) return toast('La réinitialisation a échoué.', 'error');
        try { localStorage.removeItem('arcade.luckyMode'); } catch (_) {}
        Sound.play('delete');
        detailId = null; document.getElementById('detail')?.remove();
        await load();
        applyCardSize(state.settings.cardSize);
        setView('all');
        toast('Arcade est remis à neuf.', 'ok');
      } }))
  ));
}

function confirmRemove(g) {
  openModal(h('div', { class: 'modal' },
    h('h3', { text: 'Retirer ce jeu ?' }),
    h('div', { class: 'modal-body' }, h('p', { text: `« ${g.name} » sera retiré d'Arcade. Les fichiers du jeu ne sont pas supprimés de ton ordinateur.` })),
    h('div', { class: 'modal-foot' },
      h('button', { class: 'btn ghost', onClick: closeModal, text: 'Annuler' }),
      h('button', { class: 'btn danger', text: 'Retirer', onClick: async () => { await api.removeGame(g.id); closeModal(); Sound.play('delete'); toast('Jeu retiré.'); load(); } }))
  ));
}
