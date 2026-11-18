package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
	"unsafe"
)

const createNoWindow = 0x08000000

func hide(c *exec.Cmd) *exec.Cmd {
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
	return c
}

func msgBox(title, text string, flags uintptr) int {
	t, _ := syscall.UTF16PtrFromString(title)
	x, _ := syscall.UTF16PtrFromString(text)
	r, _, _ := syscall.NewLazyDLL("user32.dll").NewProc("MessageBoxW").Call(0, uintptr(unsafe.Pointer(x)), uintptr(unsafe.Pointer(t)), flags)
	return int(r)
}

func sysRoot() string {
	if s := os.Getenv("SystemRoot"); s != "" {
		return s
	}
	return `C:\Windows`
}

func psExe() string {
	return filepath.Join(sysRoot(), "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
}

func runPS(script string) (string, error) {
	out, err := hide(exec.Command(psExe(), "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", script)).Output()
	return strings.TrimSpace(string(out)), err
}

func defaultInstallDir() string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		base = os.TempDir()
	}
	return filepath.Join(base, "Programs", "Arcade")
}

func pickFolder(start string) string {
	script := `Add-Type -AssemblyName System.Windows.Forms;` +
		`$f=New-Object System.Windows.Forms.Form;$f.TopMost=$true;$f.ShowInTaskbar=$false;$f.StartPosition='CenterScreen';$f.Size=New-Object System.Drawing.Size(1,1);$f.Opacity=0;$f.Show();` +
		`$d=New-Object System.Windows.Forms.FolderBrowserDialog;$d.Description='Choisis le dossier dans lequel installer Arcade';$d.ShowNewFolderButton=$true;` +
		`$p='` + psQuote(start) + `';if(Test-Path -LiteralPath $p){$d.SelectedPath=$p};` +
		`if($d.ShowDialog($f) -eq 'OK'){[Console]::OutputEncoding=[Text.Encoding]::UTF8;Write-Output $d.SelectedPath};$f.Close()`
	out, _ := runPS(script)
	return out
}

const regKey = `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Arcade`

func regRead(name string) string {
	out, err := hide(exec.Command("reg", "query", regKey, "/v", name)).Output()
	if err != nil {
		return ""
	}
	m := regexp.MustCompile(`(?m)^\s*` + regexp.QuoteMeta(name) + `\s+REG_\w+\s+(.*?)\s*$`).FindSubmatch(out)
	if m == nil {
		return ""
	}
	return string(m[1])
}

func regWrite(dir, version, exe string) {
	set := func(n, v string) {
		_ = hide(exec.Command("reg", "add", regKey, "/v", n, "/t", "REG_SZ", "/d", v, "/f")).Run()
	}
	set("DisplayName", "Arcade")
	set("DisplayVersion", version)
	set("Publisher", "N4ssD")
	set("InstallLocation", dir)
	set("DisplayIcon", exe)
	set("UninstallString", `"`+exe+`" --uninstall`)
	for _, n := range []string{"NoModify", "NoRepair"} {
		_ = hide(exec.Command("reg", "add", regKey, "/v", n, "/t", "REG_DWORD", "/d", "1", "/f")).Run()
	}
}

func regDelete() { _ = hide(exec.Command("reg", "delete", regKey, "/f")).Run() }

func makeShortcuts(dir string, desktop, start bool) {
	exe := filepath.Join(dir, "Arcade.exe")
	one := func(folderExpr string) string {
		return `$s=(New-Object -ComObject WScript.Shell).CreateShortcut(` + folderExpr + `+'\Arcade.lnk');` +
			`$s.TargetPath='` + psQuote(exe) + `';$s.WorkingDirectory='` + psQuote(dir) + `';$s.IconLocation='` + psQuote(exe) + `,0';$s.Description='Arcade - lanceur de jeux';$s.Save();`
	}
	script := ""
	if desktop {
		script += one(`[Environment]::GetFolderPath('Desktop')`)
	}
	if start {
		script += one(`[Environment]::GetFolderPath('Programs')`)
	}
	if script != "" {
		_, _ = runPS(script)
	}
}

func removeShortcuts() {
	_, _ = runPS(`foreach($k in 'Desktop','Programs'){$p=[Environment]::GetFolderPath($k)+'\Arcade.lnk';if(Test-Path -LiteralPath $p){Remove-Item -LiteralPath $p -Force}}`)
}

func killRunning(dir string) {
	_, _ = runPS(`Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*` + psQuote(dir) + `*Arcade.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`)
}

func startApp(dir string, bg bool) error {
	args := []string{"-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", filepath.Join(dir, "Arcade.ps1")}
	if bg {
		args = append(args, "-Background")
	}
	c := hide(exec.Command(psExe(), args...))
	c.Dir = dir
	return c.Start()
}

func findBrowser() string {
	var c []string
	for _, env := range []string{"ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"} {
		b := os.Getenv(env)
		if b == "" {
			continue
		}
		c = append(c, filepath.Join(b, "Microsoft", "Edge", "Application", "msedge.exe"), filepath.Join(b, "Google", "Chrome", "Application", "chrome.exe"))
	}
	for _, p := range c {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

func killProfile(prof string) {
	_, _ = runPS(`Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*` + psQuote(filepath.Base(prof)) + `*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`)
}

func killTree(pid int) {
	_ = hide(exec.Command("taskkill", "/T", "/F", "/PID", itoa(pid))).Run()
}

func delayedDelete(dir string) {
	// supprime Arcade.exe (en cours d'exécution) puis le dossier, une fois ce processus terminé
	q := `"` + dir + `"`
	cmd := `ping -n 3 127.0.0.1 >nul & del /f /q "` + filepath.Join(dir, "Arcade.exe") + `" & rmdir /s /q "` + filepath.Join(dir, "ui") + `" & del /f /q "` + filepath.Join(dir, "Arcade.ps1") + `" "` + filepath.Join(dir, "icon.ico") + `" & rmdir ` + q
	c := exec.Command("cmd", "/c", cmd)
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow | 0x00000200}
	_ = c.Start()
}
