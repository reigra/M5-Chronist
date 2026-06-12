@echo off
setlocal

set "ScriptDir=%~dp0"
set "SourceDir=%ScriptDir%EVA"
set "ResultDir=%ScriptDir%rules"

echo === MagusNG EVA-Parser (GUI) ===
echo.
echo Bitte warten....

REM Python check
python --version >nul 2>&1
if errorlevel 1 (
    echo Python ist nicht installiert.
    echo Bitte Python installieren oder ueber den Windows Store beziehen...
    start python
    pause
    exit /b 1
)

python --version
echo.

REM GUI-Wrapper starten
rem python "%ScriptDir%scripts\run_parse_EVA_gui.py" --xml-dir "%SourceDir%" --json-dir "%ResultDir%" --notes-file "%ScriptDir%Installationsanleitung.txt"
python "%ScriptDir%scripts\download_parse_rules_gui.py" --notes-file "%ScriptDir%Installationsanleitung.txt"
if errorlevel 1 (
    echo.
    echo Fehler beim Parsen.
    pause
    exit /b 1
)

echo.
echo === Fertig ===
rem pause
