# Arcade

Un lanceur de jeux moderne pour Windows, en français : ta bibliothèque, tes statistiques, tes succès, au même endroit.
**Un seul fichier à télécharger, `ArcadeSetup.exe`** : pas besoin d'Edge, de PowerShell ni d'installer quoi que ce soit d'autre.

## Fonctionnalités

- Bibliothèque avec pochettes HD automatiques (Steam), icônes des jeux, catégories, favoris, recherche et tri
- Ajout par **glisser-déposer** (raccourcis `.lnk` / `.url`, `.exe`), par sélecteur de fichier ou par scan d'un dossier
- Import automatique des jeux **Steam, Epic et GOG**, **temps de jeu en direct**, rappel de pause, Arcade se réduit quand tu lances un jeu
- Rangée **Reprendre**, bouton **Surprends-moi**, zoom précis des cases
- **Français et English** au choix (Paramètres > Apparence)
- **Menu automatique** : il se réduit tout seul et se déploie au survol
- **18 succès** à débloquer, historique des **nouveautés** par version
- Thèmes, couleur d'accent et logo personnalisables ; réglages **Performance** pour couper animations et effets
- Installeur intégré (choix du dossier, raccourcis, mise à jour, désinstallation) et bouton « Tout réinitialiser »
- Tes données restent sur ton PC, dans le sous-dossier `data` du dossier d'installation (aucun compte, aucun envoi, à part le nom d'un jeu pour chercher sa pochette)

### Pas encore porté depuis l'ancienne version

Démarrage avec Windows et mode zone de notification.
L'ancienne version complète (PowerShell) reste disponible dans la branche [`powershell-1.19`](../../tree/powershell-1.19).

## Télécharger

1. Télécharge **[ArcadeSetup.exe](../../releases/download/dernier/ArcadeSetup.exe)** (page [Releases](../../releases)).
2. Lance-le : la fenêtre d'installation te laisse choisir le dossier et les raccourcis. L'application installée s'appelle `Arcade.exe`.

> **Windows peut afficher « Windows a protégé votre ordinateur » (SmartScreen).**
> L'exe n'est pas encore signé numériquement : ce n'est pas un signe de virus.
> Clique sur **Informations complémentaires** puis **Exécuter quand même**, ou lis tout le code ici.

Après l'installation, le dossier contient :

| Fichier | Rôle |
|---|---|
| `Arcade.exe` | L'application |
| `data\library.json` | Ta bibliothèque et tes réglages |
| `data\covers`, `data\icons` | Pochettes et icônes |
| `data\arcade.log` | Journal, utile en cas de problème |

Pour désinstaller : Paramètres Windows > Applications > Arcade.

## De quoi est fait Arcade ?

- **Rust** ([Tauri 2](https://tauri.app)) : l'application, la fenêtre, la bibliothèque, le lancement des jeux, les pochettes, l'installeur.
- **HTML / CSS / JavaScript** : l'interface, affichée dans la fenêtre de l'application (WebView2, déjà présent dans Windows 10 et 11). C'est pour ça que GitHub affiche aussi du JavaScript et du CSS : c'est le dessin de l'écran, pas un autre programme.
- Un petit script PowerShell (`src-tauri/src/icon.ps1`) sert uniquement à extraire l'icône des jeux.

## Compiler

Rien à installer sur ton PC : **GitHub Actions** compile l'exe (onglet **Actions**). À chaque *push* sur `main`, la dernière version est publiée dans la Release `dernier`.

Compilation locale (Windows, Rust installé) :

```
cargo build --release --manifest-path src-tauri/Cargo.toml
```

L'exe est alors dans `src-tauri/target/release/arcade.exe`.

## Structure du dépôt

| Dossier | Contenu |
|---|---|
| `src-tauri/` | Le code Rust (`src/main.rs`), la configuration Tauri et les icônes |
| `ui/` | L'interface (HTML, CSS, JavaScript sans dépendance) et les polices embarquées |
| `.github/workflows/` | Compilation et publication automatiques |

## Changer de version

Même numéro dans `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `VERSION` dans `src-tauri/src/main.rs` et `APP_VERSION` dans `ui/app.js`.
Ajoute aussi une entrée dans `CHANGELOG.md` et dans la liste `CHANGELOG` de `ui/app.js` (bouton « Nouveautés »).

## Licence

[MIT](LICENSE) © N4ssD. Polices : voir [NOTICE.md](NOTICE.md).
