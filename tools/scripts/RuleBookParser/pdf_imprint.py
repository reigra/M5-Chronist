"""
pdf_imprint.py — Extract version information from PDF imprint pages.

All Midgard rulebook PDFs at Verlag F&SF share the same imprint format
on page 4. This module provides a function to extract the version string.

Usage:
    import pdfplumber
    from pdf_imprint import extract_imprint_version

    with pdfplumber.open("book.pdf") as pdf:
        version = extract_imprint_version(pdf)
        print(version)  # z.B. "2014; 2. Auflage (PDF V 5.2.0)"
"""

import re
from typing import Optional


# Unicode ligature characters that sometimes appear in PDF extractions
_UNICODE_LIGATURES = str.maketrans({
    '\ufb00': 'ff',
    '\ufb01': 'fi',
    '\ufb02': 'fl',
    '\ufb03': 'ffi',
    '\ufb04': 'ffl',
    '\ufb05': 'st',
    '\ufb06': 'st',
})


def _fix_ligatures(text: str) -> str:
    """Normalise ligature characters and ligature split artifacts."""
    text = text.translate(_UNICODE_LIGATURES)
    # Fix "Aufl age" → "Auflage" (and similar fl/ff/ffi/ffl splits)
    text = re.sub(r'(fi|fl|ff|ffi|ffl) (?=[a-z\u00e4\u00f6\u00fc\u00df])', r'\1', text)
    return text


def extract_imprint_version(pdf, page_index: int = 3) -> str:
    """
    Extract the version string from a rulebook PDF's imprint page.

    The imprint page (usually page 4) contains a line like:
        Printed in Germany 2014; 2. Auflage | PDF zum Buch V 5.2.0

    Parameters:
        pdf:        An open pdfplumber PDF object.
        page_index: 0-based page number (default 3 = page 4).

    Returns:
        Formatted version string, e.g. "2014; 2. Auflage (PDF V 5.2.0)".
        Returns "unknown" if the imprint page cannot be read or parsed.
    """
    if page_index < 0 or page_index >= len(pdf.pages):
        return "unknown"

    text = pdf.pages[page_index].extract_text()
    if not text:
        return "unknown"

    text = _fix_ligatures(text)

    m = re.search(
        r'Printed in Germany\s+(\d{4});\s*(\d+)\s*\.\s*Auflage'
        r'(?:\s*\|\s*PDF zum Buch\s*(V\s*[\d.]+\S*))?',
        text,
        re.IGNORECASE,
    )

    if not m:
        return "unknown"

    year, edition, pdf_version = m.group(1), m.group(2), m.group(3)
    base = f"{year}; {edition}. Auflage"
    if pdf_version:
        pdf_version = re.sub(r'V\s+', 'V', pdf_version.strip())
        base += f" (PDF {pdf_version})"
    return base
