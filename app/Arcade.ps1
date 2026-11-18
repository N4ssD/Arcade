# Arcade - lanceur de jeux (PowerShell + fenetre Edge, aucune installation requise)
param([switch]$Background)
$ErrorActionPreference = 'Stop'
$script:Version = '1.19.0'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:AppDir    = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:UiDir     = Join-Path $script:AppDir 'ui'
$script:DataDir   = Join-Path $env:APPDATA 'Arcade'
$script:CoversDir = Join-Path $script:DataDir 'covers'
$script:DbFile    = Join-Path $script:DataDir 'library.json'
$script:IconsDir  = Join-Path $script:DataDir 'icons'
$script:LogFile   = Join-Path $script:DataDir 'arcade.log'
$script:UrlFile   = Join-Path $script:DataDir 'url.txt'
$script:InfoFile  = Join-Path $script:DataDir 'instance.json'
$script:ProfDir   = Join-Path $script:DataDir 'browser-profile'
New-Item -ItemType Directory -Force -Path $script:DataDir, $script:CoversDir, $script:IconsDir | Out-Null

function Write-Log($msg) {
    try { Add-Content -LiteralPath $script:LogFile -Value ("{0}  {1}" -f (Get-Date -Format 's'), $msg) -Encoding UTF8 } catch {}
}

# ---------- Navigateur (fenetre "application") ----------
function Find-Browser {
    $pf86 = ${env:ProgramFiles(x86)}
    $cands = @(
        "$pf86\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "$pf86\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    )
    foreach ($c in $cands) { if ($c -and (Test-Path -LiteralPath $c)) { return $c } }
    return $null
}

function Start-AppWindow($url) {
    $b = Find-Browser
    if ($b) {
        $argList = "--app=$url --user-data-dir=`"$($script:ProfDir)`" --window-size=1280,820 --autoplay-policy=no-user-gesture-required --no-first-run --no-default-browser-check"
        return Start-Process -FilePath $b -ArgumentList $argList -PassThru
    }
    Start-Process $url
    return $null
}

# ---------- Instance unique ----------
$mutexName = 'Local\ArcadeLauncherSingleton'
$created = $false
$script:Mutex = New-Object System.Threading.Mutex($true, $mutexName, [ref]$created)
if (-not $created) {
    # Arcade tourne deja. On le reutilise seulement si c'est exactement cette version.
    # Sinon (ancienne version oubliee en arriere-plan) on la ferme et on reprend la main.
    $reuse = $false
    try {
        if (Test-Path -LiteralPath $script:InfoFile) {
            $info = [IO.File]::ReadAllText($script:InfoFile) | ConvertFrom-Json
            if ([string]$info.version -eq $script:Version -and $info.pid -and (Get-Process -Id ([int]$info.pid) -ErrorAction SilentlyContinue)) { $reuse = $true }
        }
    } catch {}
    if ($reuse) {
        if (Test-Path -LiteralPath $script:UrlFile) {
            $u = ([IO.File]::ReadAllText($script:UrlFile)).Trim()
            if ($u) { [void](Start-AppWindow $u) }
        }
        exit
    }
    Write-Log 'Ancienne instance detectee : fermeture et reprise.'
    try {
        foreach ($o in @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'")) {
            if ($o.ProcessId -ne $PID -and $o.CommandLine -and $o.CommandLine.IndexOf('Arcade.ps1', [StringComparison]::OrdinalIgnoreCase) -ge 0) {
                Stop-Process -Id $o.ProcessId -Force -ErrorAction SilentlyContinue
            }
        }
        # anciennes fenetres Arcade (meme profil de navigateur)
        foreach ($o in @(Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe' OR Name = 'chrome.exe'")) {
            if ($o.CommandLine -and $o.CommandLine.IndexOf($script:ProfDir, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
                Stop-Process -Id $o.ProcessId -Force -ErrorAction SilentlyContinue
            }
        }
    } catch { Write-Log "Fermeture de l'ancienne instance impossible : $($_.Exception.Message)" }
    Start-Sleep -Milliseconds 1500
    try { $script:Mutex.Dispose() } catch {}
    $created = $false
    $script:Mutex = New-Object System.Threading.Mutex($true, $mutexName, [ref]$created)
    if (-not $created) { Write-Log 'Impossible de reprendre la main sur Arcade.'; exit }
}

# ---------- Donnees ----------
$script:games    = New-Object System.Collections.ArrayList
$script:categories = New-Object System.Collections.ArrayList
$script:CatPalette = @('#9c7cf0', '#5ec2ff', '#58d68d', '#ffd166', '#ff8f5e', '#ff6b9a', '#3fd0c9', '#e0a3ff')
function New-DefaultSettings { return @{ cardSize = 200; volume = 60; sounds = $true; hoverSounds = $true; clickSounds = $true; autoCovers = $true; sidebarCollapsed = $false; introAnim = $true; trayMode = $false; breakReminder = 0; theme = 'dark'; accent = '#9C7CF0'; accentV = 2; logo = ''; bgfx = $true; animations = $true; effects = $true; achievements = @{}; ambient = $true; slideshow = $false } }
$script:settings = New-DefaultSettings
$script:running  = @{}
$script:daily    = @{}
$script:changed  = $false
$script:lastPing = Get-Date
$script:everPinged = $false
$script:byeAt = $null
$script:hidden = $false
$script:hiddenAt = $null
$script:quit = $false
$script:openReq = $false
$script:Tray = $null
$script:TrayTemp = $false
$script:TrayTempUntil = $null
$script:notices = New-Object System.Collections.ArrayList
$script:AllowedSchemes = @('steam','com.epicgames.launcher','goggalaxy','uplay','origin2','origin','battlenet','xbox','ms-windows-store','http','https')
$script:SkipRe = '(unins|setup|redist|crashhandler|crashreport|vc_?redist|dxsetup|dotnet|updater|launcher_helper|UnityCrashHandler|helper|installer)'

function Get-NowMs { return [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
function Test-IsUri($t) { return [bool]($t -match '^[a-zA-Z][a-zA-Z0-9+.\-]+://') }
function Test-AllowedScheme($t) {
    $s = ($t -split ':')[0].ToLower()
    return ($script:AllowedSchemes -contains $s)
}
function Get-NameFromPath($p) {
    if (Test-IsUri $p) { return 'Nouveau jeu' }
    $n = [IO.Path]::GetFileNameWithoutExtension($p)
    $n = ($n -replace '[_\-.]+', ' ') -replace '\s+', ' '
    $n = $n.Trim()
    if (-not $n) { return 'Nouveau jeu' }
    return $n
}
function Limit-Text($s, $max) {
    $s = [string]$s
    if ($s.Length -gt $max) { return $s.Substring(0, $max) }
    return $s
}

function New-GameFromObj($o) {
    return [ordered]@{
        id         = [string]$o.id
        name       = [string]$o.name
        target     = [string]$o.target
        args       = [string]$o.args
        category   = [string]$o.category
        cover      = $(if ($o.cover) { [string]$o.cover } else { $null })
        coverTried = [bool]$o.coverTried
        icon       = $(if ($o.icon) { [string]$o.icon } else { $null })
        iconTried  = [bool]$o.iconTried
        favorite   = [bool]$o.favorite
        playtime   = [long]$o.playtime
        lastPlayed = $(if ($o.lastPlayed) { [long]$o.lastPlayed } else { $null })
        launches   = [int]$o.launches
        runAs      = [bool]$o.runAs
        finished   = [bool]$o.finished
        addedAt    = [long]$o.addedAt
    }
}

function Load-Db {
    if (-not (Test-Path -LiteralPath $script:DbFile)) { return }
    try {
        $raw = [IO.File]::ReadAllText($script:DbFile, [Text.Encoding]::UTF8) | ConvertFrom-Json
        if ($raw.settings) {
            $rs = $raw.settings
            if ($rs.cardSize) { $script:settings['cardSize'] = [int]$rs.cardSize }
            if ($null -ne $rs.volume) { $script:settings['volume'] = [int]$rs.volume }
            if ($null -ne $rs.sounds) { $script:settings['sounds'] = [bool]$rs.sounds }
            if ($null -ne $rs.hoverSounds) { $script:settings['hoverSounds'] = [bool]$rs.hoverSounds }
            if ($null -ne $rs.clickSounds) { $script:settings['clickSounds'] = [bool]$rs.clickSounds }
            if ($null -ne $rs.sidebarCollapsed) { $script:settings['sidebarCollapsed'] = [bool]$rs.sidebarCollapsed }
            if ($null -ne $rs.introAnim) { $script:settings['introAnim'] = [bool]$rs.introAnim }
            if ($null -ne $rs.autoCovers) { $script:settings['autoCovers'] = [bool]$rs.autoCovers }
            if ($null -ne $rs.trayMode) { $script:settings['trayMode'] = [bool]$rs.trayMode }
            if ($rs.theme -eq 'dark' -or $rs.theme -eq 'light' -or $rs.theme -eq 'auto') { $script:settings['theme'] = [string]$rs.theme }
            if (([string]$rs.accent -match '^#[0-9a-fA-F]{6}$') -and (([string]$rs.accent).ToLower() -ne '#fac775' -or [int]$rs.accentV -ge 2)) { $script:settings['accent'] = [string]$rs.accent }
            if (([string]$rs.logo) -match '^#[0-9a-fA-F]{6}$') { $script:settings['logo'] = [string]$rs.logo }
            if ($null -ne $rs.bgfx) { $script:settings['bgfx'] = [bool]$rs.bgfx }
            if ($null -ne $rs.animations) { $script:settings['animations'] = [bool]$rs.animations }
            if ($null -ne $rs.effects) { $script:settings['effects'] = [bool]$rs.effects }
            if ($rs.achievements) { foreach ($ap in $rs.achievements.PSObject.Properties) { if ($ap.Name -match '^[a-z0-9_]{1,40}$') { $script:settings['achievements'][$ap.Name] = ([string]$ap.Value) } } }
            if ($null -ne $rs.ambient) { $script:settings['ambient'] = [bool]$rs.ambient }
            if ($null -ne $rs.slideshow) { $script:settings['slideshow'] = [bool]$rs.slideshow }
            if ($null -ne $rs.breakReminder) { $script:settings['breakReminder'] = [Math]::Min(12, [Math]::Max(0, [int]$rs.breakReminder)) }
        }
        if ($raw.daily) { foreach ($dp in $raw.daily.PSObject.Properties) { if ($dp.Name -match '^\d{4}-\d{2}-\d{2}$') { $script:daily[$dp.Name] = [long]$dp.Value } } }
        foreach ($g in @($raw.games)) { if ($g) { [void]$script:games.Add((New-GameFromObj $g)) } }
        foreach ($c in @($raw.categories)) { if ($c -and $c.name) { [void]$script:categories.Add([ordered]@{ name = [string]$c.name; color = [string]$c.color; icon = $(if ($c.icon) { [string]$c.icon } else { 'tag' }) }) } }
    } catch { Write-Log "Lecture bibliotheque impossible : $($_.Exception.Message)" }
}

function Save-Db {
    try {
        $obj = [ordered]@{ games = @($script:games.ToArray()); categories = @($script:categories.ToArray()); settings = $script:settings; daily = $script:daily }
        $json = $obj | ConvertTo-Json -Depth 6
        $tmp = "$($script:DbFile).tmp"
        [IO.File]::WriteAllText($tmp, $json, (New-Object Text.UTF8Encoding($false)))
        Move-Item -LiteralPath $tmp -Destination $script:DbFile -Force
    } catch { Write-Log "Sauvegarde impossible : $($_.Exception.Message)" }
}

# Couleur par defaut d'une categorie : meme calcul que l'interface
function Get-DefaultCatColor($name) {
    [uint64]$x = 0
    foreach ($ch in ([string]$name).ToCharArray()) { $x = ($x * 31 + [uint64][int]$ch) % 4294967296 }
    return $script:CatPalette[[int]($x % [uint64]$script:CatPalette.Count)]
}

# Toute categorie utilisee par un jeu existe dans la liste (et la casse est unifiee)
function Sync-Categories {
    $changed = $false
    foreach ($g in $script:games) {
        $n = [string]$g['category']
        if (-not $n) { continue }
        $found = $false
        foreach ($c in $script:categories) {
            if ($c['name'] -ieq $n) {
                $found = $true
                if ($c['name'] -cne $n) { $g['category'] = $c['name']; $changed = $true }
                break
            }
        }
        if (-not $found) {
            [void]$script:categories.Add([ordered]@{ name = $n; color = (Get-DefaultCatColor $n); icon = 'tag' })
            $changed = $true
        }
    }
    if ($changed) { Save-Db }
}

function Find-Game($id) {
    foreach ($g in $script:games) { if ($g['id'] -eq $id) { return $g } }
    return $null
}

function Import-Cover($src) {
    if (-not $src -or -not (Test-Path -LiteralPath $src)) { return $null }
    $ext = [IO.Path]::GetExtension($src).ToLower()
    if (-not $ext) { $ext = '.png' }
    $dest = Join-Path $script:CoversDir ([guid]::NewGuid().ToString() + $ext)
    Copy-Item -LiteralPath $src -Destination $dest -Force
    return $dest
}
function Remove-Cover($p) {
    try {
        if ($p -and $p.StartsWith($script:CoversDir) -and (Test-Path -LiteralPath $p)) { Remove-Item -LiteralPath $p -Force }
    } catch {}
}

function Get-PublicGame($g) {
    $o = [ordered]@{}
    foreach ($k in $g.Keys) { $o[$k] = $g[$k] }
    $coverUrl = $null
    if ($g['cover'] -and (Test-Path -LiteralPath $g['cover'])) {
        $coverUrl = '/cover/' + [Uri]::EscapeDataString((Split-Path -Leaf $g['cover'])) + '?t=' + $script:token
    }
    $iconUrl = $null
    if ($g['icon'] -and (Test-Path -LiteralPath $g['icon'])) {
        $iconUrl = '/icon/' + [Uri]::EscapeDataString((Split-Path -Leaf $g['icon'])) + '?t=' + $script:token
    }
    $o['iconUrl'] = $iconUrl
    $exists = $true
    if (-not (Test-IsUri $g['target'])) { $exists = [bool](Test-Path -LiteralPath $g['target']) }
    $o['coverUrl'] = $coverUrl
    $o['exists'] = $exists
    return $o
}

# ---------- Icones HD des jeux / raccourcis ----------
$script:IconsOk = $false
try {
    Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class ArcadeIcons
{
    [StructLayout(LayoutKind.Sequential)]
    public struct SIZE { public int cx; public int cy; }

    [ComImport]
    [Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellItemImageFactory
    {
        [PreserveSig]
        int GetImage(SIZE size, int flags, out IntPtr phbm);
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    static extern void SHCreateItemFromParsingName(string path, IntPtr pbc, ref Guid riid,
        [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory ppv);

    [DllImport("gdi32.dll")]
    static extern bool DeleteObject(IntPtr h);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern uint PrivateExtractIcons(string file, int index, int cx, int cy, IntPtr[] phicon, int[] piconid, uint nIcons, uint flags);

    [DllImport("user32.dll")]
    static extern bool DestroyIcon(IntPtr h);

    // Icone systeme la plus grande (jusqu'a 256x256, avec transparence)
    public static Bitmap FromShell(string path, int size)
    {
        Guid iid = new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b");
        IShellItemImageFactory f;
        SHCreateItemFromParsingName(path, IntPtr.Zero, ref iid, out f);
        SIZE s; s.cx = size; s.cy = size;
        IntPtr hbm;
        int hr = f.GetImage(s, 4, out hbm); // SIIGBF_ICONONLY
        Marshal.ReleaseComObject(f);
        if (hr != 0 || hbm == IntPtr.Zero) return null;
        try { return ToArgb(hbm); } finally { DeleteObject(hbm); }
    }

    // Icone precise d'un .exe / .dll / .ico (index donne par un raccourci)
    public static Bitmap FromIndex(string file, int index, int size)
    {
        IntPtr[] h = new IntPtr[1];
        int[] id = new int[1];
        uint n = PrivateExtractIcons(file, index, size, size, h, id, 1, 0);
        if (n == 0 || n == 0xFFFFFFFF || h[0] == IntPtr.Zero) return null;
        try
        {
            using (Icon ic = Icon.FromHandle(h[0]))
            using (Bitmap b = ic.ToBitmap()) { return new Bitmap(b); }
        }
        finally { DestroyIcon(h[0]); }
    }

    static Bitmap ToArgb(IntPtr hbm)
    {
        Bitmap bmp = Image.FromHbitmap(hbm);
        try
        {
            int w = bmp.Width, h = bmp.Height;
            Rectangle r = new Rectangle(0, 0, w, h);
            if (Image.GetPixelFormatSize(bmp.PixelFormat) < 32) return new Bitmap(bmp);
            BitmapData src = bmp.LockBits(r, ImageLockMode.ReadOnly, bmp.PixelFormat);
            Bitmap res = new Bitmap(w, h, PixelFormat.Format32bppArgb);
            BitmapData dst = res.LockBits(r, ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            try
            {
                byte[] row = new byte[w * 4];
                bool anyAlpha = false;
                byte[] all = new byte[w * 4 * h];
                for (int y = 0; y < h; y++)
                {
                    Marshal.Copy(IntPtr.Add(src.Scan0, y * src.Stride), row, 0, row.Length);
                    for (int x = 3; x < row.Length; x += 4) { if (row[x] != 0) anyAlpha = true; }
                    Buffer.BlockCopy(row, 0, all, y * row.Length, row.Length);
                }
                if (!anyAlpha) { for (int i = 3; i < all.Length; i += 4) all[i] = 255; }
                for (int y = 0; y < h; y++)
                    Marshal.Copy(all, y * w * 4, IntPtr.Add(dst.Scan0, y * dst.Stride), w * 4);
            }
            finally { bmp.UnlockBits(src); res.UnlockBits(dst); }
            return res;
        }
        finally { bmp.Dispose(); }
    }
}
'@
    $script:IconsOk = $true
} catch { Write-Log "Module d'icones indisponible : $($_.Exception.Message)" }

function Get-IconSource($target) {
    $ext = [IO.Path]::GetExtension($target).ToLower()
    try {
        if ($ext -eq '.lnk') {
            $sh = New-Object -ComObject WScript.Shell
            $l = $sh.CreateShortcut($target)
            $loc = [string]$l.IconLocation
            $tp = [string]$l.TargetPath
            if ($loc) {
                $parts = $loc.Split(',')
                $ip = [Environment]::ExpandEnvironmentVariables($parts[0].Trim())
                $ix = 0
                if ($parts.Count -gt 1) { [void][int]::TryParse($parts[$parts.Count - 1].Trim(), [ref]$ix) }
                if ($ip -and (Test-Path -LiteralPath $ip -PathType Leaf)) { return @{ path = $ip; index = $ix } }
            }
            if ($tp -and (Test-Path -LiteralPath $tp -PathType Leaf)) { return @{ path = $tp; index = 0 } }
        }
        elseif ($ext -eq '.url') {
            $f = ''; $ix = 0
            foreach ($line in [IO.File]::ReadAllLines($target)) {
                if ($line -match '^\s*IconFile\s*=\s*(.+)$') { $f = $Matches[1].Trim() }
                elseif ($line -match '^\s*IconIndex\s*=\s*(-?\d+)') { $ix = [int]$Matches[1] }
            }
            $f = [Environment]::ExpandEnvironmentVariables($f)
            if ($f -and (Test-Path -LiteralPath $f -PathType Leaf)) { return @{ path = $f; index = $ix } }
        }
    } catch { Write-Log "Lecture raccourci impossible : $($_.Exception.Message)" }
    return @{ path = $target; index = 0 }
}

function Save-IconFor($target) {
    if (-not $script:IconsOk) { return $null }
    if ((Test-IsUri $target) -or -not (Test-Path -LiteralPath $target -PathType Leaf)) { return $null }
    $src = Get-IconSource $target
    $bmp = $null
    try {
        if ($src.index -ne 0 -and ($src.path -match '\.(exe|dll|ico|icl)$')) {
            try { $bmp = [ArcadeIcons]::FromIndex($src.path, $src.index, 256) } catch {}
        }
        if (-not $bmp) { try { $bmp = [ArcadeIcons]::FromShell($src.path, 256) } catch {} }
        if (-not $bmp) {
            $ic = [System.Drawing.Icon]::ExtractAssociatedIcon($src.path)
            if ($ic) { $bmp = $ic.ToBitmap() }
        }
        if (-not $bmp) { return $null }
        $out = Join-Path $script:IconsDir ([guid]::NewGuid().ToString() + '.png')
        $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
        return $out
    } catch {
        Write-Log "Icone impossible pour $target : $($_.Exception.Message)"
        return $null
    } finally {
        if ($bmp) { $bmp.Dispose() }
    }
}
function Remove-Icon($p) {
    try {
        if ($p -and $p.StartsWith($script:IconsDir) -and (Test-Path -LiteralPath $p)) { Remove-Item -LiteralPath $p -Force }
    } catch {}
}
function Update-GameIcon($g) {
    $new = Save-IconFor $g['target']
    $g['iconTried'] = $true
    if ($new) { Remove-Icon $g['icon']; $g['icon'] = $new; return $true }
    return $false
}

# ---------- Couvertures automatiques (Steam) ----------
function Get-Norm($s) {
    $t = ([string]$s).ToLower()
    $t = $t -replace '[\u2122\u00ae\u00a9]', ''
    $t = $t -replace '[^a-z0-9]+', ' '
    return $t.Trim()
}
function Test-NameMatch($a, $b) {
    $x = Get-Norm $a; $y = Get-Norm $b
    if (-not $x -or -not $y) { return $false }
    if ($x -eq $y) { return $true }
    $tx = @($x -split ' '); $ty = @($y -split ' ')
    $common = @($tx | Where-Object { $ty -contains $_ }).Count
    $score = $common / [Math]::Max($tx.Count, $ty.Count)
    return ($score -ge 0.66)
}
function Find-SteamAppId($name) {
    $q = [Uri]::EscapeDataString($name)
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 -Uri "https://store.steampowered.com/api/storesearch/?term=$q&l=english&cc=us"
    $json = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json
    $items = @($json.items)
    foreach ($i in $items) { if ((Get-Norm $i.name) -eq (Get-Norm $name)) { return [int]$i.id } }
    foreach ($i in $items) { if (Test-NameMatch $i.name $name) { return [int]$i.id } }
    return 0
}
function Save-SteamCover($appId) {
    $bases = @('https://cdn.cloudflare.steamstatic.com/steam/apps', 'https://cdn.akamai.steamstatic.com/steam/apps', 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps')
    foreach ($f in @('library_600x900_2x.jpg', 'library_600x900.jpg')) {
        foreach ($b in $bases) {
            try {
                $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 15 -Uri "$b/$appId/$f"
                $bytes = [byte[]]$r.Content
                if ($bytes -and $bytes.Length -gt 8000 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xD8) {
                    $dest = Join-Path $script:CoversDir ([guid]::NewGuid().ToString() + '.jpg')
                    [IO.File]::WriteAllBytes($dest, $bytes)
                    return $dest
                }
            } catch {}
        }
    }
    return $null
}
function Invoke-FetchCover($g, $force, $query) {
    $appId = 0
    $tgt = [string]$g['target']
    if (-not (Test-IsUri $tgt) -and $tgt.ToLower().EndsWith('.url') -and (Test-Path -LiteralPath $tgt)) {
        try { foreach ($line in [IO.File]::ReadAllLines($tgt)) { if ($line -match '^\s*URL\s*=\s*(steam://.+)$') { $tgt = $Matches[1].Trim(); break } } } catch {}
    }
    if ((Test-IsUri $tgt) -and ($tgt -match '^steam://(?:rungameid|run)/(\d+)')) { $appId = [int]$Matches[1] }
    if ($appId -eq 0) {
        $name = if ($query) { [string]$query } else { [string]$g['name'] }
        $name = ($name -replace '(?i)\b(launcher|win64|win32|x64|x86|shipping|client)\b', ' ') -replace '\s+', ' '
        $name = $name.Trim()
        if (-not $name) { $g['coverTried'] = $true; Save-Db; return @{ ok = $true; found = $false } }
        try { $appId = Find-SteamAppId $name }
        catch { Write-Log "Recherche Steam impossible : $($_.Exception.Message)"; return @{ ok = $false; offline = $true } }
    }
    $file = $null
    if ($appId -gt 0) { $file = Save-SteamCover $appId }
    $g['coverTried'] = $true
    if ($file) {
        Remove-Cover $g['cover']
        $g['cover'] = $file
        Save-Db
        return @{ ok = $true; found = $true }
    }
    Save-Db
    return @{ ok = $true; found = $false }
}

# ---------- Scan de dossier ----------
$script:scanFound = $null
function Walk-Dir($dir, $depth, $root) {
    $exes = @(Get-ChildItem -LiteralPath $dir -Filter *.exe -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch $script:SkipRe } | Sort-Object Length -Descending)
    if ($exes.Count -gt 0) {
        if ((Split-Path -Leaf $dir) -eq (Split-Path -Leaf $root)) { $name = Get-NameFromPath $exes[0].FullName }
        else { $name = Split-Path -Leaf $dir }
        [void]$script:scanFound.Add([ordered]@{ target = $exes[0].FullName; name = $name })
    }
    if ($depth -lt 2) {
        $subs = @(Get-ChildItem -LiteralPath $dir -Directory -ErrorAction SilentlyContinue | Where-Object { -not $_.Name.StartsWith('.') })
        foreach ($d in $subs) { Walk-Dir $d.FullName ($depth + 1) $root }
    }
}
function Invoke-Scan($folder) {
    $script:scanFound = New-Object System.Collections.ArrayList
    if ($folder -and (Test-Path -LiteralPath $folder -PathType Container)) { Walk-Dir $folder 0 $folder }
    $out = @()
    foreach ($f in $script:scanFound) {
        $known = $false
        foreach ($g in $script:games) { if ($g['target'] -ieq $f['target']) { $known = $true; break } }
        if (-not $known) { $out += , $f }
    }
    return $out
}

# ---------- Import des lanceurs (Steam, Epic, GOG) ----------
function Get-SteamGames {
    $out = New-Object System.Collections.ArrayList
    $root = $null
    foreach ($k in @('HKCU:\Software\Valve\Steam', 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam', 'HKLM:\SOFTWARE\Valve\Steam')) {
        try {
            $p = Get-ItemProperty -Path $k -ErrorAction Stop
            $v = $null
            if ($p.SteamPath) { $v = [string]$p.SteamPath } elseif ($p.InstallPath) { $v = [string]$p.InstallPath }
            if ($v) { $v = $v -replace '/', '\'; if (Test-Path -LiteralPath $v) { $root = $v; break } }
        } catch {}
    }
    if (-not $root) { return @() }
    $libs = New-Object System.Collections.ArrayList
    [void]$libs.Add($root)
    $vdf = Join-Path $root 'steamapps\libraryfolders.vdf'
    if (Test-Path -LiteralPath $vdf) {
        try {
            foreach ($line in [IO.File]::ReadAllLines($vdf)) {
                if ($line -match '^\s*"path"\s+"(.+)"\s*$') {
                    $lp = ($Matches[1] -replace '\\\\', '\')
                    if ((Test-Path -LiteralPath $lp) -and -not ($libs -contains $lp)) { [void]$libs.Add($lp) }
                }
            }
        } catch {}
    }
    foreach ($lib in $libs) {
        $sa = Join-Path $lib 'steamapps'
        $files = @(Get-ChildItem -LiteralPath $sa -Filter 'appmanifest_*.acf' -File -ErrorAction SilentlyContinue)
        foreach ($f in $files) {
            try {
                $txt = [IO.File]::ReadAllText($f.FullName)
                $id = ''; $nm = ''; $flags = 4
                if ($txt -match '"appid"\s+"(\d+)"') { $id = $Matches[1] }
                if ($txt -match '"name"\s+"([^"]+)"') { $nm = $Matches[1] }
                if ($txt -match '"StateFlags"\s+"(\d+)"') { $flags = [int]$Matches[1] }
                if (-not $id -or -not $nm) { continue }
                if (($flags -band 4) -eq 0) { continue }
                if ($nm -match '^(Steamworks Common Redistributables|Proton|Steam Linux Runtime|Steam Controller Configs|Steam 360 Video Player|SteamVR)') { continue }
                [void]$out.Add([ordered]@{ launcher = 'steam'; name = $nm; target = ('steam://rungameid/' + $id); key = ('steam:' + $id) })
            } catch {}
        }
    }
    return @($out)
}
function Get-EpicGames {
    $out = New-Object System.Collections.ArrayList
    $dir = Join-Path $env:ProgramData 'Epic\EpicGamesLauncher\Data\Manifests'
    if (-not (Test-Path -LiteralPath $dir)) { return @() }
    $files = @(Get-ChildItem -LiteralPath $dir -Filter '*.item' -File -ErrorAction SilentlyContinue)
    foreach ($f in $files) {
        try {
            $j = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8) | ConvertFrom-Json
            if ($j.bIsIncompleteInstall) { continue }
            $nm = [string]$j.DisplayName
            if (-not $nm -or -not $j.LaunchExecutable -or -not $j.AppName) { continue }
            if ($nm -match '^Unreal Engine') { continue }
            $uri = 'com.epicgames.launcher://apps/' + $j.CatalogNamespace + '%3A' + $j.CatalogItemId + '%3A' + $j.AppName + '?action=launch&silent=true'
            [void]$out.Add([ordered]@{ launcher = 'epic'; name = $nm; target = $uri; key = ('epic:' + [string]$j.AppName) })
        } catch {}
    }
    return @($out)
}
function Get-GogGames {
    $out = New-Object System.Collections.ArrayList
    foreach ($base in @('HKLM:\SOFTWARE\WOW6432Node\GOG.com\Games', 'HKLM:\SOFTWARE\GOG.com\Games')) {
        if (-not (Test-Path -Path $base)) { continue }
        foreach ($k in @(Get-ChildItem -Path $base -ErrorAction SilentlyContinue)) {
            try {
                $p = Get-ItemProperty -Path $k.PSPath
                $exe = [string]$p.exe; $nm = [string]$p.gameName
                if (-not $exe -or -not $nm) { continue }
                if (-not (Test-Path -LiteralPath $exe)) { continue }
                [void]$out.Add([ordered]@{ launcher = 'gog'; name = $nm; target = $exe; key = ('gog:' + $k.PSChildName) })
            } catch {}
        }
        break
    }
    return @($out)
}
function Invoke-DetectLaunchers {
    $known = @{}
    $knownSteam = @{}
    foreach ($g in $script:games) {
        $t = [string]$g['target']
        $known[$t.ToLower()] = $true
        if ($t -match '^steam://(?:rungameid|run)/(\d+)') { $knownSteam[$Matches[1]] = $true }
    }
    $all = New-Object System.Collections.ArrayList
    $counts = [ordered]@{ steam = 0; epic = 0; gog = 0 }
    $total = [ordered]@{ steam = 0; epic = 0; gog = 0 }
    foreach ($src in @('steam', 'epic', 'gog')) {
        $list = @()
        try {
            if ($src -eq 'steam') { $list = @(Get-SteamGames) }
            elseif ($src -eq 'epic') { $list = @(Get-EpicGames) }
            else { $list = @(Get-GogGames) }
        } catch { Write-Log "Detection $src : $($_.Exception.Message)" }
        $total[$src] = $list.Count
        foreach ($it in $list) {
            $dup = $known.ContainsKey(([string]$it['target']).ToLower())
            if (-not $dup -and $src -eq 'steam' -and ([string]$it['target']) -match 'rungameid/(\d+)') { if ($knownSteam.ContainsKey($Matches[1])) { $dup = $true } }
            if ($dup) { continue }
            [void]$all.Add($it)
            $counts[$src] = [int]$counts[$src] + 1
        }
    }
    $sorted = @($all | Sort-Object { $_['launcher'] }, { $_['name'] })
    return @{ items = $sorted; counts = $counts; total = $total }
}

# ---------- Lancement ----------
function Invoke-Launch($id) {
    $g = Find-Game $id
    if (-not $g) { return @{ ok = $false; error = 'Jeu introuvable.' } }
    if ($script:running.ContainsKey($id)) {
        $ex = $script:running[$id]
        if ($ex.ContainsKey('watchDir') -and -not $ex['seen']) { $script:running.Remove($id) }
        else { return @{ ok = $false; error = 'Ce jeu est deja en cours.' } }
    }
    try {
        $t = $g['target']
        if (Test-IsUri $t) {
            if (-not (Test-AllowedScheme $t)) { return @{ ok = $false; error = 'Protocole non autorise.' } }
            Start-Process $t
            $wd = Get-WatchDir $t
            if ($wd) { $script:running[$id] = @{ proc = $null; watchDir = $wd; start = (Get-Date); last = (Get-Date); seen = $false; lastSeen = $null; nextCheck = (Get-Date).AddSeconds(5) } }
        } else {
            if (-not (Test-Path -LiteralPath $t)) { return @{ ok = $false; error = 'Fichier introuvable. Il a peut-etre ete deplace.' } }
            $ext = [IO.Path]::GetExtension($t).ToLower()
            $psi = New-Object System.Diagnostics.ProcessStartInfo
            $psi.FileName = $t
            $psi.WorkingDirectory = (Split-Path -Parent $t)
            $psi.UseShellExecute = $true
            if ($ext -eq '.exe' -and $g['args']) { $psi.Arguments = [string]$g['args'] }
            if ($g['runAs'] -and ($ext -eq '.exe' -or $ext -eq '.bat' -or $ext -eq '.cmd')) { $psi.Verb = 'runas' }
            $p = [System.Diagnostics.Process]::Start($psi)
            if ($p -and ($ext -eq '.exe' -or $ext -eq '.lnk' -or $ext -eq '.bat' -or $ext -eq '.cmd')) { $script:running[$id] = @{ proc = $p; start = (Get-Date); last = (Get-Date) } }
        }
        $g['lastPlayed'] = Get-NowMs
        $g['launches'] = [int]$g['launches'] + 1
        Save-Db
        return @{ ok = $true }
    } catch {
        $ex = $_.Exception
        if ($ex.InnerException) { $ex = $ex.InnerException }
        if (($ex -is [System.ComponentModel.Win32Exception]) -and $ex.NativeErrorCode -eq 1223) {
            return @{ ok = $false; error = 'Lancement annule : autorisation administrateur refusee.' }
        }
        return @{ ok = $false; error = $_.Exception.Message }
    }
}

function Get-SteamLibraries {
    $root = $null
    foreach ($k in @('HKCU:\Software\Valve\Steam', 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam', 'HKLM:\SOFTWARE\Valve\Steam')) {
        try {
            $p = Get-ItemProperty -Path $k -ErrorAction Stop
            $v = $null
            if ($p.SteamPath) { $v = [string]$p.SteamPath } elseif ($p.InstallPath) { $v = [string]$p.InstallPath }
            if ($v) { $v = $v -replace '/', '\'; if (Test-Path -LiteralPath $v) { $root = $v; break } }
        } catch {}
    }
    $libs = New-Object System.Collections.ArrayList
    if (-not $root) { return @() }
    [void]$libs.Add($root)
    $vdf = Join-Path $root 'steamapps\libraryfolders.vdf'
    if (Test-Path -LiteralPath $vdf) {
        try {
            foreach ($line in [IO.File]::ReadAllLines($vdf)) {
                if ($line -match '^\s*"path"\s+"(.+)"\s*$') {
                    $lp = ($Matches[1] -replace '\\\\', '\')
                    if ((Test-Path -LiteralPath $lp) -and -not ($libs -contains $lp)) { [void]$libs.Add($lp) }
                }
            }
        } catch {}
    }
    return @($libs)
}
# Dossier d'installation d'un jeu lance via Steam / Epic : sert a detecter quand le jeu tourne (temps de jeu)
function Get-WatchDir($target) {
    try {
        if ($target -match '^steam://(?:rungameid|run)/(\d+)') {
            $id = $Matches[1]
            foreach ($lib in @(Get-SteamLibraries)) {
                $mf = Join-Path $lib ('steamapps\appmanifest_' + $id + '.acf')
                if (Test-Path -LiteralPath $mf) {
                    $txt = [IO.File]::ReadAllText($mf)
                    if ($txt -match '"installdir"\s+"([^"]+)"') {
                        $d = Join-Path $lib ('steamapps\common\' + $Matches[1])
                        if (Test-Path -LiteralPath $d) { return $d }
                    }
                }
            }
        }
        elseif ($target -match '^com\.epicgames\.launcher://apps/[^%]*%3A[^%]*%3A([^?]+)') {
            $app = $Matches[1]
            $dir = Join-Path $env:ProgramData 'Epic\EpicGamesLauncher\Data\Manifests'
            foreach ($f in @(Get-ChildItem -LiteralPath $dir -Filter '*.item' -File -ErrorAction SilentlyContinue)) {
                $j = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8) | ConvertFrom-Json
                if ([string]$j.AppName -eq $app -and $j.InstallLocation -and (Test-Path -LiteralPath ([string]$j.InstallLocation))) { return [string]$j.InstallLocation }
            }
        }
    } catch { Write-Log "Get-WatchDir : $($_.Exception.Message)" }
    return $null
}
function Test-WatchDirActive($dir) {
    $prefix = ($dir.TrimEnd('\') + '\')
    foreach ($p in @(Get-Process -ErrorAction SilentlyContinue)) {
        $path = $null
        try { $path = $p.Path } catch { continue }
        if ($path -and $path.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { return $true }
    }
    return $false
}
function Add-PlayTime($g, [int]$secs) {
    if ($secs -le 0) { return }
    $g['playtime'] = [long]$g['playtime'] + $secs
    $dk = (Get-Date).ToString('yyyy-MM-dd')
    $script:daily[$dk] = [long]$script:daily[$dk] + $secs
    if ($script:daily.Count -gt 400) { foreach ($old in @($script:daily.Keys | Sort-Object | Select-Object -First ($script:daily.Count - 400))) { $script:daily.Remove($old) } }
    $script:playDirty = $true
}
$script:playDirty = $false
$script:lastPlaySave = Get-Date
# Le temps de jeu est compte EN DIRECT (toutes les quelques secondes), pas seulement a la fermeture du jeu.
function Update-Running {
    $now = Get-Date
    foreach ($id in @($script:running.Keys)) {
        $r = $script:running[$id]
        $alive = $true
        $endAt = $now
        if ($r.ContainsKey('watchDir')) {
            if ($now -lt $r['nextCheck']) { $alive = $null }
            else {
                $r['nextCheck'] = $now.AddSeconds(4)
                if (Test-WatchDirActive $r['watchDir']) {
                    if (-not $r['seen']) { $r['seen'] = $true; $r['start'] = $now; $r['last'] = $now; $script:changed = $true }
                    $r['lastSeen'] = $now
                }
                elseif (-not $r['seen']) { $alive = (($now - $r['start']).TotalSeconds -lt 240) }
                else { $alive = (($now - $r['lastSeen']).TotalSeconds -lt 12); $endAt = $r['lastSeen'] }
            }
        } else {
            try { $alive = -not $r.proc.HasExited } catch { $alive = $false }
        }
        if ($null -eq $alive) { continue }
        $g = Find-Game $id
        $counting = ((-not $r.ContainsKey('watchDir')) -or $r['seen'])
        # Les lanceurs qui se relancent eux-memes quittent vite : on ignore < 15 s
        if ($g -and $counting -and (($endAt - $r['start']).TotalSeconds -ge 15)) {
            $delta = [int][Math]::Floor(($endAt - $r['last']).TotalSeconds)
            if ($delta -ge 1) { Add-PlayTime $g $delta; $r['last'] = $r['last'].AddSeconds($delta) }
        }
        if (-not $alive) { $script:running.Remove($id); $script:changed = $true; $script:lastPlaySave = [datetime]::MinValue }
    }
    if ($script:playDirty -and (($now - $script:lastPlaySave).TotalSeconds -ge 10)) {
        Save-Db
        $script:playDirty = $false
        $script:lastPlaySave = $now
    }
}

# ---------- Systeme : demarrage Windows, zone de notification, rappels ----------
$script:StartupLnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'Arcade.lnk'
function Test-Startup { return [bool](Test-Path -LiteralPath $script:StartupLnk) }
function Set-Startup([bool]$on) {
    if ($on) {
        $root = Split-Path -Parent $script:AppDir
        $vbs = Join-Path $root 'Arcade.vbs'
        $sh = New-Object -ComObject WScript.Shell
        $l = $sh.CreateShortcut($script:StartupLnk)
        $l.TargetPath = Join-Path $env:SystemRoot 'System32\wscript.exe'
        $arg = '"' + $vbs + '"'
        if ($script:settings['trayMode']) { $arg += ' background' }
        $l.Arguments = $arg
        $l.WorkingDirectory = $root
        $l.IconLocation = (Join-Path $script:AppDir 'icon.ico')
        $l.Description = 'Arcade - lanceur de jeux'
        $l.Save()
    } else {
        Remove-Item -LiteralPath $script:StartupLnk -Force -ErrorAction SilentlyContinue
    }
}

function Ensure-Tray {
    if ($script:Tray) { return }
    $ni = New-Object System.Windows.Forms.NotifyIcon
    try { $ni.Icon = New-Object System.Drawing.Icon((Join-Path $script:AppDir 'icon.ico')) } catch { $ni.Icon = [System.Drawing.SystemIcons]::Application }
    $ni.Text = 'Arcade'
    $menu = New-Object System.Windows.Forms.ContextMenuStrip
    $i1 = $menu.Items.Add('Ouvrir Arcade')
    $i1.add_Click({ $script:openReq = $true })
    [void]$menu.Items.Add('-')
    $i2 = $menu.Items.Add('Quitter Arcade')
    $i2.add_Click({ $script:quit = $true })
    $ni.ContextMenuStrip = $menu
    $ni.add_MouseClick({ param($sender, $e) if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) { $script:openReq = $true } })
    $ni.Visible = $true
    $script:Tray = $ni
}
function Remove-Tray {
    if ($script:Tray) {
        try { $script:Tray.Visible = $false; $script:Tray.Dispose() } catch {}
        $script:Tray = $null
    }
}
function Set-TrayMode([bool]$on) {
    if ($on) { Ensure-Tray; $script:TrayTemp = $false }
    else { Remove-Tray }
    # le raccourci de demarrage depend de ce reglage (demarrage discret seulement avec l'icone)
    if (Test-Startup) { Set-Startup $true }
}
function Show-Notice($title, $text) {
    try {
        $created = $false
        if (-not $script:Tray) { Ensure-Tray; $created = $true }
        if ($created -and -not $script:settings['trayMode']) { $script:TrayTemp = $true }
        $script:Tray.ShowBalloonTip(9000, $title, $text, [System.Windows.Forms.ToolTipIcon]::Info)
        if ($script:TrayTemp) { $script:TrayTempUntil = (Get-Date).AddSeconds(15) }
    } catch { Write-Log "Notification impossible : $($_.Exception.Message)" }
}
function Check-Reminders {
    $h = [int]$script:settings['breakReminder']
    if ($h -le 0) { return }
    $now = Get-Date
    foreach ($id in @($script:running.Keys)) {
        $r = $script:running[$id]
        if (-not $r.ContainsKey('next')) { $r['next'] = $r.start.AddHours($h) }
        if ($now -ge $r['next']) {
            $hours = [Math]::Max(1, [int][Math]::Round(($now - $r.start).TotalHours))
            while ($r['next'] -le $now) { $r['next'] = $r['next'].AddHours($h) }
            $g = Find-Game $id
            if ($g) {
                [void]$script:notices.Add(@{ game = [string]$g['name']; hours = $hours })
                Show-Notice "Arcade - pause conseill$([char]0xE9)e" ("Tu joues $([char]0xE0) " + $g['name'] + " depuis environ $hours h. Pense $([char]0xE0) faire une pause !")
            }
        }
    }
}

# ---------- Boites de dialogue ----------
function New-DialogOwner {
    $f = New-Object System.Windows.Forms.Form
    $f.TopMost = $true
    $f.ShowInTaskbar = $false
    return $f
}

# ---------- API ----------
function Invoke-Api($name, $body) {
    switch ($name) {
        'bye' {
            $script:byeAt = Get-Date
            return @{ ok = $true }
        }
        'ping' {
            $script:lastPing = Get-Date
            $script:byeAt = $null
            $script:everPinged = $true
            $c = $script:changed
            $script:changed = $false
            $nt = @($script:notices.ToArray())
            $script:notices.Clear()
            return @{ ok = $true; changed = $c; notices = $nt }
        }
        'library' {
            Sync-Categories
            $list = @()
            foreach ($g in $script:games) { $list += , (Get-PublicGame $g) }
            $st = $script:settings.Clone()
            $st['startWithWindows'] = (Test-Startup)
            return [ordered]@{ version = $script:Version; games = $list; categories = @($script:categories.ToArray()); settings = $st; running = @($script:running.Keys | Where-Object { -not $script:running[$_].ContainsKey('watchDir') -or $script:running[$_]['seen'] }); daily = $script:daily }
        }
        'pickGame' {
            $owner = New-DialogOwner
            $dlg = New-Object System.Windows.Forms.OpenFileDialog
            $dlg.Title = 'Choisir un jeu'
            $dlg.Multiselect = $true
            $dlg.Filter = 'Jeux et raccourcis (*.exe;*.lnk;*.bat;*.cmd;*.url)|*.exe;*.lnk;*.bat;*.cmd;*.url|Tous les fichiers (*.*)|*.*'
            $paths = @()
            if ($dlg.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { $paths = @($dlg.FileNames) }
            $owner.Dispose()
            return @{ paths = $paths }
        }
        'pickCover' {
            $owner = New-DialogOwner
            $dlg = New-Object System.Windows.Forms.OpenFileDialog
            $dlg.Title = 'Choisir une image'
            $dlg.Filter = 'Images (*.png;*.jpg;*.jpeg;*.webp;*.gif;*.bmp)|*.png;*.jpg;*.jpeg;*.webp;*.gif;*.bmp'
            $res = @{ path = $null; data = $null }
            if ($dlg.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
                $res.path = $dlg.FileName
                $ext = [IO.Path]::GetExtension($dlg.FileName).TrimStart('.').ToLower()
                if ($ext -eq 'jpg') { $ext = 'jpeg' }
                $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($dlg.FileName))
                $res.data = "data:image/$ext;base64,$b64"
            }
            $owner.Dispose()
            return $res
        }
        'pickFolder' {
            $owner = New-DialogOwner
            $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
            $dlg.Description = 'Choisir un dossier de jeux'
            $p = $null
            if ($dlg.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { $p = $dlg.SelectedPath }
            $owner.Dispose()
            return @{ path = $p }
        }
        'add' {
            $added = 0
            foreach ($it in @($body.items)) {
                if (-not $it -or -not $it.target) { continue }
                $t = ([string]$it.target).Trim()
                if (-not $t) { continue }
                if ((Test-IsUri $t) -and -not (Test-AllowedScheme $t)) { continue }
                $dup = $false
                foreach ($g in $script:games) { if ($g['target'] -ieq $t) { $dup = $true; break } }
                if ($dup) { continue }
                $nm = if ($it.name) { [string]$it.name } else { Get-NameFromPath $t }
                $cv = $null
                if ($it.cover) { $cv = Import-Cover ([string]$it.cover) }
                $ico = Save-IconFor $t
                $new = [ordered]@{
                    id = [guid]::NewGuid().ToString(); name = (Limit-Text $nm.Trim() 80); target = $t; args = ''
                    category = (Limit-Text ([string]$it.category).Trim() 30); cover = $cv; coverTried = [bool]$cv; icon = $ico; iconTried = $true; favorite = $false
                    playtime = [long]0; lastPlayed = $null; launches = 0; runAs = $false; finished = $false; addedAt = (Get-NowMs)
                }
                [void]$script:games.Add($new)
                $added++
            }
            Save-Db
            return @{ added = $added }
        }
        'update' {
            $g = Find-Game ([string]$body.id)
            if (-not $g -or -not $body.patch) { return @{ ok = $false } }
            $p = $body.patch
            $names = @($p.PSObject.Properties.Name)
            if ($names -contains 'name' -and ([string]$p.name).Trim()) { $g['name'] = Limit-Text ([string]$p.name).Trim() 80 }
            if ($names -contains 'category') { $g['category'] = Limit-Text ([string]$p.category).Trim() 30 }
            if ($names -contains 'args') { $g['args'] = Limit-Text $p.args 500 }
            if ($names -contains 'favorite') { $g['favorite'] = [bool]$p.favorite }
            if ($names -contains 'runAs') { $g['runAs'] = [bool]$p.runAs }
            if ($names -contains 'finished') { $g['finished'] = [bool]$p.finished }
            if ($names -contains 'target' -and ([string]$p.target).Trim()) {
                $t = ([string]$p.target).Trim()
                if (-not (Test-IsUri $t) -or (Test-AllowedScheme $t)) {
                    if ($t -ne $g['target']) { $g['target'] = $t; [void](Update-GameIcon $g) }
                }
            }
            if ($names -contains 'cover') {
                if ($null -eq $p.cover) { Remove-Cover $g['cover']; $g['cover'] = $null }
                else {
                    $np = Import-Cover ([string]$p.cover)
                    if ($np) { Remove-Cover $g['cover']; $g['cover'] = $np }
                }
            }
            Save-Db
            return @{ ok = $true }
        }
        'remove' {
            $g = Find-Game ([string]$body.id)
            if ($g) {
                Remove-Cover $g['cover']; Remove-Icon $g['icon']
                # raccourci depose dans Arcade : on supprime aussi sa copie
                try { if ([string]$g['target'] -like ((Join-Path $script:DataDir 'shortcuts') + '\*')) { Remove-Item -LiteralPath $g['target'] -Force -ErrorAction SilentlyContinue } } catch {}
                $script:games.Remove($g); Save-Db
            }
            return @{ ok = [bool]$g }
        }
        'categories' {
            # renommages appliques en une seule passe (permet d'echanger deux noms)
            $map = @{}
            foreach ($r in @($body.renames)) {
                if ($r -and $r.from -and $r.to) { $map[([string]$r.from).ToLower()] = Limit-Text ([string]$r.to).Trim() 30 }
            }
            if ($map.Count -gt 0) {
                foreach ($g in $script:games) {
                    $k = ([string]$g['category']).ToLower()
                    if ($k -and $map.ContainsKey($k)) { $g['category'] = $map[$k] }
                }
            }
            $new = New-Object System.Collections.ArrayList
            $seen = @{}
            foreach ($c in @($body.list)) {
                if (-not $c -or -not $c.name) { continue }
                $n = (Limit-Text ([string]$c.name).Trim() 30).Trim()
                if (-not $n -or $seen.ContainsKey($n.ToLower())) { continue }
                $seen[$n.ToLower()] = $true
                $col = [string]$c.color
                if ($col -notmatch '^#[0-9a-fA-F]{6}$') { $col = Get-DefaultCatColor $n }
                $ico = [string]$c.icon
                if ($ico -notmatch '^[a-z0-9-]{1,24}$') { $ico = 'tag' }
                [void]$new.Add([ordered]@{ name = $n; color = $col; icon = $ico })
                if ($new.Count -ge 40) { break }
            }
            $script:categories = $new
            # un jeu dont la categorie a ete supprimee devient "sans categorie"
            foreach ($g in $script:games) {
                $k = ([string]$g['category']).ToLower()
                if ($k -and -not $seen.ContainsKey($k)) { $g['category'] = '' }
            }
            Save-Db
            return @{ ok = $true }
        }
        'launch' { return (Invoke-Launch ([string]$body.id)) }
        'fetchCover' {
            $g = Find-Game ([string]$body.id)
            if (-not $g) { return @{ ok = $false } }
            $force = [bool]$body.force
            if (-not $force) {
                if (-not $script:settings['autoCovers']) { return @{ ok = $true; found = $false; skipped = $true } }
                if ($g['cover'] -or $g['coverTried']) { return @{ ok = $true; found = $false; skipped = $true } }
            }
            return (Invoke-FetchCover $g $force ([string]$body.query))
        }
        'refreshIcon' {
            $g = Find-Game ([string]$body.id)
            if (-not $g) { return @{ ok = $false } }
            $ok = Update-GameIcon $g
            Save-Db
            return @{ ok = $true; found = $ok }
        }
        'reveal' {
            $g = Find-Game ([string]$body.id)
            if ($g -and -not (Test-IsUri $g['target']) -and (Test-Path -LiteralPath $g['target'])) {
                Start-Process explorer.exe -ArgumentList "/select,`"$($g['target'])`""
            }
            return @{ ok = $true }
        }
        'detectLaunchers' {
            return (Invoke-DetectLaunchers)
        }
        'scan' {
            $items = @(Invoke-Scan ([string]$body.folder))
            return @{ items = $items }
        }
        'addDropped' {
            # un navigateur ne donne pas le chemin d'un fichier depose : on recoit le raccourci (.lnk / .url) lui-meme
            $nm = [IO.Path]::GetFileName([string]$body.name)
            $ext = [IO.Path]::GetExtension($nm).ToLower()
            if ($ext -ne '.lnk' -and $ext -ne '.url') { return @{ added = 0; error = 'Seuls les raccourcis (.lnk, .url) peuvent etre deposes.' } }
            $bytes = [Convert]::FromBase64String([string]$body.data)
            if ($bytes.Length -lt 20 -or $bytes.Length -gt 262144) { return @{ added = 0; error = 'Raccourci invalide.' } }
            $dir = Join-Path $script:DataDir 'shortcuts'
            New-Item -ItemType Directory -Force -Path $dir | Out-Null
            $safe = ([IO.Path]::GetFileNameWithoutExtension($nm) -replace '[^\w\.\- ]', '_')
            if (-not $safe) { $safe = 'raccourci' }
            $dest = Join-Path $dir (([guid]::NewGuid().ToString('N').Substring(0, 8)) + '-' + $safe + $ext)
            [IO.File]::WriteAllBytes($dest, $bytes)
            $item = [pscustomobject]@{ target = $dest; name = [IO.Path]::GetFileNameWithoutExtension($nm); category = ''; cover = $null }
            return (Invoke-Api 'add' ([pscustomobject]@{ items = @($item) }))
        }
        'resetAll' {
            # remet Arcade a neuf : bibliotheque, categories, reglages, statistiques, couvertures, icones, raccourcis, log
            $script:running.Clear()
            $script:games.Clear(); $script:categories.Clear(); $script:daily.Clear()
            $script:settings = New-DefaultSettings
            try { Set-TrayMode $false } catch {}
            try { Set-Startup $false } catch {}
            foreach ($d in @($script:CoversDir, $script:IconsDir, (Join-Path $script:DataDir 'shortcuts'))) {
                try { if (Test-Path -LiteralPath $d) { Get-ChildItem -LiteralPath $d -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue } } catch {}
            }
            Save-Db
            try { Clear-Content -LiteralPath $script:LogFile -ErrorAction SilentlyContinue } catch {}
            Write-Log 'Arcade remis a zero.'
            $st = $script:settings.Clone(); $st['startWithWindows'] = $false
            return @{ ok = $true; settings = $st }
        }
        'settings' {
            if ($null -ne $body.cardSize) { $script:settings['cardSize'] = [Math]::Min(320, [Math]::Max(140, [int]$body.cardSize)) }
            if ($null -ne $body.volume) { $script:settings['volume'] = [Math]::Min(100, [Math]::Max(0, [int]$body.volume)) }
            if ($null -ne $body.sounds) { $script:settings['sounds'] = [bool]$body.sounds }
            if ($null -ne $body.hoverSounds) { $script:settings['hoverSounds'] = [bool]$body.hoverSounds }
            if ($null -ne $body.clickSounds) { $script:settings['clickSounds'] = [bool]$body.clickSounds }
            if ($null -ne $body.sidebarCollapsed) { $script:settings['sidebarCollapsed'] = [bool]$body.sidebarCollapsed }
            if ($null -ne $body.introAnim) { $script:settings['introAnim'] = [bool]$body.introAnim }
            if ($null -ne $body.autoCovers) { $script:settings['autoCovers'] = [bool]$body.autoCovers }
            if ($body.theme -eq 'dark' -or $body.theme -eq 'light' -or $body.theme -eq 'auto') { $script:settings['theme'] = [string]$body.theme }
            if ([string]$body.accent -match '^#[0-9a-fA-F]{6}$') { $script:settings['accent'] = [string]$body.accent }
            if ($null -ne $body.logo) { if ([string]$body.logo -match '^#[0-9a-fA-F]{6}$') { $script:settings['logo'] = [string]$body.logo } elseif ([string]$body.logo -eq '') { $script:settings['logo'] = '' } }
            if ($null -ne $body.bgfx) { $script:settings['bgfx'] = [bool]$body.bgfx }
            if ($null -ne $body.animations) { $script:settings['animations'] = [bool]$body.animations }
            if ($null -ne $body.effects) { $script:settings['effects'] = [bool]$body.effects }
            if ($null -ne $body.ambient) { $script:settings['ambient'] = [bool]$body.ambient }
            if ($null -ne $body.slideshow) { $script:settings['slideshow'] = [bool]$body.slideshow }
            if ($null -ne $body.breakReminder) {
                $script:settings['breakReminder'] = [Math]::Min(12, [Math]::Max(0, [int]$body.breakReminder))
                foreach ($id in @($script:running.Keys)) { $script:running[$id].Remove('next') }
            }
            if ($null -ne $body.trayMode) {
                $script:settings['trayMode'] = [bool]$body.trayMode
                Set-TrayMode ([bool]$body.trayMode)
            }
            if ($null -ne $body.startWithWindows) { Set-Startup ([bool]$body.startWithWindows) }
            if ($body.achievements) {
                if ($script:settings['achievements'] -isnot [hashtable]) { $script:settings['achievements'] = @{} }
                foreach ($ap in $body.achievements.PSObject.Properties) {
                    if ($ap.Name -match '^[a-z0-9_]{1,40}$' -and -not $script:settings['achievements'].ContainsKey($ap.Name)) {
                        $script:settings['achievements'][$ap.Name] = ([string]$ap.Value).Substring(0, [Math]::Min(40, ([string]$ap.Value).Length))
                    }
                }
            }
            Save-Db
            $st = $script:settings.Clone()
            $st['startWithWindows'] = (Test-Startup)
            return $st
        }
        default { throw "Fonction inconnue ($name). Une ancienne version d'Arcade est peut-etre encore ouverte : ferme toutes les fenetres Arcade, attends 10 secondes, puis relance Arcade." }
    }
}

# ---------- Serveur HTTP local ----------
$script:Mime = @{
    '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'application/javascript; charset=utf-8'
    '.woff2' = 'font/woff2'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.webp' = 'image/webp'; '.gif' = 'image/gif'; '.bmp' = 'image/bmp'
}
$script:StaticFiles = @('/styles.css', '/app.js', '/bridge.js', '/sounds.js', '/logo.png', '/favicon.png', '/icon-38.png', '/icon-76.png', '/icon-152.png', '/icon-304.png', '/icon-32.png', '/icon-64.png', '/icon-128.png', '/icon-256.png', '/icon-512.png', '/fonts/silkscreen-400.woff2', '/fonts/silkscreen-700.woff2', '/fonts/outfit-400.woff2', '/fonts/outfit-600.woff2')

function Send-Bytes($res, $code, $mime, [byte[]]$bytes) {
    $res.StatusCode = $code
    $res.ContentType = $mime
    $res.ContentLength64 = $bytes.Length
    $res.Headers.Add('Cache-Control', 'no-store')
    $res.Headers.Add('X-Content-Type-Options', 'nosniff')
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
    $res.OutputStream.Close()
}
function Send-Text($res, $code, $text) {
    Send-Bytes $res $code 'text/plain; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes($text))
}

function Handle-Request($ctx) {
    $req = $ctx.Request
    $res = $ctx.Response
    try {
        $path = $req.Url.AbsolutePath
        # Protection contre le "DNS rebinding" : seul 127.0.0.1:<port> est accepte
        if ($req.Headers['Host'] -ne "127.0.0.1:$($script:port)") { Send-Text $res 403 'Interdit'; return }

        if ($path -eq '/' -or $path -eq '/index.html') {
            if ($req.QueryString['t'] -ne $script:token) { Send-Text $res 403 'Interdit'; return }
            Send-Bytes $res 200 $script:Mime['.html'] ([IO.File]::ReadAllBytes((Join-Path $script:UiDir 'index.html')))
            return
        }
        if ($script:StaticFiles -contains $path) {
            $f = Join-Path $script:UiDir $path.TrimStart('/')
            Send-Bytes $res 200 $script:Mime[[IO.Path]::GetExtension($f)] ([IO.File]::ReadAllBytes($f))
            return
        }
        if ($path.StartsWith('/cover/')) {
            if ($req.QueryString['t'] -ne $script:token) { Send-Text $res 403 'Interdit'; return }
            $leaf = [IO.Path]::GetFileName([Uri]::UnescapeDataString($path.Substring(7)))
            $f = Join-Path $script:CoversDir $leaf
            if (-not $leaf -or -not (Test-Path -LiteralPath $f)) { Send-Text $res 404 'Introuvable'; return }
            $mime = $script:Mime[[IO.Path]::GetExtension($f).ToLower()]
            if (-not $mime) { $mime = 'application/octet-stream' }
            Send-Bytes $res 200 $mime ([IO.File]::ReadAllBytes($f))
            return
        }
        if ($path.StartsWith('/icon/')) {
            if ($req.QueryString['t'] -ne $script:token) { Send-Text $res 403 'Interdit'; return }
            $leaf = [IO.Path]::GetFileName([Uri]::UnescapeDataString($path.Substring(6)))
            $f = Join-Path $script:IconsDir $leaf
            if (-not $leaf -or -not (Test-Path -LiteralPath $f)) { Send-Text $res 404 'Introuvable'; return }
            Send-Bytes $res 200 'image/png' ([IO.File]::ReadAllBytes($f))
            return
        }
        if ($path.StartsWith('/api/') -and $req.HttpMethod -eq 'POST') {
            $tok = $req.Headers['X-Arcade-Token']
            if (-not $tok) { $tok = $req.QueryString['t'] }
            if ($tok -ne $script:token) { Send-Text $res 403 'Interdit'; return }
            $reader = New-Object IO.StreamReader($req.InputStream, [Text.Encoding]::UTF8)
            $txt = $reader.ReadToEnd()
            $body = $null
            if ($txt) { $body = $txt | ConvertFrom-Json }
            $result = Invoke-Api $path.Substring(5) $body
            $json = $result | ConvertTo-Json -Depth 6 -Compress
            Send-Bytes $res 200 'application/json; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes($json))
            return
        }
        Send-Text $res 404 'Introuvable'
    } catch {
        Write-Log "Erreur requete $($req.Url.AbsolutePath) : $($_.Exception.Message)"
        try { Send-Text $res 500 ('Erreur serveur : ' + $_.Exception.Message) } catch {}
    }
}

function Get-FreePort {
    $l = New-Object System.Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
    $l.Start()
    $p = $l.LocalEndpoint.Port
    $l.Stop()
    return $p
}

# ---------- Demarrage ----------
Load-Db
$iconChanged = $false
foreach ($g in @($script:games.ToArray())) {
    if (-not $g['iconTried']) { [void](Update-GameIcon $g); $iconChanged = $true }
}
if ($iconChanged) { Save-Db }
$script:port = Get-FreePort
$script:token = [guid]::NewGuid().ToString('N')
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$($script:port)/")
$listener.Start()
$url = "http://127.0.0.1:$($script:port)/?t=$($script:token)"
[IO.File]::WriteAllText($script:UrlFile, $url)
[IO.File]::WriteAllText($script:InfoFile, ((@{ version = $script:Version; pid = $PID; port = $script:port }) | ConvertTo-Json -Compress))

$startTime = Get-Date
if ($script:settings['trayMode']) { try { Ensure-Tray } catch { Write-Log "Icone de notification impossible : $($_.Exception.Message)" } }
$proc = $null
if ($Background -and $script:Tray) {
    # demarrage discret (Windows) : pas de fenetre, seulement l'icone
    $script:hidden = $true
    $script:hiddenAt = Get-Date
} else {
    $proc = Start-AppWindow $url
}
Write-Log "Demarre sur le port $($script:port)"

try {
    $async = $null
    $lastTick = Get-Date
    while ($true) {
        if (-not $async) { $async = $listener.BeginGetContext($null, $null) }
        if ($async.AsyncWaitHandle.WaitOne(250)) {
            $ctx = $listener.EndGetContext($async)
            $async = $null
            Handle-Request $ctx
        }
        try { Update-Running } catch { if (-not $script:lastRunErr -or ((Get-Date) - $script:lastRunErr).TotalSeconds -gt 60) { $script:lastRunErr = Get-Date; Write-Log "Suivi du temps de jeu : $($_.Exception.Message)" } }
        try { [System.Windows.Forms.Application]::DoEvents() } catch {}
        try { Check-Reminders } catch { Write-Log "Rappel de pause : $($_.Exception.Message)" }

        $now = Get-Date
        # Mise en veille du PC (ou longue requete) : on ne ferme surtout pas Arcade
        if (($now - $lastTick).TotalSeconds -gt 20) { $script:lastPing = $now; $script:byeAt = $null }
        $lastTick = $now

        # Si le navigateur s'est delegue a une autre instance, on ne se fie pas a son processus
        if ($proc -and $proc.HasExited -and (($now - $startTime).TotalSeconds -lt 10)) { $proc = $null }

        if ($script:quit) { break }
        if ($script:TrayTemp -and $script:TrayTempUntil -and $now -gt $script:TrayTempUntil) { Remove-Tray; $script:TrayTemp = $false; $script:TrayTempUntil = $null }
        if ($script:openReq) {
            $script:openReq = $false
            $proc = Start-AppWindow $url
            $startTime = Get-Date
            $script:lastPing = $startTime
            $script:byeAt = $null
        }

        $idle = ($now - $script:lastPing).TotalSeconds
        if ($script:hidden) {
            # Arcade tourne en arriere-plan (icone) : la fenetre revient quand une page se remet a repondre
            if ($script:lastPing -gt $script:hiddenAt) { $script:hidden = $false }
        } else {
            # Fenetre fermee : le navigateur previent (bye) ; sinon on s'arrete apres un long silence.
            $gone = ($script:everPinged -and $script:byeAt -and (($now - $script:byeAt).TotalSeconds -gt 4)) -or
                    ($script:everPinged -and $proc -and $proc.HasExited -and $idle -gt 8) -or
                    ($script:everPinged -and $idle -gt 120)
            if ($gone) {
                if ($script:Tray -and $script:settings['trayMode']) {
                    $script:hidden = $true
                    $script:hiddenAt = $now
                    $script:byeAt = $null
                    Show-Notice 'Arcade' "Arcade continue en arri$([char]0xE8)re-plan. Clique sur l'ic$([char]0xF4)ne pour le rouvrir."
                } else { break }
            }
            if (-not $script:everPinged -and $idle -gt 90) { break }
        }
    }
} catch {
    Write-Log "Erreur fatale : $($_.Exception.Message)"
} finally {
    Save-Db
    Remove-Tray
    try { $listener.Stop() } catch {}
    try { Remove-Item -LiteralPath $script:UrlFile -Force -ErrorAction SilentlyContinue } catch {}
    try { Remove-Item -LiteralPath $script:InfoFile -Force -ErrorAction SilentlyContinue } catch {}
    try { $script:Mutex.ReleaseMutex() } catch {}
}
