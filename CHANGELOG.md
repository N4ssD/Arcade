# Historique des versions

## 2.0.0 — Arcade devient une vraie application
- Réécriture en Rust (Tauri) : un seul `Arcade.exe`, sans Edge ni PowerShell.
- Installeur intégré avec choix du dossier ; les données sont rangées dans le sous-dossier `data`.
- Menu automatique (réduit, déployé au survol), glisser-déposer de raccourcis et de `.exe`.
- Pas encore porté : import Steam/Epic/GOG, temps de jeu en direct, démarrage avec Windows, zone de notification (l'ancienne version reste dans la branche `powershell-1.19`).

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
