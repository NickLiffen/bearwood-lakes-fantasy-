---
name: merge-division-leaderboards
description: Combine two Bearwood Lakes golf leaderboard PDFs (M Division and F Division) into a single combined leaderboard PDF, sorted by To Par Net, preserving the club's exact export format. Use when asked to merge, combine, or join the male and female leaderboards, medal results, or division PDFs into one.
---

# Merge Division Leaderboards

Combines the men's and women's medal leaderboard PDFs exported by the club's
scoring system into **one combined leaderboard**, sorted by To Par Net, rendered
so it is visually indistinguishable from the original export.

The output is not a page-stitch. Scores are parsed out of both PDFs, merged into
a single ranked field, and re-rendered onto the original page as a template.

## When to Use

- "Combine the male and female leaderboards"
- "Merge the medal PDFs into one"
- "Can you join the two divisions into a single leaderboard"
- Any request to produce a combined/overall board from separate division exports

## Prerequisites

Python 3 with **PyMuPDF** (`import fitz`). Verify before starting:

```bash
python3 -c "import fitz; print(fitz.__doc__)"
```

If missing: `pip install pymupdf`. Poppler (`pdftoppm`, `pdftotext`) is useful
for visual checks but is not required by the script.

No network access and no third-party service is needed — do not upload the PDFs
anywhere.

## Step-by-Step Process

### 1. Locate the source PDFs

Ask the user where they are if not given. They are typically on the Desktop as
`Male Leaderboard.pdf` and `Female Leaderboard.pdf`.

> **Gotcha:** the "Female Leaderboard.pdf" export often contains **both**
> divisions — page 1 is F Division, the remaining pages duplicate the entire M
> Division. Always filter by division banner text, never by file or page number.
> The script already does this.

### 2. Preview the merge before rendering

Always show the user the resulting order first. This is the step that catches
problems, because the club cares intensely about who moves.

```bash
python3 .github/skills/merge-division-leaderboards/scripts/merge_leaderboard.py \
  --male "~/Desktop/Male Leaderboard.pdf" \
  --female "~/Desktop/Female Leaderboard.pdf" \
  --out /dev/null --preview
```

### 3. Generate the combined PDF

```bash
python3 .github/skills/merge-division-leaderboards/scripts/merge_leaderboard.py \
  --male "~/Desktop/Male Leaderboard.pdf" \
  --female "~/Desktop/Female Leaderboard.pdf" \
  --out "~/Desktop/Combined Leaderboard.pdf"
```

Verification runs automatically and the script exits non-zero if any check
fails. **Never hand over a PDF whose verification failed.**

### 4. Render and eyeball the result

Automated checks confirm the data, not the design. Always look at page 1:

```bash
pdftoppm -png -r 100 -f 1 -l 1 "~/Desktop/Combined Leaderboard.pdf" /tmp/check
```

Then view `/tmp/check-1.png`. Confirm the header, banner, column header band,
row shading, and footer all match the original export.

### 5. Clean up

Delete any rendered PNGs and scratch PDFs from `/tmp`.

## Merge Rules

These rules encode what the club actually wants. Do not change them without
asking.

1. **Sort by To Par Net ascending.** Both divisions play to par 72, so To Par Net
   and Total Net produce the same order.
2. **The primary (men's) division keeps its relative order.** The sort is stable
   and tagged by source division.
3. **Secondary-division players go to the *end* of their tie group.** This means
   no man is leapfrogged within a tie, and everyone above the insertion point
   keeps their exact original position.
4. **Nobody moves up.** Inserting players can only push people down.
5. **Positions are renumbered sequentially** (1, 2, 3…), including through ties.
   The club's export does not use "T4"-style tied notation — do not introduce it.
6. **WD and NR stay at the bottom**, after all finishers, keeping their `WD`/`NR`
   position markers rather than a number.
7. **Purse values are carried across unchanged** and the footer total is the sum
   of both divisions.

`PROTECTED_TO_PAR = 4` in the script encodes the club's hard requirement that
**the top 3 and anyone at +4 or better must not move**. Verification enforces it.

## Open Question: The Purse Column

Purses are currently carried over verbatim, so a women's prize winner can appear
well down the combined board still showing her payout (e.g. £24.00 at 44th).
Totals are summed (£335 + £24 = £359).

This was flagged to the user and accepted for the August 2026 medal, but **ask
each time** whether they want purses kept as-is, blanked, or recalculated
against a single combined pot.

## Important Implementation Notes

### Reuse the original page as a template

The club header is **logos plus vector outline artwork**, not text — the title
"August Weekend Medal 2026", the date, and "Round 1 Leaderboard" cannot be
extracted as text and must not be re-typeset. The script copies the source page
and only replaces the table area below `HEADER_BOTTOM = 108.0`.

This means the date and event name come from the source PDF automatically and do
not need to be passed in.

### Redact, never paint over

Covering the old table with a white rectangle leaves the original division's text
in the file — still selectable, copyable, and visible to `pdftotext`. That is a
real defect, not a cosmetic one. The script uses redaction annotations to
physically strip the old content:

```python
page.add_redact_annot(rect, fill=CLR_WHITE)
page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE,
                      graphics=fitz.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED,
                      text=fitz.PDF_REDACT_TEXT_REMOVE)
```

Confirm with: `pdftotext out.pdf - | grep -c "M Division\|F Division"` → `0`.

### Reuse the embedded font

The PDFs embed a **subset** of IBM Plex Sans Regular (~64 characters). The script
extracts it from the source and re-embeds it, so glyphs match exactly.

Because it is a subset, characters not already used in the source will render as
blank boxes. Missing from the subset: **`O` `U` `V` `X` `Y` `Z` `q` `,`**.
`assert_glyph_coverage()` fails loudly rather than emitting `.notdef` boxes.

This is why the banner says "Combined Division" and not "Overall" — `O` is
unavailable. If new wording is needed, pick words built from existing characters.

### Parsing: cluster rows by y with tolerance

The "To Par Net" column is a **separate text block** whose baselines sit a
fraction of a point off the main row. Grouping spans by an exact or rounded y
value splits every row in half. Cluster with a tolerance of `ROW_H / 3`.

### Layout constants

All geometry was measured from the real export — see
[`references/pdf-layout.md`](references/pdf-layout.md) for the values, how they
were derived, and how to re-derive them if the club changes its export.

Two easily-missed details: the **To Par column is 9pt** while every other cell is
10.5pt, and **continuation pages have no banner and no repeated column header**,
starting rows at `y = 113.25`.

## Error Handling

| Symptom | Cause | Fix |
|---|---|---|
| `Embedded font subset lacks glyphs for: 'O'` | Wording uses a character not in the subset | Reword using available characters |
| `No division matching 'F Division' found` | Wrong file, or export renamed its divisions | Check the banner text with `pdftotext file.pdf -` |
| Row count is far higher than expected | Old content not redacted, or y-clustering broken | Check redaction ran; check the tolerance in `parse_leaderboard` |
| Names and To Par values merged into one field | Column x-bands drifted | Re-derive bands, see the reference doc |
| Verification fails | Genuine data or layout regression | **Do not publish.** Investigate before delivering |
