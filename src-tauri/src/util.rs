// Arcade — utilitaires
use super::*;

pub(crate) fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

pub(crate) static CHANGED: AtomicBool = AtomicBool::new(false);
pub(crate) static COUNTER: AtomicU64 = AtomicU64::new(1);

pub(crate) fn new_id() -> String {
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

pub(crate) fn log(dir: &Path, msg: &str) {
    use std::io::Write;
    let _ = fs::create_dir_all(dir);
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(dir.join("arcade.log")) {
        let _ = writeln!(f, "[{}] {}", now_ms() / 1000, msg);
    }
}

pub(crate) fn limit(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

pub(crate) fn is_hex_color(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 7 && b[0] == b'#' && b[1..].iter().all(|c| c.is_ascii_hexdigit())
}

pub(crate) fn is_uri(t: &str) -> bool {
    match t.find("://") {
        Some(p) if p >= 2 => {
            let mut chars = t[..p].chars();
            let first_ok = chars.next().map(|c| c.is_ascii_alphabetic()).unwrap_or(false);
            first_ok && chars.all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '.' || c == '-')
        }
        _ => false,
    }
}

pub(crate) fn allowed_scheme(t: &str) -> bool {
    let s = t.split(':').next().unwrap_or("").to_lowercase();
    SCHEMES.contains(&s.as_str())
}

pub(crate) fn name_from_path(p: &str) -> String {
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

pub(crate) fn default_cat_color(name: &str) -> String {
    let mut x: u64 = 0;
    for u in name.encode_utf16() {
        x = (x * 31 + u as u64) % 4_294_967_296;
    }
    PALETTE[(x % PALETTE.len() as u64) as usize].to_string()
}

pub(crate) fn gs(v: &Value, k: &str) -> String {
    match v.get(k) {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        _ => String::new(),
    }
}
pub(crate) fn gb(v: &Value, k: &str) -> bool {
    v.get(k).and_then(|x| x.as_bool()).unwrap_or(false)
}
pub(crate) fn gn(v: &Value, k: &str) -> i64 {
    match v.get(k) {
        Some(x) => x.as_i64().or_else(|| x.as_f64().map(|f| f as i64)).unwrap_or(0),
        None => 0,
    }
}
pub(crate) fn opt_str(v: &Value, k: &str) -> Value {
    match v.get(k) {
        Some(Value::String(s)) if !s.is_empty() => Value::String(s.clone()),
        _ => Value::Null,
    }
}

pub(crate) fn appdata_dir() -> PathBuf {
    match std::env::var_os("APPDATA") {
        Some(a) => PathBuf::from(a).join("Arcade"),
        None => PathBuf::from("Arcade-data"),
    }
}

// Installé : les données sont dans le dossier d'installation (sous-dossier « data »), bien visibles.
// Sinon (mode portable, ancienne version) : %APPDATA%\Arcade.
pub(crate) fn data_dir() -> PathBuf {
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

pub(crate) fn copy_dir(src: &Path, dst: &Path) {
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
