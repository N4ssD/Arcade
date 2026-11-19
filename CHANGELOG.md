# Changelog

## 2.12.1 — Auto theme and Resume
- The theme follows Windows by default (Settings > Appearance > Theme: Dark, Light or Auto). An already saved choice is kept.
- Resume section: the Play button is now a small round button with just the triangle, leaving room for the game name.

## 2.12.0 — Christmas theme
- From December 1 to January 6 Arcade dresses up by itself: string lights, snow, a pixel tree, a Santa hat on the logo, a red accent and a festive avatar.
- Not a fan? Settings > Appearance > "Christmas theme": Auto, Always or Never. Snow and lights stop when animations or visual effects are off.

## 2.11.2 — Cursor size
- The pixel cursor is smaller by default and you can pick its size: Small, Medium or Large (Settings > Appearance).

## 2.11.1 — While you play
- When a game launches, the music stops and Arcade hides from the desktop: it stays in the notification area, one click on its icon reopens it.
- Arcade reopens by itself when the game closes and the music resumes.

## 2.11.0 — Pixel cursor
- New pixel cursor (arrow + hand over buttons and games) in your accent color, inside the Arcade window only.
- Settings > Appearance > "Pixel cursor" turns it off.

## 2.10.1 — Faster music start
- The ambient music starts as soon as loading ends, without waiting for a click, and fades in faster.

## 2.10.0 — Ambient music and reliability
- New soft ambient background music, generated live. Settings > Sounds: on/off switch and its own volume. Pauses when Arcade is minimized.
- Adding games: no more false "already in your library" message after a double click or a drop event sent twice by Windows.
- Error messages stay 12 seconds (click to dismiss) and are written to `data\arcade.log`.
- Icons: games without an icon are retried each time Arcade starts.

## 2.9.0 — The icon follows your color
- The taskbar and notification-area icon now take your accent color (or your custom logo color).
- Windows limit: a taskbar-pinned shortcut keeps its original icon; only the open window's icon changes.

## 2.8.3 — Smaller modules
- Library commands moved out of the covers module into their own one.

## 2.8.2 — Build fix
- Finishing touch on the engine split into modules.

## 2.8.1 — Tidier engine
- The Rust engine is split into modules (utilities, settings, library storage, launching, covers, installer, updates, tray…). Nothing changes on screen.

## 2.8.0 — Tidier code
- The UI code is split into several files (core, library, achievements, avatar, categories, settings…). Nothing changes on screen.

## 2.7.2 — Polish
- English text for the coin-collect banner, tidier layout of that banner.
- New screenshots on the GitHub page.

## 2.7.1 — Collect your coins
- Achievements: a "Collect" button on each unlocked achievement and "Collect all" at the top to cash in the coins.
- The strip's Customize button is smaller.

## 2.7.0 — 101 achievements and coin rewards
- 80+ new achievements: play time, streaks, days played, big sessions, different games, night or morning launches, customization, avatar, shop, levels, coins, and even achievements about achievements.
- Every achievement now pays coins by tier: 10 (bronze), 25 (silver), 50 (gold) or 100 (legend), to spend in the avatar shop.
- Nothing is unlocked in advance: on first launch Arcade records where you stand and only progress made from then on counts (the original 18 keep their usual calculation if you already had them).
- Achievements window: All / To unlock / Unlocked filters, the reward of each achievement and the total of coins earned.

## 2.6.0 — More looks, smoother avatar
- 5 new hairstyles (ponytail, bun, bob, mohawk, afro), 5 new tops (tank top, shirt, Hawaiian shirt, overalls, armor) and a skirt.
- Animations rebuilt: gentle breathing, blinking, head and arms moving with a slight delay, a squash-and-stretch jump when happy, a nodding head when asleep, a tapping foot when impatient.

## 2.5.1 — Consistent toolbar
- Search, sort, Categories, Surprise me and Full screen now share the same height, rounding and background.
- The sort list arrow no longer touches the border.

## 2.5.0 — Living avatar and 30 % volume
- The avatar reacts: it falls asleep when you are idle, is happy when you launch a game (and when you come back), gets impatient if you linger in the menus.
- Automatic outfits: pajamas at night, sunglasses in the afternoon, a beanie in winter, a witch costume at Halloween (can be turned off in Settings > Appearance).
- The default volume is now 30 % everywhere (applied once, including existing installs; change it in Settings > Sound).

## 2.4.2 — Avatar strip
- The avatar moves into a slim strip under the search bar (character, speech bubble, coins, level, Customize button), so the library keeps its full width.
- The cross hides the strip; the "My avatar" menu entry brings it back.

## 2.4.1 — Avatar in the menu
- The avatar icon in the menu is now a small face in a frame, aligned exactly with the other icons.

## 2.4.0 — Your avatar
- New: a pixel-art character that represents you, with a level (from play time and achievements) and coins to spend.
- A panel beside the library: the avatar talks about your games ("it's been 3 days since you played…"). Click it for another line, click the arrow to hide the panel.
- "Customize" editor: skin, hair, face, top, bottom, shoes, accessories and background, with colors and items to buy with coins or unlock with achievements.
- Optional: Settings > Appearance > Avatar turns it off completely.

## 2.3.7 — Collapsed menu
- Removed the dot separator under Settings (the one between Statistics and the categories stays).

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
