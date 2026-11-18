// Arcade — commandes de la bibliothèque (ajout, modification, suppression de jeux, catégories…)
use super::*;

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
