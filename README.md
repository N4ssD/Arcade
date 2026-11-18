# Arcade

Un lanceur de jeux moderne pour Windows, en français : ta bibliothèque, tes statistiques, tes succès, au même endroit.
**Rien à installer à part l'application elle-même** : Arcade utilise PowerShell et Edge/Chrome, déjà présents sur Windows 10 et 11.

## Fonctionnalités

- Bibliothèque avec couvertures HD automatiques (Steam), icônes des jeux, catégories, favoris, recherche et tri
- Import automatique des jeux **Steam, Epic et GOG**
- Rangée **Reprendre**, bouton **Surprends-moi**, zoom précis des cases
- **Temps de jeu et statistiques en direct**, rappel de pause, mode barre des tâches
- **18 succès** à débloquer, historique des **nouveautés** par version
- Thèmes, couleur d'accent et logo personnalisables ; réglages **Performance** pour couper animations et effets
- Installeur avec choix du dossier, mise à jour, désinstallation, et bouton « Tout réinitialiser »
- Tes données restent sur ton PC, dans `%APPDATA%\Arcade` (aucun compte, aucun envoi, à part le nom d'un jeu pour chercher sa couverture)

## Télécharger

1. Va dans l'onglet **[Releases](../../releases)** et télécharge `Arcade.exe` (ou `Arcade-Installeur.zip`).
2. Lance-le : l'installeur te laisse choisir le dossier d'installation et les raccourcis.

> **Windows peut afficher « Windows a protégé votre ordinateur » (SmartScreen).**
> L'exe n'est pas encore signé numériquement : ce n'est pas un signe de virus.
> Clique sur **Informations complémentaires** puis **Exécuter quand même**.
> Tu peux vérifier ton fichier avec l'empreinte `Arcade.exe.sha256` fournie dans chaque Release, ou lire tout le code ici.

## Lancer depuis les sources (sans installeur)

Télécharge le dépôt (Code > Download ZIP), puis double-clique sur `Arcade.vbs`.

## Compiler soi-même

Rien à installer sur ton PC : **GitHub Actions** compile l'exe à ta place.

- À chaque *push* sur `main`, le workflow *Compiler Arcade.exe* produit un fichier téléchargeable (onglet **Actions** > le dernier run > **Artifacts**).
- Pour publier une version : mets à jour la version (voir ci-dessous), puis crée un tag, par exemple :
  ```
  git tag v1.19.0
  git push origin v1.19.0
  ```
  Le workflow crée alors la Release avec `Arcade.exe`, le zip et l'empreinte SHA-256.

Compilation locale (Linux/macOS/WSL avec Go 1.24+ et Python 3) :

```bash
cd installer
cp -r ../app ./app
python3 gen_syso.py "$(grep -m1 -oP '\$script:Version\s*=\s*\x27\K[^\x27]+' ../app/Arcade.ps1 | tr -d '\r')\"
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w -H=windowsgui" -o ../dist/Arcade.exe .
```

## Structure du dépôt

| Dossier | Contenu |
|---|---|
| `app/Arcade.ps1` | Le « serveur » local (PowerShell 5.1) : bibliothèque, lancement, temps de jeu, couvertures |
| `app/ui/` | L'interface (HTML, CSS, JavaScript sans dépendance) et les polices embarquées |
| `installer/` | `Arcade.exe` : installeur / lanceur écrit en Go, qui embarque `app/` |
| `.github/workflows/` | Compilation et publication automatiques |

## Changer de version

La version doit être **identique** dans deux endroits (le workflow vérifie) :
`$script:Version` dans `app/Arcade.ps1` et `APP_VERSION` dans `app/ui/app.js`.
Ajoute aussi une entrée dans `CHANGELOG.md` et dans la liste `CHANGELOG` de `app/ui/app.js` (bouton « Nouveautés »).

## Licence

[MIT](LICENSE) © N4ssD. Polices : voir [NOTICE.md](NOTICE.md).
