"""
pdf_entry_stream.py — Reading-order line stream for two-column rulebook pages.

Turns pdfplumber words into StreamLine objects (text plus font info) in
reading order: left column top→bottom, then right column, page by page.
Used by the Ars Armorum technique and Kampfvers parsers.
"""

from dataclasses import dataclass

from pdf_skills_common import fix_ligatures

COL_SPLIT = 290.0    # x boundary between the two text columns
Y_TOLERANCE = 3.0    # words whose top differs less than this form one line


@dataclass
class StreamLine:
    """One text line of one column with its dominant font attributes."""
    page: int
    column: int
    top: float
    x0: float
    text: str
    size: float      # largest font size on the line
    bold: bool       # first word uses a bold font
    italic: bool     # first word uses an italic font


def _make_line(page_no: int, column: int, words: list[dict]) -> StreamLine:
    """Build a StreamLine from the words of one visual line."""
    words = sorted(words, key=lambda w: w["x0"])
    font = words[0].get("fontname", "")
    return StreamLine(
        page=page_no,
        column=column,
        top=float(words[0]["top"]),
        x0=float(words[0]["x0"]),
        text=fix_ligatures(" ".join(w["text"] for w in words)).strip(),
        size=max(float(w.get("size", 0.0)) for w in words),
        bold="Bold" in font,
        italic="Italic" in font,
    )


def page_lines(pdf, page_no: int) -> list[StreamLine]:
    """
    Return the lines of one book page (1-based) in reading order.

    Duplicate overlay glyphs are removed (dedupe_chars), words are split
    into two columns at COL_SPLIT and grouped by their top coordinate.
    Page numbers (18pt digits) are dropped.
    """
    page = pdf.pages[page_no - 1].dedupe_chars()
    words = page.extract_words(
        x_tolerance=3, y_tolerance=3, keep_blank_chars=False,
        use_text_flow=False, extra_attrs=["size", "fontname"],
    )
    result: list[StreamLine] = []
    columns = (
        [w for w in words if w["x0"] < COL_SPLIT],
        [w for w in words if w["x0"] >= COL_SPLIT],
    )
    for column, col_words in enumerate(columns):
        col_words.sort(key=lambda w: (w["top"], w["x0"]))
        group: list[dict] = []
        for w in col_words:
            if group and abs(w["top"] - group[0]["top"]) > Y_TOLERANCE:
                result.append(_make_line(page_no, column, group))
                group = []
            group.append(w)
        if group:
            result.append(_make_line(page_no, column, group))
    return [l for l in result if l.text and not (l.size >= 16 and l.text.isdigit())]


def stream(pdf, first_page: int, last_page: int) -> list[StreamLine]:
    """Concatenate page_lines() for an inclusive book page range."""
    lines: list[StreamLine] = []
    for page_no in range(first_page, last_page + 1):
        lines.extend(page_lines(pdf, page_no))
    return lines


def join_lines(texts: list[str]) -> str:
    """
    Join wrapped text lines into one paragraph string.

    A trailing hyphen followed by a lowercase continuation is treated as
    a word break ("Ge-" + "lingt" → "Gelingt"); "KiDo-" + "Kämpfer" keeps it.
    """
    out = ""
    for t in texts:
        if out.endswith("-") and t[:1].islower():
            out = out[:-1] + t
        else:
            out = f"{out} {t}" if out else t
    return out
