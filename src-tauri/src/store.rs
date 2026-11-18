// Arcade — chargement / sauvegarde de la bibliothèque
use super::*;

pub(crate) fn norm_game(v: &Value) -> Obj {
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

pub(crate) fn load(dir: &Path) -> Db {
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

pub(crate) fn save(dir: &Path, db: &Db) {
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
pub(crate) fn sync_categories(db: &mut Db) {
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

pub(crate) fn public_game(dir: &Path, g: &Obj) -> Value {
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

pub(crate) fn find_game(db: &Db, id: &str) -> Option<usize> {
    db.games.iter().position(|g| g.get("id").and_then(|x| x.as_str()) == Some(id))
}
