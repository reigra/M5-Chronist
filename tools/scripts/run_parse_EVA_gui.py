#!/usr/bin/env python3
import argparse
import json
import os
import shutil
import sys
import urllib.request
import zipfile
import tkinter as tk
from tkinter import scrolledtext, ttk

TOOLS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMP_ZIP = os.path.join(TOOLS_DIR, "EVAsrc_temp.zip")
ZIP_URL = "https://ebruenner.de/download/EVAsrc.zip"

XML_FILES = {
    "kodex":  ("m5kodex.xml", "eva_kodex.json"),
    "arkanum": ("m5arkanum.xml", "eva_arkanum.json"),
    "dinge":  ("dinge.xml", "eva_dinge.json"),
}

sys.path.insert(0, os.path.join(TOOLS_DIR, "scripts"))

from parse_EVA_kodex import parse_kodex_document
from parse_EVA_arkanum import parse_arkanum_document
from parse_EVA_dinge import parse_dinge_document


class OutputDialog:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("MagusNG \u2013 EVA-Parser")
        self.root.geometry("800x600")
        self.root.minsize(600, 400)

        main = ttk.Frame(self.root, padding=12)
        main.pack(fill=tk.BOTH, expand=True)

        header = ttk.Label(main, text="EVA-Parser Ausgabe", font=("Segoe UI", 14, "bold"))
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

    def append_json(self, label, data):
        self.append(f"\n\u2500\u2500\u2500 {label} \u2500\u2500\u2500\n\n")
        formatted = json.dumps(data, ensure_ascii=False, indent=2)
        self.append(formatted + "\n")

    def run(self):
        self.root.mainloop()


def download_zip(xml_dir):
    os.makedirs(xml_dir, exist_ok=True)
    with urllib.request.urlopen(ZIP_URL) as response:
        with open(TEMP_ZIP, "wb") as f:
            shutil.copyfileobj(response, f)


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


def cleanup():
    if os.path.isfile(TEMP_ZIP):
        os.remove(TEMP_ZIP)


def main():
    parser = argparse.ArgumentParser(description="GUI-Wrapper f\u00fcr die EVA-Parser")
    parser.add_argument("--xml-dir", default=os.path.join(TOOLS_DIR, "EVA"),
                        help="Verzeichnis mit den XML-Eingabedateien (Default: tools/EVA)")
    parser.add_argument("--json-dir", default=os.path.join(TOOLS_DIR, "rules"),
                        help="Verzeichnis für die JSON-Ausgabedateien (Default: tools/rules)")
    parser.add_argument("--notes-file",
                        help="Optionale Textdatei, die nach dem Parsen im Fenster angezeigt wird")
    args = parser.parse_args()

    xml_dir = os.path.abspath(args.xml_dir)
    json_dir = os.path.abspath(args.json_dir)

    dialog = OutputDialog()

    def run_pipeline():
        try:
            dialog.append("=== Schritt 1/4: Download ===\n\n")
            download_zip(xml_dir)
            dialog.append("\u2713 Download erfolgreich\n\n")

            dialog.append("=== Schritt 2/4: Extrahieren ===\n\n")
            extract_xmls(xml_dir)
            dialog.append(f"\u2713 XML-Dateien extrahiert nach: {xml_dir}\n\n")

            dialog.append("=== Schritt 3/4: Parsen ===\n\n")
            results = parse_all(xml_dir, json_dir)
            for key in results:
                _, json_name = XML_FILES[key]
                json_path = os.path.join(json_dir, json_name)
                dialog.append(f"\u2713 {json_path}\n")
            dialog.append("\n")

            dialog.append("=== Schritt 4/4: Ausgabe ===\n\n")
            # dialog.append_json("Kodex (Fertigkeiten, Klassen, Rassen \u2026)", results["kodex"])
            # dialog.append_json("Arkanum (Zauber)", results["arkanum"])
            # dialog.append_json("Dinge (Ausr\u00fcstung, Waffen)", results["dinge"])

            cleanup()
            dialog.append(f"\n\u2713 Fertig \u2013 JSON-Dateien in: {json_dir}\n")

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
