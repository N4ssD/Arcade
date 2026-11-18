// Arcade — performances
use super::*;

pub(crate) static START: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();
pub(crate) static OPEN_MS: AtomicU64 = AtomicU64::new(0);
pub(crate) static PERF_SYS: Mutex<Option<sysinfo::System>> = Mutex::new(None);

// Mémoire et processeur d'Arcade, moteur d'affichage (WebView2) compris : on additionne l'arbre de processus
pub(crate) fn perf_snapshot(game_running: bool) -> Value {
    use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate};
    let me = Pid::from_u32(std::process::id());
    let (mut mem, mut cpu, mut procs) = (0u64, 0f32, 0u32);
    if let Ok(mut g) = PERF_SYS.lock() {
        let sys = g.get_or_insert_with(sysinfo::System::new);
        sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::new().with_cpu().with_memory());
        let mut tree: Vec<Pid> = vec![me];
        loop {
            let before = tree.len();
            for (pid, p) in sys.processes() {
                if !tree.contains(pid) && p.parent().map(|pp| tree.contains(&pp)).unwrap_or(false) {
                    tree.push(*pid);
                }
            }
            if tree.len() == before {
                break;
            }
        }
        for pid in &tree {
            if let Some(p) = sys.process(*pid) {
                mem += p.memory();
                cpu += p.cpu_usage();
                procs += 1;
            }
        }
    }
    let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1) as f32;
    let up = START.get().map(|s| s.elapsed().as_secs()).unwrap_or(0);
    json!({ "ok": true, "memMb": (mem as f64 / 1_048_576.0).round(), "cpu": ((cpu / cores) as f64 * 10.0).round() / 10.0, "procs": procs, "openMs": OPEN_MS.load(Ordering::Relaxed), "uptime": up, "gameRunning": game_running })
}
