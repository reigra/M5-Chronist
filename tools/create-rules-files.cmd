@echo off
setlocal

set "ScriptDir=%~dp0"
set "ZipUrl=https://ebruenner.de/download/EVAsrc.zip"
set "SourceDir=%ScriptDir%EVA"
set "ResultDir=%ScriptDir%rules"
set "TempZip=%ScriptDir%EVAsrc_temp.zip"

echo === MagusNG EVA-Extract Installer ===
echo.

REM 1. Python check
echo [1/6] Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo   -^> Python ist nicht installiert.
    echo   -^> Bitte Python installieren oder über den Windows Store beziehen...
 rem   start ms-windows-store://pdp/?productid=9P7QFQMJRFP7
    start python
    exit /b 1
)
python --version
echo.

REM 2. Download
echo [2/6] Downloading EVAsrc.zip...
curl.exe -sS -L -o "%TempZip%" "%ZipUrl%"
if errorlevel 1 (
    echo   -^> Download fehlgeschlagen
    exit /b 1
)
echo   -^> Downloaded to "%TempZip%"
echo.

REM 3. Extract EVAsrc/*.xml to EVA/
echo [3/6] Extracting EVAsrc/*.xml to EVA/...
if not exist "%SourceDir%" mkdir "%SourceDir%"
tar.exe -xf "%TempZip%"  "EVAsrc/*.xml" 
if errorlevel 1 (
    echo   -^> Extraction fehlgeschlagen
    del "%TempZip%" 2>nul
    exit /b 1
)
move /Y "%ScriptDir%EVAsrc\*.xml" "%SourceDir%\" >nul
rd /S /Q "%ScriptDir%EVAsrc" >nul
echo   -^> Extracted XML files to "%SourceDir%"
echo.

if not exist "%ResultDir%" mkdir "%ResultDir%"

REM 4. parse_kodex.py
echo [4/6] Running parse_kodex.py...
python "%ScriptDir%scripts\parse_kodex.py" "%SourceDir%\m5kodex.xml" "%ResultDir%\eva_kodex.json"
if errorlevel 1 (
    echo   -^> parse_kodex.py fehlgeschlagen
    del "%TempZip%" 2>nul
    exit /b 1
)
echo   -^> Wrote "%ResultDir%\eva_kodex.json"
echo.

REM 5. parse_arkanum.py
echo [5/6] Running parse_arkanum.py...
python "%ScriptDir%scripts\parse_arkanum.py" "%SourceDir%\m5arkanum.xml" "%ResultDir%\eva_arkanum.json"
if errorlevel 1 (
    echo   -^> parse_arkanum.py fehlgeschlagen
    del "%TempZip%" 2>nul
    exit /b 1
)
echo   -^> Wrote "%ResultDir%\eva_arkanum.json"
echo.

REM 6. parse_dinge.py
echo [6/6] Running parse_dinge.py...
python "%ScriptDir%scripts\parse_dinge.py" "%SourceDir%\dinge.xml" "%ResultDir%\eva_dinge.json"
if errorlevel 1 (
    echo   -^> parse_dinge.py fehlgeschlagen
    del "%TempZip%" 2>nul
    exit /b 1
)
echo   -^> Wrote "%ResultDir%\eva_dinge.json"
echo.

del "%TempZip%" 2>nul

echo === Done! ===
