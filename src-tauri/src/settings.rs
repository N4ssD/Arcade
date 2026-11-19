// Arcade — réglages (liste blanche et nettoyage)
use super::*;

pub(crate) fn default_settings() -> Obj {
    let v = json!({
        "cardSize": 200, "volume": 30, "volumeV": 0, "music": true, "musicVol": 20, "cursor": true, "cursorSize": 1, "xmasMode": 1, "sounds": true, "hoverSounds": true, "clickSounds": true,
        "autoCovers": true, "sidebarCollapsed": false, "introAnim": true, "trayMode": false,
        "breakReminder": 0, "theme": "auto", "accent": "#9C7CF0", "accentV": 2, "logo": "",
        "bgfx": true, "animations": true, "effects": true, "achievements": {}, "ambient": true,
        "slideshow": false, "minimizeOnLaunch": true, "checkUpdates": true, "ecoMode": true, "perfChip": false,
        "avatarOn": true, "avatarPanel": true, "avatarAuto": true, "avatar": {}, "counters": {}, "achBase": {}
    });
    v.as_object().cloned().unwrap_or_default()
}

pub(crate) fn same_kind(a: &Value, b: &Value) -> bool {
    matches!(
        (a, b),
        (Value::Bool(_), Value::Bool(_)) | (Value::Number(_), Value::Number(_)) | (Value::String(_), Value::String(_)) | (Value::Object(_), Value::Object(_))
    )
}

pub(crate) fn apply_setting(settings: &mut Obj, k: &str, v: &Value) {
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
        "xmasMode" => {
            if let Some(n) = v.as_i64() {
                settings.insert(k.into(), json!(n.clamp(0, 2)));
            }
        }
        "cursorSize" => {
            if let Some(n) = v.as_i64() {
                settings.insert(k.into(), json!(n.clamp(1, 3)));
            }
        }
        "musicVol" => {
            if let Some(n) = v.as_i64() {
                settings.insert(k.into(), json!(n.clamp(0, 100)));
            }
        }
        "volumeV" => {
            if let Some(n) = v.as_i64() {
                settings.insert(k.into(), json!(n.clamp(0, 10)));
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
        "avatar" | "counters" | "achBase" => {
            // Avatar : petit dictionnaire (chaînes courtes, nombres, liste d'objets possédés), nettoyé champ par champ
            if let Some(o) = v.as_object() {
                let mut out = Obj::new();
                for (key, val) in o.iter().take(40) {
                    if key.is_empty() || key.len() > 20 || !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
                        continue;
                    }
                    match val {
                        Value::String(t) => {
                            out.insert(key.clone(), json!(limit(t, 24)));
                        }
                        Value::Number(n) => {
                            if let Some(x) = n.as_i64() {
                                out.insert(key.clone(), json!(x.clamp(0, 10_000_000)));
                            }
                        }
                        Value::Array(a) => {
                            let list: Vec<Value> = a.iter().filter_map(|x| x.as_str()).filter(|t| !t.is_empty() && t.len() <= 24).take(200).map(|t| json!(t)).collect();
                            out.insert(key.clone(), Value::Array(list));
                        }
                        _ => {}
                    }
                }
                settings.insert(k.into(), Value::Object(out));
            }
        }
        "bgfx" | "animations" | "effects" | "ambient" | "slideshow" | "sounds" | "music" | "cursor" | "hoverSounds" | "clickSounds" | "autoCovers"
        | "sidebarCollapsed" | "introAnim" | "trayMode" | "minimizeOnLaunch" | "checkUpdates" | "ecoMode" | "perfChip" | "avatarOn" | "avatarPanel" | "avatarAuto" => {
            if let Some(b) = v.as_bool() {
                settings.insert(k.into(), json!(b));
            }
        }
        _ => {}
    }
}
