// Arcade (version Rust / Tauri) : même interface que la version PowerShell, même fichier de bibliothèque.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::{json, Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const VERSION: &str = "1.19.0";
const PALETTE: [&str; 8] = ["#9c7cf0", "#5ec2ff", "#58d68d", "#ffd166", "#ff8f5e", "#ff6b9a", "#3fd0c9", "#e0a3ff"];
const SCHEMES: [&str; 11] = [
    "steam", "com.epicgames.launcher", "goggalaxy", "uplay", "origin2", "origin", "battlenet", "xbox",
    "ms-windows-store", "http", "https",
];
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

type Obj = Map<String, Value>;

struct Db {
    games: Vec<Obj>,
    categories: Vec<Value>,
    settings: Obj,
    daily: Obj,
}

struct App {
    db: Mutex<Db>,
    dir: PathBuf,
}

// ---------- utilitaires ----------

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

static COUNTER: AtomicU64 = AtomicU64::new(1);

fn new_id() -> String {
    let n = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0) as u64;
    let c = COUNTER.fetch_add(1, Ordering::Relaxed);
    let a = n ^ (c.wrapping_mul(0x9E37_79B9_7F4A_7C15));
    let b = n.rotate_left(17) ^ c.wrapping_mul(0xC2B2_AE3D_27D4_EB4F);
    format!(
        "{:08x}-{:04x}-4{:03x}-8{:03x}-{:012x}",
        (a >> 32) as u32,
        (a >> 16) as u16,
        (b >> 52) as u16 & 0x0fff,
        (b >> 40) as u16 & 0x0fff,
        b & 0xffff_ffff_ffff
    )
}

fn limit(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

fn is_hex_color(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 7 && b[0] == b'#' && b[1..].iter().all(|c| c.is_ascii_hexdigit())
}

fn is_uri(t: &str) -> bool {
    match t.find("://") {
        Some(p) if p >= 2 => {
            let mut chars = t[..p].chars();
            let first_ok = chars.next().map(|c| c.is_ascii_alphabetic()).unwrap_or(false);
            first_ok && chars.all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '.' || c == '-')
        }
        _ => false,
    }
}

fn allowed_scheme(t: &str) -> bool {
    let s = t.split(':').next().unwrap_or("").to_lowercase();
    SCHEMES.contains(&s.as_str())
}

fn name_from_path(p: &str) -> String {
    if is_uri(p) {
        return "Nouveau jeu".to_string();
    }
    let stem = Path::new(p).file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let cleaned: String = stem.chars().map(|c| if c == '_' || c == '-' || c == '.' { ' ' } else { c }).collect();
    let name = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty() {
        "Nouveau jeu".to_string()
    } else {
        name
    }
}

fn default_cat_color(name: &str) -> String {
    let mut x: u64 = 0;
    for u in name.encode_utf16() {
        x = (x * 31 + u as u64) % 4_294_967_296;
    }
    PALETTE[(x % PALETTE.len() as u64) as usize].to_string()
}

fn gs(v: &Value, k: &str) -> String {
    match v.get(k) {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        _ => String::new(),
    }
}
fn gb(v: &Value, k: &str) -> bool {
    v.get(k).and_then(|x| x.as_bool()).unwrap_or(false)
}
fn gn(v: &Value, k: &str) -> i64 {
    match v.get(k) {
        Some(x) => x.as_i64().or_else(|| x.as_f64().map(|f| f as i64)).unwrap_or(0),
        None => 0,
    }
}
fn opt_str(v: &Value, k: &str) -> Value {
    match v.get(k) {
        Some(Value::String(s)) if !s.is_empty() => Value::String(s.clone()),
        _ => Value::Null,
    }
}

fn data_dir() -> PathBuf {
    match std::env::var_os("APPDATA") {
        Some(a) => PathBuf::from(a).join("Arcade"),
        None => PathBuf::from("Arcade-data"),
    }
}

// ---------- réglages ----------

fn default_settings() -> Obj {
    let v = json!({
        "cardSize": 200, "volume": 60, "sounds": true, "hoverSounds": true, "clickSounds": true,
        "autoCovers": true, "sidebarCollapsed": false, "introAnim": true, "trayMode": false,
        "breakReminder": 0, "theme": "dark", "accent": "#9C7CF0", "accentV": 2, "logo": "",
        "bgfx": true, "animations": true, "effects": true, "achievements": {}, "ambient": true,
        "slideshow": false
    });
    v.as_object().cloned().unwrap_or_default()
}

fn same_kind(a: &Value, b: &Value) -> bool {
    matches!(
        (a, b),
        (Value::Bool(_), Value::Bool(_)) | (Value::Number(_), Value::Number(_)) | (Value::String(_), Value::String(_)) | (Value::Object(_), Value::Object(_))
    )
}

fn apply_setting(settings: &mut Obj, k: &str, v: &Value) {
    match k {
        "cardSize" => {
            if let Some(n) = v.as_i64() {
                settings.insert(k.into(), json!(n.clamp(140, 320)));
            }
        }
        "volume" => {
            if let Some(n) = v.as_i64() {
                settings.insert(k.into(), json!(n.clamp(0, 100)));
            }
        }
        "breakReminder" => {
            if let Some(n) = v.as_i64() {
                settings.insert(k.into(), json!(n.clamp(0, 12)));
            }
        }
        "theme" => {
            if let Some(s) = v.as_str() {
                if s == "dark" || s == "light" || s == "auto" {
                    settings.insert(k.into(), json!(s));
                }
            }
        }
        "accent" => {
            if let Some(s) = v.as_str() {
                if is_hex_color(s) {
                    settings.insert(k.into(), json!(s));
                }
            }
        }
        "logo" => {
            if let Some(s) = v.as_str() {
                if s.is_empty() || is_hex_color(s) {
                    settings.insert(k.into(), json!(s));
                }
            }
        }
        "achievements" => {
            if let Some(o) = v.as_object() {
                let mut cur = settings.get("achievements").and_then(|x| x.as_object()).cloned().unwrap_or_default();
                for (id, val) in o {
                    let ok = !id.is_empty() && id.len() <= 40 && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_');
                    if ok && !cur.contains_key(id) {
                        if let Some(s) = val.as_str() {
                            cur.insert(id.clone(), json!(limit(s, 40)));
                        }
                    }
                }
                settings.insert(k.into(), Value::Object(cur));
            }
        }
        "bgfx" | "animations" | "effects" | "ambient" | "slideshow" | "sounds" | "hoverSounds" | "clickSounds" | "autoCovers"
        | "sidebarCollapsed" | "introAnim" | "trayMode" => {
            if let Some(b) = v.as_bool() {
                settings.insert(k.into(), json!(b));
            }
        }
        _ => {}
    }
}

// ---------- chargement / sauvegarde ----------

fn norm_game(v: &Value) -> Obj {
    let mut g = Obj::new();
    g.insert("id".into(), json!(gs(v, "id")));
    g.insert("name".into(), json!(gs(v, "name")));
    g.insert("target".into(), json!(gs(v, "target")));
    g.insert("args".into(), json!(gs(v, "args")));
    g.insert("category".into(), json!(gs(v, "category")));
    g.insert("cover".into(), opt_str(v, "cover"));
    g.insert("coverTried".into(), json!(gb(v, "coverTried")));
    g.insert("icon".into(), opt_str(v, "icon"));
    g.insert("iconTried".into(), json!(gb(v, "iconTried")));
    g.insert("favorite".into(), json!(gb(v, "favorite")));
    g.insert("playtime".into(), json!(gn(v, "playtime")));
    let lp = gn(v, "lastPlayed");
    g.insert("lastPlayed".into(), if lp > 0 { json!(lp) } else { Value::Null });
    g.insert("launches".into(), json!(gn(v, "launches")));
    g.insert("runAs".into(), json!(gb(v, "runAs")));
    g.insert("finished".into(), json!(gb(v, "finished")));
    g.insert("addedAt".into(), json!(gn(v, "addedAt")));
    g
}

fn load(dir: &Path) -> Db {
    let mut db = Db { games: vec![], categories: vec![], settings: default_settings(), daily: Obj::new() };
    let text = match fs::read_to_string(dir.join("library.json")) {
        Ok(t) => t,
        Err(_) => return db,
    };
    let raw: Value = match serde_json::from_str(text.trim_start_matches('\u{feff}')) {
        Ok(v) => v,
        Err(_) => return db,
    };
    if let Some(s) = raw.get("settings").and_then(|x| x.as_object()) {
        // l'ancienne couleur ambrée n'est reprise que si accentV >= 2 (comme la version PowerShell)
        let acc_v = s.get("accentV").and_then(|x| x.as_i64()).unwrap_or(0);
        for (k, v) in s {
            if k == "accent" && v.as_str().map(|a| a.eq_ignore_ascii_case("#fac775")).unwrap_or(false) && acc_v < 2 {
                continue;
            }
            let known = db.settings.get(k).map(|d| same_kind(d, v)).unwrap_or(false);
            if known {
                apply_setting(&mut db.settings, k, v);
            }
        }
    }
    if let Some(d) = raw.get("daily").and_then(|x| x.as_object()) {
        for (k, v) in d {
            if k.len() == 10 && v.is_number() {
                db.daily.insert(k.clone(), json!(v.as_i64().unwrap_or(0)));
            }
        }
    }
    if let Some(a) = raw.get("games").and_then(|x| x.as_array()) {
        for g in a {
            if g.is_object() {
                db.games.push(norm_game(g));
            }
        }
    }
    if let Some(a) = raw.get("categories").and_then(|x| x.as_array()) {
        for c in a {
            let name = gs(c, "name");
            if name.is_empty() {
                continue;
            }
            let icon = if gs(c, "icon").is_empty() { "tag".to_string() } else { gs(c, "icon") };
            db.categories.push(json!({ "name": name, "color": gs(c, "color"), "icon": icon }));
        }
    }
    db
}

fn save(dir: &Path, db: &Db) {
    let obj = json!({
        "games": db.games,
        "categories": db.categories,
        "settings": db.settings,
        "daily": db.daily,
    });
    if let Ok(text) = serde_json::to_string_pretty(&obj) {
        let _ = fs::create_dir_all(dir);
        let tmp = dir.join("library.json.tmp");
        if fs::write(&tmp, text).is_ok() {
            let _ = fs::rename(&tmp, dir.join("library.json"));
        }
    }
}

// Toute catégorie utilisée par un jeu existe dans la liste (et la casse est unifiée)
fn sync_categories(db: &mut Db) {
    for gi in 0..db.games.len() {
        let n = db.games[gi].get("category").and_then(|x| x.as_str()).unwrap_or("").to_string();
        if n.is_empty() {
            continue;
        }
        let lower = n.to_lowercase();
        let found = db.categories.iter().find_map(|c| {
            let cn = c.get("name").and_then(|x| x.as_str()).unwrap_or("");
            if cn.to_lowercase() == lower {
                Some(cn.to_string())
            } else {
                None
            }
        });
        match found {
            Some(cn) => {
                if cn != n {
                    db.games[gi].insert("category".into(), json!(cn));
                }
            }
            None => db.categories.push(json!({ "name": n, "color": default_cat_color(&n), "icon": "tag" })),
        }
    }
}

fn public_game(g: &Obj) -> Value {
    let mut o = g.clone();
    let target = g.get("target").and_then(|x| x.as_str()).unwrap_or("");
    let exists = if is_uri(target) { true } else { Path::new(target).exists() };
    o.insert("iconUrl".into(), Value::Null);
    o.insert("coverUrl".into(), Value::Null);
    o.insert("exists".into(), json!(exists));
    Value::Object(o)
}

// ---------- lancement ----------

#[cfg(windows)]
fn launch_target(g: &Obj) -> Result<(), String> {
    let t = g.get("target").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let args = g.get("args").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let run_as = g.get("runAs").and_then(|x| x.as_bool()).unwrap_or(false);
    if is_uri(&t) {
        if !allowed_scheme(&t) {
            return Err("Protocole non autorisé.".into());
        }
        std::process::Command::new("cmd")
            .raw_arg(format!("/c start \"\" \"{}\"", t))
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    let p = Path::new(&t);
    if !p.exists() {
        return Err("Fichier introuvable. Il a peut-être été déplacé.".into());
    }
    let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    let dir = p.parent().map(|d| d.to_path_buf()).unwrap_or_default();
    if run_as && (ext == "exe" || ext == "bat" || ext == "cmd") {
        let ps = format!("Start-Process -FilePath '{}' -Verb RunAs", t.replace('\'', "''"));
        std::process::Command::new("powershell")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &ps])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    if ext == "exe" {
        let mut c = std::process::Command::new(&t);
        c.current_dir(&dir);
        if !args.is_empty() {
            c.raw_arg(&args);
        }
        c.spawn().map_err(|e| e.to_string())?;
    } else {
        std::process::Command::new("cmd")
            .current_dir(&dir)
            .raw_arg(format!("/c start \"\" \"{}\"", t))
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(not(windows))]
fn launch_target(_g: &Obj) -> Result<(), String> {
    Err("Le lancement de jeux n'est disponible que sous Windows.".into())
}

#[cfg(windows)]
fn reveal_in_explorer(target: &str) {
    let _ = std::process::Command::new("explorer.exe").raw_arg(format!("/select,\"{}\"", target)).spawn();
}

#[cfg(not(windows))]
fn reveal_in_explorer(_target: &str) {}

// ---------- API (mêmes noms que la version PowerShell) ----------

fn find_game(db: &Db, id: &str) -> Option<usize> {
    db.games.iter().position(|g| g.get("id").and_then(|x| x.as_str()) == Some(id))
}

fn handle(dir: &Path, db: &mut Db, name: &str, body: &Value) -> Result<Value, String> {
    match name {
        "ping" => Ok(json!({ "ok": true, "changed": false, "notices": [] })),
        "bye" => Ok(json!({ "ok": true })),
        "library" => {
            sync_categories(db);
            let games: Vec<Value> = db.games.iter().map(public_game).collect();
            let mut st = db.settings.clone();
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
                    g.insert("cover".into(), Value::Null);
                    g.insert("coverTried".into(), json!(false));
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
            if p.get("target").is_some() && !gs(&p, "target").trim().is_empty() {
                let t = gs(&p, "target").trim().to_string();
                if !is_uri(&t) || allowed_scheme(&t) {
                    g.insert("target".into(), json!(t));
                }
            }
            save(dir, db);
            Ok(json!({ "ok": true }))
        }
        "remove" => {
            let id = gs(body, "id");
            match find_game(db, &id) {
                Some(i) => {
                    db.games.remove(i);
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
        "launch" => {
            let id = gs(body, "id");
            let idx = match find_game(db, &id) {
                Some(i) => i,
                None => return Ok(json!({ "ok": false, "error": "Jeu introuvable." })),
            };
            match launch_target(&db.games[idx]) {
                Ok(()) => {
                    let g = &mut db.games[idx];
                    let n = g.get("launches").and_then(|x| x.as_i64()).unwrap_or(0) + 1;
                    g.insert("lastPlayed".into(), json!(now_ms()));
                    g.insert("launches".into(), json!(n));
                    save(dir, db);
                    Ok(json!({ "ok": true }))
                }
                Err(e) => Ok(json!({ "ok": false, "error": e })),
            }
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
        // Fonctions pas encore portées dans la version Rust
        "detectLaunchers" | "fetchCover" | "refreshIcon" | "addDropped" => {
            Err("Pas encore disponible dans la version Rust (en cours de portage).".into())
        }
        _ => Err(format!("Fonction inconnue : {}", name)),
    }
}

// ---------- glisser-déposer de raccourcis ----------

fn rd_u16(b: &[u8], o: usize) -> Option<usize> {
    b.get(o..o + 2).map(|x| u16::from_le_bytes([x[0], x[1]]) as usize)
}
fn rd_u32(b: &[u8], o: usize) -> Option<usize> {
    b.get(o..o + 4).map(|x| u32::from_le_bytes([x[0], x[1], x[2], x[3]]) as usize)
}

// Lit la cible d'un raccourci Windows (.lnk) sans bibliothèque externe
fn lnk_target(path: &Path) -> Option<String> {
    let b = fs::read(path).ok()?;
    if b.len() < 0x4c || rd_u32(&b, 0)? != 0x4c {
        return None;
    }
    let flags = rd_u32(&b, 0x14)?;
    let mut off = 0x4c;
    if flags & 1 != 0 {
        off += 2 + rd_u16(&b, off)?; // LinkTargetIDList
    }
    if flags & 2 == 0 {
        return None; // pas de LinkInfo (raccourci vers une appli du Store, par ex.)
    }
    let li = off;
    let hdr = rd_u32(&b, li + 4)?;
    let lflags = rd_u32(&b, li + 8)?;
    if lflags & 1 == 0 {
        return None;
    }
    let cstr = |start: usize| -> Vec<u8> { b[start.min(b.len())..].iter().take_while(|c| **c != 0).cloned().collect() };
    let ustr = |start: usize| -> String {
        let mut v: Vec<u16> = vec![];
        let mut i = start;
        while i + 1 < b.len() {
            let u = u16::from_le_bytes([b[i], b[i + 1]]);
            if u == 0 {
                break;
            }
            v.push(u);
            i += 2;
        }
        String::from_utf16_lossy(&v)
    };
    let (base, suffix) = if hdr >= 0x24 {
        let bo = rd_u32(&b, li + 28)?;
        let so = rd_u32(&b, li + 32).unwrap_or(0);
        (ustr(li + bo), if so > 0 { ustr(li + so) } else { String::new() })
    } else {
        let bo = rd_u32(&b, li + 16)?;
        let so = rd_u32(&b, li + 24).unwrap_or(0);
        (
            String::from_utf8_lossy(&cstr(li + bo)).to_string(),
            if so > 0 { String::from_utf8_lossy(&cstr(li + so)).to_string() } else { String::new() },
        )
    };
    let full = format!("{}{}", base, suffix);
    if full.trim().is_empty() {
        None
    } else {
        Some(full)
    }
}

fn url_file_target(path: &Path) -> Option<String> {
    let t = fs::read(path).ok()?;
    let text = String::from_utf8_lossy(&t);
    for line in text.lines() {
        let l = line.trim().trim_start_matches('\u{feff}');
        if l.len() > 4 && l[..4].eq_ignore_ascii_case("url=") {
            return Some(l[4..].trim().to_string());
        }
    }
    None
}

// Transforme les fichiers déposés en jeux ; renvoie (ajoutés, ignorés)
fn add_dropped(dir: &Path, db: &mut Db, paths: &[PathBuf]) -> (i64, usize) {
    let mut items: Vec<Value> = vec![];
    let mut skipped = 0;
    for p in paths {
        let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
        let stem = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        let target = match ext.as_str() {
            "lnk" => Some(lnk_target(p).unwrap_or_else(|| p.to_string_lossy().to_string())),
            "url" => Some(url_file_target(p).unwrap_or_else(|| p.to_string_lossy().to_string())),
            "exe" | "bat" | "cmd" => Some(p.to_string_lossy().to_string()),
            _ => None,
        };
        match target {
            Some(t) => {
                let name = if ext == "exe" || ext == "bat" || ext == "cmd" { name_from_path(&t) } else { name_from_path(&stem) };
                items.push(json!({ "target": t, "name": name, "category": "", "cover": null }));
            }
            None => skipped += 1,
        }
    }
    let added = if items.is_empty() {
        0
    } else {
        handle(dir, db, "add", &json!({ "items": items })).ok().and_then(|v| v.get("added").and_then(|a| a.as_i64())).unwrap_or(0)
    };
    (added, skipped)
}

// ---------- boîtes de dialogue et scan ----------

fn dialog_call(name: &str, body: &Value) -> Option<Result<Value, String>> {
    match name {
        "pickGame" => {
            let files = rfd::FileDialog::new()
                .set_title("Choisir un jeu")
                .add_filter("Jeux et raccourcis", &["exe", "lnk", "bat", "cmd", "url"])
                .add_filter("Tous les fichiers", &["*"])
                .pick_files()
                .unwrap_or_default();
            let paths: Vec<String> = files.iter().map(|p| p.to_string_lossy().to_string()).collect();
            Some(Ok(json!({ "paths": paths })))
        }
        "pickCover" => {
            let f = rfd::FileDialog::new()
                .set_title("Choisir une image")
                .add_filter("Images", &["png", "jpg", "jpeg", "webp", "gif", "bmp"])
                .pick_file();
            match f {
                Some(p) => {
                    use base64::Engine;
                    let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
                    let ext = if ext == "jpg" { "jpeg".to_string() } else { ext };
                    let data = fs::read(&p).map(|b| format!("data:image/{};base64,{}", ext, base64::engine::general_purpose::STANDARD.encode(b))).ok();
                    Some(Ok(json!({ "path": p.to_string_lossy(), "data": data })))
                }
                None => Some(Ok(json!({ "path": null, "data": null }))),
            }
        }
        "pickFolder" => {
            let f = rfd::FileDialog::new().set_title("Choisir un dossier de jeux").pick_folder();
            Some(Ok(json!({ "path": f.map(|p| p.to_string_lossy().to_string()) })))
        }
        "scan" => {
            let folder = gs(body, "folder");
            let root = PathBuf::from(&folder);
            let mut found: Vec<(String, String)> = vec![];
            if !folder.is_empty() && root.is_dir() {
                walk_dir(&root, 0, &root, &mut found);
            }
            Some(Ok(json!({ "items": found.into_iter().map(|(t, n)| json!({ "target": t, "name": n })).collect::<Vec<_>>() })))
        }
        _ => None,
    }
}

fn skip_exe(name: &str) -> bool {
    let n = name.to_lowercase();
    ["unins", "uninst", "setup", "install", "redist", "vc_redist", "vcredist", "dxsetup", "crashreport", "crashhandler", "crashpad", "helper", "updater", "update"]
        .iter()
        .any(|k| n.contains(k))
}

fn walk_dir(dir: &Path, depth: u32, root: &Path, out: &mut Vec<(String, String)>) {
    let rd = match fs::read_dir(dir) {
        Ok(r) => r,
        Err(_) => return,
    };
    let mut exes: Vec<(u64, PathBuf)> = vec![];
    let mut subs: Vec<PathBuf> = vec![];
    for e in rd.flatten() {
        let p = e.path();
        let fname = e.file_name().to_string_lossy().to_string();
        if p.is_dir() {
            if !fname.starts_with('.') {
                subs.push(p);
            }
        } else if p.extension().map(|x| x.to_string_lossy().to_lowercase() == "exe").unwrap_or(false) && !skip_exe(&fname) {
            exes.push((e.metadata().map(|m| m.len()).unwrap_or(0), p));
        }
    }
    exes.sort_by(|a, b| b.0.cmp(&a.0));
    if let Some((_, best)) = exes.first() {
        let t = best.to_string_lossy().to_string();
        let name = if dir == root {
            name_from_path(&t)
        } else {
            dir.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| name_from_path(&t))
        };
        out.push((t, name));
    }
    if depth < 2 {
        for s in subs {
            walk_dir(&s, depth + 1, root, out);
        }
    }
}

#[tauri::command]
async fn api(name: String, body: Value, state: tauri::State<'_, App>) -> Result<Value, String> {
    if let Some(r) = dialog_call(&name, &body) {
        // pour le scan, on retire les jeux déjà présents
        if name == "scan" {
            if let (Ok(v), Ok(db)) = (&r, state.db.lock()) {
                let known: Vec<String> = db.games.iter().map(|g| g.get("target").and_then(|x| x.as_str()).unwrap_or("").to_lowercase()).collect();
                let items: Vec<Value> = v["items"].as_array().cloned().unwrap_or_default().into_iter().filter(|i| !known.contains(&gs(i, "target").to_lowercase())).collect();
                return Ok(json!({ "items": items }));
            }
        }
        return r;
    }
    let mut db = state.db.lock().map_err(|_| "Verrou de la bibliothèque indisponible.".to_string())?;
    handle(&state.dir, &mut db, &name, &body)
}

fn main() {
    let dir = data_dir();
    let _ = fs::create_dir_all(&dir);
    let db = load(&dir);
    tauri::Builder::default()
        .manage(App { db: Mutex::new(db), dir })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::DragDrop(d) = event {
                let app = window.app_handle();
                match d {
                    tauri::DragDropEvent::Enter { .. } => {
                        let _ = app.emit("arcade-drag", json!({ "over": true }));
                    }
                    tauri::DragDropEvent::Leave => {
                        let _ = app.emit("arcade-drag", json!({ "over": false }));
                    }
                    tauri::DragDropEvent::Drop { paths, .. } => {
                        let _ = app.emit("arcade-drag", json!({ "over": false }));
                        let st = app.state::<App>();
                        let res = match st.db.lock() {
                            Ok(mut db) => Some(add_dropped(&st.dir, &mut db, paths)),
                            Err(_) => None,
                        };
                        if let Some((added, skipped)) = res {
                            let _ = app.emit("arcade-dropped", json!({ "added": added, "skipped": skipped }));
                        }
                    }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![api])
        .run(tauri::generate_context!())
        .expect("Erreur au lancement d'Arcade");
}
