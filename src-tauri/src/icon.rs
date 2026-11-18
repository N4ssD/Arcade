// Arcade — icône de la fenêtre et de la zone de notification : l'interface dessine le logo à la couleur choisie et l'envoie ici
use super::*;
use base64::Engine;

pub(crate) static ICON_PNG: Mutex<Vec<u8>> = Mutex::new(Vec::new());

// Icône courante (couleur choisie) ou, à défaut, l'icône d'origine
pub(crate) fn current_icon() -> Option<tauri::image::Image<'static>> {
    let png = ICON_PNG.lock().map(|p| p.clone()).unwrap_or_default();
    let img = if png.is_empty() {
        tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png")).ok()?
    } else {
        tauri::image::Image::from_bytes(&png).ok()?
    };
    Some(tauri::image::Image::new_owned(img.rgba().to_vec(), img.width(), img.height()))
}

pub(crate) fn apply_icon(app: &tauri::AppHandle) {
    let h = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(img) = current_icon() {
            if let Some(w) = h.get_webview_window("main") {
                let _ = w.set_icon(img.clone());
            }
            if let Some(t) = h.tray_by_id("arcade") {
                let _ = t.set_icon(Some(img));
            }
        }
    });
}

// body.png : « data:image/png;base64,… » produit par l'interface (taille limitée)
pub(crate) fn set_icon_cmd(app: &tauri::AppHandle, body: &Value) -> Result<Value, String> {
    let data = gs(body, "png");
    let b64 = data.strip_prefix("data:image/png;base64,").ok_or("Icône invalide.")?;
    if b64.len() > 600_000 {
        return Err("Icône trop grande.".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64).map_err(|_| "Icône invalide.".to_string())?;
    tauri::image::Image::from_bytes(&bytes).map_err(|e| e.to_string())?;
    if let Ok(mut p) = ICON_PNG.lock() {
        *p = bytes;
    }
    apply_icon(app);
    Ok(json!({ "ok": true }))
}
