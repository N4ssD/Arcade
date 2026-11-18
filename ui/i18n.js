// Langues d'Arcade : français (par défaut) et anglais.
// L'interface est écrite en français ; en anglais, chaque texte affiché est traduit à la volée.
(() => {
  'use strict';
  let lang = 'fr';
  try {
    const s = localStorage.getItem('arcade.lang');
    lang = s === 'en' || s === 'fr' ? s : ((navigator.language || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en');
  } catch { /* stockage indisponible */ }
  document.documentElement.lang = lang;

  window.ARC = {
    lang,
    locale: lang === 'en' ? 'en-GB' : 'fr-FR',
    decimal: lang === 'en' ? '.' : ',',
    set(l) {
      try { localStorage.setItem('arcade.lang', l); } catch { /* ignoré */ }
      location.reload();
    },
  };
  if (lang !== 'en') return;

  const EN = {
    // --- barre latérale, en-têtes, boutons principaux ---
    'Ta bibliothèque de jeux': 'Your game library', 'Chargement…': 'Loading…', 'Appuie sur une touche pour passer': 'Press any key to skip',
    'Bibliothèque': 'Library', 'Favoris': 'Favorites', 'Récents': 'Recent', 'Statistiques': 'Statistics', 'Catégories': 'Categories',
    'Succès': 'Achievements', 'Nouveautés': "What's new", 'Paramètres': 'Settings', 'Ajouter un jeu': 'Add a game',
    'Scanner un dossier': 'Scan a folder', 'Importer mes jeux': 'Import my games', 'Importer Steam / Epic / GOG': 'Import Steam / Epic / GOG',
    'Nom (A–Z)': 'Name (A–Z)', 'Dernier lancé': 'Last played', 'Temps de jeu': 'Playtime', 'Ajouté récemment': 'Recently added',
    'Surprends-moi': 'Surprise me', 'Ta bibliothèque est vide': 'Your library is empty', 'Ta bibliothèque est vide.': 'Your library is empty.',
    'Ajoute un jeu, scanne un dossier, ou glisse-dépose tes fichiers ici.': 'Add a game, scan a folder, or drag and drop your files here.',
    'Dépose tes raccourcis (.lnk, .url) ici': 'Drop your shortcuts (.lnk, .url) here',
    'Menu automatique — clique pour le garder déplié': 'Automatic menu — click to keep it expanded',
    'Menu fermé en permanence — clique pour le mode automatique': 'Menu always closed — click for automatic mode',
    'Menu déplié en permanence — clique pour le garder fermé': 'Menu always expanded — click to keep it closed',
    'Plus tard': 'Later',
    'Téléchargement…': 'Downloading…',
    'Ta bibliothèque et tes réglages sont conservés.': 'Your library and settings are kept.',
    'Rechercher une mise à jour': 'Check for updates',
    'Vérifier les mises à jour au démarrage': 'Check for updates at startup',
    'Arcade regarde en arrière-plan s\'il existe une nouvelle version et te le propose.': 'Arcade checks in the background for a new version and offers it to you.',
    'Impossible de joindre GitHub. Vérifie ta connexion.': 'Can\'t reach GitHub. Check your connection.',
    'Téléchargement impossible. Vérifie ta connexion.': 'Download failed. Check your connection.',
    'Le fichier téléchargé est invalide.': 'The downloaded file is invalid.',
    'Agrandir le menu': 'Expand the menu', 'Réduire le menu': 'Collapse the menu', 'Réduire le menu (Ctrl+B)': 'Collapse the menu (Ctrl+B)',
    'Ajouter un jeu (Ctrl+N)': 'Add a game (Ctrl+N)', 'Plein écran (F11)': 'Full screen (F11)', 'Rechercher… (Ctrl+F)': 'Search… (Ctrl+F)',
    'Taille des vignettes': 'Thumbnail size', 'Trier par': 'Sort by', 'Créer et gérer les catégories (Jeux, Logiciels…)': 'Create and manage categories (Games, Software…)',
    'Importer les jeux installés depuis Steam, Epic Games et GOG': 'Import installed games from Steam, Epic Games and GOG',
    'Laisse le hasard choisir ton prochain jeu': 'Let chance pick your next game', 'Bienvenue': 'Welcome',
    'Tout': 'All', 'Tous mes jeux': 'All my games', 'Sans catégorie': 'Uncategorized', 'Par catégorie': 'By category', 'Actualiser': 'Refresh',
    'Reprendre': 'Resume', 'Joués récemment': 'Played recently', 'Rien à afficher dans cette section pour le moment.': 'Nothing to show in this section yet.',
    'Aucun résultat': 'No results', 'Essaie une autre recherche.': 'Try another search.', 'Choisis un autre filtre ci-dessus.': 'Pick another filter above.',
    'Aujourd\'hui': 'Today', 'Hier': 'Yesterday', 'Jamais': 'Never', 'Jamais joué': 'Never played', 'Jamais lancé': 'Never launched', 'Jamais lancés': 'Never launched',
    'Cette semaine': 'This week', 'Dernière session': 'Last session', 'Temps de jeu total': 'Total playtime', 'Lancements': 'Launches',
    'Les plus joués': 'Most played', '14 derniers jours': 'Last 14 days', 'Tout a été essayé': 'Everything has been tried',
    'Pas encore de statistiques': 'No statistics yet', 'Pas encore assez de temps de jeu.': 'Not enough playtime yet.',
    'Lance un jeu depuis Arcade : son temps de jeu, tes séries de jours et tes jeux préférés apparaîtront ici.': 'Launch a game from Arcade: its playtime, your day streaks and your favorite games will show up here.',
    'Le détail jour par jour est enregistré à partir de cette version.': 'The day-by-day detail is recorded starting with this version.',
    'Aucun jeu en cours': 'No game running', 'Actualiser les statistiques': 'Refresh statistics',
    'Ajoute des catégories à tes jeux pour voir la répartition.': 'Add categories to your games to see the breakdown.',
    'Pas terminé': 'Not finished', 'Pas terminés': 'Not finished', 'terminé': 'finished', 'terminés': 'finished', 'catégories': 'categories',
    'Jours d\'affilée': 'Day streak', 'Jour d\'affilée': 'Day streak', 'C:\\Jeux\\MonJeu\\jeu.exe  ou  steam://rungameid/12345': 'C:\\Games\\MyGame\\game.exe  or  steam://rungameid/12345',
    '+ Jeux': '+ Games', '+ Logiciels': '+ Software', '+ Émulateurs': '+ Emulators', '+ Outils': '+ Tools', '+ Médias': '+ Media',
    // --- fiche d'un jeu et menus ---
    'Jouer': 'Play', 'Options': 'Options', 'Voir la fiche': 'View details', 'Ouvrir le dossier': 'Open folder', 'Modifier le jeu': 'Edit game',
    'Marquer comme terminé': 'Mark as finished', 'Terminé': 'Finished', 'Retirer de la bibliothèque': 'Remove from library', 'Retirer ce jeu ?': 'Remove this game?',
    'Ajouter aux favoris': 'Add to favorites', 'Retirer des favoris': 'Remove from favorites', 'Favori': 'Favorite', 'Modifier': 'Edit', 'Dossier': 'Folder',
    'Emplacement': 'Location', 'Copier': 'Copy', 'Copier le chemin': 'Copy path', 'Chemin copié.': 'Path copied.', 'Copie impossible.': 'Could not copy.',
    'Catégorie': 'Category', 'Catégorie…': 'Category…', 'Ranger dans la catégorie': 'Move to category', 'Introuvable': 'Missing', 'Fichier introuvable': 'File not found',
    'Ajouté le': 'Added on', 'Retirer': 'Remove', 'Retour (Échap)': 'Back (Esc)', 'Fermer': 'Close', 'Fermer / revenir à la bibliothèque': 'Close / back to library',
    'Actualiser l\'icône': 'Refresh icon', 'Icône mise à jour.': 'Icon updated.', 'Aucune icône trouvée pour ce jeu.': 'No icon found for this game.',
    'Retrouver la couverture': 'Find the cover', 'Couverture trouvée !': 'Cover found!', 'Couverture…': 'Cover…',
    'Aucune couverture trouvée pour ce nom. Essaie un autre nom, ou choisis une image.': 'No cover found for this name. Try another name, or pick an image.',
    'Impossible de contacter Steam. Vérifie ta connexion Internet.': 'Could not reach Steam. Check your internet connection.',
    'Impossible de lancer ce jeu.': 'Could not launch this game.', 'Jeu retiré.': 'Game removed.', 'Jeu ajouté ! Recherche de la couverture…': 'Game added! Looking for the cover…',
    'Ce jeu est déjà dans ta bibliothèque.': 'This game is already in your library.', 'Ce jeu est déjà dans ta bibliothèque (ou le lien est invalide).': 'This game is already in your library (or the link is invalid).',
    'Modifications enregistrées.': 'Changes saved.', 'Indique le fichier ou le lien du jeu.': 'Enter the game file or link.',
    'Arguments de lancement': 'Launch arguments', 'Optionnel (ex : -windowed)': 'Optional (e.g. -windowed)', 'Uniquement pour les fichiers .exe.': 'Only for .exe files.',
    'Exécuter en administrateur': 'Run as administrator', 'Windows te demandera une autorisation à chaque lancement. Pour les .exe et .bat uniquement.': 'Windows will ask for permission on every launch. For .exe and .bat files only.',
    'Fichier ou lien': 'File or link', 'Parcourir…': 'Browse…', 'Nom': 'Name', 'Nom du jeu': 'Game name', 'Image de couverture': 'Cover image', 'Choisir une image…': 'Choose an image…',
    'Chercher auto': 'Search automatically', 'Télécharge une couverture HD à partir du nom': 'Downloads an HD cover from the name',
    'Une couverture HD est cherchée automatiquement à l\'ajout. Sinon, une couverture colorée est générée.': 'An HD cover is searched automatically when adding. Otherwise, a colored cover is generated.',
    'Un .exe, un raccourci .lnk, ou un lien (steam://, com.epicgames.launcher://…).': 'An .exe, a .lnk shortcut, or a link (steam://, com.epicgames.launcher://…).',
    'Annuler': 'Cancel', 'Enregistrer': 'Save', 'Ajouter': 'Add', 'Supprimer': 'Delete', 'Couleur': 'Color', 'Actuelle': 'Current', 'Aucune': 'None',
    'Rechercher': 'Search', 'Relancer': 'Run again', 'Tester': 'Test', 'Basculer': 'Toggle', 'Volume': 'Volume',
    'Où ranger': 'Where to put',
    // --- catégories ---
    'Gérer les catégories': 'Manage categories', 'Nom de la catégorie (ex : Logiciels)': 'Category name (e.g. Software)', 'Nom de la catégorie (ex : Logiciels, Jeux…)': 'Category name (e.g. Software, Games…)',
    'Créer la catégorie': 'Create category', '+ Nouvelle': '+ New', 'Nouvelle': 'New', 'Changer la couleur et l\'icône': 'Change color and icon', 'Couleur personnalisée': 'Custom color',
    'Donne un nom à la catégorie.': 'Give the category a name.', 'Cette catégorie existe déjà.': 'This category already exists.', 'Cette catégorie existe déjà : elle est sélectionnée.': 'This category already exists: it is selected.',
    'Catégorie retirée.': 'Category removed.', 'Catégories enregistrées.': 'Categories saved.', 'Deux catégories ont le même nom.': 'Two categories have the same name.', 'Une catégorie n\'a pas de nom.': 'A category has no name.',
    'Aucune catégorie pour le moment. Crée-en une ci-dessous pour ranger tes jeux et logiciels.': 'No categories yet. Create one below to organize your games and software.',
    'Aucun jeu ici pour le moment. Glisse un jeu sur cette catégorie, ou fais un clic droit sur un jeu puis « Catégorie… ».': 'No games here yet. Drag a game onto this category, or right-click a game then “Category…”.',
    'Range ta bibliothèque : Jeux, Logiciels, Émulateurs… Clique sur le badge d\'une catégorie pour changer sa couleur et son icône.': 'Organize your library: Games, Software, Emulators… Click a category badge to change its color and icon.',
    'Range les jeux dans « Steam », « Epic Games » ou « GOG ».': 'Puts games in “Steam”, “Epic Games” or “GOG”.', 'Une catégorie par lanceur': 'One category per launcher',
    'Tout sélectionner': 'Select all', 'Tout désélectionner': 'Deselect all', 'Tout / rien': 'All / none', 'Tout effacer': 'Clear all',
    // --- import et scan ---
    'Recherche de Steam, Epic Games et GOG…': 'Looking for Steam, Epic Games and GOG…', 'Analyse du dossier…': 'Scanning the folder…', 'Rien à importer': 'Nothing to import',
    'Aucun jeu Steam, Epic Games ou GOG installé n\'a été trouvé sur ce PC.': 'No installed Steam, Epic Games or GOG game was found on this PC.',
    'Tous tes jeux Steam, Epic Games et GOG sont déjà dans Arcade.': 'All your Steam, Epic Games and GOG games are already in Arcade.',
    'Aucun nouveau jeu (.exe) trouvé dans ce dossier.': 'No new game (.exe) found in this folder.',
    'Décoche ceux que tu ne veux pas ajouter (désinstalleurs et utilitaires déjà ignorés).': 'Uncheck the ones you don\'t want to add (uninstallers and utilities are already skipped).',
    'Seuls les jeux déjà installés sont listés. Les couvertures HD sont téléchargées ensuite, une par jeu.': 'Only already installed games are listed. HD covers are downloaded afterwards, one per game.',
    'Ajouter la sélection': 'Add selection', 'Epic Games': 'Epic Games',
    'Rechercher les couvertures manquantes': 'Find missing covers', 'Relance la recherche pour les jeux sans image.': 'Runs the search again for games without an image.',
    'Tous tes jeux ont déjà une couverture.': 'All your games already have a cover.', 'Couvertures manquantes': 'Missing covers',
    'Dépose des raccourcis (.lnk, .url) ou des .exe.': 'Drop shortcuts (.lnk, .url) or .exe files.',
    // --- surprends-moi ---
    'Je choisis ton prochain jeu au hasard.': 'I\'m picking your next game at random.', 'Tirage en cours…': 'Drawing…', 'Tout est terminé, bravo !': 'Everything is finished, well done!',
    'Toute la bibliothèque': 'Whole library', 'Tu as déjà lancé tous tes jeux !': 'You have already launched all your games!',
    // --- succès ---
    'Succès Arcade': 'Arcade achievements', 'Premier pas': 'First step', 'Ajoute ton premier jeu.': 'Add your first game.', 'Collectionneur': 'Collector', 'Ajoute 10 jeux.': 'Add 10 games.',
    'Grande collection': 'Big collection', 'Ajoute 25 jeux.': 'Add 25 games.', 'Bibliothécaire': 'Librarian', 'Ajoute 50 jeux.': 'Add 50 games.',
    'Échauffement': 'Warm-up', 'Cumule 1 h de jeu.': 'Play for 1 h in total.', 'Habitué': 'Regular', 'Cumule 10 h de jeu.': 'Play for 10 h in total.',
    'Centurion': 'Centurion', 'Cumule 100 h de jeu.': 'Play for 100 h in total.', 'Légende vivante': 'Living legend', 'Cumule 500 h de jeu.': 'Play for 500 h in total.',
    'Sur la lancée': 'On a roll', 'Joue 3 jours d\'affilée.': 'Play 3 days in a row.', 'Une semaine d\'affilée': 'A week in a row', 'Joue 7 jours d\'affilée.': 'Play 7 days in a row.',
    'Mois sans faute': 'Flawless month', 'Joue 30 jours d\'affilée.': 'Play 30 days in a row.', 'Prêt à jouer': 'Ready to play', 'Lance des jeux 10 fois.': 'Launch games 10 times.',
    'Toujours partant': 'Always up for it', 'Lance des jeux 100 fois.': 'Launch games 100 times.', 'Marathon': 'Marathon', 'Passe 10 h sur un seul jeu.': 'Spend 10 h on a single game.',
    'Coups de cœur': 'Favorites', 'Mets 5 jeux en favoris.': 'Add 5 games to favorites.', 'Générique de fin': 'End credits', 'Marque un jeu comme terminé.': 'Mark a game as finished.',
    'Complétionniste': 'Completionist', 'Marque 10 jeux comme terminés.': 'Mark 10 games as finished.', 'Organisé': 'Organized', 'Crée 3 catégories.': 'Create 3 categories.',
    'Continue comme ça !': 'Keep it up!', 'jeux': 'games', 'jeu': 'game', 'jours': 'days', 'lancements': 'launches', 'favoris': 'favorites',
    // --- nouveautés ---
    'Voir les nouveautés': 'See what\'s new', 'Arcade devient une vraie application': 'Arcade becomes a real application',
    'Glisser-déposer de raccourcis et de .exe directement dans la fenêtre.': 'Drag and drop shortcuts and .exe files straight into the window.',
    'Bientôt : import Steam/Epic/GOG et temps de jeu en direct.': 'Coming soon: Steam/Epic/GOG import and live playtime.',
    'Nouveau bouton « Succès » : 18 badges à débloquer (jeux ajoutés, heures cumulées, jours d\'affilée, favoris, jeux terminés…).': 'New “Achievements” button: 18 badges to unlock (games added, total hours, day streaks, favorites, finished games…).',
    'Une notification s\'affiche à chaque succès débloqué ; ta progression est enregistrée.': 'A notification appears for every unlocked achievement; your progress is saved.',
    'Nouveautés': 'What\'s new',
    'Nouveau bouton « Nouveautés » : l\'historique des changements de chaque version.': 'New “What\'s new” button: the change history of every version.',
    'Un point violet t\'indique quand une nouvelle version est arrivée.': 'A purple dot tells you when a new version has arrived.',
    'Réinitialisation et installeur': 'Reset and installer',
    'Paramètres > Réinitialisation : remet Arcade à neuf (bibliothèque, catégories, statistiques, couvertures, réglages).': 'Settings > Reset: puts Arcade back to new (library, categories, statistics, covers, settings).',
    'Arcade.exe : un vrai installeur avec choix du dossier, raccourcis Bureau et menu Démarrer, mise à jour et désinstallation.': 'Arcade.exe: a real installer with folder choice, Desktop and Start menu shortcuts, update and uninstall.',
    'Fiche d\'un jeu refaite': 'Game page redesigned', 'Fond coloré, grande jaquette lumineuse, boutons mieux rangés.': 'Colored background, large glowing cover, better organized buttons.',
    'Statistiques avec icônes et barre de temps de jeu comparée à tes autres jeux.': 'Statistics with icons and a playtime bar compared to your other games.',
    'Nouveau bouton « Terminé » et bouton pour copier le chemin du jeu.': 'New “Finished” button and a button to copy the game path.',
    'Performance et finitions': 'Performance and polish',
    'Paramètres > Performance : coupe les animations et/ou les effets visuels (flous, lueurs, fond animé).': 'Settings > Performance: turns off animations and/or visual effects (blurs, glows, animated background).',
    'Le fond du lanceur reprend les pixels scintillants de l\'écran de chargement.': 'The launcher background now has the twinkling pixels of the loading screen.',
    'Signature N4ssD discrète en bas à droite.': 'Discreet N4ssD signature at the bottom right.', 'Contour doux et lumineux autour d\'un jeu cliqué.': 'Soft glowing outline around a clicked game.',
    'Le zoom agrandit aussi la rangée « Reprendre ».': 'Zoom also enlarges the “Resume” row.',
    'Import, reprise et statistiques en direct': 'Import, resume and live statistics', 'Import automatique des jeux Steam, Epic et GOG.': 'Automatic import of Steam, Epic and GOG games.',
    'Rangée « Reprendre » en haut de la bibliothèque.': '“Resume” row at the top of the library.',
    'Bouton « Surprends-moi » : tire un jeu au hasard (jeux jamais finis ou jamais lancés).': '“Surprise me” button: picks a random game (never finished or never launched).',
    'Temps de jeu et statistiques mis à jour en direct, avec un bouton pour actualiser.': 'Playtime and statistics updated live, with a refresh button.',
    'Zoom des cases par crans précis (seule la case grandit).': 'Card zoom in precise steps (only the card grows).',
    'Nouveau logo pixel : couleur d\'origine violette, modifiable dans les réglages.': 'New pixel logo: original purple color, changeable in settings.',
    'Animation sur tous les boutons, écran de chargement amélioré, icône de fenêtre en haute qualité.': 'Animation on all buttons, improved loading screen, high-quality window icon.',
    // --- paramètres ---
    'Sons': 'Sounds', 'Sons de l\'interface': 'Interface sounds', 'Petits sons doux lors des clics, des ouvertures et du lancement des jeux.': 'Soft little sounds on clicks, openings and game launches.',
    'Sons au clic': 'Click sounds', 'Un petit son doux quand tu cliques sur un bouton ou changes de section.': 'A soft little sound when you click a button or change section.',
    'Sons au survol': 'Hover sounds', 'Un léger tic quand la souris passe sur un jeu.': 'A light tick when the mouse moves over a game.',
    'Règle le volume des sons du lanceur.': 'Sets the volume of the launcher sounds.', 'Jouer un son': 'Play a sound',
    'Performance': 'Performance', 'Animations': 'Animations', 'Désactive les transitions et animations (survols, ouvertures, clics, défilements). Idéal sur un PC modeste.': 'Turns off transitions and animations (hovers, openings, clicks, scrolling). Ideal on a modest PC.',
    'Effets visuels': 'Visual effects', 'Désactive les effets lourds : flous, lueurs, fond animé et ambiance. Plus fluide, un peu moins joli.': 'Turns off heavy effects: blurs, glows, animated background and ambiance. Smoother, a bit less pretty.',
    'Apparence': 'Appearance', 'Langue': 'Language', 'Choisis la langue de l\'interface.': 'Choose the interface language.', 'Thème': 'Theme', 'Sombre, clair, ou comme Windows (Auto).': 'Dark, light, or like Windows (Auto).',
    'Sombre': 'Dark', 'Clair': 'Light', 'Auto': 'Auto', 'Menu automatique': 'Automatic menu',
    'Le menu se réduit tout seul quand la souris n\'est pas dessus, et se déploie dès que tu passes dessus.': 'The menu collapses by itself when the mouse is not over it, and expands as soon as you hover it.',
    'Couleur d\'accent': 'Accent color', 'La couleur des boutons, de la sélection et des détails.': 'The color of buttons, selection and details.',
    'Couleur du logo': 'Logo color', 'Par défaut, le logo prend la couleur d\'accent.': 'By default, the logo uses the accent color.', 'Comme l\'accent': 'Same as accent',
    'Violet': 'Purple', 'Ambre': 'Amber', 'Bleu': 'Blue', 'Turquoise': 'Turquoise', 'Vert': 'Green', 'Jaune': 'Yellow', 'Orange': 'Orange', 'Rose': 'Pink', 'Rouge': 'Red',
    'Fond animé': 'Animated background', 'Grille pixel, lueurs et petits pixels qui scintillent derrière le lanceur (comme à l\'écran de chargement).': 'Pixel grid, glows and twinkling little pixels behind the launcher (like on the loading screen).',
    'Ambiance': 'Ambiance', 'L\'image du jeu survolé s\'étend en fond, flou et discret, derrière la bibliothèque.': 'The hovered game\'s image spreads out in the background, blurred and subtle, behind the library.',
    'Diaporama au repos': 'Idle slideshow', 'Si tu ne touches à rien pendant un moment, les images de tes jeux défilent doucement en fond.': 'If you don\'t touch anything for a while, your games\' images slowly scroll in the background.',
    'Animation de démarrage': 'Startup animation', 'Petite animation du logo à l\'ouverture d\'Arcade.': 'Small logo animation when Arcade opens.',
    'Système': 'System', 'Lancer Arcade au démarrage de Windows': 'Start Arcade with Windows', 'Arcade s\'ouvre tout seul quand tu allumes ton PC.': 'Arcade opens by itself when you turn on your PC.',
    'Garder Arcade dans la zone de notification': 'Keep Arcade in the notification area', 'Quand tu fermes la fenêtre, Arcade reste en arrière-plan (icône près de l\'horloge) : clique dessus pour le rouvrir. Avec le démarrage Windows, il démarre alors discrètement.': 'When you close the window, Arcade stays in the background (icon near the clock): click it to reopen. With Windows startup, it then starts quietly.',
    'Arcade restera actif dans la zone de notification quand tu fermes la fenêtre.': 'Arcade will stay active in the notification area when you close the window.', 'Arcade se fermera complètement avec sa fenêtre.': 'Arcade will close completely with its window.',
    'Rappel de pause': 'Break reminder', 'Une notification Windows (et un message dans Arcade) quand tu joues depuis longtemps.': 'A Windows notification (and a message in Arcade) when you have been playing for a long time.',
    'Désactivé': 'Off', 'Toutes les heures': 'Every hour', 'Toutes les 2 heures': 'Every 2 hours', 'Toutes les 3 heures': 'Every 3 hours', 'Toutes les 4 heures': 'Every 4 hours',
    'Couvertures': 'Covers', 'Couvertures automatiques': 'Automatic covers', 'À l\'ajout d\'un jeu, télécharge une couverture HD depuis Steam. Seul le nom du jeu est envoyé.': 'When a game is added, downloads an HD cover from Steam. Only the game name is sent.',
    'Affichage et manette': 'Display and controller', 'Mode télé': 'TV mode', 'Plein écran, menu réduit, sélection bien visible, curseur masqué quand tu ne bouges pas la souris. Idéal avec une manette (croix : naviguer, A : jouer, Y : fiche, X : favori, LB/RB : sections, Start : plein écran).': 'Full screen, collapsed menu, clearly visible selection, cursor hidden when you don\'t move the mouse. Ideal with a controller (d-pad: navigate, A: play, Y: details, X: favorite, LB/RB: sections, Start: full screen).',
    'Plein écran': 'Full screen', 'Raccourci : F11. Échap pour en sortir.': 'Shortcut: F11. Esc to exit.', 'Le plein écran n\'est pas disponible ici.': 'Full screen is not available here.',
    'Manette détectée : croix = naviguer, A = jouer, Y = fiche, X = favori, LB/RB = sections.': 'Controller detected: d-pad = navigate, A = play, Y = details, X = favorite, LB/RB = sections.',
    'Raccourcis clavier': 'Keyboard shortcuts', 'Survole ou sélectionne un jeu, puis utilise ces touches.': 'Hover or select a game, then use these keys.', 'Afficher cette liste': 'Show this list',
    'Se déplacer entre les jeux': 'Move between games', 'Lancer le jeu sélectionné': 'Launch the selected game', 'Ouvrir la fiche du jeu sélectionné': 'Open the selected game\'s page',
    'Ajouter / retirer des favoris': 'Add / remove favorites', 'Rechercher': 'Search', 'Réduire / agrandir le menu': 'Collapse / expand the menu',
    'Entrée': 'Enter', 'Espace': 'Space', 'Suppr': 'Del', 'Échap': 'Esc', 'Ctrl + Entrée': 'Ctrl + Enter', '/  ou  Ctrl + F': '/  or  Ctrl + F',
    'Réinitialisation': 'Reset', 'Tout réinitialiser': 'Reset everything', 'Tout réinitialiser ?': 'Reset everything?', 'Tout remettre à zéro': 'Reset everything to zero',
    'Efface ta bibliothèque, tes catégories, tes statistiques, tes couvertures et tous tes réglages : Arcade redevient comme neuf. Les fichiers de tes jeux ne sont pas touchés.': 'Erases your library, categories, statistics, covers and all your settings: Arcade goes back to new. Your game files are not touched.',
    'Arcade redevient comme neuf : tous les jeux, catégories, statistiques, couvertures et réglages seront effacés. Cette action est définitive.': 'Arcade goes back to new: all games, categories, statistics, covers and settings will be erased. This cannot be undone.',
    'Les fichiers de tes jeux ne sont pas supprimés de ton ordinateur.': 'Your game files are not deleted from your computer.',
    'Arcade est remis à neuf.': 'Arcade has been reset.', 'La réinitialisation a échoué.': 'The reset failed.',
    'Tes données sont dans le sous-dossier data du dossier d\'installation.': 'Your data is in the data subfolder of the installation folder.',
    'À propos': 'About', 'Médias': 'Media', 'Suggestions :': 'Suggestions:',
    // --- messages venant de l'application (Rust) ---
    'Pas encore disponible dans la version Rust (en cours de portage).': 'Not available yet in the Rust version (being ported).',
    'Le lancement de jeux n\'est disponible que sous Windows.': 'Game launching is only available on Windows.',
    'Fichier introuvable. Il a peut-être été déplacé.': 'File not found. It may have been moved.', 'Protocole non autorisé.': 'Protocol not allowed.', 'Jeu introuvable.': 'Game not found.',
    'Arcade doit être lancé depuis Arcade.exe.': 'Arcade must be started from Arcade.exe.',
    'Réduire Arcade quand un jeu se lance': 'Minimize Arcade when a game launches', 'Arcade se réduit dans la barre des tâches pendant que tu joues, pour ne consommer aucune ressource.': 'Arcade minimizes to the taskbar while you play, so it uses no resources.',
    'Ce jeu est déjà en cours.': 'This game is already running.',
    'Réécrit en Rust : Arcade a sa propre fenêtre et n\'a plus besoin d\'Edge ni du serveur PowerShell.': 'Rewritten in Rust: Arcade has its own window and no longer needs Edge or the PowerShell server.',
    'ArcadeSetup.exe : tu choisis le dossier d\'installation, et tes données (bibliothèque, pochettes, journal) sont rangées dans le sous-dossier data.': 'ArcadeSetup.exe: you choose the installation folder, and your data (library, covers, log) is stored in the data subfolder.',
    'Menu automatique : il se réduit tout seul, et en s\'ouvrant au survol il pousse le contenu vers la droite (réglable).': 'Automatic menu: it collapses by itself, and when it opens on hover it pushes the content to the right (adjustable).',
    'Temps de jeu compté en direct, rappel de pause et import Steam / Epic / GOG.': 'Playtime counted live, break reminder and Steam / Epic / GOG import.',
    'Démarrage avec Windows et zone de notification.': 'Start with Windows and notification area.',
    'Choix de la langue : français ou anglais (Paramètres > Apparence).': 'Language choice: French or English (Settings > Appearance).',
    // --- installeur ---
    'Installation d\'Arcade': 'Arcade setup', 'Installe Arcade pour ce compte. Aucun administrateur requis.': 'Installs Arcade for this account. No administrator required.',
    'Installer dans': 'Install to', 'Installé dans': 'Installed in', 'C\'est toi qui choisis où installer Arcade.': 'You choose where to install Arcade.', 'Modifier…': 'Change…',
    'Raccourci sur le Bureau': 'Desktop shortcut', 'Raccourci dans le menu Démarrer': 'Start menu shortcut', 'Lancer Arcade à la fin': 'Launch Arcade when finished',
    'Installer': 'Install', 'Mettre à jour': 'Update', 'Installation en cours…': 'Installing…', 'Mise à jour en cours…': 'Updating…', 'Préparation…': 'Preparing…',
    'Copie des fichiers…': 'Copying files…', 'Création des raccourcis…': 'Creating shortcuts…', 'Finalisation…': 'Finishing…', 'Retour': 'Back', 'Réessayer': 'Try again',
    'Arcade est installé': 'Arcade is installed', 'Arcade est à jour': 'Arcade is up to date', 'Tout est prêt. Bon jeu !': 'All set. Have fun!', 'Lancer Arcade': 'Launch Arcade',
    'Tu peux le retrouver avec son raccourci.': 'You can find it with its shortcut.',
    'Dossier d\'installation invalide.': 'Invalid installation folder.', 'Choisis un dossier, pas la racine d\'un disque.': 'Choose a folder, not the root of a drive.', 'Choisis un dossier en dehors de Windows.': 'Choose a folder outside Windows.',
    'L\'installeur ne répond plus.': 'The installer is not responding.', 'Erreur inconnue.': 'Unknown error.',
  };

  // Textes avec des valeurs variables
  const pl = (n, one, many) => (Number(n) > 1 ? many : one);
  const UNITS = { 'jeu': 'game', 'jeux': 'games', 'jours': 'days', 'lancements': 'launches', 'favoris': 'favorites', 'terminé': 'finished', 'terminés': 'finished', 'catégories': 'categories', 'h': 'h' };
  const RULES = [
    [/^(\d+) jeux? installés? trouvés?$/, (m, n) => `${n} installed ${pl(n, 'game', 'games')} found`],
    [/^(\d+) jeux? importés?\. Les couvertures arrivent…$/, (m, n) => `${n} ${pl(n, 'game', 'games')} imported. Covers are coming…`],
    [/^Importer (\d+) jeux?$/, (m, n) => `Import ${n} ${pl(n, 'game', 'games')}`],
    [/^(\d+) jeux? prêts?$/, (m, n) => `${n} ${pl(n, 'game', 'games')} ready`],
    [/^sur (\d+) jeux?$/, (m, n) => `across ${n} ${pl(n, 'game', 'games')}`],
    [/^(\d+) jamais joués?$/, (m, n) => `${n} never played`],
    [/^(\d+) jeux?$/, (m, n) => `${n} ${pl(n, 'game', 'games')}`],
    [/^(\d+) jeu\(x\) ajouté\(s\)\.$/, (m, n) => `${n} ${pl(n, 'game', 'games')} added.`],
    [/^(\d+) jeu\(x\) ajouté\(s\) depuis tes raccourcis\.$/, (m, n) => `${n} ${pl(n, 'game', 'games')} added from your shortcuts.`],
    [/^(\d+) jeu\(x\) trouvé\(s\)$/, (m, n) => `${n} ${pl(n, 'game', 'games')} found`],
    [/^Catégories enregistrées\. (\d+) jeu\(x\) sans catégorie\.$/, (m, n) => `Categories saved. ${n} ${pl(n, 'game', 'games')} without a category.`],
    [/^Recherche de (\d+) couverture\(s\)…$/, (m, n) => `Looking for ${n} ${pl(n, 'cover', 'covers')}…`],
    [/^Il y a (\d+) j$/, (m, n) => `${n} d ago`],
    [/^(\d+) succès débloqués ! Ouvre « Succès » pour les voir\.$/, (m, n) => `${n} achievements unlocked! Open “Achievements” to see them.`],
    [/^Succès débloqué : (.+)$/, (m, a) => 'Achievement unlocked: ' + tr(a)],
    [/^(\d+) \/ (\d+) débloqués$/, (m, a, b) => `${a} / ${b} unlocked`],
    [/^Débloqué le (\d+)\/(\d+)\/(\d+)$/, (m, d, mo, y) => `Unlocked on ${d}/${mo}/${y}`],
    [/^(.+ \/ .+) (jeux?|jours|lancements|favoris|terminés?|catégories)$/, (m, a, u) => `${a.replace(',', '.')} ${UNITS[u] || u}`],
    [/^Mis à jour à (.+)$/, (m, t) => 'Updated at ' + t],
    [/^En cours : (.+)$/, (m, t) => 'Playing: ' + t],
    [/^Arguments : (.+)$/, (m, t) => 'Arguments: ' + t],
    [/^Taille des cases : (.+)$/, (m, t) => 'Card size: ' + t],
    [/^Erreur : (.+)$/, (m, t) => 'Error: ' + tr(t)],
    [/^Impossible d'enregistrer les catégories : (.+)$/, (m, t) => 'Could not save the categories: ' + tr(t)],
    [/^(.+) se lance…$/, (m, t) => `${t} is launching…`],
    [/^(.+) marqué comme terminé\.$/, (m, t) => `${t} marked as finished.`],
    [/^(.+) remis dans les jeux à finir\.$/, (m, t) => `${t} put back in games to finish.`],
    [/^Où ranger « (.+) » \?$/, (m, t) => `Where should “${t}” go?`],
    [/^Rangé dans « (.+) »\.$/, (m, t) => `Moved to “${t}”.`],
    [/^« (.+) » n'a plus de catégorie\.$/, (m, t) => `“${t}” no longer has a category.`],
    [/^« (.+) » rangé dans « (.+) »\.$/, (m, a, b) => `“${a}” moved to “${b}”.`],
    [/^« (.+) » sera retiré d'Arcade\. Les fichiers du jeu ne sont pas supprimés de ton ordinateur\.$/, (m, t) => `“${t}” will be removed from Arcade. The game files are not deleted from your computer.`],
    [/^Tu joues à (.+) depuis environ (\d+) h : pense à faire une pause !$/, (m, g, h) => `You have been playing ${g} for about ${h} h: remember to take a break!`],
    [/^(Aujourd'hui|Hier) à (.+)$/, (m, d, t) => `${tr(d)} at ${t}`],
    [/^(\+?-?\d+) % vs semaine passée$/, (m, n) => `${n} % vs last week`],
    [/^Arcade (\d+\.\d+\.\d+)$/, (m, v) => 'Arcade ' + v],
    [/^Version (\d+\.\d+\.\d+)$/, (m, v) => 'Version ' + v],
    [/^Une nouvelle version d'Arcade est prête(?: \((.+)\))?\. Ta bibliothèque et tes réglages sont conservés\.$/, (m, v) => `A new version of Arcade is ready${v ? ' (' + v + ')' : ''}. Your library and settings are kept.`],
  ];

  function tr(s) {
    if (!s) return s;
    const t = s.trim();
    if (!t) return s;
    let out = EN[t];
    if (out === undefined && t.includes(' · ')) {
      const parts = t.split(' · '), mapped = parts.map((x) => tr(x));
      if (mapped.some((x, i) => x !== parts[i])) out = mapped.join(' · ');
    }
    if (out === undefined) {
      for (const [re, fn] of RULES) { const m = t.match(re); if (m) { out = fn(...m); break; } }
    }
    if (out === undefined || out === t) return s;
    const a = s.indexOf(t);
    return s.slice(0, a) + out + s.slice(a + t.length);
  }
  window.ARC.tr = tr;

  const ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];
  const SKIP = new Set(['SCRIPT', 'STYLE']);
  function fixNode(n) {
    if (n.nodeType === 3) {
      const v = tr(n.nodeValue);
      if (v !== n.nodeValue) n.nodeValue = v;
    } else if (n.nodeType === 1 && !SKIP.has(n.tagName)) {
      for (const a of ATTRS) { const v = n.getAttribute(a); if (v) { const t = tr(v); if (t !== v) n.setAttribute(a, t); } }
      for (let c = n.firstChild; c; c = c.nextSibling) fixNode(c);
    }
  }
  const obs = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(fixNode);
      else if (m.type === 'characterData') fixNode(m.target);
      else if (m.type === 'attributes') fixNode(m.target);
    }
  });
  const start = () => {
    fixNode(document.documentElement);
    obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
