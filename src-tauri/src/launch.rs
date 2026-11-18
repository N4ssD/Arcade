// Arcade — lancement des jeux
use super::*;

pub(crate) struct Launched {
    pub(crate) child: Option<std::process::Child>,
    pub(crate) watch: Option<PathBuf>,
}

pub(crate) fn steam_root() -> Option<PathBuf> {
    for (key, name) in [
        (r"HKCU\Software\Valve\Steam", "SteamPath"),
        (r"HKLM\SOFTWARE\WOW6432Node\Valve\Steam", "InstallPath"),
        (r"HKLM\SOFTWARE\Valve\Steam", "InstallPath"),
    ] {
        for (_, n, v) in reg_values(key, false) {
            if n.eq_ignore_ascii_case(name) {
                let p = PathBuf::from(v.replace('/', "\\"));
                if p.is_dir() {
                    return Some(p);
                }
            }
        }
    }
    None
}

pub(crate) fn steam_libraries() -> Vec<PathBuf> {
    let root = match steam_root() {
        Some(r) => r,
        None => return vec![],
    };
    let mut libs = vec![root.clone()];
    if let Ok(txt) = fs::read_to_string(root.join("steamapps").join("libraryfolders.vdf")) {
        for line in txt.lines() {
            let l = line.trim();
            if l.starts_with("\"path\"") {
                if let Some(v) = quoted_after(l, 1) {
                    let p = PathBuf::from(v.replace("\\\\", "\\"));
                    if p.is_dir() && !libs.contains(&p) {
                        libs.push(p);
                    }
                }
            }
        }
    }
    libs
}

// n-ième texte entre guillemets d'une ligne (0 = la clé, 1 = la valeur)
pub(crate) fn quoted_after(line: &str, n: usize) -> Option<String> {
    line.split('"').skip(1).step_by(2).nth(n).map(|s| s.to_string())
}

pub(crate) fn vdf_value(txt: &str, key: &str) -> Option<String> {
    for line in txt.lines() {
        let l = line.trim();
        if quoted_after(l, 0).map(|k| k.eq_ignore_ascii_case(key)).unwrap_or(false) {
            return quoted_after(l, 1);
        }
    }
    None
}

pub(crate) fn epic_manifests() -> Vec<Value> {
    let base = match std::env::var_os("ProgramData") {
        Some(b) => PathBuf::from(b).join(r"Epic\EpicGamesLauncher\Data\Manifests"),
        None => return vec![],
    };
    let mut out = vec![];
    if let Ok(rd) = fs::read_dir(base) {
        for e in rd.flatten() {
            if e.path().extension().map(|x| x.to_string_lossy().to_lowercase() == "item").unwrap_or(false) {
                if let Ok(t) = fs::read_to_string(e.path()) {
                    if let Ok(v) = serde_json::from_str::<Value>(t.trim_start_matches('\u{feff}')) {
                        out.push(v);
                    }
                }
            }
        }
    }
    out
}

// Dossier d'un jeu lancé via Steam / Epic : sert à voir quand le jeu tourne
pub(crate) fn watch_dir_for(target: &str) -> Option<PathBuf> {
    let l = target.to_lowercase();
    if l.starts_with("steam://") {
        let id = steam_appid_of(target);
        if id == 0 {
            return None;
        }
        for lib in steam_libraries() {
            if let Ok(txt) = fs::read_to_string(lib.join("steamapps").join(format!("appmanifest_{}.acf", id))) {
                if let Some(d) = vdf_value(&txt, "installdir") {
                    let p = lib.join("steamapps").join("common").join(d);
                    if p.is_dir() {
                        return Some(p);
                    }
                }
            }
        }
    } else if l.starts_with("com.epicgames.launcher://apps/") {
        let rest = &target["com.epicgames.launcher://apps/".len()..];
        let rest = rest.split('?').next().unwrap_or("");
        let app = rest.rsplit("%3A").next().unwrap_or("").to_string();
        for v in epic_manifests() {
            if gs(&v, "AppName") == app {
                let p = PathBuf::from(gs(&v, "InstallLocation"));
                if p.is_dir() {
                    return Some(p);
                }
            }
        }
    }
    None
}

// Valeurs du registre : (clé, nom, valeur). `reg` est lancé en UTF-8 pour garder les accents.
#[cfg(windows)]
pub(crate) fn reg_values(key: &str, recursive: bool) -> Vec<(String, String, String)> {
    let cmd = format!("/c chcp 65001 >nul & reg query \"{}\"{}", key, if recursive { " /s" } else { "" });
    let out = match std::process::Command::new("cmd").raw_arg(cmd).creation_flags(CREATE_NO_WINDOW).output() {
        Ok(o) => o,
        Err(_) => return vec![],
    };
    let text = String::from_utf8_lossy(&out.stdout).to_string();
    let mut cur = String::new();
    let mut res = vec![];
    for line in text.lines() {
        let line = line.trim_end();
        if line.starts_with("HKEY_") {
            cur = line.trim().to_string();
        } else if line.starts_with(' ') {
            let t = line.trim_start();
            if let Some((name, rest)) = t.split_once("    ") {
                if let Some((typ, val)) = rest.trim_start().split_once("    ") {
                    if typ.starts_with("REG_") {
                        res.push((cur.clone(), name.to_string(), val.trim().to_string()));
                    }
                }
            }
        }
    }
    res
}

#[cfg(not(windows))]
pub(crate) fn reg_values(_key: &str, _recursive: bool) -> Vec<(String, String, String)> {
    vec![]
}

pub(crate) fn detect_launchers(known_targets: &[String]) -> Value {
    let mut items: Vec<Value> = vec![];
    let mut total = (0, 0, 0);
    let mut counts = (0, 0, 0);
    let known: Vec<String> = known_targets.iter().map(|t| t.to_lowercase()).collect();
    let known_steam: Vec<u64> = known_targets.iter().map(|t| steam_appid_of(t)).filter(|n| *n > 0).collect();

    // Steam
    for lib in steam_libraries() {
        if let Ok(rd) = fs::read_dir(lib.join("steamapps")) {
            for e in rd.flatten() {
                let fname = e.file_name().to_string_lossy().to_string();
                if !(fname.starts_with("appmanifest_") && fname.ends_with(".acf")) {
                    continue;
                }
                let txt = match fs::read_to_string(e.path()) {
                    Ok(t) => t,
                    Err(_) => continue,
                };
                let id = vdf_value(&txt, "appid").unwrap_or_default();
                let nm = vdf_value(&txt, "name").unwrap_or_default();
                let flags: i64 = vdf_value(&txt, "StateFlags").and_then(|f| f.parse().ok()).unwrap_or(4);
                if id.is_empty() || nm.is_empty() || flags & 4 == 0 {
                    continue;
                }
                let skip = ["Steamworks Common Redistributables", "Proton", "Steam Linux Runtime", "Steam Controller Configs", "Steam 360 Video Player", "SteamVR"];
                if skip.iter().any(|s| nm.starts_with(s)) {
                    continue;
                }
                total.0 += 1;
                let target = format!("steam://rungameid/{}", id);
                let idn: u64 = id.parse().unwrap_or(0);
                if known.contains(&target.to_lowercase()) || known_steam.contains(&idn) {
                    continue;
                }
                counts.0 += 1;
                items.push(json!({ "launcher": "steam", "name": nm, "target": target, "key": format!("steam:{}", id) }));
            }
        }
    }
    // Epic Games
    for v in epic_manifests() {
        if gb(&v, "bIsIncompleteInstall") {
            continue;
        }
        let (nm, app) = (gs(&v, "DisplayName"), gs(&v, "AppName"));
        if nm.is_empty() || app.is_empty() || gs(&v, "LaunchExecutable").is_empty() || nm.starts_with("Unreal Engine") {
            continue;
        }
        total.1 += 1;
        let target = format!(
            "com.epicgames.launcher://apps/{}%3A{}%3A{}?action=launch&silent=true",
            gs(&v, "CatalogNamespace"),
            gs(&v, "CatalogItemId"),
            app
        );
        if known.contains(&target.to_lowercase()) {
            continue;
        }
        counts.1 += 1;
        items.push(json!({ "launcher": "epic", "name": nm, "target": target, "key": format!("epic:{}", app) }));
    }
    // GOG Galaxy
    for base in [r"HKLM\SOFTWARE\WOW6432Node\GOG.com\Games", r"HKLM\SOFTWARE\GOG.com\Games"] {
        let vals = reg_values(base, true);
        if vals.is_empty() {
            continue;
        }
        let mut keys: Vec<String> = vals.iter().map(|(k, _, _)| k.clone()).collect();
        keys.sort();
        keys.dedup();
        for k in keys {
            let get = |n: &str| vals.iter().find(|(kk, nn, _)| *kk == k && nn.eq_ignore_ascii_case(n)).map(|(_, _, v)| v.clone()).unwrap_or_default();
            let (exe, nm) = (get("exe"), get("gameName"));
            if exe.is_empty() || nm.is_empty() || !Path::new(&exe).is_file() {
                continue;
            }
            total.2 += 1;
            if known.contains(&exe.to_lowercase()) {
                continue;
            }
            counts.2 += 1;
            items.push(json!({ "launcher": "gog", "name": nm, "target": exe, "key": format!("gog:{}", file_name_of(&k)) }));
        }
        break;
    }
    items.sort_by(|a, b| (gs(a, "launcher"), gs(a, "name").to_lowercase()).cmp(&(gs(b, "launcher"), gs(b, "name").to_lowercase())));
    json!({
        "items": items,
        "counts": { "steam": counts.0, "epic": counts.1, "gog": counts.2 },
        "total": { "steam": total.0, "epic": total.1, "gog": total.2 },
    })
}

#[cfg(windows)]
pub(crate) fn launch_target(g: &Obj) -> Result<Launched, String> {
    let t = g.get("target").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let args = g.get("args").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let run_as = g.get("runAs").and_then(|x| x.as_bool()).unwrap_or(false);
    let start_cmd = |target: &str, cwd: Option<&Path>| -> Result<(), String> {
        let mut c = std::process::Command::new("cmd");
        if let Some(d) = cwd {
            c.current_dir(d);
        }
        c.raw_arg(format!("/c start \"\" \"{}\"", target)).creation_flags(CREATE_NO_WINDOW).spawn().map(|_| ()).map_err(|e| e.to_string())
    };
    if is_uri(&t) {
        if !allowed_scheme(&t) {
            return Err("Protocole non autorisé.".into());
        }
        start_cmd(&t, None)?;
        return Ok(Launched { child: None, watch: watch_dir_for(&t) });
    }
    let p = Path::new(&t);
    if !p.exists() {
        return Err("Fichier introuvable. Il a peut-être été déplacé.".into());
    }
    let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    let dir = p.parent().map(|d| d.to_path_buf()).unwrap_or_default();
    if run_as && (ext == "exe" || ext == "bat" || ext == "cmd") {
        let q = |s: &str| s.replace('\'', "''");
        let mut ps = format!("Start-Process -FilePath '{}' -WorkingDirectory '{}'", q(&t), q(&dir.to_string_lossy()));
        if !args.trim().is_empty() {
            ps.push_str(&format!(" -ArgumentList '{}'", q(&args)));
        }
        ps.push_str(" -Verb RunAs");
        std::process::Command::new("powershell")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &ps])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(Launched { child: None, watch: Some(dir) });
    }
    if ext == "exe" {
        let mut c = std::process::Command::new(&t);
        c.current_dir(&dir);
        if !args.is_empty() {
            c.raw_arg(&args);
        }
        let child = c.spawn().map_err(|e| e.to_string())?;
        return Ok(Launched { child: Some(child), watch: None });
    }
    if (ext == "bat" || ext == "cmd") && !args.trim().is_empty() {
        let mut c = std::process::Command::new("cmd");
        c.current_dir(&dir);
        c.raw_arg(format!("/c start \"\" \"{}\" {}", t, args)).creation_flags(CREATE_NO_WINDOW).spawn().map_err(|e| e.to_string())?;
        return Ok(Launched { child: None, watch: Some(dir) });
    }
    start_cmd(&t, Some(&dir))?;
    let watch = match ext.as_str() {
        "lnk" => lnk_target(p).and_then(|x| Path::new(&x).parent().map(|d| d.to_path_buf())).filter(|d| d.is_dir()),
        "url" => url_file_target(p).and_then(|u| watch_dir_for(&u)),
        _ => Some(dir),
    };
    Ok(Launched { child: None, watch })
}

#[cfg(not(windows))]
pub(crate) fn launch_target(_g: &Obj) -> Result<Launched, String> {
    Err("Le lancement de jeux n'est disponible que sous Windows.".into())
}

#[cfg(windows)]
pub(crate) fn reveal_in_explorer(target: &str) {
    let _ = std::process::Command::new("explorer.exe").raw_arg(format!("/select,\"{}\"", target)).spawn();
}

#[cfg(not(windows))]
pub(crate) fn reveal_in_explorer(_target: &str) {}
