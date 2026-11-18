// Arcade — boîtes de dialogue et scan de dossiers
use super::*;

pub(crate) fn dialog_call(name: &str, body: &Value) -> Option<Result<Value, String>> {
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

pub(crate) fn skip_exe(name: &str) -> bool {
    let n = name.to_lowercase();
    ["unins", "uninst", "setup", "install", "redist", "vc_redist", "vcredist", "dxsetup", "crashreport", "crashhandler", "crashpad", "helper", "updater", "update"]
        .iter()
        .any(|k| n.contains(k))
}

pub(crate) fn walk_dir(dir: &Path, depth: u32, root: &Path, out: &mut Vec<(String, String)>) {
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
