// Arcade — lancement et temps de jeu en direct
use super::*;

pub(crate) async fn launch_cmd(state: &tauri::State<'_, App>, app: &tauri::AppHandle, body: &Value) -> Result<Value, String> {
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
                // Arcade se cache du bureau pendant que tu joues (il reste dans la zone de notification) : l'interface ne consomme plus rien
                let h = app.clone();
                let _ = app.run_on_main_thread(move || {
                    let hidden = match build_tray(&h) {
                        Ok(_) => h.get_webview_window("main").map(|w| w.hide().is_ok()).unwrap_or(false),
                        Err(_) => false,
                    };
                    if !hidden {
                        if let Some(w) = h.get_webview_window("main") {
                            let _ = w.minimize();
                        }
                    }
                });
            }
            Ok(json!({ "ok": true }))
        }
        Err(e) => Ok(json!({ "ok": false, "error": e })),
    }
}

pub(crate) fn path_under(exe: &Path, prefix_lower: &str) -> bool {
    exe.to_string_lossy().to_lowercase().starts_with(prefix_lower)
}

// Appelée toutes les 2 secondes : ne fait rien tant qu'aucun jeu n'est suivi
pub(crate) fn tick(app: &tauri::AppHandle, sys: &mut sysinfo::System) {
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
            r.next_check = now + 1500;
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
                alive = now - r.last_seen < 5_000;
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
            // l'icône de la zone de notification n'était là que pour la durée de la partie (sauf si tu l'as activée dans les réglages)
            if !tray_mode(app) {
                sync_tray(app, false);
            }
        }
    }
}
