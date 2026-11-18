// Arcade — couvertures et icônes
use super::*;

pub(crate) fn url_enc(s: &str) -> String {
    let mut o = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b == b'.' || b == b'-' || b == b'_' {
            o.push(b as char);
        } else {
            o.push_str(&format!("%{:02X}", b));
        }
    }
    o
}

pub(crate) fn file_name_of(p: &str) -> String {
    p.rsplit(|c| c == '\\' || c == '/').next().unwrap_or("").to_string()
}

pub(crate) fn remove_media(dir: &Path, sub: &str, p: &str) {
    if p.is_empty() {
        return;
    }
    let f = file_name_of(p);
    if f.is_empty() || f.contains("..") {
        return;
    }
    let _ = fs::remove_file(dir.join(sub).join(f));
}

pub(crate) fn import_cover(dir: &Path, src: &str) -> Option<String> {
    let sp = Path::new(src);
    if src.is_empty() || !sp.is_file() {
        return None;
    }
    let ext = sp.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_else(|| "png".into());
    let cdir = dir.join("covers");
    let _ = fs::create_dir_all(&cdir);
    let dest = cdir.join(format!("{}.{}", new_id(), ext));
    fs::copy(sp, &dest).ok()?;
    Some(dest.to_string_lossy().to_string())
}

pub(crate) fn get_norm(s: &str) -> String {
    let t: String = s.to_lowercase().chars().filter(|c| !matches!(c, '\u{2122}' | '\u{ae}' | '\u{a9}')).collect();
    let t: String = t.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { ' ' }).collect();
    t.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub(crate) fn name_match(a: &str, b: &str) -> bool {
    let (x, y) = (get_norm(a), get_norm(b));
    if x.is_empty() || y.is_empty() {
        return false;
    }
    if x == y {
        return true;
    }
    let tx: Vec<&str> = x.split(' ').collect();
    let ty: Vec<&str> = y.split(' ').collect();
    let common = tx.iter().filter(|t| ty.contains(t)).count();
    (common as f64 / tx.len().max(ty.len()) as f64) >= 0.66
}

pub(crate) fn http_get(url: &str, secs: u64) -> Result<Vec<u8>, String> {
    let r = ureq::get(url).timeout(std::time::Duration::from_secs(secs)).call().map_err(|e| e.to_string())?;
    let mut buf = Vec::new();
    r.into_reader().take(8_000_000).read_to_end(&mut buf).map_err(|e| e.to_string())?;
    Ok(buf)
}

pub(crate) fn find_steam_appid(name: &str) -> Result<u64, String> {
    let url = format!("https://store.steampowered.com/api/storesearch/?term={}&l=english&cc=us", url_enc(name));
    let body = http_get(&url, 10)?;
    let v: Value = serde_json::from_slice(&body).map_err(|e| e.to_string())?;
    let items = v.get("items").and_then(|x| x.as_array()).cloned().unwrap_or_default();
    for i in &items {
        if get_norm(&gs(i, "name")) == get_norm(name) {
            return Ok(gn(i, "id") as u64);
        }
    }
    for i in &items {
        if name_match(&gs(i, "name"), name) {
            return Ok(gn(i, "id") as u64);
        }
    }
    Ok(0)
}

pub(crate) fn steam_appid_of(uri: &str) -> u64 {
    let l = uri.to_lowercase();
    for pre in ["steam://rungameid/", "steam://run/"] {
        if let Some(rest) = l.strip_prefix(pre) {
            let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
            if let Ok(n) = digits.parse::<u64>() {
                return n;
            }
        }
    }
    0
}

// Ok(None) = pas de couverture trouvée ; Err = pas de connexion
pub(crate) fn find_cover(name: &str, target: &str, query: &str, cdir: &Path) -> Result<Option<String>, String> {
    let mut tgt = target.to_string();
    if tgt.to_lowercase().ends_with(".url") && Path::new(&tgt).is_file() {
        if let Some(u) = url_file_target(Path::new(&tgt)) {
            tgt = u;
        }
    }
    let mut appid = if is_uri(&tgt) { steam_appid_of(&tgt) } else { 0 };
    if appid == 0 {
        let base = if query.is_empty() { name } else { query };
        let drop = ["launcher", "win64", "win32", "x64", "x86", "shipping", "client"];
        let clean: Vec<&str> = base.split_whitespace().filter(|w| !drop.contains(&w.to_lowercase().as_str())).collect();
        let clean = clean.join(" ");
        if clean.is_empty() {
            return Ok(None);
        }
        appid = find_steam_appid(&clean)?;
    }
    if appid == 0 {
        return Ok(None);
    }
    let bases = [
        "https://cdn.cloudflare.steamstatic.com/steam/apps",
        "https://cdn.akamai.steamstatic.com/steam/apps",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps",
    ];
    for f in ["library_600x900_2x.jpg", "library_600x900.jpg"] {
        for b in bases {
            if let Ok(bytes) = http_get(&format!("{}/{}/{}", b, appid, f), 15) {
                if bytes.len() > 8000 && bytes[0] == 0xFF && bytes[1] == 0xD8 {
                    let _ = fs::create_dir_all(cdir);
                    let dest = cdir.join(format!("{}.jpg", new_id()));
                    if fs::write(&dest, &bytes).is_ok() {
                        return Ok(Some(dest.to_string_lossy().to_string()));
                    }
                }
            }
        }
    }
    Ok(None)
}

// Extrait les icônes de plusieurs jeux avec UN SEUL appel PowerShell (le module d'icônes est compilé une fois, puis gardé en cache)
#[cfg(windows)]
pub(crate) fn extract_icons(dir: &Path, targets: &[String]) -> Vec<Option<String>> {
    let mut res: Vec<Option<String>> = vec![None; targets.len()];
    if targets.is_empty() {
        return res;
    }
    let idir = dir.join("icons");
    let _ = fs::create_dir_all(&idir);
    let script = dir.join("icon.ps1");
    let list = dir.join("icon-list.txt");
    if fs::write(&script, include_str!("icon.ps1")).is_err() || fs::write(&list, targets.join("\n")).is_err() {
        return res;
    }
    let root = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
    let ps = format!(r"{}\System32\WindowsPowerShell\v1.0\powershell.exe", root);
    let out = std::process::Command::new(ps)
        .args(["-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(&script)
        .arg("-ListFile")
        .arg(&list)
        .arg("-IconsDir")
        .arg(&idir)
        .arg("-CacheDll")
        .arg(dir.join(format!("icons-{}.dll", VERSION)))
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    if let Ok(o) = out {
        let text = String::from_utf8_lossy(&o.stdout).to_string();
        for (i, line) in text.lines().take(targets.len()).enumerate() {
            let name = line.trim();
            if !name.is_empty() && idir.join(name).is_file() {
                res[i] = Some(idir.join(name).to_string_lossy().to_string());
            }
        }
    }
    let _ = fs::remove_file(&list);
    res
}

#[cfg(not(windows))]
pub(crate) fn extract_icons(_dir: &Path, targets: &[String]) -> Vec<Option<String>> {
    vec![None; targets.len()]
}

pub(crate) fn extract_icon(dir: &Path, target: &str) -> Option<String> {
    if is_uri(target) || !Path::new(target).is_file() {
        return None;
    }
    extract_icons(dir, &[target.to_string()]).into_iter().next().flatten()
}

pub(crate) static ICON_BUSY: AtomicBool = AtomicBool::new(false);
// Jeux dont l'icône a déjà été tentée pendant cette session (un échec est retenté une fois à chaque lancement d'Arcade)
pub(crate) static ICON_SESSION: Mutex<Vec<String>> = Mutex::new(Vec::new());

// Extrait en arrière-plan les icônes des jeux qui n'en ont pas encore (un seul traitement à la fois, en lot)
pub(crate) fn spawn_icon_jobs(app: tauri::AppHandle) {
    if ICON_BUSY.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(move || {
        let st = app.state::<App>();
        loop {
            let todo: Vec<(String, String)> = match st.db.lock() {
                Ok(mut db) => {
                    let mut v = vec![];
                    let mut changed = false;
                    for g in db.games.iter_mut() {
                        let none = g.get("icon").map(|x| x.is_null()).unwrap_or(true);
                        let id = g.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
                        let done_now = ICON_SESSION.lock().map(|s| s.contains(&id)).unwrap_or(true);
                        if !none || done_now {
                            continue;
                        }
                        let target = g.get("target").and_then(|x| x.as_str()).unwrap_or("").to_string();
                        if is_uri(&target) || !Path::new(&target).is_file() {
                            g.insert("iconTried".into(), json!(true));
                            if let Ok(mut s) = ICON_SESSION.lock() {
                                s.push(id.clone());
                            }
                            changed = true;
                        } else {
                            v.push((id, target));
                        }
                    }
                    if changed {
                        save(&st.dir, &db);
                    }
                    v
                }
                Err(_) => break,
            };
            if todo.is_empty() {
                break;
            }
            let targets: Vec<String> = todo.iter().map(|(_, t)| t.clone()).collect();
            let icons = extract_icons(&st.dir, &targets);
            if let Ok(mut db) = st.db.lock() {
                for ((id, _), ico) in todo.iter().zip(icons) {
                    if let Ok(mut s) = ICON_SESSION.lock() {
                        s.push(id.clone());
                    }
                    if let Some(i) = find_game(&db, id) {
                        db.games[i].insert("iconTried".into(), json!(true));
                        if let Some(p) = ico {
                            db.games[i].insert("icon".into(), json!(p));
                        }
                    }
                }
                save(&st.dir, &db);
                CHANGED.store(true, Ordering::Relaxed);
            }
        }
        ICON_BUSY.store(false, Ordering::SeqCst);
    });
}

// Jeton d'image envoyé à l'interface : « arc:cover/nom.jpg?empreinte ». L'image est lue à la demande (commande `image`, octets bruts).
pub(crate) fn media_token(path: &Path, kind: &str, file: &str) -> Option<String> {
    let meta = fs::metadata(path).ok()?;
    if !meta.is_file() {
        return None;
    }
    let stamp = meta.len() ^ meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0).rotate_left(32);
    Some(format!("arc:{}/{}?{}", kind, url_enc(file), stamp))
}



pub(crate) async fn fetch_cover_cmd(state: &tauri::State<'_, App>, body: &Value) -> Result<Value, String> {
    let id = gs(body, "id");
    let force = gb(body, "force");
    let query = gs(body, "query");
    let (name, target) = {
        let db = state.db.lock().map_err(|_| "verrou".to_string())?;
        let i = match find_game(&db, &id) {
            Some(i) => i,
            None => return Ok(json!({ "ok": false })),
        };
        let g = Value::Object(db.games[i].clone());
        if !force {
            let auto = db.settings.get("autoCovers").and_then(|x| x.as_bool()).unwrap_or(true);
            if !auto || !g.get("cover").map(|c| c.is_null()).unwrap_or(true) || gb(&g, "coverTried") {
                return Ok(json!({ "ok": true, "found": false, "skipped": true }));
            }
        }
        (gs(&g, "name"), gs(&g, "target"))
    };
    let cdir = state.dir.join("covers");
    let res = tauri::async_runtime::spawn_blocking(move || find_cover(&name, &target, &query, &cdir)).await.map_err(|e| e.to_string())?;
    match res {
        Err(e) => {
            log(&state.dir, &format!("Recherche de couverture impossible : {}", e));
            Ok(json!({ "ok": false, "offline": true }))
        }
        Ok(file) => {
            let mut db = state.db.lock().map_err(|_| "verrou".to_string())?;
            if let Some(i) = find_game(&db, &id) {
                db.games[i].insert("coverTried".into(), json!(true));
                if let Some(f) = &file {
                    let old = db.games[i].get("cover").and_then(|x| x.as_str()).unwrap_or("").to_string();
                    remove_media(&state.dir, "covers", &old);
                    db.games[i].insert("cover".into(), json!(f));
                }
                save(&state.dir, &db);
            }
            Ok(json!({ "ok": true, "found": file.is_some() }))
        }
    }
}

pub(crate) async fn refresh_icon_cmd(state: &tauri::State<'_, App>, body: &Value) -> Result<Value, String> {
    let id = gs(body, "id");
    let target = {
        let db = state.db.lock().map_err(|_| "verrou".to_string())?;
        match find_game(&db, &id) {
            Some(i) => gs(&Value::Object(db.games[i].clone()), "target"),
            None => return Ok(json!({ "ok": false })),
        }
    };
    let dir = state.dir.clone();
    let ico = tauri::async_runtime::spawn_blocking(move || extract_icon(&dir, &target)).await.map_err(|e| e.to_string())?;
    let mut db = state.db.lock().map_err(|_| "verrou".to_string())?;
    if let Some(i) = find_game(&db, &id) {
        db.games[i].insert("iconTried".into(), json!(true));
        if let Some(p) = &ico {
            let old = db.games[i].get("icon").and_then(|x| x.as_str()).unwrap_or("").to_string();
            remove_media(&state.dir, "icons", &old);
            db.games[i].insert("icon".into(), json!(p));
        }
        save(&state.dir, &db);
    }
    Ok(json!({ "ok": true, "found": ico.is_some() }))
}
