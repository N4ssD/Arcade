# Historique des versions

## 2.0.0 — Arcade devient une vraie application
- Réécrit en Rust (Tauri) : Arcade a sa propre fenêtre, sans Edge ni serveur PowerShell.
- `ArcadeSetup.exe` : choix du dossier d'installation ; les données sont rangées dans le sous-dossier `data`.
- Menu automatique : réduit au repos, il pousse le contenu vers la droite au survol (réglable).
- Glisser-déposer de raccourcis (`.lnk`, `.url`) et de `.exe`.
- Temps de jeu en direct, rappel de pause, import Steam / Epic / GOG.
- Arcade se réduit quand un jeu se lance (réglable).
- Démarrage avec Windows et zone de notification.
- Choix de la langue : français ou anglais.

## 1.19.0 — Succès Arcade
- Bouton « Succès » : 18 badges à débloquer (jeux ajoutés, heures cumulées, jours d'affilée, favoris, jeux terminés…).
- Notification à chaque succès débloqué ; la progression est enregistrée dans les réglages.

## 1.18.0 — Nouveautés
- Bouton « Nouveautés » : historique des changements de chaque version, avec un point d'alerte à chaque nouvelle version.

## 1.17.0 — Réinitialisation et installeur
- Paramètres > Réinitialisation : remet Arcade à neuf (bibliothèque, catégories, statistiques, couvertures, réglages).
- `Arcade.exe` : installeur avec choix du dossier, raccourcis Bureau / menu Démarrer, mise à jour et désinstallation.

## 1.16.0 — Fiche d'un jeu refaite
- Fond coloré, grande jaquette lumineuse, boutons mieux rangés, statistiques avec icônes et barre de temps de jeu.
- Bouton « Terminé » et bouton pour copier le chemin du jeu.

## 1.15.x — Performance et finitions
- Paramètres > Performance : coupe les animations et/ou les effets visuels.
- Pixels scintillants sur le fond du lanceur, signature discrète, contour doux autour d'un jeu cliqué.
- Le zoom agrandit aussi la rangée « Reprendre ».

## 1.14 — Import, reprise et statistiques en direct
- Import automatique des jeux Steam, Epic et GOG.
- Rangée « Reprendre », bouton « Surprends-moi », temps de jeu et statistiques en direct.
- Zoom des cases par crans précis, nouveau logo pixel (couleur modifiable), animation sur tous les boutons.
