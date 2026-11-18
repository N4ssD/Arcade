// Arcade — installation / désinstallation (Windows). Chargé seulement sous Windows (voir main.rs).
use super::*;
use std::process::Command;

use winreg::{enums::HKEY_CURRENT_USER, RegKey};

const REG: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Arcade";

pub fn reg_read(name: &str) -> String {
    RegKey::predef(HKEY_CURRENT_USER).open_subkey(REG).ok().and_then(|k| k.get_value::<String, _>(name).ok()).unwrap_or_default()
}

fn reg_write(dir: &Path, exe: &Path) {
    if let Ok((k, _)) = RegKey::predef(HKEY_CURRENT_USER).create_subkey(REG) {
        let sv = |n: &str, v: &str| {
            let _ = k.set_value(n, &v.to_string());
        };
        sv("DisplayName", "Arcade");
        sv("DisplayVersion", VERSION);
        sv("Publisher", "N4ssD");
        sv("InstallLocation", &dir.to_string_lossy());
        sv("DisplayIcon", &exe.to_string_lossy());
        sv("UninstallString", &format!("\"{}\" --uninstall", exe.to_string_lossy()));
        let _ = k.set_value("NoModify", &1u32);
        let _ = k.set_value("NoRepair", &1u32);
    }
}

fn reg_delete() {
    let _ = RegKey::predef(HKEY_CURRENT_USER).delete_subkey_all(REG);
}

pub fn installed_dir() -> Option<PathBuf> {
    let d = reg_read("InstallLocation");
    if d.is_empty() {
        None
    } else {
        Some(PathBuf::from(d))
    }
}

pub fn running_installed() -> bool {
    static C: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *C.get_or_init(running_installed_uncached)
}

fn running_installed_uncached() -> bool {
    let me = match std::env::current_exe() {
        Ok(p) => p,
        Err(_) => return false,
    };
    // seul « Arcade.exe » est l'application ; « ArcadeSetup.exe » (le téléchargement) est toujours l'installeur
    let is_app = me.file_name().map(|n| n.to_string_lossy().eq_ignore_ascii_case("Arcade.exe")).unwrap_or(false);
    let my_dir = me.parent().map(|p| p.to_string_lossy().to_lowercase()).unwrap_or_default();
    match installed_dir() {
        Some(d) => is_app && d.to_string_lossy().trim_end_matches('\\').to_lowercase() == my_dir.trim_end_matches('\\') && d.join("Arcade.exe").exists(),
        None => false,
    }
}

pub fn needs_install() -> bool {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--portable") || std::env::var_os("ARCADE_PORTABLE").is_some() {
        return false;
    }
    !running_installed()
}

pub fn default_dir() -> PathBuf {
    if let Some(d) = installed_dir() {
        return d;
    }
    let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    base.join("Programs").join("Arcade")
}

pub fn valid_dir(dir: &Path) -> Result<(), String> {
    let s = dir.to_string_lossy().to_string();
    if !dir.is_absolute() || s.len() < 6 {
        return Err("Dossier d'installation invalide.".into());
    }
    if dir.parent().is_none() || dir.parent().map(|p| p.as_os_str().is_empty()).unwrap_or(true) {
        return Err("Choisis un dossier, pas la racine d'un disque.".into());
    }
    if let Ok(sr) = std::env::var("SystemRoot") {
        if s.to_lowercase().starts_with(&sr.to_lowercase()) {
            return Err("Choisis un dossier en dehors de Windows.".into());
        }
    }
    Ok(())
}

// Si le dossier choisi contient déjà autre chose, Arcade s'installe dans un sous-dossier « Arcade »
pub fn tidy_dir(p: &Path) -> PathBuf {
    if p.join("Arcade.exe").exists() {
        return p.to_path_buf();
    }
    if let Ok(mut rd) = fs::read_dir(p) {
        if rd.next().is_some() {
            return p.join("Arcade");
        }
    }
    p.to_path_buf()
}

// Arrête les Arcade.exe en cours (sauf nous-mêmes) pour pouvoir remplacer le fichier
fn kill_others(exe: &Path) {
    let name = exe.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "Arcade.exe".into());
    let _ = Command::new("taskkill")
        .args(["/F", "/IM", &name, "/FI", &format!("PID ne {}", std::process::id())])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
}

fn make_lnk(path: &Path, exe: &Path, dir: &Path, args: Option<&str>) {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(mut sl) = mslnk::ShellLink::new(exe) {
        sl.set_working_dir(Some(dir.to_string_lossy().to_string()));
        sl.set_icon_location(Some(exe.to_string_lossy().to_string()));
        sl.set_name(Some("Arcade - lanceur de jeux".to_string()));
        if let Some(a) = args {
            sl.set_arguments(Some(a.to_string()));
        }
        let _ = sl.create_lnk(path);
    }
}

fn programs_dir() -> PathBuf {
    dirs::data_dir().unwrap_or_default().join(r"Microsoft\Windows\Start Menu\Programs")
}

fn make_shortcuts(dir: &Path, desktop: bool, start: bool) {
    let exe = dir.join("Arcade.exe");
    if desktop {
        if let Some(d) = dirs::desktop_dir() {
            make_lnk(&d.join("Arcade.lnk"), &exe, dir, None);
        }
    }
    if start {
        make_lnk(&programs_dir().join("Arcade.lnk"), &exe, dir, None);
    }
}

fn remove_shortcuts() {
    if let Some(d) = dirs::desktop_dir() {
        let _ = fs::remove_file(d.join("Arcade.lnk"));
    }
    let _ = fs::remove_file(programs_dir().join("Arcade.lnk"));
}

pub fn install(dir: &Path, desktop: bool, start: bool) -> Result<(), String> {
    let t0 = std::time::Instant::now();
    let mut marks: Vec<String> = vec![];
    let mut mark = |what: &str| marks.push(format!("{} {} ms", what, t0.elapsed().as_millis()));
    valid_dir(dir)?;
    let target = dir.join("Arcade.exe");
    kill_others(&target);
    mark("arrêt");
    fs::create_dir_all(dir).map_err(|e| format!("Impossible de créer le dossier : {}", e))?;
    let me = std::env::current_exe().map_err(|e| e.to_string())?;
    // la copie de l'application (le plus long : l'antivirus analyse le fichier) se fait en parallèle du reste
    let (src, dst) = (me.clone(), target.clone());
    let copier = std::thread::spawn(move || -> String {
        let mut last = String::new();
        for _ in 0..12 {
            match fs::copy(&src, &dst) {
                Ok(_) => return String::new(),
                Err(e) => {
                    last = e.to_string();
                    std::thread::sleep(std::time::Duration::from_millis(250));
                }
            }
        }
        last
    });
    // données : reprises de l'ancien dossier d'installation, sinon de l'ancienne version (%APPDATA%)
    let ndata = dir.join("data");
    if !ndata.join("library.json").exists() {
        match installed_dir() {
            Some(old) if old.join("data").join("library.json").exists() && old != dir => copy_dir(&old.join("data"), &ndata),
            _ => {
                if appdata_dir().join("library.json").exists() {
                    copy_dir(&appdata_dir(), &ndata);
                }
            }
        }
    }
    let _ = fs::create_dir_all(&ndata);
    let _ = fs::write(
        dir.join("LISEZMOI.txt"),
        "Arcade - dossier d'installation\r\n\r\nArcade.exe : l'application\r\ndata\\library.json : ta bibliotheque et tes reglages\r\ndata\\covers : les pochettes\r\ndata\\icons : les icones\r\ndata\\arcade.log : le journal (utile en cas de probleme)\r\n",
    );
    mark("données");
    make_shortcuts(dir, desktop, start);
    mark("raccourcis");
    let copied = copier.join().unwrap_or_else(|_| "copie interrompue".into());
    mark("copie de l'application");
    if !copied.is_empty() {
        return Err(format!("Copie de l'application impossible : {}", copied));
    }
    reg_write(dir, &target);
    mark("registre");
    log(&ndata, &format!("Durées d'installation : {}", marks.join(" · ")));
    Ok(())
}

fn startup_lnk() -> PathBuf {
    programs_dir().join("Startup").join("Arcade.lnk")
}

pub fn startup_enabled() -> bool {
    startup_lnk().exists()
}

// Démarrage avec Windows : raccourci dans le dossier « Démarrage », lancé en arrière-plan
pub fn set_startup(on: bool) {
    let lnk = startup_lnk();
    if on {
        if let Ok(exe) = std::env::current_exe() {
            let dir = exe.parent().map(|p| p.to_path_buf()).unwrap_or_default();
            make_lnk(&lnk, &exe, &dir, Some("--background"));
        }
    } else {
        let _ = fs::remove_file(&lnk);
    }
}

pub fn launch_installed() {
    if let Some(d) = installed_dir() {
        let exe = d.join("Arcade.exe");
        let _ = Command::new(&exe).current_dir(&d).spawn();
    }
}

// Désinstalle : raccourcis, démarrage Windows, registre, dossier d'installation (supprimé après la fermeture d'Arcade)
pub fn uninstall_core(dir: &Path, wipe: bool) {
    kill_others(&dir.join("Arcade.exe"));
    remove_shortcuts();
    let _ = fs::remove_file(startup_lnk());
    reg_delete();
    if wipe {
        let _ = fs::remove_dir_all(appdata_dir());
    } else {
        // on garde la bibliothèque : elle sera reprise à la prochaine installation
        copy_dir(&dir.join("data"), &appdata_dir());
    }
    let _ = Command::new("cmd")
        .raw_arg(format!("/c ping -n 4 127.0.0.1 >nul & rmdir /s /q \"{}\"", dir.to_string_lossy()))
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
}

pub fn uninstall() {
    use rfd::{MessageButtons, MessageDialog, MessageDialogResult, MessageLevel};
    let dir = match installed_dir() {
        Some(d) => d,
        None => {
            MessageDialog::new().set_title("Arcade").set_description("Arcade ne semble pas installé.").set_level(MessageLevel::Info).show();
            return;
        }
    };
    let yes = |t: &str, d: &str| {
        MessageDialog::new().set_title(t).set_description(d).set_buttons(MessageButtons::YesNo).set_level(MessageLevel::Warning).show() == MessageDialogResult::Yes
    };
    if !yes("Désinstaller Arcade", "Désinstaller Arcade ?") {
        return;
    }
    let wipe = yes(
        "Désinstaller Arcade",
        "Supprimer aussi ta bibliothèque (jeux, couvertures, réglages) ?\n\nChoisis « Non » pour la garder si tu réinstalles Arcade plus tard.",
    );
    uninstall_core(&dir, wipe);
    MessageDialog::new().set_title("Arcade").set_description("Arcade a été désinstallé.").set_level(MessageLevel::Info).show();
}
