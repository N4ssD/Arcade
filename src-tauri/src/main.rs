// Arcade : application Windows autonome (Rust + Tauri). L'interface est dans ../ui.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::{json, Map, Value};
use std::fs;
use std::io::Read;
use std::sync::atomic::AtomicBool;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const VERSION: &str = "2.0.0";
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

// Un jeu lancé depuis Arcade et suivi pour compter le temps de jeu en direct
struct Run {
    child: Option<std::process::Child>,
    watch: Option<PathBuf>,
    start: i64,
    last: i64,
    seen: bool,
    last_seen: i64,
    next_check: i64,
    next_remind: i64,
}

struct App {
    db: Mutex<Db>,
    dir: PathBuf,
    running: Mutex<std::collections::HashMap<String, Run>>,
}

static NOTICES: Mutex<Vec<Value>> = Mutex::new(Vec::new());
static LAST_SAVE: std::sync::atomic::AtomicI64 = std::sync::atomic::AtomicI64::new(0);

// ---------- utilitaires ----------

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

static CHANGED: AtomicBool = AtomicBool::new(false);
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

fn log(dir: &Path, msg: &str) {
    use std::io::Write;
    let _ = fs::create_dir_all(dir);
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(dir.join("arcade.log")) {
        let _ = writeln!(f, "[{}] {}", now_ms() / 1000, msg);
    }
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

fn appdata_dir() -> PathBuf {
    match std::env::var_os("APPDATA") {
        Some(a) => PathBuf::from(a).join("Arcade"),
        None => PathBuf::from("Arcade-data"),
    }
}

// Installé : les données sont dans le dossier d'installation (sous-dossier « data »), bien visibles.
// Sinon (mode portable, ancienne version) : %APPDATA%\Arcade.
fn data_dir() -> PathBuf {
    use std::sync::OnceLock;
    static D: OnceLock<PathBuf> = OnceLock::new();
    D.get_or_init(|| {
        #[cfg(windows)]
        {
            if inst::running_installed() {
                if let Some(p) = std::env::current_exe().ok().and_then(|e| e.parent().map(|p| p.to_path_buf())) {
                    return p.join("data");
                }
            }
        }
        appdata_dir()
    })
    .clone()
}

fn copy_dir(src: &Path, dst: &Path) {
    let _ = fs::create_dir_all(dst);
    if let Ok(rd) = fs::read_dir(src) {
        for e in rd.flatten() {
            let (s, d) = (e.path(), dst.join(e.file_name()));
            if s.is_dir() {
                copy_dir(&s, &d);
            } else if !d.exists() {
                let _ = fs::copy(&s, &d);
            }
        }
    }
}

// ---------- réglages ----------

fn default_settings() -> Obj {
    let v = json!({
        "cardSize": 200, "volume": 60, "sounds": true, "hoverSounds": true, "clickSounds": true,
        "autoCovers": true, "sidebarCollapsed": false, "introAnim": true, "trayMode": false,
        "breakReminder": 0, "theme": "dark", "accent": "#9C7CF0", "accentV": 2, "logo": "",
        "bgfx": true, "animations": true, "effects": true, "achievements": {}, "ambient": true,
        "slideshow": false, "minimizeOnLaunch": true
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
        | "sidebarCollapsed" | "introAnim" | "trayMode" | "minimizeOnLaunch" => {
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

fn public_game(dir: &Path, g: &Obj) -> Value {
    let mut o = g.clone();
    let target = g.get("target").and_then(|x| x.as_str()).unwrap_or("");
    let exists = if is_uri(target) { true } else { Path::new(target).exists() };
    let media = |field: &str, sub: &str, kind: &str| -> Value {
        let p = g.get(field).and_then(|x| x.as_str()).unwrap_or("");
        let f = file_name_of(p);
        if f.is_empty() || f.contains("..") {
            return Value::Null;
        }
        match media_token(&dir.join(sub).join(&f), kind, &f) {
            Some(u) => json!(u),
            None => Value::Null,
        }
    };
    o.insert("iconUrl".into(), media("icon", "icons", "icon"));
    o.insert("coverUrl".into(), media("cover", "covers", "cover"));
    o.insert("exists".into(), json!(exists));
    Value::Object(o)
}

// ---------- lancement ----------

struct Launched {
    child: Option<std::process::Child>,
    watch: Option<PathBuf>,
}

fn steam_root() -> Option<PathBuf> {
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

fn steam_libraries() -> Vec<PathBuf> {
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
fn quoted_after(line: &str, n: usize) -> Option<String> {
    line.split('"').skip(1).step_by(2).nth(n).map(|s| s.to_string())
}

fn vdf_value(txt: &str, key: &str) -> Option<String> {
    for line in txt.lines() {
        let l = line.trim();
        if quoted_after(l, 0).map(|k| k.eq_ignore_ascii_case(key)).unwrap_or(false) {
            return quoted_after(l, 1);
        }
    }
    None
}

fn epic_manifests() -> Vec<Value> {
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
fn watch_dir_for(target: &str) -> Option<PathBuf> {
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
fn reg_values(key: &str, recursive: bool) -> Vec<(String, String, String)> {
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
fn reg_values(_key: &str, _recursive: bool) -> Vec<(String, String, String)> {
    vec![]
}

fn detect_launchers(known_targets: &[String]) -> Value {
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
fn launch_target(g: &Obj) -> Result<Launched, String> {
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
        let ps = format!("Start-Process -FilePath '{}' -Verb RunAs", t.replace('\'', "''"));
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
    start_cmd(&t, Some(&dir))?;
    let watch = match ext.as_str() {
        "lnk" => lnk_target(p).and_then(|x| Path::new(&x).parent().map(|d| d.to_path_buf())).filter(|d| d.is_dir()),
        "url" => url_file_target(p).and_then(|u| watch_dir_for(&u)),
        _ => Some(dir),
    };
    Ok(Launched { child: None, watch })
}

#[cfg(not(windows))]
fn launch_target(_g: &Obj) -> Result<Launched, String> {
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


// ---------- couvertures et icônes ----------

fn url_enc(s: &str) -> String {
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

fn file_name_of(p: &str) -> String {
    p.rsplit(|c| c == '\\' || c == '/').next().unwrap_or("").to_string()
}

fn remove_media(dir: &Path, sub: &str, p: &str) {
    if p.is_empty() {
        return;
    }
    let f = file_name_of(p);
    if f.is_empty() || f.contains("..") {
        return;
    }
    let _ = fs::remove_file(dir.join(sub).join(f));
}

fn import_cover(dir: &Path, src: &str) -> Option<String> {
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

fn get_norm(s: &str) -> String {
    let t: String = s.to_lowercase().chars().filter(|c| !matches!(c, '\u{2122}' | '\u{ae}' | '\u{a9}')).collect();
    let t: String = t.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { ' ' }).collect();
    t.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn name_match(a: &str, b: &str) -> bool {
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

fn http_get(url: &str, secs: u64) -> Result<Vec<u8>, String> {
    let r = ureq::get(url).timeout(std::time::Duration::from_secs(secs)).call().map_err(|e| e.to_string())?;
    let mut buf = Vec::new();
    r.into_reader().take(8_000_000).read_to_end(&mut buf).map_err(|e| e.to_string())?;
    Ok(buf)
}

fn find_steam_appid(name: &str) -> Result<u64, String> {
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

fn steam_appid_of(uri: &str) -> u64 {
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
fn find_cover(name: &str, target: &str, query: &str, cdir: &Path) -> Result<Option<String>, String> {
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
fn extract_icons(dir: &Path, targets: &[String]) -> Vec<Option<String>> {
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
fn extract_icons(_dir: &Path, targets: &[String]) -> Vec<Option<String>> {
    vec![None; targets.len()]
}

fn extract_icon(dir: &Path, target: &str) -> Option<String> {
    if is_uri(target) || !Path::new(target).is_file() {
        return None;
    }
    extract_icons(dir, &[target.to_string()]).into_iter().next().flatten()
}

static ICON_BUSY: AtomicBool = AtomicBool::new(false);

// Extrait en arrière-plan les icônes des jeux qui n'en ont pas encore (un seul traitement à la fois, en lot)
fn spawn_icon_jobs(app: tauri::AppHandle) {
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
fn media_token(path: &Path, kind: &str, file: &str) -> Option<String> {
    let meta = fs::metadata(path).ok()?;
    if !meta.is_file() {
        return None;
    }
    let stamp = meta.len() ^ meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0).rotate_left(32);
    Some(format!("arc:{}/{}?{}", kind, url_enc(file), stamp))
}

#[tauri::command]
fn image(kind: String, name: String, state: tauri::State<'_, App>) -> Result<tauri::ipc::Response, String> {
    let sub = match kind.as_str() {
        "cover" => "covers",
        "icon" => "icons",
        _ => return Err("Image inconnue.".into()),
    };
    if name.is_empty() || name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err("Image inconnue.".into());
    }
    fs::read(state.dir.join(sub).join(&name)).map(tauri::ipc::Response::new).map_err(|e| e.to_string())
}

fn handle(dir: &Path, db: &mut Db, name: &str, body: &Value) -> Result<Value, String> {
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

// ---------- installation / désinstallation (Windows) ----------

#[cfg(windows)]
mod inst {
    use super::*;
    use std::process::Command;

    use winreg::{enums::HKEY_CURRENT_USER, RegKey};

    const REG: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Arcade";

    pub fn reg_read(name: &str) -> String {
        RegKey::predef(HKEY_CURRENT_USER).open_subkey(REG).ok().and_then(|k| k.get_value::<String, _>(name).ok()).unwrap_or_default()
    }

    fn reg_write(dir: &Path, exe: &Path) {
        if let Ok((k, _)) = RegKey::predef(HKEY_CURRENT_USER).create_subkey(REG) {
            let sv = |n: &str, v: &str| {
                let _ = k.set_value(n, &v.to_string());
            };
            sv("DisplayName", "Arcade");
            sv("DisplayVersion", VERSION);
            sv("Publisher", "N4ssD");
            sv("InstallLocation", &dir.to_string_lossy());
            sv("DisplayIcon", &exe.to_string_lossy());
            sv("UninstallString", &format!("\"{}\" --uninstall", exe.to_string_lossy()));
            let _ = k.set_value("NoModify", &1u32);
            let _ = k.set_value("NoRepair", &1u32);
        }
    }

    fn reg_delete() {
        let _ = RegKey::predef(HKEY_CURRENT_USER).delete_subkey_all(REG);
    }

    pub fn installed_dir() -> Option<PathBuf> {
        let d = reg_read("InstallLocation");
        if d.is_empty() {
            None
        } else {
            Some(PathBuf::from(d))
        }
    }

    pub fn running_installed() -> bool {
        static C: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
        *C.get_or_init(running_installed_uncached)
    }

    fn running_installed_uncached() -> bool {
        let me = match std::env::current_exe() {
            Ok(p) => p,
            Err(_) => return false,
        };
        // seul « Arcade.exe » est l'application ; « ArcadeSetup.exe » (le téléchargement) est toujours l'installeur
        let is_app = me.file_name().map(|n| n.to_string_lossy().eq_ignore_ascii_case("Arcade.exe")).unwrap_or(false);
        let my_dir = me.parent().map(|p| p.to_string_lossy().to_lowercase()).unwrap_or_default();
        match installed_dir() {
            Some(d) => is_app && d.to_string_lossy().trim_end_matches('\\').to_lowercase() == my_dir.trim_end_matches('\\') && d.join("Arcade.exe").exists(),
            None => false,
        }
    }

    pub fn needs_install() -> bool {
        let args: Vec<String> = std::env::args().collect();
        if args.iter().any(|a| a == "--portable") || std::env::var_os("ARCADE_PORTABLE").is_some() {
            return false;
        }
        !running_installed()
    }

    pub fn default_dir() -> PathBuf {
        if let Some(d) = installed_dir() {
            return d;
        }
        let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
        base.join("Programs").join("Arcade")
    }

    pub fn valid_dir(dir: &Path) -> Result<(), String> {
        let s = dir.to_string_lossy().to_string();
        if !dir.is_absolute() || s.len() < 6 {
            return Err("Dossier d'installation invalide.".into());
        }
        if dir.parent().is_none() || dir.parent().map(|p| p.as_os_str().is_empty()).unwrap_or(true) {
            return Err("Choisis un dossier, pas la racine d'un disque.".into());
        }
        if let Ok(sr) = std::env::var("SystemRoot") {
            if s.to_lowercase().starts_with(&sr.to_lowercase()) {
                return Err("Choisis un dossier en dehors de Windows.".into());
            }
        }
        Ok(())
    }

    // Si le dossier choisi contient déjà autre chose, Arcade s'installe dans un sous-dossier « Arcade »
    pub fn tidy_dir(p: &Path) -> PathBuf {
        if p.join("Arcade.exe").exists() {
            return p.to_path_buf();
        }
        if let Ok(mut rd) = fs::read_dir(p) {
            if rd.next().is_some() {
                return p.join("Arcade");
            }
        }
        p.to_path_buf()
    }

    // Arrête les Arcade.exe en cours (sauf nous-mêmes) pour pouvoir remplacer le fichier
    fn kill_others(exe: &Path) {
        let name = exe.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "Arcade.exe".into());
        let _ = Command::new("taskkill")
            .args(["/F", "/IM", &name, "/FI", &format!("PID ne {}", std::process::id())])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }

    fn make_lnk(path: &Path, exe: &Path, dir: &Path, args: Option<&str>) {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(mut sl) = mslnk::ShellLink::new(exe) {
            sl.set_working_dir(Some(dir.to_string_lossy().to_string()));
            sl.set_icon_location(Some(exe.to_string_lossy().to_string()));
            sl.set_name(Some("Arcade - lanceur de jeux".to_string()));
            if let Some(a) = args {
                sl.set_arguments(Some(a.to_string()));
            }
            let _ = sl.create_lnk(path);
        }
    }

    fn programs_dir() -> PathBuf {
        dirs::data_dir().unwrap_or_default().join(r"Microsoft\Windows\Start Menu\Programs")
    }

    fn make_shortcuts(dir: &Path, desktop: bool, start: bool) {
        let exe = dir.join("Arcade.exe");
        if desktop {
            if let Some(d) = dirs::desktop_dir() {
                make_lnk(&d.join("Arcade.lnk"), &exe, dir, None);
            }
        }
        if start {
            make_lnk(&programs_dir().join("Arcade.lnk"), &exe, dir, None);
        }
    }

    fn remove_shortcuts() {
        if let Some(d) = dirs::desktop_dir() {
            let _ = fs::remove_file(d.join("Arcade.lnk"));
        }
        let _ = fs::remove_file(programs_dir().join("Arcade.lnk"));
    }

    pub fn install(dir: &Path, desktop: bool, start: bool) -> Result<(), String> {
        valid_dir(dir)?;
        let target = dir.join("Arcade.exe");
        kill_others(&target);
        fs::create_dir_all(dir).map_err(|e| format!("Impossible de créer le dossier : {}", e))?;
        let me = std::env::current_exe().map_err(|e| e.to_string())?;
        // le fichier cible peut mettre un instant à se libérer après l'arrêt d'Arcade
        let mut last = String::new();
        for _ in 0..10 {
            match fs::copy(&me, &target) {
                Ok(_) => {
                    last.clear();
                    break;
                }
                Err(e) => {
                    last = e.to_string();
                    std::thread::sleep(std::time::Duration::from_millis(400));
                }
            }
        }
        if !last.is_empty() {
            return Err(format!("Copie de l'application impossible : {}", last));
        }
        // données : reprises de l'ancien dossier d'installation, sinon de l'ancienne version (%APPDATA%)
        let ndata = dir.join("data");
        if !ndata.join("library.json").exists() {
            match installed_dir() {
                Some(old) if old.join("data").join("library.json").exists() && old != dir => copy_dir(&old.join("data"), &ndata),
                _ => {
                    if appdata_dir().join("library.json").exists() {
                        copy_dir(&appdata_dir(), &ndata);
                    }
                }
            }
        }
        let _ = fs::create_dir_all(&ndata);
        let _ = fs::write(
            dir.join("LISEZMOI.txt"),
            "Arcade - dossier d'installation\r\n\r\nArcade.exe : l'application\r\ndata\\library.json : ta bibliotheque et tes reglages\r\ndata\\covers : les pochettes\r\ndata\\icons : les icones\r\ndata\\arcade.log : le journal (utile en cas de probleme)\r\n",
        );
        make_shortcuts(dir, desktop, start);
        reg_write(dir, &target);
        Ok(())
    }

    fn startup_lnk() -> PathBuf {
        programs_dir().join("Startup").join("Arcade.lnk")
    }

    pub fn startup_enabled() -> bool {
        startup_lnk().exists()
    }

    // Démarrage avec Windows : raccourci dans le dossier « Démarrage », lancé en arrière-plan
    pub fn set_startup(on: bool) {
        let lnk = startup_lnk();
        if on {
            if let Ok(exe) = std::env::current_exe() {
                let dir = exe.parent().map(|p| p.to_path_buf()).unwrap_or_default();
                make_lnk(&lnk, &exe, &dir, Some("--background"));
            }
        } else {
            let _ = fs::remove_file(&lnk);
        }
    }

    pub fn launch_installed() {
        if let Some(d) = installed_dir() {
            let exe = d.join("Arcade.exe");
            let _ = Command::new(&exe).current_dir(&d).spawn();
        }
    }

    pub fn uninstall() {
        use rfd::{MessageButtons, MessageDialog, MessageDialogResult, MessageLevel};
        let dir = match installed_dir() {
            Some(d) => d,
            None => {
                MessageDialog::new().set_title("Arcade").set_description("Arcade ne semble pas installé.").set_level(MessageLevel::Info).show();
                return;
            }
        };
        let yes = |t: &str, d: &str| {
            MessageDialog::new().set_title(t).set_description(d).set_buttons(MessageButtons::YesNo).set_level(MessageLevel::Warning).show() == MessageDialogResult::Yes
        };
        if !yes("Désinstaller Arcade", "Désinstaller Arcade ?") {
            return;
        }
        let wipe = yes(
            "Désinstaller Arcade",
            "Supprimer aussi ta bibliothèque (jeux, couvertures, réglages) ?\n\nChoisis « Non » pour la garder si tu réinstalles Arcade plus tard.",
        );
        kill_others(&dir.join("Arcade.exe"));
        remove_shortcuts();
        let _ = fs::remove_file(startup_lnk());
        reg_delete();
        if wipe {
            let _ = fs::remove_dir_all(appdata_dir());
        } else {
            // on garde la bibliothèque : elle sera reprise à la prochaine installation
            copy_dir(&dir.join("data"), &appdata_dir());
        }
        let _ = Command::new("cmd")
            .raw_arg(format!("/c ping -n 4 127.0.0.1 >nul & rmdir /s /q \"{}\"", dir.to_string_lossy()))
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
        MessageDialog::new().set_title("Arcade").set_description("Arcade a été désinstallé.").set_level(MessageLevel::Info).show();
    }
}

static CHOSEN: Mutex<String> = Mutex::new(String::new());

#[tauri::command]
async fn setup(name: String, body: Value, app: tauri::AppHandle) -> Result<Value, String> {
    #[cfg(windows)]
    {
        match name.as_str() {
            "info" => {
                let old = inst::reg_read("DisplayVersion");
                let installed = inst::installed_dir().is_some();
                let dir = {
                    let mut c = CHOSEN.lock().map_err(|_| "verrou".to_string())?;
                    if c.is_empty() {
                        *c = inst::default_dir().to_string_lossy().to_string();
                    }
                    c.clone()
                };
                Ok(json!({ "mode": if installed { "update" } else { "install" }, "version": VERSION, "dir": dir, "oldVersion": old }))
            }
            "browse" => {
                let start = CHOSEN.lock().map(|c| c.clone()).unwrap_or_default();
                let mut dlg = rfd::FileDialog::new().set_title("Choisis le dossier dans lequel installer Arcade");
                if !start.is_empty() {
                    dlg = dlg.set_directory(&start);
                }
                match dlg.pick_folder() {
                    Some(p) => {
                        let d = inst::tidy_dir(&p).to_string_lossy().to_string();
                        if let Ok(mut c) = CHOSEN.lock() {
                            *c = d.clone();
                        }
                        Ok(json!({ "dir": d }))
                    }
                    None => Ok(json!({ "dir": null })),
                }
            }
            "install" => {
                let dir = CHOSEN.lock().map(|c| c.clone()).unwrap_or_default();
                let (desktop, start) = (gb(&body, "desktop"), gb(&body, "start"));
                let r = inst::install(Path::new(&dir), desktop, start);
                log(&data_dir(), &format!("Installation dans {} : {:?}", dir, r));
                match r {
                    Ok(()) => Ok(json!({ "ok": true })),
                    Err(e) => Ok(json!({ "ok": false, "error": e })),
                }
            }
            "finish" => {
                if gb(&body, "launch") {
                    inst::launch_installed();
                }
                app.exit(0);
                Ok(json!({ "ok": true }))
            }
            _ => Ok(json!({ "ok": true })),
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (&name, &body, &app);
        Err("L'installation n'est disponible que sous Windows.".into())
    }
}

async fn fetch_cover_cmd(state: &tauri::State<'_, App>, body: &Value) -> Result<Value, String> {
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

async fn refresh_icon_cmd(state: &tauri::State<'_, App>, body: &Value) -> Result<Value, String> {
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

// ---------- lancement et temps de jeu en direct ----------

async fn launch_cmd(state: &tauri::State<'_, App>, app: &tauri::AppHandle, body: &Value) -> Result<Value, String> {
    let id = gs(body, "id");
    let mut db = state.db.lock().map_err(|_| "verrou".to_string())?;
    let idx = match find_game(&db, &id) {
        Some(i) => i,
        None => return Ok(json!({ "ok": false, "error": "Jeu introuvable." })),
    };
    {
        let mut runs = state.running.lock().map_err(|_| "verrou".to_string())?;
        if let Some(r) = runs.get_mut(&id) {
            let alive = match r.child.as_mut() {
                Some(c) => matches!(c.try_wait(), Ok(None)),
                None => r.seen || now_ms() - r.start < 240_000,
            };
            if alive {
                return Ok(json!({ "ok": false, "error": "Ce jeu est déjà en cours." }));
            }
            runs.remove(&id);
        }
    }
    match launch_target(&db.games[idx]) {
        Ok(l) => {
            let now = now_ms();
            let g = &mut db.games[idx];
            let n = g.get("launches").and_then(|x| x.as_i64()).unwrap_or(0) + 1;
            g.insert("lastPlayed".into(), json!(now));
            g.insert("launches".into(), json!(n));
            save(&state.dir, &db);
            let minimize = db.settings.get("minimizeOnLaunch").and_then(|x| x.as_bool()).unwrap_or(true);
            drop(db);
            if l.child.is_some() || l.watch.is_some() {
                if let Ok(mut runs) = state.running.lock() {
                    runs.insert(
                        id,
                        Run { child: l.child, seen: l.watch.is_none(), watch: l.watch, start: now, last: now, last_seen: now, next_check: now + 5000, next_remind: 0 },
                    );
                }
            }
            if minimize {
                // Arcade se réduit pendant que tu joues : l'interface ne consomme plus rien
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.minimize();
                }
            }
            Ok(json!({ "ok": true }))
        }
        Err(e) => Ok(json!({ "ok": false, "error": e })),
    }
}

fn path_under(exe: &Path, prefix_lower: &str) -> bool {
    exe.to_string_lossy().to_lowercase().starts_with(prefix_lower)
}

// Appelée toutes les 2 secondes : ne fait rien tant qu'aucun jeu n'est suivi
fn tick(app: &tauri::AppHandle, sys: &mut sysinfo::System) {
    let st = app.state::<App>();
    let mut db = match st.db.lock() {
        Ok(d) => d,
        Err(_) => return,
    };
    let mut runs = match st.running.lock() {
        Ok(r) => r,
        Err(_) => return,
    };
    if runs.is_empty() {
        return;
    }
    let now = now_ms();
    if runs.values().any(|r| r.watch.is_some()) {
        use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, UpdateKind};
        sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::new().with_exe(UpdateKind::OnlyIfNotSet));
    }
    let remind_h = db.settings.get("breakReminder").and_then(|x| x.as_i64()).unwrap_or(0);
    let mut ended: Vec<String> = vec![];
    let mut deltas: Vec<(String, i64)> = vec![];
    let mut notices: Vec<(String, i64)> = vec![];
    let mut changed = false;
    for (id, r) in runs.iter_mut() {
        let mut alive = true;
        let mut end_at = now;
        if let Some(dir) = r.watch.clone() {
            if now < r.next_check {
                continue;
            }
            r.next_check = now + 4000;
            let mut prefix = dir.to_string_lossy().to_lowercase();
            if !prefix.ends_with('\\') {
                prefix.push('\\');
            }
            let active = sys.processes().values().any(|p| p.exe().map(|e| path_under(e, &prefix)).unwrap_or(false));
            if active {
                if !r.seen {
                    r.seen = true;
                    r.start = now;
                    r.last = now;
                    changed = true;
                }
                r.last_seen = now;
            } else if !r.seen {
                alive = now - r.start < 240_000;
            } else {
                alive = now - r.last_seen < 12_000;
                end_at = r.last_seen;
            }
        } else if let Some(c) = r.child.as_mut() {
            alive = matches!(c.try_wait(), Ok(None));
        }
        // les lanceurs qui se relancent eux-mêmes quittent vite : on ignore moins de 15 s
        if r.seen && end_at - r.start >= 15_000 {
            let delta = (end_at - r.last) / 1000;
            if delta >= 1 {
                deltas.push((id.clone(), delta));
                r.last += delta * 1000;
            }
        }
        if alive && r.seen && remind_h > 0 {
            let step = remind_h * 3_600_000;
            if r.next_remind == 0 {
                r.next_remind = r.start + step;
            }
            if now >= r.next_remind {
                let hours = (((now - r.start) as f64) / 3_600_000.0).round().max(1.0) as i64;
                while r.next_remind <= now {
                    r.next_remind += step;
                }
                notices.push((id.clone(), hours));
            }
        }
        if !alive {
            ended.push(id.clone());
        }
    }
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let dirty = !deltas.is_empty();
    for (id, d) in deltas {
        if let Some(i) = find_game(&db, &id) {
            let p = gn(&Value::Object(db.games[i].clone()), "playtime") + d;
            db.games[i].insert("playtime".into(), json!(p));
        }
        let cur = db.daily.get(&today).and_then(|x| x.as_i64()).unwrap_or(0);
        db.daily.insert(today.clone(), json!(cur + d));
    }
    if db.daily.len() > 400 {
        let mut keys: Vec<String> = db.daily.keys().cloned().collect();
        keys.sort();
        for k in keys.iter().take(db.daily.len() - 400) {
            db.daily.remove(k);
        }
    }
    for (id, hours) in notices {
        if let Some(i) = find_game(&db, &id) {
            let name = gs(&Value::Object(db.games[i].clone()), "name");
            if let Ok(mut n) = NOTICES.lock() {
                n.push(json!({ "game": name, "hours": hours }));
            }
        }
    }
    for id in &ended {
        runs.remove(id);
        changed = true;
    }
    // Le dernier jeu suivi vient de se fermer : Arcade se rouvre (il s'était réduit au lancement)
    let reopen = !ended.is_empty() && runs.is_empty() && db.settings.get("minimizeOnLaunch").and_then(|x| x.as_bool()).unwrap_or(true);
    let last = LAST_SAVE.load(Ordering::Relaxed);
    if (dirty && now - last >= 10_000) || !ended.is_empty() {
        save(&st.dir, &db);
        LAST_SAVE.store(now, Ordering::Relaxed);
    }
    if changed {
        CHANGED.store(true, Ordering::Relaxed);
    }
    if reopen {
        drop(runs);
        drop(db);
        let hidden = app.get_webview_window("main").map(|w| w.is_minimized().unwrap_or(false) || !w.is_visible().unwrap_or(true)).unwrap_or(false);
        if hidden {
            show_main(app);
        }
    }
}

// ---------- zone de notification ----------

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

// Construit l'icône de la zone de notification (doit s'exécuter sur le thread principal)
fn build_tray(app: &tauri::AppHandle) -> Result<(), String> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
    if app.tray_by_id("arcade").is_some() {
        return Ok(());
    }
    let open = MenuItem::with_id(app, "open", "Ouvrir Arcade", true, None::<&str>).map_err(|e| e.to_string())?;
    let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>).map_err(|e| e.to_string())?;
    let menu = Menu::with_items(app, &[&open, &quit]).map_err(|e| e.to_string())?;
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png")).map_err(|e| e.to_string())?;
    TrayIconBuilder::with_id("arcade")
        .icon(icon)
        .tooltip("Arcade")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, ev| match ev.id().as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, ev| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                show_main(tray.app_handle());
            }
        })
        .build(app)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

// Active ou retire l'icône ; peut être appelé depuis n'importe quel thread
fn sync_tray(app: &tauri::AppHandle, enabled: bool) {
    let h = app.clone();
    let _ = app.run_on_main_thread(move || {
        if enabled {
            match build_tray(&h) {
                Ok(_) => log(&h.state::<App>().dir, "Zone de notification : icône créée"),
                Err(e) => log(&h.state::<App>().dir, &format!("Zone de notification : échec ({})", e)),
            }
        } else {
            let _ = h.remove_tray_by_id("arcade");
        }
    });
}

fn tray_mode(app: &tauri::AppHandle) -> bool {
    app.state::<App>().db.lock().map(|d| d.settings.get("trayMode").and_then(|x| x.as_bool()).unwrap_or(false)).unwrap_or(false)
}

#[tauri::command]
async fn api(name: String, body: Value, state: tauri::State<'_, App>, app: tauri::AppHandle) -> Result<Value, String> {
    if name == "fetchCover" {
        return fetch_cover_cmd(&state, &body).await;
    }
    if name == "refreshIcon" {
        return refresh_icon_cmd(&state, &body).await;
    }
    if name == "launch" {
        return launch_cmd(&state, &app, &body).await;
    }
    if name == "detectLaunchers" {
        let known: Vec<String> = {
            let db = state.db.lock().map_err(|_| "verrou".to_string())?;
            db.games.iter().map(|g| g.get("target").and_then(|x| x.as_str()).unwrap_or("").to_string()).collect()
        };
        return tauri::async_runtime::spawn_blocking(move || Ok(detect_launchers(&known))).await.map_err(|e| e.to_string())?;
    }
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
    let res = handle(&state.dir, &mut db, &name, &body);
    drop(db);
    let mut res = res;
    if name == "library" {
        if let (Ok(v), Ok(runs)) = (&mut res, state.running.lock()) {
            let ids: Vec<Value> = runs.iter().filter(|(_, r)| r.watch.is_none() || r.seen).map(|(k, _)| json!(k)).collect();
            v["running"] = Value::Array(ids);
        }
    }
    if name == "add" {
        spawn_icon_jobs(app.clone());
    }
    if name == "settings" && body.get("trayMode").is_some() {
        let on = tray_mode(&app);
        sync_tray(&app, on);
    }
    res
}

fn main() {
    #[cfg(windows)]
    if std::env::args().any(|a| a == "--uninstall") {
        inst::uninstall();
        return;
    }
    #[cfg(windows)]
    let installer = inst::needs_install();
    #[cfg(not(windows))]
    let installer = false;

    let dir = data_dir();
    let _ = fs::create_dir_all(&dir);
    let db = load(&dir);
    let db_tray = db.settings.get("trayMode").and_then(|x| x.as_bool()).unwrap_or(false);
    {
        let d = dir.clone();
        std::panic::set_hook(Box::new(move |info| log(&d, &format!("ERREUR (panic) : {}", info))));
    }
    if !installer {
        log(&dir, &format!("Démarrage d'Arcade {} ({} jeux)", VERSION, db.games.len()));
    }
    let background = std::env::args().any(|a| a == "--background");
    let start_hidden = background && !installer && db_tray;
    let builder = tauri::Builder::default();
    // une seule fenêtre Arcade à la fois (pas pour l'installeur)
    let builder = if installer { builder } else { builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app))) };
    builder
        .manage(App { db: Mutex::new(db), dir, running: Mutex::new(Default::default()) })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                if tray_mode(app) && app.tray_by_id("arcade").is_some() {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
            if let tauri::WindowEvent::DragDrop(d) = event {
                let app = window.app_handle();
                match d {
                    tauri::DragDropEvent::Enter { .. } => {
                        log(&app.state::<App>().dir, "Fichier au-dessus de la fenêtre");
                        let _ = app.emit("arcade-drag", json!({ "over": true }));
                    }
                    tauri::DragDropEvent::Leave => {
                        let _ = app.emit("arcade-drag", json!({ "over": false }));
                    }
                    tauri::DragDropEvent::Drop { paths, .. } => {
                        let _ = app.emit("arcade-drag", json!({ "over": false }));
                        let st = app.state::<App>();
                        log(&st.dir, &format!("Dépôt de {} fichier(s) : {:?}", paths.len(), paths));
                        let res = match st.db.lock() {
                            Ok(mut db) => Some(add_dropped(&st.dir, &mut db, paths)),
                            Err(_) => None,
                        };
                        if let Some((added, skipped)) = res {
                            log(&st.dir, &format!("Dépôt : {} ajouté(s), {} ignoré(s)", added, skipped));
                            let _ = app.emit("arcade-dropped", json!({ "added": added, "skipped": skipped }));
                            if added > 0 {
                                spawn_icon_jobs(app.clone());
                            }
                        }
                    }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![api, setup, image])
        .setup(move |app| {
            if installer {
                tauri::WebviewWindowBuilder::new(app, "setup", tauri::WebviewUrl::App("setup.html".into()))
                    .title("Installation d'Arcade")
                    .inner_size(720.0, 720.0)
                    .resizable(false)
                    .center()
                    .build()?;
            } else {
                spawn_icon_jobs(app.handle().clone());
                let h = app.handle().clone();
                std::thread::spawn(move || {
                    let mut sys = sysinfo::System::new();
                    loop {
                        std::thread::sleep(std::time::Duration::from_secs(2));
                        tick(&h, &mut sys);
                    }
                });
                tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
                    .title("Arcade")
                    .inner_size(1280.0, 820.0)
                    .min_inner_size(900.0, 600.0)
                    .center()
                    .visible(!start_hidden)
                    .build()?;
                if db_tray {
                    match build_tray(app.handle()) {
                        Ok(_) => log(&app.state::<App>().dir, "Zone de notification : icône créée"),
                        Err(e) => {
                            log(&app.state::<App>().dir, &format!("Zone de notification : échec ({})", e));
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                            }
                        }
                    }
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            log(&data_dir(), &format!("ERREUR au lancement : {}", e));
        });
}
