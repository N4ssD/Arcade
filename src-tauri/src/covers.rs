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
                        let tried = g.get("iconTried").and_then(|x| x.as_bool()).unwrap_or(false);
                        if !none || tried {
                            continue;
                        }
                        let id = g.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
                        let target = g.get("target").and_then(|x| x.as_str()).unwrap_or("").to_string();
                        if is_uri(&target) || !Path::new(&target).is_file() {
                            g.insert("iconTried".into(), json!(true));
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


pub(crate) fn handle(dir: &Path, db: &mut Db, name: &str, body: &Value) -> Result<Value, String> {
    match name {
        "ping" => {
            let notices: Vec<Value> = NOTICES.lock().map(|mut n| n.drain(..).collect()).unwrap_or_default();
            Ok(json!({ "ok": true, "changed": CHANGED.swap(false, Ordering::Relaxed), "notices": notices }))
        }
        "bye" => Ok(json!({ "ok": true })),
        "library" => {
            sync_categories(db);
            let games: Vec<Value> = db.games.iter().map(|g| public_game(dir, g)).collect();
            let mut st = db.settings.clone();
            #[cfg(windows)]
            st.insert("startWithWindows".into(), json!(inst::startup_enabled()));
            #[cfg(not(windows))]
            st.insert("startWithWindows".into(), json!(false));
            Ok(json!({
                "version": VERSION,
                "games": games,
                "categories": db.categories,
                "settings": st,
                "running": [],
                "daily": db.daily,
            }))
        }
        "add" => {
            let mut added = 0;
            if let Some(items) = body.get("items").and_then(|x| x.as_array()) {
                for it in items {
                    let t = gs(it, "target").trim().to_string();
                    if t.is_empty() {
                        continue;
                    }
                    if is_uri(&t) && !allowed_scheme(&t) {
                        continue;
                    }
                    if db.games.iter().any(|g| g.get("target").and_then(|x| x.as_str()).map(|x| x.to_lowercase()) == Some(t.to_lowercase())) {
                        continue;
                    }
                    let nm = if gs(it, "name").is_empty() { name_from_path(&t) } else { gs(it, "name") };
                    let mut g = Obj::new();
                    g.insert("id".into(), json!(new_id()));
                    g.insert("name".into(), json!(limit(nm.trim(), 80)));
                    g.insert("target".into(), json!(t));
                    g.insert("args".into(), json!(""));
                    g.insert("category".into(), json!(limit(gs(it, "category").trim(), 30)));
                    let cv = import_cover(dir, &gs(it, "cover"));
                    g.insert("coverTried".into(), json!(cv.is_some()));
                    g.insert("cover".into(), match cv { Some(p) => json!(p), None => Value::Null });
                    g.insert("icon".into(), Value::Null);
                    g.insert("iconTried".into(), json!(false));
                    g.insert("favorite".into(), json!(false));
                    g.insert("playtime".into(), json!(0));
                    g.insert("lastPlayed".into(), Value::Null);
                    g.insert("launches".into(), json!(0));
                    g.insert("runAs".into(), json!(false));
                    g.insert("finished".into(), json!(false));
                    g.insert("addedAt".into(), json!(now_ms()));
                    db.games.push(g);
                    added += 1;
                }
            }
            save(dir, db);
            Ok(json!({ "added": added }))
        }
        "update" => {
            let id = gs(body, "id");
            let idx = match find_game(db, &id) {
                Some(i) => i,
                None => return Ok(json!({ "ok": false })),
            };
            let p = match body.get("patch") {
                Some(p) if p.is_object() => p.clone(),
                _ => return Ok(json!({ "ok": false })),
            };
            let g = &mut db.games[idx];
            if p.get("name").is_some() && !gs(&p, "name").trim().is_empty() {
                g.insert("name".into(), json!(limit(gs(&p, "name").trim(), 80)));
            }
            if p.get("category").is_some() {
                g.insert("category".into(), json!(limit(gs(&p, "category").trim(), 30)));
            }
            if p.get("args").is_some() {
                g.insert("args".into(), json!(limit(&gs(&p, "args"), 500)));
            }
            for k in ["favorite", "runAs", "finished"] {
                if p.get(k).is_some() {
                    g.insert(k.into(), json!(gb(&p, k)));
                }
            }
            if let Some(cv) = p.get("cover") {
                let old = g.get("cover").and_then(|x| x.as_str()).unwrap_or("").to_string();
                match cv {
                    Value::Null => {
                        remove_media(dir, "covers", &old);
                        g.insert("cover".into(), Value::Null);
                    }
                    Value::String(s) if !s.is_empty() => {
                        if let Some(np) = import_cover(dir, s) {
                            remove_media(dir, "covers", &old);
                            g.insert("cover".into(), json!(np));
                            g.insert("coverTried".into(), json!(true));
                        }
                    }
                    _ => {}
                }
            }
            if p.get("target").is_some() && !gs(&p, "target").trim().is_empty() {
                let t = gs(&p, "target").trim().to_string();
                if !is_uri(&t) || allowed_scheme(&t) {
                    g.insert("target".into(), json!(t));
                }
            }
            save(dir, db);
            Ok(json!({ "ok": true }))
        }
        "checkLibrary" => {
            let mut missing = vec![];
            for g in &db.games {
                let t = g.get("target").and_then(|x| x.as_str()).unwrap_or("");
                if !t.is_empty() && !is_uri(t) && !Path::new(t).exists() {
                    missing.push(json!({ "id": g.get("id"), "name": g.get("name"), "target": t }));
                }
            }
            let info = |g: &Obj| json!({ "id": g.get("id"), "name": g.get("name"), "target": g.get("target"), "playtime": g.get("playtime"), "launches": g.get("launches") });
            let mut groups: Vec<Value> = vec![];
            let mut used: Vec<bool> = vec![false; db.games.len()];
            for pass in 0..2 {
                let key = |g: &Obj| -> String {
                    let t = g.get("target").and_then(|x| x.as_str()).unwrap_or("");
                    let n = g.get("name").and_then(|x| x.as_str()).unwrap_or("");
                    if pass == 0 { t.to_lowercase().replace('/', "\\") } else { get_norm(n) }
                };
                let mut seen: Vec<(String, Vec<usize>)> = vec![];
                for (i, g) in db.games.iter().enumerate() {
                    if used[i] {
                        continue;
                    }
                    let k = key(g);
                    if k.is_empty() {
                        continue;
                    }
                    match seen.iter_mut().find(|(x, _)| *x == k) {
                        Some((_, v)) => v.push(i),
                        None => seen.push((k, vec![i])),
                    }
                }
                for (_, v) in seen.into_iter().filter(|(_, v)| v.len() > 1) {
                    for &i in &v {
                        used[i] = true;
                    }
                    groups.push(json!({ "reason": if pass == 0 { "target" } else { "name" }, "games": v.iter().map(|&i| info(&db.games[i])).collect::<Vec<_>>() }));
                }
            }
            Ok(json!({ "ok": true, "missing": missing, "duplicates": groups }))
        }
        "mergeGames" => {
            let keep = gs(body, "keep");
            let ids: Vec<String> = body.get("remove").and_then(|x| x.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
            let ki = match find_game(db, &keep) {
                Some(i) => i,
                None => return Ok(json!({ "ok": false })),
            };
            for id in ids.iter().filter(|id| **id != keep) {
                if let Some(i) = find_game(db, id) {
                    let old = db.games.remove(i);
                    let ki = find_game(db, &keep).unwrap_or(ki.min(db.games.len().saturating_sub(1)));
                    let (pt, la, lp) = (gn(&Value::Object(old.clone()), "playtime"), gn(&Value::Object(old.clone()), "launches"), gn(&Value::Object(old.clone()), "lastPlayed"));
                    let k = &mut db.games[ki];
                    let kv = Value::Object(k.clone());
                    k.insert("playtime".into(), json!(gn(&kv, "playtime") + pt));
                    k.insert("launches".into(), json!(gn(&kv, "launches") + la));
                    if lp > gn(&kv, "lastPlayed") {
                        k.insert("lastPlayed".into(), json!(lp));
                    }
                    for f in ["favorite", "finished"] {
                        if old.get(f).and_then(|x| x.as_bool()).unwrap_or(false) {
                            k.insert(f.into(), json!(true));
                        }
                    }
                    let kc = k.get("cover").and_then(|x| x.as_str()).map(file_name_of).unwrap_or_default();
                    let ko = k.get("icon").and_then(|x| x.as_str()).map(file_name_of).unwrap_or_default();
                    let oc = old.get("cover").and_then(|x| x.as_str()).unwrap_or("");
                    let oi = old.get("icon").and_then(|x| x.as_str()).unwrap_or("");
                    if file_name_of(oc) != kc {
                        remove_media(dir, "covers", oc);
                    }
                    if file_name_of(oi) != ko {
                        remove_media(dir, "icons", oi);
                    }
                }
            }
            save(dir, db);
            Ok(json!({ "ok": true }))
        }
        "remove" => {
            let id = gs(body, "id");
            match find_game(db, &id) {
                Some(i) => {
                    let old = db.games.remove(i);
                    remove_media(dir, "covers", old.get("cover").and_then(|x| x.as_str()).unwrap_or(""));
                    remove_media(dir, "icons", old.get("icon").and_then(|x| x.as_str()).unwrap_or(""));
                    save(dir, db);
                    Ok(json!({ "ok": true }))
                }
                None => Ok(json!({ "ok": false })),
            }
        }
        "categories" => {
            // renommages appliqués en une seule passe (permet d'échanger deux noms)
            let mut map: Vec<(String, String)> = vec![];
            if let Some(rs) = body.get("renames").and_then(|x| x.as_array()) {
                for r in rs {
                    let (f, t) = (gs(r, "from"), gs(r, "to"));
                    if !f.is_empty() && !t.is_empty() {
                        map.push((f.to_lowercase(), limit(t.trim(), 30)));
                    }
                }
            }
            if !map.is_empty() {
                for g in db.games.iter_mut() {
                    let k = g.get("category").and_then(|x| x.as_str()).unwrap_or("").to_lowercase();
                    if let Some((_, to)) = map.iter().find(|(f, _)| *f == k) {
                        g.insert("category".into(), json!(to));
                    }
                }
            }
            let mut list: Vec<Value> = vec![];
            let mut seen: Vec<String> = vec![];
            if let Some(a) = body.get("list").and_then(|x| x.as_array()) {
                for c in a {
                    let n = limit(gs(c, "name").trim(), 30).trim().to_string();
                    if n.is_empty() || seen.contains(&n.to_lowercase()) {
                        continue;
                    }
                    seen.push(n.to_lowercase());
                    let col = gs(c, "color");
                    let col = if is_hex_color(&col) { col } else { default_cat_color(&n) };
                    let ico = gs(c, "icon");
                    let ico_ok = !ico.is_empty() && ico.len() <= 24 && ico.chars().all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-');
                    list.push(json!({ "name": n, "color": col, "icon": if ico_ok { ico } else { "tag".to_string() } }));
                    if list.len() >= 40 {
                        break;
                    }
                }
            }
            db.categories = list;
            for g in db.games.iter_mut() {
                let k = g.get("category").and_then(|x| x.as_str()).unwrap_or("").to_lowercase();
                if !k.is_empty() && !seen.contains(&k) {
                    g.insert("category".into(), json!(""));
                }
            }
            save(dir, db);
            Ok(json!({ "ok": true }))
        }
        "reveal" => {
            let id = gs(body, "id");
            if let Some(i) = find_game(db, &id) {
                let t = db.games[i].get("target").and_then(|x| x.as_str()).unwrap_or("").to_string();
                if !is_uri(&t) && Path::new(&t).exists() {
                    reveal_in_explorer(&t);
                }
            }
            Ok(json!({ "ok": true }))
        }
        "settings" => {
            #[cfg(windows)]
            if let Some(on) = body.get("startWithWindows").and_then(|x| x.as_bool()) {
                inst::set_startup(on);
            }
            if let Some(o) = body.as_object() {
                for (k, v) in o {
                    apply_setting(&mut db.settings, k, v);
                }
            }
            save(dir, db);
            Ok(Value::Object(db.settings.clone()))
        }
        "resetAll" => {
            db.games.clear();
            db.categories.clear();
            db.daily.clear();
            db.settings = default_settings();
            for sub in ["covers", "icons", "shortcuts"] {
                let d = dir.join(sub);
                if let Ok(rd) = fs::read_dir(&d) {
                    for e in rd.flatten() {
                        let p = e.path();
                        if p.is_dir() {
                            let _ = fs::remove_dir_all(&p);
                        } else {
                            let _ = fs::remove_file(&p);
                        }
                    }
                }
            }
            save(dir, db);
            Ok(json!({ "ok": true, "settings": db.settings }))
        }
        _ => Err(format!("Fonction inconnue : {}", name)),
    }
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
