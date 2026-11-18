//go:build !windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
)

// Version de test (Linux) : ne fait rien de destructif.
func hide(c *exec.Cmd) *exec.Cmd                   { return c }
func msgBox(title, text string, flags uintptr) int { println(title + ": " + text); return 6 }
func defaultInstallDir() string {
	return filepath.Join(os.TempDir(), "arcade-test", "Programs", "Arcade")
}
func pickFolder(start string) string                { return filepath.Join(os.TempDir(), "arcade-test", "Choisi") }
func regRead(name string) string                    { return "" }
func regWrite(dir, version, exe string)             {}
func regDelete()                                    {}
func makeShortcuts(dir string, desktop, start bool) {}
func removeShortcuts()                              {}
func killRunning(dir string)                        {}
func startApp(dir string, bg bool) error            { println("startApp " + dir); return nil }
func findBrowser() string                           { return os.Getenv("ARCADE_TEST_BROWSER") }
func findBrowserOld() string                        { return "" }
func killProfile(prof string)                       {}
func killTree(pid int)                              {}
func delayedDelete(dir string)                      {}
