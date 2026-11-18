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

pub(crate) const VERSION: &str = "2.11.2";
pub(crate) const PALETTE: [&str; 8] = ["#9c7cf0", "#5ec2ff", "#58d68d", "#ffd166", "#ff8f5e", "#ff6b9a", "#3fd0c9", "#e0a3ff"];
pub(crate) const SCHEMES: [&str; 11] = [
    "steam", "com.epicgames.launcher", "goggalaxy", "uplay", "origin2", "origin", "battlenet", "xbox",
    "ms-windows-store", "http", "https",
];
pub(crate) const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub(crate) type Obj = Map<String, Value>;

pub(crate) struct Db {
    pub(crate) games: Vec<Obj>,
    pub(crate) categories: Vec<Value>,
    pub(crate) settings: Obj,
    pub(crate) daily: Obj,
}

// Un jeu lancé depuis Arcade et suivi pour compter le temps de jeu en direct
pub(crate) struct Run {
    pub(crate) child: Option<std::process::Child>,
    pub(crate) watch: Option<PathBuf>,
    pub(crate) start: i64,
    pub(crate) last: i64,
    pub(crate) seen: bool,
    pub(crate) last_seen: i64,
    pub(crate) next_check: i64,
    pub(crate) next_remind: i64,
}

pub(crate) struct App {
    pub(crate) db: Mutex<Db>,
    pub(crate) dir: PathBuf,
    pub(crate) running: Mutex<std::collections::HashMap<String, Run>>,
}

pub(crate) static NOTICES: Mutex<Vec<Value>> = Mutex::new(Vec::new());
pub(crate) static LAST_SAVE: std::sync::atomic::AtomicI64 = std::sync::atomic::AtomicI64::new(0);


#[cfg(windows)]
mod inst;
mod covers;
mod dialogs;
mod dragdrop;
mod handlers;
mod icon;
mod launch;
mod perf;
mod session;
mod settings;
mod store;
mod tray;
mod update;
mod util;

pub(crate) use covers::*;
pub(crate) use dialogs::*;
pub(crate) use dragdrop::*;
pub(crate) use handlers::*;
pub(crate) use icon::*;
pub(crate) use launch::*;
pub(crate) use perf::*;
pub(crate) use session::*;
pub(crate) use settings::*;
pub(crate) use store::*;
pub(crate) use tray::*;
pub(crate) use update::*;
pub(crate) use util::*;

pub(crate) static CHOSEN: Mutex<String> = Mutex::new(String::new());


// ---------- commandes appelées par l'interface ----------

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
                let auto = installed && std::env::args().any(|a| a == "--update");
                Ok(json!({ "mode": if installed { "update" } else { "install" }, "version": VERSION, "dir": dir, "oldVersion": old, "auto": auto }))
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

#[tauri::command]
async fn api(name: String, body: Value, state: tauri::State<'_, App>, app: tauri::AppHandle) -> Result<Value, String> {
    if name == "logError" {
        log(&state.dir, &format!("Erreur interface : {}", limit(&gs(&body, "msg"), 300)));
        return Ok(json!({ "ok": true }));
    }
    let dir = state.dir.clone();
    let label = name.clone();
    let res = api_inner(name, body, state, app).await;
    if let Err(e) = &res {
        log(&dir, &format!("Erreur « {} » : {}", label, e));
    }
    res
}

async fn api_inner(name: String, body: Value, state: tauri::State<'_, App>, app: tauri::AppHandle) -> Result<Value, String> {
    if name == "perf" {
        let running = state.running.lock().map(|r| !r.is_empty()).unwrap_or(false);
        return tauri::async_runtime::spawn_blocking(move || Ok(perf_snapshot(running))).await.map_err(|e| e.to_string())?;
    }
    if name == "checkUpdate" {
        return check_update_cmd().await;
    }
    if name == "installUpdate" {
        return install_update_cmd(&app, &state.dir).await;
    }
    if name == "uninstall" {
        #[cfg(windows)]
        {
            if !inst::running_installed() {
                return Err("Arcade n'est pas installé : rien à désinstaller.".into());
            }
            let wipe = gb(&body, "wipe");
            if let Ok(db) = state.db.lock() {
                save(&state.dir, &db);
            }
            if let Some(dir) = inst::installed_dir() {
                log(&state.dir, &format!("Désinstallation (supprimer la bibliothèque : {})", wipe));
                inst::uninstall_core(&dir, wipe);
            }
            let h = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(400));
                h.exit(0);
            });
            return Ok(json!({ "ok": true }));
        }
        #[cfg(not(windows))]
        return Err("Disponible uniquement sous Windows.".into());
    }
    if name == "setIcon" {
        return set_icon_cmd(&app, &body);
    }
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
        if OPEN_MS.load(Ordering::Relaxed) == 0 {
            OPEN_MS.store(START.get().map(|s| s.elapsed().as_millis() as u64).unwrap_or(0).max(1), Ordering::Relaxed);
        }
        if let (Ok(v), Ok(runs)) = (&mut res, state.running.lock()) {
            let ids: Vec<Value> = runs.iter().filter(|(_, r)| r.watch.is_none() || r.seen).map(|(k, _)| json!(k)).collect();
            v["running"] = Value::Array(ids);
        }
        #[cfg(windows)]
        if let Ok(v) = &mut res {
            v["installed"] = json!(inst::running_installed());
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
    let _ = START.set(std::time::Instant::now());
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
    // l'installeur n'a besoin ni du dossier de données ni de la bibliothèque : ouverture plus rapide
    let db = if installer {
        Db { games: vec![], categories: vec![], settings: default_settings(), daily: Obj::new() }
    } else {
        let _ = fs::create_dir_all(&dir);
        load(&dir)
    };
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
                    .background_color(tauri::window::Color(18, 18, 24, 255))
                    .center()
                    .build()?;
            } else {
                spawn_icon_jobs(app.handle().clone());
                let h = app.handle().clone();
                std::thread::spawn(move || {
                    let mut sys = sysinfo::System::new();
                    loop {
                        std::thread::sleep(std::time::Duration::from_millis(1000));
                        tick(&h, &mut sys);
                    }
                });
                let win = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
                    .title("Arcade")
                    .inner_size(1280.0, 820.0)
                    .min_inner_size(900.0, 600.0)
                    .background_color(tauri::window::Color(18, 18, 24, 255))
                    .center()
                    .visible(!start_hidden);
                // La musique d'ambiance démarre toute seule (sans attendre un clic)
                #[cfg(windows)]
                let win = win.additional_browser_args("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required");
                win.build()?;
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
