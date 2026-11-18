package main

import (
	"crypto/rand"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

//go:embed all:app
var appFS embed.FS

//go:embed setup/index.html
var setupHTML []byte

func itoa(i int) string { return strconv.Itoa(i) }

func psQuote(s string) string { return strings.ReplaceAll(s, "'", "''") }

func version() string {
	b, err := appFS.ReadFile("app/Arcade.ps1")
	if err != nil {
		return "0"
	}
	m := regexp.MustCompile(`\$script:Version\s*=\s*'([^']+)'`).FindSubmatch(b)
	if m == nil {
		return "0"
	}
	return string(m[1])
}

func dry() bool { return os.Getenv("ARCADE_DRYRUN") != "" }

func has(args []string, names ...string) bool {
	for _, a := range args {
		for _, n := range names {
			if strings.EqualFold(a, n) {
				return true
			}
		}
	}
	return false
}

func installedDir() (dir, ver string, ok bool) {
	d := regRead("InstallLocation")
	if d == "" {
		return "", "", false
	}
	if _, err := os.Stat(filepath.Join(d, "Arcade.ps1")); err != nil {
		return "", "", false
	}
	return d, regRead("DisplayVersion"), true
}

func main() {
	args := os.Args[1:]
	if has(args, "--uninstall") {
		uninstall()
		return
	}
	bg := has(args, "background", "-background", "--background")
	exe, _ := os.Executable()
	if dir, ver, ok := installedDir(); ok && os.Getenv("ARCADE_FORCE_SETUP") == "" {
		same := strings.EqualFold(filepath.Clean(exe), filepath.Clean(filepath.Join(dir, "Arcade.exe")))
		if same || ver == version() {
			if err := startApp(dir, bg); err != nil {
				msgBox("Arcade", "Impossible de lancer Arcade :\n"+err.Error(), 0x10)
			}
			return
		}
		runSetup("update", dir, ver, bg)
		return
	}
	runSetup("install", defaultInstallDir(), "", bg)
}

// ---------- extraction / installation ----------

func extract(dst string) error {
	return fs.WalkDir(appFS, "app", func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel("app", filepath.FromSlash(p))
		out := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(out, 0o755)
		}
		b, err := appFS.ReadFile(p)
		if err != nil {
			return err
		}
		return os.WriteFile(out, b, 0o644)
	})
}

func copyFile(src, dst string) error {
	if a, e1 := os.Stat(src); e1 == nil {
		if b, e2 := os.Stat(dst); e2 == nil && os.SameFile(a, b) {
			return nil
		}
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	tmp := dst + ".new"
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err = io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	out.Close()
	_ = os.Remove(dst)
	return os.Rename(tmp, dst)
}

func validDir(dir string) error {
	if !filepath.IsAbs(dir) || len(dir) < 6 {
		return errors.New("Dossier d'installation invalide.")
	}
	if filepath.Dir(dir) == dir || strings.EqualFold(dir, filepath.VolumeName(dir)+`\`) {
		return errors.New("Choisis un dossier, pas la racine d'un disque.")
	}
	if sr := os.Getenv("SystemRoot"); sr != "" && strings.HasPrefix(strings.ToLower(dir), strings.ToLower(sr)) {
		return errors.New("Choisis un dossier en dehors de Windows.")
	}
	return nil
}

// Si le dossier choisi contient déjà autre chose qu'Arcade, on y range Arcade dans un sous-dossier
// pour ne pas mélanger nos fichiers avec les siens.
func tidyDir(p string) string {
	if _, err := os.Stat(filepath.Join(p, "Arcade.ps1")); err == nil {
		return p
	}
	if ents, err := os.ReadDir(p); err == nil && len(ents) > 0 {
		return filepath.Join(p, "Arcade")
	}
	return p
}

func doInstall(dir string, desktop, start bool) error {
	if err := validDir(dir); err != nil {
		return err
	}
	if dry() {
		time.Sleep(600 * time.Millisecond)
		println("DRYRUN install", dir, desktop, start)
		return nil
	}
	killRunning(dir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return errors.New("Impossible de créer le dossier : " + err.Error())
	}
	if err := extract(dir); err != nil {
		return errors.New("Copie des fichiers impossible : " + err.Error())
	}
	self, _ := os.Executable()
	target := filepath.Join(dir, "Arcade.exe")
	if err := copyFile(self, target); err != nil {
		return errors.New("Copie de l'application impossible : " + err.Error())
	}
	makeShortcuts(dir, desktop, start)
	regWrite(dir, version(), target)
	return nil
}

// ---------- désinstallation ----------

func uninstall() {
	dir, _, ok := installedDir()
	if !ok {
		msgBox("Arcade", "Arcade ne semble pas installé.", 0x40)
		return
	}
	if msgBox("Désinstaller Arcade", "Désinstaller Arcade ?", 0x24) != 6 {
		return
	}
	wipe := msgBox("Désinstaller Arcade", "Supprimer aussi ta bibliothèque (jeux, couvertures, réglages) ?\n\nChoisis « Non » pour la garder si tu réinstalles Arcade plus tard.", 0x124) == 6
	killRunning(dir)
	removeShortcuts()
	regDelete()
	if wipe {
		if ad := os.Getenv("APPDATA"); ad != "" {
			_ = os.RemoveAll(filepath.Join(ad, "Arcade"))
		}
	}
	delayedDelete(dir)
	msgBox("Arcade", "Arcade a été désinstallé.", 0x40)
}

// ---------- fenêtre d'installation (page web locale dans Edge/Chrome) ----------

func runSetup(mode, dir, oldVer string, bg bool) {
	tokB := make([]byte, 16)
	_, _ = rand.Read(tokB)
	token := hex.EncodeToString(tokB)
	ln, err := net.Listen("tcp", "127.0.0.1:"+os.Getenv("ARCADE_TEST_PORT"))
	if err != nil {
		msgBox("Arcade", "Impossible d'ouvrir l'installeur : "+err.Error(), 0x10)
		return
	}
	port := ln.Addr().(*net.TCPAddr).Port
	host := "127.0.0.1:" + itoa(port)
	done := make(chan struct{})
	var closed bool
	finish := func() {
		if !closed {
			closed = true
			close(done)
		}
	}
	installed := false
	curDir := dir
	var lastPing, busy atomic.Int64
	lastPing.Store(0)

	mux := http.NewServeMux()
	guard := func(h func(w http.ResponseWriter, r *http.Request)) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			if r.Host != host || r.Method != http.MethodPost || r.Header.Get("X-Token") != token {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			h(w, r)
		}
	}
	reply := func(w http.ResponseWriter, v any) { _ = json.NewEncoder(w).Encode(v) }
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Host != host || r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(setupHTML)
	})
	mux.HandleFunc("/fonts/", func(w http.ResponseWriter, r *http.Request) {
		name := filepath.Base(r.URL.Path)
		b, err := appFS.ReadFile("app/ui/fonts/" + name)
		if err != nil || !strings.HasSuffix(name, ".woff2") {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "font/woff2")
		_, _ = w.Write(b)
	})
	mux.HandleFunc("/api/ping", guard(func(w http.ResponseWriter, r *http.Request) {
		lastPing.Store(time.Now().UnixMilli())
		reply(w, map[string]any{"ok": true})
	}))
	mux.HandleFunc("/api/bye", func(w http.ResponseWriter, r *http.Request) {
		// envoyé par la page quand la fenêtre se ferme (sendBeacon : pas d'en-tête, le jeton est dans l'URL)
		if r.Host != host || r.Method != http.MethodPost || r.URL.Query().Get("t") != token {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		go func() {
			time.Sleep(1500 * time.Millisecond)
			if busy.Load() == 0 && time.Now().UnixMilli()-lastPing.Load() > 1200 {
				finish()
			}
		}()
	})
	mux.HandleFunc("/api/info", guard(func(w http.ResponseWriter, r *http.Request) {
		reply(w, map[string]any{"mode": mode, "version": version(), "oldVersion": oldVer, "dir": curDir})
	}))
	mux.HandleFunc("/api/browse", guard(func(w http.ResponseWriter, r *http.Request) {
		if mode == "update" {
			reply(w, map[string]any{"dir": curDir})
			return
		}
		start := curDir
		if _, err := os.Stat(start); err != nil {
			start = filepath.Dir(curDir)
		}
		if p := pickFolder(start); p != "" {
			curDir = tidyDir(p)
		}
		reply(w, map[string]any{"dir": curDir})
	}))
	mux.HandleFunc("/api/install", guard(func(w http.ResponseWriter, r *http.Request) {
		var in struct{ Desktop, Start bool }
		_ = json.NewDecoder(r.Body).Decode(&in)
		busy.Store(1)
		err := doInstall(curDir, in.Desktop, in.Start)
		busy.Store(0)
		if err != nil {
			reply(w, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		installed = true
		reply(w, map[string]any{"ok": true})
	}))
	mux.HandleFunc("/api/finish", guard(func(w http.ResponseWriter, r *http.Request) {
		var in struct{ Launch bool }
		_ = json.NewDecoder(r.Body).Decode(&in)
		if installed && in.Launch {
			if dry() {
				println("DRYRUN launch", curDir)
			} else {
				_ = startApp(curDir, bg)
			}
		}
		reply(w, map[string]any{"ok": true})
		go func() { time.Sleep(400 * time.Millisecond); finish() }()
	}))
	srv := &http.Server{Handler: mux}
	go func() { _ = srv.Serve(ln) }()

	url := "http://" + host + "/?t=" + token
	if os.Getenv("ARCADE_TEST_PORT") != "" {
		println("SETUP", url)
		<-done
		return
	}
	br := findBrowser()
	if br == "" {
		msgBox("Arcade", "Edge ou Chrome est introuvable : Arcade en a besoin pour s'afficher.", 0x10)
		return
	}
	prof, _ := os.MkdirTemp("", "arcade-setup-")
	cmd := exec.Command(br, "--app="+url, "--user-data-dir="+prof, "--window-size=860,600", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-features=Translate")
	if err := cmd.Start(); err != nil {
		msgBox("Arcade", "Impossible d'ouvrir la fenêtre d'installation : "+err.Error(), 0x10)
		return
	}
	// Edge peut rendre la main tout de suite (le processus lancé se termine alors que la fenêtre reste ouverte) :
	// on ne se fie donc pas à la fin du processus, mais aux « pings » envoyés par la page elle-même.
	go func() { _ = cmd.Wait() }()
	start := time.Now()
	tick := time.NewTicker(500 * time.Millisecond)
	defer tick.Stop()
wait:
	for {
		select {
		case <-done:
			break wait
		case <-tick.C:
			lp := lastPing.Load()
			if busy.Load() != 0 {
				continue
			}
			if lp == 0 && time.Since(start) > 45*time.Second {
				break wait
			}
			if lp != 0 && time.Now().UnixMilli()-lp > 25000 {
				break wait
			}
		}
	}
	time.Sleep(300 * time.Millisecond)
	killProfile(prof)
	_ = srv.Close()
	time.Sleep(300 * time.Millisecond)
	_ = os.RemoveAll(prof)
}
