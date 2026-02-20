# build.ps1 — TRACKR Windows build orchestration
# Produces an NSIS installer: TRACKR_<version>_x64-setup.exe
#
# Prerequisites:
#   - Python 3.12+ with PyInstaller: pip install pyinstaller
#   - Node.js + npm
#   - Rust toolchain (rustup)
#   - Java sidecar already jpackaged at build/jpackage/NowPlayingLite-DeviceStartFixed/
#   - Tauri updater signing key at ~/.tauri/trackr.key (npx tauri signer generate -w ~/.tauri/trackr.key)

param(
    [switch]$SkipPyInstaller,
    [switch]$SkipNpmInstall
)

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot
$SidecarDir = "$RepoRoot\ui\trackr-ui\src-tauri\binaries"
$TargetTriple = "x86_64-pc-windows-msvc"
$SidecarExe = "$SidecarDir\trackr-backend-$TargetTriple.exe"
$JavaSidecarDir = "$RepoRoot\build\jpackage\NowPlayingLite-DeviceStartFixed"
$SigningKeyPath = "$env:USERPROFILE\.tauri\trackr.key"

Write-Host "`n=== TRACKR Build ===" -ForegroundColor Cyan

# ── Step 1: Clean previous artifacts ────────────────────────────────────────
Write-Host "`n[1/6] Cleaning previous build artifacts..." -ForegroundColor Yellow
if (Test-Path "$RepoRoot\dist") { Remove-Item "$RepoRoot\dist" -Recurse -Force }
if (Test-Path "$RepoRoot\__pycache__") { Remove-Item "$RepoRoot\__pycache__" -Recurse -Force }
# Remove old frozen exe but keep the binaries directory (skip if reusing)
if (-not $SkipPyInstaller -and (Test-Path $SidecarExe)) { Remove-Item $SidecarExe -Force }

# ── Step 2: Freeze Python backend with PyInstaller ──────────────────────────
if (-not $SkipPyInstaller) {
    Write-Host "`n[2/6] Freezing Python backend with PyInstaller..." -ForegroundColor Yellow

    # Ensure PyInstaller is available
    $hasPyInstaller = $true
    try { python -m PyInstaller --version 2>&1 | Out-Null } catch { $hasPyInstaller = $false }
    if (-not $hasPyInstaller -or $LASTEXITCODE -ne 0) {
        Write-Host "PyInstaller not found. Installing..." -ForegroundColor DarkYellow
        pip install pyinstaller
        if ($LASTEXITCODE -ne 0) { throw "Failed to install PyInstaller" }
    }

    # Ensure binaries directory exists
    if (-not (Test-Path $SidecarDir)) { New-Item -ItemType Directory -Path $SidecarDir -Force | Out-Null }

    # Run PyInstaller from repo root so pathex resolves correctly
    Push-Location $RepoRoot
    python -m PyInstaller trackr-backend.spec --distpath "$SidecarDir" --workpath "$RepoRoot\dist\pyinstaller-work" --noconfirm
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "PyInstaller failed" }
    Pop-Location

    if (-not (Test-Path $SidecarExe)) {
        throw "Expected sidecar not found at: $SidecarExe"
    }
    $size = [math]::Round((Get-Item $SidecarExe).Length / 1MB, 1)
    Write-Host "  Frozen backend: $SidecarExe ($size MB)" -ForegroundColor Green
} else {
    Write-Host "`n[2/6] Skipping PyInstaller (--SkipPyInstaller)" -ForegroundColor DarkGray
    if (-not (Test-Path $SidecarExe)) {
        throw "Sidecar exe missing and PyInstaller was skipped: $SidecarExe"
    }
}

# ── Step 3: Verify Beat Link sidecar ──────────────────────────────────────
Write-Host "`n[3/6] Verifying Beat Link sidecar..." -ForegroundColor Yellow
$javaExe = "$JavaSidecarDir\NowPlayingLite.exe"
if (-not (Test-Path $javaExe)) {
    throw "Beat Link sidecar not found at: $javaExe`nRun jpackage build first."
}
$javaSize = [math]::Round((Get-ChildItem $JavaSidecarDir -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB, 1)
Write-Host "  Beat Link sidecar OK: $JavaSidecarDir ($javaSize MB)" -ForegroundColor Green

# ── Step 4: npm install ─────────────────────────────────────────────────────
if (-not $SkipNpmInstall) {
    Write-Host "`n[4/6] Installing npm dependencies..." -ForegroundColor Yellow
    Push-Location "$RepoRoot\ui\trackr-ui"
    npm install
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm install failed" }
    Pop-Location
} else {
    Write-Host "`n[4/6] Skipping npm install (--SkipNpmInstall)" -ForegroundColor DarkGray
}

# ── Step 5: Set updater signing key ──────────────────────────────────────────
Write-Host "`n[5/6] Setting updater signing key..." -ForegroundColor Yellow
if (Test-Path $SigningKeyPath) {
    $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $SigningKeyPath -Raw
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $env:TRACKR_SIGN_PASSWORD
    if (-not $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
        throw "TRACKR_SIGN_PASSWORD env var not set.`nSet it before running: `$env:TRACKR_SIGN_PASSWORD = 'your-password'"
    }
    Write-Host "  Signing key loaded from: $SigningKeyPath" -ForegroundColor Green
} else {
    throw "Signing key not found at: $SigningKeyPath`nRun: npx tauri signer generate -w `"$SigningKeyPath`""
}

# ── Step 6: Tauri build ─────────────────────────────────────────────────────
Write-Host "`n[6/6] Building Tauri NSIS installer..." -ForegroundColor Yellow
Push-Location "$RepoRoot\ui\trackr-ui"
# Clean trackr-ui build-script cache to avoid "Access is denied" on jpackage resources
# (Full cargo clean can trigger Application Control errors; targeted removal is safer)
$buildDir = "$RepoRoot\ui\trackr-ui\src-tauri\target\release\build"
Get-ChildItem "$buildDir\trackr-ui-*" -Directory -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem "$RepoRoot\ui\trackr-ui\src-tauri\target\release\.fingerprint\trackr-ui-*" -Directory -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
npx tauri build 2>&1
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Tauri build failed" }
Pop-Location

# ── Done ─────────────────────────────────────────────────────────────────────
$installerDir = "$RepoRoot\ui\trackr-ui\src-tauri\target\release\bundle\nsis"
$installer = Get-ChildItem "$installerDir\*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1

if ($installer) {
    $installerSize = [math]::Round($installer.Length / 1MB, 1)
    $sig = Get-ChildItem "$installerDir\*.sig" -ErrorAction SilentlyContinue | Select-Object -First 1
    Write-Host "`n=== Build Complete ===" -ForegroundColor Green
    Write-Host "  Installer: $($installer.FullName)" -ForegroundColor Green
    Write-Host "  Size: $installerSize MB" -ForegroundColor Green
    if ($sig) {
        Write-Host "  Signature: $($sig.FullName)" -ForegroundColor Green
    } else {
        Write-Host "  WARNING: No .sig file found — updater signing may have failed" -ForegroundColor Red
    }
} else {
    Write-Host "`n=== Build Complete ===" -ForegroundColor Green
    Write-Host "  Check output at: $installerDir" -ForegroundColor Yellow
}
