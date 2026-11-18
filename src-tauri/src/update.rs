// Arcade — mises à jour
use super::*;

pub(crate) const REPO: &str = "N4ssD/Arcade";

pub(crate) fn parse_cargo_version(t: &str) -> Option<String> {
    for l in t.lines() {
        if let Some(rest) = l.trim().strip_prefix("version") {
            if let Some(v) = rest.trim_start().strip_prefix('=') {
                let v = v.trim().trim_matches('"').trim();
                if !v.is_empty() {
                    return Some(v.to_string());
                }
            }
        }
    }
    None
}

pub(crate) fn ver_parts(v: &str) -> Vec<u64> {
    v.split('.').map(|p| p.trim().parse::<u64>().unwrap_or(0)).collect()
}

pub(crate) fn ver_newer(latest: &str, current: &str) -> bool {
    let (a, b) = (ver_parts(latest), ver_parts(current));
    for i in 0..a.len().max(b.len()) {
        let (x, y) = (a.get(i).copied().unwrap_or(0), b.get(i).copied().unwrap_or(0));
        if x != y {
            return x > y;
        }
    }
    false
}

pub(crate) async fn check_update_cmd() -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(|| {
        // Source de vérité : la version de l'exe réellement publié (titre de la release « dernier »), pas le code sur main
        // (main peut être en avance pendant que la compilation tourne). Repli : Cargo.toml.
        let from_release = (|| -> Option<String> {
            let url = format!("https://api.github.com/repos/{}/releases/tags/dernier", REPO);
            let r = ureq::get(&url).set("User-Agent", "Arcade-updater").timeout(std::time::Duration::from_secs(8)).call().ok()?;
            let v: Value = serde_json::from_reader(r.into_reader().take(2_000_000)).ok()?;
            let name = v.get("name")?.as_str()?.to_string();
            name.split_whitespace().find(|w| w.chars().next().map_or(false, |c| c.is_ascii_digit()) && w.contains('.')).map(|w| w.to_string())
        })();
        let latest = match from_release {
            Some(v) => v,
            None => {
                let url = format!("https://raw.githubusercontent.com/{}/main/src-tauri/Cargo.toml", REPO);
                let body = http_get(&url, 8).map_err(|_| "Impossible de joindre GitHub. Vérifie ta connexion.".to_string())?;
                parse_cargo_version(&String::from_utf8_lossy(&body)).ok_or_else(|| "Version distante illisible.".to_string())?
            }
        };
        Ok(json!({ "ok": true, "current": VERSION, "latest": latest, "available": ver_newer(&latest, VERSION) }))
    })
    .await
    .map_err(|e| e.to_string())?
}

// Télécharge le nouvel ArcadeSetup.exe, le lance en mode « mise à jour automatique » puis ferme Arcade
pub(crate) async fn install_update_cmd(app: &tauri::AppHandle, dir: &Path) -> Result<Value, String> {
    let d = dir.to_path_buf();
    let exe = tauri::async_runtime::spawn_blocking(move || -> Result<PathBuf, String> {
        let url = format!("https://github.com/{}/releases/download/dernier/ArcadeSetup.exe", REPO);
        let r = ureq::get(&url).timeout(std::time::Duration::from_secs(180)).call().map_err(|_| "Téléchargement impossible. Vérifie ta connexion.".to_string())?;
        let mut buf = Vec::new();
        r.into_reader().take(200_000_000).read_to_end(&mut buf).map_err(|e| e.to_string())?;
        if buf.len() < 1_000_000 || &buf[..2] != b"MZ" {
            return Err("Le fichier téléchargé est invalide.".into());
        }
        let tmp = std::env::temp_dir().join("ArcadeUpdate");
        let _ = fs::create_dir_all(&tmp);
        let exe = tmp.join("ArcadeSetup.exe");
        fs::write(&exe, &buf).map_err(|e| format!("Écriture impossible : {}", e))?;
        log(&d, &format!("Mise à jour téléchargée ({} Mo)", buf.len() / 1_000_000));
        Ok(exe)
    })
    .await
    .map_err(|e| e.to_string())??;
    #[cfg(windows)]
    {
        std::process::Command::new(&exe).arg("--update").current_dir(exe.parent().unwrap_or(Path::new("."))).spawn().map_err(|e| e.to_string())?;
        let h = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(400));
            h.exit(0);
        });
        Ok(json!({ "ok": true }))
    }
    #[cfg(not(windows))]
    {
        let _ = (&exe, app);
        Err("Les mises à jour ne sont disponibles que sous Windows.".into())
    }
}
