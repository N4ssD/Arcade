// Arcade — zone de notification
use super::*;

pub(crate) fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        // Windows refuse parfois de mettre au premier plan une fenêtre qui n'a pas le focus : on la fait passer devant un instant
        let _ = w.set_always_on_top(true);
        let _ = w.set_focus();
        let _ = w.set_always_on_top(false);
    }
}

// Construit l'icône de la zone de notification (doit s'exécuter sur le thread principal)
pub(crate) fn build_tray(app: &tauri::AppHandle) -> Result<(), String> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
    if app.tray_by_id("arcade").is_some() {
        return Ok(());
    }
    let open = MenuItem::with_id(app, "open", "Ouvrir Arcade", true, None::<&str>).map_err(|e| e.to_string())?;
    let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>).map_err(|e| e.to_string())?;
    let menu = Menu::with_items(app, &[&open, &quit]).map_err(|e| e.to_string())?;
    let icon = current_icon().ok_or("Icône introuvable.")?;
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
pub(crate) fn sync_tray(app: &tauri::AppHandle, enabled: bool) {
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

pub(crate) fn tray_mode(app: &tauri::AppHandle) -> bool {
    app.state::<App>().db.lock().map(|d| d.settings.get("trayMode").and_then(|x| x.as_bool()).unwrap_or(false)).unwrap_or(false)
}
