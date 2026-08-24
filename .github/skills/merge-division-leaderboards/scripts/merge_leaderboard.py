"""Merge Bearwood Lakes medal leaderboard PDFs into a single combined leaderboard.

The two source PDFs (M Division and F Division) are exports from the club's
scoring system. This script parses the rows out of them, merges the field by
"To Par Net", and re-renders the result using the *original PDF pages as
templates* so the club header (logos plus the outlined title artwork) and the
embedded IBM Plex Sans font subset are reused verbatim.

Ordering guarantee: the primary division keeps its relative order, and players
from the secondary division are placed at the end of their tie group. No
primary-division player's standing changes relative to another.

Usage:
    python3 merge_leaderboard.py --male "Male Leaderboard.pdf" \
        --female "Female Leaderboard.pdf" --out "Combined Leaderboard.pdf"
"""

import argparse

import fitz

# --- layout constants, measured directly from the source PDFs ---------------
PAGE_W, PAGE_H = 612.0, 792.0

# Everything above this y is the club header (logos + outlined title artwork)
# and is preserved from the template page.
HEADER_BOTTOM = 108.0

TABLE_X0, TABLE_X1 = 11.25, 600.75
COL_EDGES = [11.25, 74.25, 349.5, 420.0, 492.0, 600.75]

BANNER_TOP, BANNER_BOTTOM = 120.75, 149.25
BANNER_TEXT_X, BANNER_TEXT_DY = 23.25, 20.25

HEAD_TOP, HEAD_BOTTOM = 157.5, 191.25
FIRST_ROW_TOP = 191.25          # page 1, directly under the column header band
CONT_ROW_TOP = 113.25           # continuation pages have no banner/column header

ROW_H = 16.5
ROW_TEXT_DY = 11.25
ROWS_PER_PAGE = 35              # matches the source export's pagination

FOOTER_H = 26.25
FOOTER_TEXT_DY = 17.25

PLAYER_X = 76.27                # player column is left-aligned
POS_CX = (COL_EDGES[0] + COL_EDGES[1]) / 2
TOPAR_CX = (COL_EDGES[2] + COL_EDGES[3]) / 2
NET_CX = (COL_EDGES[3] + COL_EDGES[4]) / 2
PURSE_CX = (COL_EDGES[4] + COL_EDGES[5]) / 2

# column x-bands used when parsing spans back out of the source PDFs
PARSE_POS_MAX, PARSE_PLAYER_MAX, PARSE_TOPAR_MAX, PARSE_NET_MAX = 70.0, 350.0, 420.0, 500.0

CLR_WHITE = (1.0, 1.0, 1.0)
CLR_ROW_ALT = (0.961, 0.961, 0.961)
CLR_BORDER = (0.827, 0.855, 0.871)
CLR_BAND = (0.243, 0.243, 0.267)
CLR_BANNER_TEXT = (0.243, 0.271, 0.286)
CLR_VALUE = (0.2, 0.2, 0.2)
CLR_NAME = (0.0, 0.0, 0.0)

SIZE_BANNER, SIZE_HEAD, SIZE_SUBHEAD, SIZE_ROW = 12.75, 11.55, 9.0, 10.5
SIZE_TOPAR = 9.0                # the To Par Net column is set smaller than the rest
TOPAR_TEXT_DY = 10.5
BORDER_W = 0.75
FONT_ALIAS = "plex"

NON_FINISHER = 10**6

# Positions at this To Par or better must not change when merging. The club
# treats the top of the board (and the prize places) as settled.
PROTECTED_TO_PAR = 4


# --- parsing ----------------------------------------------------------------
def parse_leaderboard(path, division_filter=None):
    """Extract division tables from a leaderboard PDF.

    Returns a list of ``{"title": str, "rows": [row, ...]}`` dicts.
    """
    doc = fitz.open(path)
    divisions = []
    current = None

    for page in doc:
        spans = []
        for block in page.get_text("dict")["blocks"]:
            if block["type"] == 1:  # image
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    text = span["text"].strip()
                    if not text:
                        continue
                    x0, y0, _x1, y1 = span["bbox"]
                    if span["size"] > 12 and "Division" in text:
                        current = {"title": text, "rows": []}
                        divisions.append(current)
                        continue
                    spans.append(((y0 + y1) / 2, x0, text, span["size"]))

        # The "To Par Net" column lives in its own text block whose baselines sit
        # a fraction of a point off the main row, so cluster by y with tolerance
        # rather than grouping on an exact/rounded value.
        rows_of_spans = []
        for y_centre, x0, text, size in sorted(spans):
            if rows_of_spans and abs(y_centre - rows_of_spans[-1][0]) <= ROW_H / 3:
                rows_of_spans[-1][1].append((x0, text, size))
            else:
                rows_of_spans.append((y_centre, [(x0, text, size)]))

        for _y, cells in rows_of_spans:
            if any("Purse Allocated" in text for _x, text, _s in cells):
                continue
            if any(size > 11 for _x, _t, size in cells):  # column heading row
                continue
            row = {"pos": None, "player": None, "topar": None, "net": None, "purse": None}
            for x0, text, _size in sorted(cells):
                if x0 < PARSE_POS_MAX:
                    row["pos"] = text
                elif x0 < PARSE_PLAYER_MAX:
                    row["player"] = f"{row['player']} {text}" if row["player"] else text
                elif x0 < PARSE_TOPAR_MAX:
                    row["topar"] = text
                elif x0 < PARSE_NET_MAX:
                    row["net"] = text
                else:
                    row["purse"] = text
            if row["pos"] and row["player"] and current is not None:
                current["rows"].append(row)

    if division_filter:
        divisions = [d for d in divisions if division_filter in d["title"]]
    if not divisions:
        raise SystemExit(f"No division matching {division_filter!r} found in {path}")
    return divisions


def topar_value(row):
    """Numeric sort key for To Par Net. WD/NR (shown as '-') sort last."""
    raw = row.get("topar")
    if raw in (None, "", "-"):
        return NON_FINISHER
    if raw == "E":
        return 0
    return int(raw.replace("+", ""))


def purse_value(row):
    raw = (row.get("purse") or "").replace("£", "").replace(",", "")
    try:
        return float(raw)
    except ValueError:
        return 0.0


def merge_divisions(primary_rows, secondary_rows):
    """Stable merge by To Par Net.

    Sorting is stable and tagged, so primary players keep their relative order
    and secondary players land at the end of their tie group. Positions are then
    renumbered sequentially, matching the source export's numbering style.
    """
    combined = [dict(row, source="primary") for row in primary_rows]
    combined += [dict(row, source="secondary") for row in secondary_rows]
    combined.sort(key=lambda r: (topar_value(r), 0 if r["source"] == "primary" else 1))

    finishers = [r for r in combined if topar_value(r) < NON_FINISHER]
    non_finishers = [r for r in combined if topar_value(r) >= NON_FINISHER]
    for index, row in enumerate(finishers, start=1):
        row["pos"] = str(index)
    return finishers + non_finishers


# --- rendering --------------------------------------------------------------
def load_font_buffer(path):
    """Pull the embedded IBM Plex Sans subset out of a source PDF."""
    doc = fitz.open(path)
    xref = doc[0].get_fonts(full=True)[0][0]
    _name, _ext, _type, buffer = doc.extract_font(xref)
    return buffer


def assert_glyph_coverage(font_buffer, texts):
    """The embedded font is a subset; fail loudly rather than emit .notdef boxes."""
    font = fitz.Font(fontbuffer=font_buffer)
    missing = {c for text in texts for c in text
               if c != " " and font.has_glyph(ord(c)) == 0}
    if missing:
        raise SystemExit(
            "Embedded font subset lacks glyphs for: "
            + " ".join(sorted(repr(c) for c in missing))
            + "\nChoose wording that reuses characters already present in the source PDFs."
        )
    return font


def centred(page, font, text, centre_x, baseline, size, colour):
    width = font.text_length(text, fontsize=size)
    page.insert_text((centre_x - width / 2, baseline), text,
                     fontname=FONT_ALIAS, fontsize=size, color=colour)


def draw_grid_row(page, top, fill):
    """Draw one table row: background, vertical rules, and bottom rule."""
    page.draw_rect(fitz.Rect(TABLE_X0, top, TABLE_X1, top + ROW_H),
                   color=None, fill=fill)
    for x in COL_EDGES:
        page.draw_line(fitz.Point(x, top), fitz.Point(x, top + ROW_H),
                       color=CLR_BORDER, width=BORDER_W)
    page.draw_line(fitz.Point(TABLE_X0, top + ROW_H), fitz.Point(TABLE_X1, top + ROW_H),
                   color=CLR_BORDER, width=BORDER_W)


def render(template_path, rows, banner_title, purse_total, out_path,
           rows_per_page=ROWS_PER_PAGE):
    src = fitz.open(template_path)
    font_buffer = load_font_buffer(template_path)

    texts = [banner_title, "Pos.", "Player", "To Par", "Net", "Total", "Purse",
             f"Total Purse Allocated: £{purse_total:,.2f}"]
    for row in rows:
        texts += [row["pos"], row["player"], row["topar"] or "-",
                  row["net"] or "", row["purse"] or ""]
    font = assert_glyph_coverage(font_buffer, texts)

    pages = [rows[i:i + rows_per_page] for i in range(0, len(rows), rows_per_page)] or [[]]
    out = fitz.open()
    row_index = 0

    for page_number, page_rows in enumerate(pages):
        is_first = page_number == 0
        template_index = 0 if is_first else min(1, src.page_count - 1)
        out.insert_pdf(src, from_page=template_index, to_page=template_index)
        page = out[-1]

        # Physically strip the template's old table. Painting a white rectangle
        # would leave the original division's text in the file, still selectable
        # and extractable, so redact instead. The club header sits above
        # HEADER_BOTTOM and is left untouched.
        page.add_redact_annot(fitz.Rect(0, HEADER_BOTTOM, PAGE_W, PAGE_H),
                              fill=CLR_WHITE)
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE,
                              graphics=fitz.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED,
                              text=fitz.PDF_REDACT_TEXT_REMOVE)

        page.insert_font(fontname=FONT_ALIAS, fontbuffer=font_buffer)
        page.draw_rect(fitz.Rect(0, HEADER_BOTTOM, PAGE_W, PAGE_H),
                       color=None, fill=CLR_WHITE)

        if is_first:
            banner = fitz.Rect(TABLE_X0, BANNER_TOP, TABLE_X1, BANNER_BOTTOM)
            page.draw_rect(banner, color=CLR_BORDER, fill=CLR_WHITE, width=BORDER_W)
            page.insert_text((BANNER_TEXT_X, BANNER_TOP + BANNER_TEXT_DY), banner_title,
                             fontname=FONT_ALIAS, fontsize=SIZE_BANNER,
                             color=CLR_BANNER_TEXT)

            page.draw_rect(fitz.Rect(TABLE_X0, HEAD_TOP, TABLE_X1, HEAD_BOTTOM),
                           color=None, fill=CLR_BAND)
            centred(page, font, "Pos.", POS_CX, HEAD_TOP + 21.0, SIZE_HEAD, CLR_WHITE)
            page.insert_text((PLAYER_X, HEAD_TOP + 21.0), "Player",
                             fontname=FONT_ALIAS, fontsize=SIZE_HEAD, color=CLR_WHITE)
            centred(page, font, "To Par", TOPAR_CX, HEAD_TOP + 14.25, SIZE_SUBHEAD, CLR_WHITE)
            centred(page, font, "Net", TOPAR_CX, HEAD_TOP + 25.5, SIZE_SUBHEAD, CLR_WHITE)
            centred(page, font, "Total", NET_CX, HEAD_TOP + 13.5, SIZE_HEAD, CLR_WHITE)
            centred(page, font, "Net", NET_CX, HEAD_TOP + 28.5, SIZE_HEAD, CLR_WHITE)
            centred(page, font, "Purse", PURSE_CX, HEAD_TOP + 21.0, SIZE_HEAD, CLR_WHITE)
            y = FIRST_ROW_TOP
        else:
            y = CONT_ROW_TOP

        for row in page_rows:
            # Shading alternates across the whole field, not per page.
            draw_grid_row(page, y, CLR_ROW_ALT if row_index % 2 else CLR_WHITE)
            baseline = y + ROW_TEXT_DY
            centred(page, font, row["pos"], POS_CX, baseline, SIZE_ROW, CLR_VALUE)
            page.insert_text((PLAYER_X, baseline), row["player"],
                             fontname=FONT_ALIAS, fontsize=SIZE_ROW, color=CLR_NAME)
            centred(page, font, row["topar"] or "-", TOPAR_CX, y + TOPAR_TEXT_DY,
                    SIZE_TOPAR, CLR_VALUE)
            centred(page, font, row["net"] or "", NET_CX, baseline, SIZE_ROW, CLR_VALUE)
            centred(page, font, row["purse"] or "", PURSE_CX, baseline, SIZE_ROW, CLR_VALUE)
            y += ROW_H
            row_index += 1

        if page_number == len(pages) - 1:
            footer = fitz.Rect(TABLE_X0, y + 0.75, TABLE_X1, y + 0.75 + FOOTER_H)
            page.draw_rect(footer, color=None, fill=CLR_BAND)
            centred(page, font, f"Total Purse Allocated: £{purse_total:,.2f}",
                    (TABLE_X0 + TABLE_X1) / 2, footer.y0 + FOOTER_TEXT_DY,
                    SIZE_HEAD, CLR_WHITE)

    out.save(out_path, garbage=4, deflate=True)
    out.close()
    return len(pages)


def verify(male_path, female_path, out_path, merged, purse_total):
    """Re-parse the generated PDF and assert the merge invariants hold.

    This is the safety net that matters: it proves the rendered PDF actually
    contains the intended field, and that no primary-division player was
    displaced in a way the club would object to.
    """
    male = parse_leaderboard(male_path, "M Division")[0]["rows"]
    female = parse_leaderboard(female_path, "F Division")[0]["rows"]
    out = parse_leaderboard(out_path)[0]["rows"]

    failures = []

    def check(condition, message):
        print(("PASS  " if condition else "FAIL  ") + message)
        if not condition:
            failures.append(message)

    check(len(out) == len(merged), f"row count round-trips ({len(merged)} -> {len(out)})")
    for field in ("player", "pos", "topar", "net", "purse"):
        check([r[field] for r in out] == [r[field] for r in merged],
              f"{field} values round-trip")

    everyone = {r["player"] for r in male} | {r["player"] for r in female}
    check(everyone == {r["player"] for r in out} and len(out) == len(everyone),
          f"all {len(everyone)} players present exactly once")

    values = [topar_value(r) for r in out]
    check(values == sorted(values), "field is sorted by To Par Net")

    male_topar = {r["player"]: topar_value(r) for r in male}
    old_pos = {r["player"]: int(r["pos"]) for r in male if r["pos"].isdigit()}
    new_pos = {r["player"]: int(r["pos"]) for r in out if r["pos"].isdigit()}

    displaced = [p for p, v in old_pos.items()
                 if male_topar[p] <= PROTECTED_TO_PAR and new_pos.get(p) != v]
    check(not displaced,
          f"every primary player at +{PROTECTED_TO_PAR} or better keeps their position")

    check([r["player"] for r in out[:3]] == [r["player"] for r in male[:3]],
          f"top 3 unchanged -> {[r['player'] for r in out[:3]]}")
    check(not [p for p, v in old_pos.items() if new_pos.get(p, v) < v],
          "no primary player moves up the board")

    actual = sum(purse_value(r) for r in out)
    check(abs(actual - purse_total) < 0.01, f"purse total = £{actual:,.2f}")

    non_finishers = [r["pos"] for r in out if not r["pos"].isdigit()]
    check(non_finishers == sorted(non_finishers, key=lambda p: p != "WD"),
          f"non-finishers retained at the bottom -> {non_finishers}")

    print("\n" + ("ALL CHECKS PASSED" if not failures else f"{len(failures)} FAILURES"))
    return not failures


# --- entry point ------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--male", required=True)
    parser.add_argument("--female", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--title", default="Weekend Medal - Combined Division")
    parser.add_argument("--rows-per-page", type=int, default=ROWS_PER_PAGE)
    parser.add_argument("--preview", action="store_true",
                        help="print the merged order without writing a PDF")
    parser.add_argument("--no-verify", action="store_true",
                        help="skip the post-render invariant checks")
    args = parser.parse_args()

    male_rows = parse_leaderboard(args.male, "M Division")[0]["rows"]
    female_rows = parse_leaderboard(args.female, "F Division")[0]["rows"]
    merged = merge_divisions(male_rows, female_rows)
    purse_total = sum(purse_value(row) for row in merged)

    if args.preview:
        female_names = {row["player"] for row in female_rows}
        for row in merged:
            flag = "  <- F" if row["player"] in female_names else ""
            print(f"{row['pos']:>3}  {row['player']:<24} {str(row['topar']):>4} "
                  f"{str(row['net']):>4}  {str(row['purse']):>8}{flag}")
        print(f"\n{len(merged)} rows, purse total £{purse_total:,.2f}")
        return

    page_count = render(args.male, merged, args.title, purse_total, args.out,
                        args.rows_per_page)
    print(f"Wrote {args.out}: {len(merged)} rows across {page_count} pages "
          f"(purse total £{purse_total:,.2f})\n")

    if not args.no_verify:
        if not verify(args.male, args.female, args.out, merged, purse_total):
            raise SystemExit("Verification failed - do not publish this PDF.")


if __name__ == "__main__":
    main()
