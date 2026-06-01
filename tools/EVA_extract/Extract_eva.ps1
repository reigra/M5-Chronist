<#
.SYNOPSIS
  Installationsskript für MagusNG EVA-Extract.
  Lädt EVAsrc.zip herunter, extrahiert XML-Dateien und konvertiert sie via Python in JSON.
#>

$ErrorActionPreference = 'Stop'
$ZipUrl = 'https://ebruenner.de/download/EVAsrc.zip'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourceDir = Join-Path $ScriptDir 'source'
$ResultDir = Join-Path $ScriptDir 'result'
$TempZip = Join-Path $ScriptDir 'EVAsrc_temp.zip'

Write-Host "=== MagusNG EVA-Extract Installer ===" -ForegroundColor Cyan

# 1. Download
Write-Host "[1/6] Downloading EVAsrc.zip..." -ForegroundColor Yellow
try {
    Invoke-WebRequest -Uri $ZipUrl -OutFile $TempZip -UseBasicParsing
    Write-Host "  -> Downloaded to $TempZip" -ForegroundColor Green
} catch {
    Write-Host "  -> Download failed: $_" -ForegroundColor Red
    exit 1
}

# 2. Extract EVAsrc/*.xml into source/
Write-Host "[2/6] Extracting EVAsrc/*.xml to source/..." -ForegroundColor Yellow
if (-not (Test-Path $SourceDir)) {
    New-Item -ItemType Directory -Path $SourceDir -Force | Out-Null
}

try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $Zip = [System.IO.Compression.ZipFile]::OpenRead($TempZip)
    $Extracted = 0
    foreach ($Entry in $Zip.Entries) {
        if ($Entry.FullName -like 'EVAsrc/*.xml' -and -not $Entry.FullName.EndsWith('/')) {
            $RelativePath = $Entry.FullName -replace '^EVAsrc/', ''
            $DestFile = Join-Path $SourceDir $RelativePath
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($Entry, $DestFile, $true)
            $Extracted++
        }
    }
    $Zip.Dispose()
    Write-Host "  -> Extracted $Extracted XML files" -ForegroundColor Green
} catch {
    Write-Host "  -> Extraction failed: $_" -ForegroundColor Red
    Remove-Item $TempZip -Force -ErrorAction SilentlyContinue
    exit 1
}

# 3. Check / install Python
Write-Host "[3/6] Checking Python..." -ForegroundColor Yellow
$PythonCmd = Get-Command 'python' -ErrorAction SilentlyContinue
if (-not $PythonCmd) {
    Write-Host "  -> Python not found. Downloading and installing..." -ForegroundColor Yellow
    $PythonUrl = 'https://www.python.org/ftp/python/3.12.4/python-3.12.4-amd64.exe'
    $PythonInstaller = Join-Path $ScriptDir 'python_installer.exe'
    try {
        Invoke-WebRequest -Uri $PythonUrl -OutFile $PythonInstaller -UseBasicParsing
        Write-Host "  -> Installing Python (silent)..." -ForegroundColor Yellow
        Start-Process -FilePath $PythonInstaller -ArgumentList '/quiet InstallAllUsers=1 PrependPath=1' -Wait
        Remove-Item $PythonInstaller -Force
        $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
        Write-Host "  -> Python installed" -ForegroundColor Green
    } catch {
        Write-Host "  -> Python installation failed: $_" -ForegroundColor Red
        Remove-Item $TempZip -Force -ErrorAction SilentlyContinue
        exit 1
    }
} else {
    Write-Host "  -> Python found" -ForegroundColor Green
}

if (-not (Test-Path $ResultDir)) {
    New-Item -ItemType Directory -Path $ResultDir -Force | Out-Null
}

# 4. Run parse_kodex.py
Write-Host "[4/6] Running parse_kodex.py..." -ForegroundColor Yellow
$KodexInput = Join-Path $SourceDir 'm5kodex.xml'
$KodexOutput = Join-Path $ResultDir 'eva_kodex.json'
try {
    & python (Join-Path $ScriptDir 'scripts/parse_kodex.py') $KodexInput $KodexOutput
    Write-Host "  -> Wrote $KodexOutput" -ForegroundColor Green
} catch {
    Write-Host "  -> parse_kodex.py failed: $_" -ForegroundColor Red
    Remove-Item $TempZip -Force -ErrorAction SilentlyContinue
    exit 1
}

# 5. Run parse_arkanum.py
Write-Host "[5/6] Running parse_arkanum.py..." -ForegroundColor Yellow
$ArkanumInput = Join-Path $SourceDir 'm5arkanum.xml'
$ArkanumOutput = Join-Path $ResultDir 'eva_arkanum.json'
try {
    & python (Join-Path $ScriptDir 'scripts/parse_arkanum.py') $ArkanumInput $ArkanumOutput
    Write-Host "  -> Wrote $ArkanumOutput" -ForegroundColor Green
} catch {
    Write-Host "  -> parse_arkanum.py failed: $_" -ForegroundColor Red
    Remove-Item $TempZip -Force -ErrorAction SilentlyContinue
    exit 1
}

# 6. Run parse_dinge.py
Write-Host "[6/6] Running parse_dinge.py..." -ForegroundColor Yellow
$DingeInput = Join-Path $SourceDir 'dinge.xml'
$DingeOutput = Join-Path $ResultDir 'eva_dinge.json'
try {
    & python (Join-Path $ScriptDir 'scripts/parse_dinge.py') $DingeInput $DingeOutput
    Write-Host "  -> Wrote $DingeOutput" -ForegroundColor Green
} catch {
    Write-Host "  -> parse_dinge.py failed: $_" -ForegroundColor Red
    Remove-Item $TempZip -Force -ErrorAction SilentlyContinue
    exit 1
}

Remove-Item $TempZip -Force -ErrorAction SilentlyContinue

Write-Host "=== Done! ===" -ForegroundColor Cyan
