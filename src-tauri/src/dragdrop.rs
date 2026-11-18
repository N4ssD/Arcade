// Arcade — glisser-déposer de raccourcis
use super::*;

pub(crate) fn rd_u16(b: &[u8], o: usize) -> Option<usize> {
    b.get(o..o + 2).map(|x| u16::from_le_bytes([x[0], x[1]]) as usize)
}
pub(crate) fn rd_u32(b: &[u8], o: usize) -> Option<usize> {
    b.get(o..o + 4).map(|x| u32::from_le_bytes([x[0], x[1], x[2], x[3]]) as usize)
}

// Lit la cible d'un raccourci Windows (.lnk) sans bibliothèque externe
pub(crate) fn lnk_target(path: &Path) -> Option<String> {
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

pub(crate) fn url_file_target(path: &Path) -> Option<String> {
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
pub(crate) fn add_dropped(dir: &Path, db: &mut Db, paths: &[PathBuf]) -> (i64, usize) {
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
