# Changelog

## 2.3.6 — Dot separators and update check
- Collapsed menu: the separator lines are replaced by three small dots, centered between the icon groups.
- Updates: Arcade now compares with the version of the build that is actually published, so it no longer offers an update that is still compiling.

## 2.3.5 — Separators recentered
- Collapsed menu: both separators now sit exactly halfway between the icons, and follow automatically when categories are added or removed.

## 2.3.4 — Menu separators
- Collapsed menu: separators are now thin lines that fade at both ends, centered, with equal spacing above and below.

## 2.3.3 — Menu
- Collapsed menu: thin separator lines between groups.
- The "what's new" dot no longer covers the What's new icon (it sits in its corner).
- New icon for "Scan a folder" (folder with a magnifier) so it is no longer confused with categories.

## 2.3.2 — Custom color
- The "custom color" button (the rainbow circle) is replaced by a discreet dashed circle with a "+". Once a color is picked it takes that color and shows a pencil.

## 2.3.1 — Polish
- Performance panel: better spacing around the cards.
- The performance indicator now shows in the menu when it opens.

## 2.3.0 — Performance
- New "Performance" panel in Settings: memory (display engine included), processor and startup time, measured live.
- Power-saving mode: animations pause when the window is hidden or while a game runs. Optional indicator at the bottom of the menu.
- Arcade comes back much faster when you quit a game.
- Faster install: files are copied in parallel and there is less waiting.

## 2.2.0 — Maintenance and updates
- Settings > Maintenance > "Check the library": finds games whose file has disappeared and duplicate games, with one-click clean-up and merge (play time and launches are added up).
- "Uninstall Arcade" from Settings, with or without keeping your library.

## 2.1.0 — Automatic updates
- Arcade checks for a new version and offers to install it in one click: it downloads, updates itself and restarts (can be turned off; a "Check" button is in Settings).
- Run as administrator: launch arguments and the working folder are now passed to the game.
- Launch arguments are also used for `.bat` and `.cmd` files.

## 2.0.0 — Arcade becomes a real application
- Rewritten in Rust (Tauri): Arcade has its own window, with no Edge and no PowerShell server.
- `ArcadeSetup.exe`: choose the install folder; data is stored in the `data` subfolder.
- Auto-hiding menu: collapsed when idle, it pushes the content to the right on hover (optional).
- Drag and drop of shortcuts (`.lnk`, `.url`) and `.exe` files.
- Live play time, break reminders, Steam / Epic / GOG import.
- Arcade minimizes when a game starts (optional).
- Start with Windows and notification area.
- Language choice: French or English.

## 1.19.0 — Arcade achievements
- "Achievements" button: 18 badges to unlock (games added, total hours, days in a row, favorites, finished games…).
- A notification for every unlocked achievement; progress is saved in the settings.

## 1.18.0 — What's new
- "What's new" button: change history for each version, with an alert dot on every new version.

## 1.17.0 — Reset and installer
- Settings > Reset: brings Arcade back to new (library, categories, statistics, covers, settings).
- `Arcade.exe`: installer with folder choice, Desktop / Start menu shortcuts, update and uninstall.

## 1.16.0 — New game page
- Colored background, large glowing cover, better-arranged buttons, statistics with icons and a play time bar.
- "Finished" button and a button to copy the game's path.

## 1.15.x — Performance and polish
- Settings > Performance: turn off animations and/or visual effects.
- Twinkling pixels on the launcher background, discreet signature, soft outline around a clicked game.
- The zoom also enlarges the "Resume" row.

## 1.14 — Import, resume and live statistics
- Automatic import of Steam, Epic and GOG games.
- "Resume" row, "Surprise me" button, live play time and statistics.
- Card zoom in precise steps, new pixel logo (color can be changed), animation on every button.
