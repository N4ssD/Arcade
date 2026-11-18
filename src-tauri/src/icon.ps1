param([string]$Target, [string]$ListFile, [string]$IconsDir, [string]$CacheDll)
$ErrorActionPreference = 'Continue'
$script:IconsDir = $IconsDir
function Write-Log($m) { }
function Test-IsUri($t) { return [bool]($t -match '^[a-zA-Z][a-zA-Z0-9+.\-]+://') }
$script:IconsOk = $false
$csrc = @'
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
try {
    $loaded = $false
    if ($CacheDll -and (Test-Path -LiteralPath $CacheDll)) {
        try { Add-Type -Path $CacheDll; $loaded = $true } catch {}
    }
    if (-not $loaded) {
        if ($CacheDll) {
            try {
                Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition $csrc -OutputAssembly $CacheDll
                Add-Type -Path $CacheDll
                $loaded = $true
            } catch { try { Remove-Item -LiteralPath $CacheDll -Force -ErrorAction SilentlyContinue } catch {} }
        }
        if (-not $loaded) { Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition $csrc; $loaded = $true }
    }
    $script:IconsOk = $loaded
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
$targets = @()
if ($ListFile -and (Test-Path -LiteralPath $ListFile)) { $targets = @(Get-Content -LiteralPath $ListFile -Encoding UTF8) }
elseif ($Target) { $targets = @($Target) }
foreach ($tg in $targets) {
    $name = ''
    if ($tg) {
        $r = Save-IconFor $tg.Trim()
        if ($r) { $name = (Split-Path -Leaf $r) }
    }
    [Console]::Out.WriteLine($name)
}
