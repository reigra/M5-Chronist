@echo off
setlocal

set "ScriptDir=%~dp0"
set "SourceDir=%ScriptDir%EVA"
set "ResultDir=%ScriptDir%rules"

echo === M5-Chronist EVA-Parser (GUI) ===
echo.
echo Bitte warten....

REM Python check: uv bevorzugen, sonst globales Python
uv --version >nul 2>&1
if not errorlevel 1 (
    set "PY=uv run --no-project python"
    goto :python_found
)

python --version >nul 2>&1
if not errorlevel 1 (
    set "PY=python"
    goto :python_found
)

echo Python ist nicht installiert.
echo Bitte Python installieren oder ueber den Windows Store beziehen...
start python
pause
exit /b 1

:python_found
%PY% --version
echo.

REM GUI-Wrapper starten
rem %PY% "%ScriptDir%scripts\run_parse_EVA_gui.py" --xml-dir "%SourceDir%" --json-dir "%ResultDir%" --notes-file "%ScriptDir%Installationsanleitung.txt"
%PY% "%ScriptDir%scripts\download_parse_rules_gui.py" --notes-file "%ScriptDir%Installationsanleitung.txt"
if errorlevel 1 (
    echo.
    echo Fehler beim Parsen.
    pause
    exit /b 1
)

echo.
echo === Fertig ===
rem pause
