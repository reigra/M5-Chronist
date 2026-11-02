#!/usr/bin/env python3
import argparse
import json
import os
import shutil
import subprocess
import sys
import urllib.request
import zipfile
import tkinter as tk
from tkinter import scrolledtext, ttk

TOOLS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMP_ZIP = os.path.join(TOOLS_DIR, "EVAsrc_temp.zip")
# EVA_ZIP_URL = "https://ebruenner.de/download/EVAsrc.zip"
EVA_ZIP_URL = "https://files.catbox.moe/fnfgoy.zip"
PDF_URL = "http://www.heidebrunn.de/Midgard/Lerntabellen_5_8_3.pdf"
PDF_DST = os.path.join(TOOLS_DIR, "Mogadil", "Lerntabellen_5_8_3.pdf")

XML_DIR = os.path.join(TOOLS_DIR, "EVA")
JSON_DIR = os.path.join(TOOLS_DIR, "rules")

XML_FILES = {
    "kodex":  ("m5kodex.xml", "eva_kodex.json"),
    "arkanum": ("m5arkanum.xml", "eva_arkanum.json"),
    "dinge":  ("dinge.xml", "eva_dinge.json"),
}

# Browser-User-Agent: catbox.moe blockt den Standard-UA von urllib und schließt die
# Verbindung ohne Antwort (http.client.RemoteDisconnected).
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

sys.path.insert(0, os.path.join(TOOLS_DIR, "scripts"))

from parse_EVA_kodex import parse_kodex_document
from parse_EVA_arkanum import parse_arkanum_document
from parse_EVA_dinge import parse_dinge_document
from parse_Mogadil import parse_mogadil_document


class OutputDialog:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("M5 - Chronist \u2013 Rules-Parser")
        self.root.geometry("800x600")
        self.root.minsize(600, 400)

        main = ttk.Frame(self.root, padding=12)
        main.pack(fill=tk.BOTH, expand=True)

        header = ttk.Label(main, text="Rules-Parser Ausgabe", font=("Segoe UI", 14, "bold"))
        header.pack(anchor=tk.W, pady=(0, 8))

        self.text = scrolledtext.ScrolledText(
            main, wrap=tk.WORD, font=("Consolas", 10), state=tk.DISABLED
        )
        self.text.pack(fill=tk.BOTH, expand=True)

        btn_frame = ttk.Frame(main)
        btn_frame.pack(fill=tk.X, pady=(8, 0))
        ttk.Button(btn_frame, text="Schlie\u00dfen", command=self.root.destroy).pack(side=tk.RIGHT)

    def append(self, text):
        self.text.configure(state=tk.NORMAL)
        self.text.insert(tk.END, text)
        self.text.see(tk.END)
        self.text.configure(state=tk.DISABLED)
        self.root.update()

    def run(self):
        self.root.mainloop()


def download_file(url, dst):
    # Lädt eine Datei mit Browser-User-Agent herunter (einige Hosts blocken urllib).
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req) as response:
        with open(dst, "wb") as f:
            shutil.copyfileobj(response, f)


def download_zip(xml_dir):
    os.makedirs(xml_dir, exist_ok=True)
    expected = [os.path.join(xml_dir, xml_name) for xml_name, _ in XML_FILES.values()]
    if all(os.path.isfile(p) for p in expected):
        return False
    download_file(EVA_ZIP_URL, TEMP_ZIP)
    return True


def extract_xmls(xml_dir):
    with zipfile.ZipFile(TEMP_ZIP) as zf:
        for name in zf.namelist():
            if name.startswith("EVAsrc/") and name.endswith(".xml"):
                zf.extract(name, TOOLS_DIR)
                src = os.path.join(TOOLS_DIR, name)
                dst = os.path.join(xml_dir, os.path.basename(name))
                shutil.move(src, dst)
    evasrc_dir = os.path.join(TOOLS_DIR, "EVAsrc")
    if os.path.isdir(evasrc_dir):
        shutil.rmtree(evasrc_dir)


def parse_all(xml_dir, json_dir):
    results = {}
    os.makedirs(json_dir, exist_ok=True)

    for key, (xml_name, json_name) in XML_FILES.items():
        xml_path = os.path.join(xml_dir, xml_name)
        json_path = os.path.join(json_dir, json_name)

        if not os.path.isfile(xml_path):
            raise FileNotFoundError(f"XML nicht gefunden: {xml_path}")

        if key == "kodex":
            data = parse_kodex_document(xml_path)
        elif key == "arkanum":
            data = parse_arkanum_document(xml_path)
        elif key == "dinge":
            data = parse_dinge_document(xml_path)

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        results[key] = data

    return results


def download_pdf(pdf_dst):
    if os.path.isfile(pdf_dst):
        return
    os.makedirs(os.path.dirname(pdf_dst), exist_ok=True)
    download_file(PDF_URL, pdf_dst)


def cleanup():
    if os.path.isfile(TEMP_ZIP):
        os.remove(TEMP_ZIP)


def main():
    parser = argparse.ArgumentParser(description="GUI-Wrapper für EVA + Mogadil Lerntabellen Parser")
    parser.add_argument("--notes-file",
                        help="Optionale Textdatei, die nach dem Parsen im Fenster angezeigt wird")
    args = parser.parse_args()

    dialog = OutputDialog()

    def log(text):
        dialog.append(text + '\n')

    def run_pipeline():
        try:
            # --- EVA Teil ---
            dialog.append("=== Schritt 1/7: EVA-Download ===\n\n")
            downloaded = download_zip(XML_DIR)
            if downloaded:
                dialog.append("\u2713 EVA-Zip erfolgreich geladen\n\n")
                dialog.append("=== Schritt 2/7: Extrahieren ===\n\n")
                extract_xmls(XML_DIR)
                dialog.append(f"\u2713 XML-Dateien extrahiert nach: {XML_DIR}\n\n")
            else:
                dialog.append("\u2713 XML-Dateien bereits vorhanden \u2013 Download \u00fcbersprungen\n\n")

            dialog.append("=== Schritt 3/7: EVA-XML parsen ===\n\n")
            results = parse_all(XML_DIR, JSON_DIR)
            for key in results:
                _, json_name = XML_FILES[key]
                json_path = os.path.join(JSON_DIR, json_name)
                dialog.append(f"\u2713 {json_path}\n")
            dialog.append("\n")

            # --- Mogadil PDF Teil ---
            dialog.append("=== Schritt 4/7: Lerntabellen-PDF download ===\n\n")
            dialog.append(f"  URL: {PDF_URL}\n")
            download_pdf(PDF_DST)
            dialog.append(f"\u2713 PDF gespeichert als: {PDF_DST}\n\n")

            dialog.append("=== Schritt 5/7: Lerntabellen parsen ===\n\n")
            mogadil_out = os.path.join(JSON_DIR, "mogadil.json")
            parse_mogadil_document(PDF_DST, mogadil_out, log=log)
            dialog.append("\n")

            # --- Arkanum PDF Parsing ---
            dialog.append("=== Schritt 6/7: Arkanum PDF parsen ===\n\n")
            project_dir = os.path.dirname(TOOLS_DIR)
            arkanum_script = os.path.join(TOOLS_DIR, "scripts", "RuleBookParser", "parse_arkanum.py")
            result = subprocess.run(
                [sys.executable, arkanum_script],
                capture_output=True, text=True, cwd=project_dir,
            )
            dialog.append(result.stdout)
            if result.returncode != 0:
                dialog.append("! Arkanum-PDF nicht gefunden oder Fehler im Parser \u2013 \u00fcbersprungen\n")
                if result.stderr.strip():
                    dialog.append(f"  Details: {result.stderr.strip()}\n")
            else:
                dialog.append("\u2713 tools/rules/arkanum.json\n")
            dialog.append("\n")

            # --- Ausgabe ---
            dialog.append("=== Schritt 7/7: Fertig ===\n\n")

            cleanup()
            dialog.append(f"\u2713 JSON-Dateien in: {JSON_DIR}\n")
            dialog.append(f"  - eva_kodex.json\n")
            dialog.append(f"  - eva_arkanum.json\n")
            dialog.append(f"  - eva_dinge.json\n")
            dialog.append(f"  - mogadil.json\n")
            if result.returncode == 0:
                dialog.append(f"  - arkanum.json\n")

            if args.notes_file:
                notes_path = os.path.abspath(args.notes_file)
                if os.path.isfile(notes_path):
                    with open(notes_path, "r", encoding="utf-8") as f:
                        content = f.read()
                    dialog.append(f"\n\u2500\u2500\u2500 Notizen ({args.notes_file}) \u2500\u2500\u2500\n\n")
                    dialog.append(content + "\n")
                else:
                    dialog.append(f"\n! Notiz-Datei nicht gefunden: {args.notes_file}\n")

        except Exception as e:
            dialog.append(f"\n\u2717 FEHLER: {e}\n")
            import traceback
            dialog.append(traceback.format_exc())

    dialog.root.after(100, run_pipeline)
    dialog.run()


if __name__ == "__main__":
    main()
