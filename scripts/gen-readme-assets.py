#!/usr/bin/env python3
"""README visuals for dsh-pdf-table (docs/assets/), derived from the shipped code.

Outputs (idempotent overwrite):
  dsh-pdf-table-hero-{zh,en}-{light,dark}.webp   1440x576 hero banner (Pillow)
  dsh-pdf-table-flow-v5-{light,dark}.svg         1100x660 structure figure (hand SVG)

What the drawings are derived from (read before writing, never invented):

  src/plugin/tools.ts   pdf.inspect -> { pages, chars_per_page, total_chars,
                        has_text_layer, pages_without_text }; pdf.tables -> { tables:
                        [{ page, rows }], rows }; pdf.to_csv -> toCsv(rows) ->
                        safeExportPath($DSH_HOME/dsh-pdf-table/exports, filename) ->
                        writeFile -> { path, sha256, rows, bytes, pages }.
  src/core/pdf.ts       ROW_TOLERANCE=3 (items within 3pt share a row), CELL_GAP=6
                        (x gap above 6pt starts a cell), COLUMN_TOLERANCE=18
                        (cell starts cluster into columns); rows with fewer than two
                        cells are dropped as prose; short rows are padded with ''.
  src/core/csv.ts       RFC 4180: quote on comma, quote, CR or LF; double the quotes.
  src/core/safe-path.ts [A-Za-z0-9._-]{1,120} filename -> resolve under the base ->
                        realpath re-anchor; escapes raise E_PDF_PATH_NOT_ALLOWED,
                        unsafe names raise E_PDF_PATH_INVALID.

Design notes
------------
* Hero: the extraction sheet. Left column is prose (kicker / title / two value lines
  / subtitle / meta / footer). Right column is the tool's own object: the sample
  3x4 table drawn on a coordinate axis (y ticks on the left, x ticks below, the
  quoted "South, East" cell ringed) plus the CSV receipt the tool returns. Every
  value is copied from the committed quickstart golden, none is asserted.
* Flow: grammar = TWO-SIDED BOUNDARY over a coordinate field, with an S-tail.
  The R0 panel holds a page specimen, the coordinate field (rows = y bands, cells =
  x gaps, columns = start clusters, one prose row dropped) and the resulting
  rows[y][x] grid side by side. The tail turns down into the R1 write zone: the CSV
  text crosses one guarded seam (filename whitelist, base prefix, realpath) and the
  file receipt sits on the far side. Deliberately not a row of nodes with arrows.
  The figure is token-only English, so one light/dark pair serves all five README
  languages.

Every label is measured with the same TTF that draws it (or with the Windows
fallback Chrome uses); a label that would leave its box aborts the run instead of
shipping clipped text.

Run once:  python scripts/gen-readme-assets.py
Requires:  Pillow, and Windows fonts msyh.ttc / msyhbd.ttc / consola.ttf /
           segoeui.ttf / segoeuib.ttf.
"""
from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "assets")

HERO_W, HERO_H = 1440, 576
FLOW_W, FLOW_H = 1100, 660

FONT_CJK = r"C:\Windows\Fonts\msyh.ttc"
FONT_CJK_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_MONO = r"C:\Windows\Fonts\consola.ttf"
FONT_EN = r"C:\Windows\Fonts\segoeui.ttf"
FONT_EN_BOLD = r"C:\Windows\Fonts\segoeuib.ttf"
for _p in (FONT_CJK, FONT_CJK_BOLD, FONT_MONO, FONT_EN, FONT_EN_BOLD):
    if not os.path.exists(_p):
        sys.exit(f"FATAL: font missing: {_p}")

# Family palette + the page backgrounds fixed by the task.
SKIN = {
    "light": dict(bg_from="#f9f6fd", bg_to="#e4eaf8", card="#ffffff",
                  zone="#f6f3fd", edge="#e2dff0", text="#141419",
                  sub="#4d5261", faint="#8f94a4", accent="#4B67B4",
                  accent2="#16a34a", pill="#ece7f9", grid="#e7e4f0",
                  red="#c0392b", amber="#b45309", shadow=(32, 26, 64),
                  shadow_alpha=34, glow=22, row_tint="#f4f1fd"),
    "dark": dict(bg_from="#131a2a", bg_to="#0c1016", card="#1b2231",
                 zone="#171e2d", edge="#2e374b", text="#f0f3f9",
                 sub="#a8b1c4", faint="#737b8d", accent="#8496f5",
                 accent2="#3fb950", pill="#242d42", grid="#1e2636",
                 red="#f87171", amber="#fbbf24", shadow=(0, 0, 0),
                 shadow_alpha=90, glow=38, row_tint="#1f2740"),
}

_KINDS = {
    "cjk": FONT_CJK, "cjk_bold": FONT_CJK_BOLD, "mono": FONT_MONO,
    "en": FONT_EN, "en_bold": FONT_EN_BOLD,
}
_MEASURE = ImageDraw.Draw(Image.new("RGB", (1, 1)))


def font(size, kind="cjk_bold"):
    return ImageFont.truetype(_KINDS[kind], max(8, int(round(size))))


def width(text, size, kind):
    return _MEASURE.textlength(text, font=font(size, kind))


def hx(value):
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def fit(text, kind, maxw, size, floor):
    while size > floor and width(text, size, kind) > maxw:
        size -= 1
    return size


def must_fit(text, kind, size, maxw, where):
    w = width(text, size, kind)
    if w > maxw:
        sys.exit(f"FATAL: {where}: {text!r} needs {w:.0f}px at {size}px, "
                 f"box {maxw:.0f}px.")
    return w


def gradient(w, h, c1, c2):
    top, bottom = hx(c1), hx(c2)
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(1, h - 1)
        d.line([(0, y), (w, y)],
               fill=tuple(int(top[i] + (bottom[i] - top[i]) * t)
                          for i in range(3)))
    return img


def glow(img, cx, cy, radius, color, alpha=40):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        fill=color + (alpha,))
    layer = layer.filter(ImageFilter.GaussianBlur(max(8, radius * 0.5)))
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def card(img, box, s, radius=22, shadow=22, fill="card", edge="edge"):
    x0, y0, x1, y1 = box
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle(
        [x0 + 2, y0 + 6, x1, y1 + 8], radius=radius,
        fill=s["shadow"] + (s["shadow_alpha"],))
    layer = layer.filter(ImageFilter.GaussianBlur(shadow))
    img = Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")
    ImageDraw.Draw(img).rounded_rectangle(
        [x0, y0, x1, y1], radius=radius, fill=hx(s[fill]),
        outline=hx(s[edge]), width=1)
    return img


def pill(img, xy, text, s, size=20, kind="cjk_bold", fg="accent", pad=17):
    d = ImageDraw.Draw(img)
    f = font(size, kind)
    w = d.textlength(text, font=f)
    x, y = xy
    h = max(34, size + 18)
    d.rounded_rectangle([x, y, x + w + pad * 2, y + h], radius=h / 2,
                        fill=hx(s["pill"]), outline=hx(s["accent"]), width=1)
    d.text((x + pad, y + h / 2 + 1), text, font=f, fill=hx(s[fg]), anchor="lm")
    return img


def write(img, xy, text, s, size, kind, color="text", maxw=None,
          where="label"):
    d = ImageDraw.Draw(img)
    if maxw is not None:
        must_fit(text, kind, size, maxw, where)
    d.text(xy, text, font=font(size, kind), fill=hx(s[color]))
    return img


# ---------------------------------------------------------------------------
# Hero copy. Every number comes from samples/quickstart/expected/result.json
# (138 text chars, 1 page, 3x4 rows, 71 bytes, sha256 c5826d3772fb...).
# ---------------------------------------------------------------------------
HERO = {
    "zh": dict(
        kicker="DeepSeek Harness · PDF 表格抽取插件",
        title="dsh-pdf-table",
        value=["把 PDF 的文本层还原成行列，导出 CSV",
               "不 OCR、不联网、不调模型，原 PDF 只读"],
        sub="pdf.inspect → pdf.tables → pdf.to_csv · RFC 4180 引号转义",
        meta="R0 只读 ×2 · R1 本地写 ×1 · 只写 exports/ · pdfjs-dist 5.4.394",
        foot="Apache-2.0 · github.com/PerryLink/dsh-pdf-table · Node ≥24.9",
        panel_title="坐标 → 行列",
        panel_meta="1 页 · 138 字符",
        panel_rule="Δy ≤3pt 成行 · Δx >6pt 分格 · 列起点 18pt",
        panel_call='"South, East" · 逗号 → 整格加引号',
        panel_note="行按 y 归并，列按起点聚类；短行补空串",
        out_title="pdf.to_csv → exports/",
        out_last="只读解析，不写回原 PDF",
        out_risk="R1 · $DSH_HOME/dsh-pdf-table/exports/",
    ),
    "en": dict(
        kicker="DeepSeek Harness · PDF table extraction plugin",
        title="dsh-pdf-table",
        value=["Turn a PDF text layer into rows and columns",
               "Offline CSV you can check cell by cell"],
        sub="pdf.inspect → pdf.tables → pdf.to_csv · RFC 4180 quoting",
        meta="R0 read-only ×2 · R1 local write ×1 · exports/ only · pdfjs-dist 5.4.394",
        foot="Apache-2.0 · github.com/PerryLink/dsh-pdf-table · Node ≥24.9",
        panel_title="coordinates → rows",
        panel_meta="1 page · 138 chars",
        panel_rule="Δy ≤3pt rows · Δx >6pt cells · 18pt columns",
        panel_call='"South, East" · comma → quoted',
        panel_note="rows merged by y, columns by start; short rows padded",
        out_title="pdf.to_csv → exports/",
        out_last="parse only — never writes back",
        out_risk="R1 · $DSH_HOME/dsh-pdf-table/exports/",
    ),
}

# Header row + two data rows of samples/quickstart/input/table-demo.pdf.
SAMPLE = [["Region", 'Q1 "units"', "Q2", "Q3"],
          ["North", "120", "135", "150"],
          ["South, East", "90", "110", "130"]]


def hero(lang, skin_name):
    s = SKIN[skin_name]
    model = HERO[lang]
    zh = lang == "zh"
    body = "cjk" if zh else "en"
    body_bold = "cjk_bold" if zh else "en_bold"

    img = gradient(HERO_W, HERO_H, s["bg_from"], s["bg_to"])
    img = glow(img, 1210, 46, 430, hx(s["accent"]), s["glow"])
    img = glow(img, 118, 566, 300, hx(s["accent"]),
               s["glow"] // 2 if skin_name == "light" else s["glow"] // 3)

    m, left_w = 64, 760
    img = pill(img, (m, 56), model["kicker"], s,
               size=20 if zh else 19,
               kind="cjk_bold" if zh else "en_bold")

    d = ImageDraw.Draw(img)
    title_size = fit(model["title"], "mono", left_w, 84, 79)
    if title_size < 79:
        sys.exit("FATAL: hero title drops below 48px on an 880px render")
    d.text((m, 118), model["title"], font=font(title_size, "mono"),
           fill=hx(s["text"]))

    value_size = min(fit(line, body_bold, left_w, 34 if zh else 32, 27)
                     for line in model["value"])
    for i, line in enumerate(model["value"]):
        write(img, (m, 246 + i * (value_size + 13)), line, s, value_size,
              body_bold, "text", left_w, f"hero.{lang}.value{i}")

    write(img, (m + 2, 386), model["sub"], s, 25, body, "sub", left_w,
          f"hero.{lang}.sub")
    write(img, (m + 2, 442), model["meta"], s, 20, body, "faint", left_w,
          f"hero.{lang}.meta")

    d = ImageDraw.Draw(img)
    d.line([m + 2, 482, m + 742, 482], fill=hx(s["grid"]), width=2)
    write(img, (m + 2, 496), model["foot"], s, 17, "en", "faint", 742,
          f"hero.{lang}.foot")

    # ------------------------------------------------- card A: the sample grid
    img = card(img, (872, 44, 1376, 356), s, radius=22)
    write(img, (898, 66), model["panel_title"], s, 21, body_bold, "text", 300,
          f"hero.{lang}.panel_title")
    d = ImageDraw.Draw(img)
    d.text((1350, 74), model["panel_meta"], font=font(12, body),
           fill=hx(s["faint"]), anchor="ra")
    write(img, (898, 98), model["panel_rule"], s, 12, body, "faint", 452,
          f"hero.{lang}.panel_rule")

    gx0, gy0 = 946, 128
    cw, rh = 101, 44
    # axes first (behind the grid)
    d = ImageDraw.Draw(img)
    d.line([930, 268, 930, 142], fill=hx(s["edge"]), width=2)
    d.polygon([(930, 134), (925, 144), (935, 144)], fill=hx(s["edge"]))
    d.line([930, 268, 1360, 268], fill=hx(s["edge"]), width=2)
    d.polygon([(1366, 268), (1356, 263), (1356, 273)], fill=hx(s["edge"]))
    d.text((930, 126), "y", font=font(12, "mono"), fill=hx(s["faint"]),
           anchor="mm")
    d.text((1366, 268), "x", font=font(12, "mono"), fill=hx(s["faint"]),
           anchor="lm")
    for i in range(4):
        d.line([924, gy0 + i * rh, 934, gy0 + i * rh],
               fill=hx(s["edge"]), width=1)
    for i in range(5):
        d.line([gx0 + i * cw, 262, gx0 + i * cw, 274],
               fill=hx(s["edge"]), width=1)

    # header tint + grid lines (header + two data rows, as in the sample)
    d.rounded_rectangle([gx0, gy0, gx0 + 4 * cw, gy0 + rh], radius=6,
                        fill=hx(s["row_tint"]))
    for i in range(5):
        d.line([gx0 + i * cw, gy0, gx0 + i * cw, gy0 + 3 * rh],
               fill=hx(s["grid"]), width=1)
    for i in range(4):
        d.line([gx0, gy0 + i * rh, gx0 + 4 * cw, gy0 + i * rh],
               fill=hx(s["grid"]), width=1)
    for row, values in enumerate(SAMPLE):
        for col, value in enumerate(values):
            must_fit(value, "mono", 13, cw - 18, f"hero.{lang}.cell")
            d.text((gx0 + col * cw + 9, gy0 + row * rh + rh / 2),
                   value, font=font(13, "mono"),
                   fill=hx(s["text"] if row else s["sub"]), anchor="lm")

    # ring the quoted cell: the sample exists to prove this escaping
    d.rounded_rectangle([gx0 + 1, gy0 + 2 * rh + 4, gx0 + cw - 1,
                         gy0 + 3 * rh - 4], radius=7,
                        outline=hx(s["accent"]), width=2)
    write(img, (898, 296), model["panel_call"], s, 12.5,
          "mono" if not zh else body, "accent", 452,
          f"hero.{lang}.panel_call")
    write(img, (898, 324), model["panel_note"], s, 12, body, "faint", 452,
          f"hero.{lang}.panel_note")

    # ---------------------------------------------- card B: the CSV receipt
    img = card(img, (872, 372, 1376, 532), s, radius=20)
    write(img, (898, 392), model["out_title"], s, 12.5, "mono", "text", 300,
          f"hero.{lang}.out_title")
    d = ImageDraw.Draw(img)
    d.text((1350, 396), "RFC 4180", font=font(11, "mono"),
           fill=hx(s["accent"]), anchor="ra")
    d.line([898, 408, 1350, 408], fill=hx(s["grid"]), width=1)

    d.text((898, 430), 'Region,"Q1 ""units""",Q2,Q3', font=font(12, "mono"),
           fill=hx(s["text"]))
    d.text((898, 452), "pdf-tables-c5826d3772fb.csv · 3 rows · 71 bytes",
           font=font(12, "mono"), fill=hx(s["sub"]))
    d.text((898, 474), "sha256 c5826d3772fb… · pages [1]",
           font=font(12, "mono"), fill=hx(s["sub"]))
    write(img, (898, 496), model["out_risk"], s, 12, "mono", "accent", 452,
          f"hero.{lang}.out_risk")
    write(img, (898, 518), model["out_last"], s, 11.5, body, "faint", 430,
          f"hero.{lang}.out_last")

    # green check: the CSV was written and hashed
    d.ellipse([1340, 490, 1358, 508], outline=hx(s["accent2"]), width=2)
    d.line([1344, 499, 1348, 504, 1355, 494], fill=hx(s["accent2"]), width=2)

    name = f"dsh-pdf-table-hero-{lang}-{skin_name}.webp"
    img.save(os.path.join(OUT, name), "WEBP", quality=92)
    print(f"wrote {name}")


# ---------------------------------------------------------------------------
# Flow figure (1100x660). Token-only English: one light/dark pair for all five
# README languages.
# ---------------------------------------------------------------------------
FLOW_TEXT = dict(
    title="dsh-pdf-table",
    sub="PDF text layer → coordinate grid → RFC 4180 CSV · local only · no OCR · no model call",
    meta1="R0 read-only ×2 · R1 local write ×1",
    meta2="pdfjs-dist 5.4.394 · Node ≥24.9",
    r0tab="R0 · read-only",
    r0sub="pdf.tables · items → rows (Δy ≤3pt) → cells (Δx >6pt) → columns (18pt tol)",
    page_file="report.pdf",
    page_meta="table-demo.pdf · 1 page",
    page_inspect="pdf.inspect",
    page_stamp="text layer: yes · 138 chars",
    legend="Δy ≤3pt → row · Δx >6pt → cell · column start 18pt",
    prose="1 block → dropped",
    matrix="rows[y][x]",
    matrix_note="3 × 4",
    ghost="1 text block → prose · dropped",
    r1tab="R1 · local write",
    receipt_title="exports/ · file on disk",
    receipt_path="$DSH_HOME/dsh-pdf-table/exports/",
    receipt_file="pdf-tables-c5826d3772fb.csv",
    receipt_sha="sha256 c5826d3772fb… · 3 rows",
    receipt_bytes="71 bytes · pages [1]",
    receipt_foot="source PDF untouched",
    gate_title="safeExportPath",
    gate_check1="[A-Za-z0-9._-]{1,120}",
    gate_check2="resolve(base) + sep",
    gate_check3="realpath(base) + /",
    gate_bad1="unsafe name → E_PDF_PATH_INVALID",
    gate_bad2="../x.csv → E_PDF_PATH_NOT_ALLOWED",
    csv_title="toCsv() · RFC 4180",
    csv_sub="pdf.to_csv · builds the text",
    csv_chip="quoted",
    csv_note1=', → "…"   ·   " → ""',
    csv_note2="3 rows · 4 cols · 71 bytes",
    foot="scanned PDF → E_PDF_NO_TEXT_LAYER → OCR first · rows with one text block are dropped as prose · short rows padded with empty cells · original PDF read-only",
    desc=("The R0 read-only panel takes the text items of report.pdf, groups them into "
          "rows by y (3pt), splits cells on x gaps above 6pt, clusters cell starts into "
          "four columns at 18pt tolerance, drops the single-block prose row, and yields a "
          "3 by 4 rows[y][x] grid. The tail turns down into the R1 write zone: toCsv() "
          "produces RFC 4180 quoted text, one guarded seam (filename whitelist, base "
          "prefix, realpath) admits it, and the file lands at "
          "$DSH_HOME/dsh-pdf-table/exports/ with a sha256 receipt."),
)


def esc(text):
    return (text.replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;"))


def _svg_fit(text, size, maxw, is_mono, where):
    w = width(text, int(round(size)), "mono" if is_mono else "cjk")
    if w > maxw:
        sys.exit(f"FATAL: {where}: {text!r} needs {w:.0f}px at {size}px, "
                 f"box {maxw:.0f}px.")


def flow_svg(skin_name):
    s = SKIN[skin_name]
    T = FLOW_TEXT
    W, H = FLOW_W, FLOW_H
    sans = ('font-family="Microsoft YaHei, Segoe UI, ui-sans-serif, system-ui, '
            'sans-serif"')
    mono = ('font-family="Consolas, ui-monospace, SFMono-Regular, Menlo, '
            'monospace"')
    p = []
    a = p.append

    def tx(x, y, text, size, color, kind="sans", bold=False, anchor=None,
           maxw=None, where="label"):
        if maxw is not None:
            _svg_fit(text, size, maxw, kind == "mono", where)
        attrs = [f'x="{x}"', f'y="{y}"', f'fill="{s[color]}"',
                 mono if kind == "mono" else sans, f'font-size="{size}"']
        if bold:
            attrs.append('font-weight="700"')
        if anchor:
            attrs.append(f'text-anchor="{anchor}"')
        a(f'<text {" ".join(attrs)}>{esc(text)}</text>')

    a(f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="ptT ptD">
<title id="ptT">dsh-pdf-table structure: text items cluster into rows and columns inside the read-only panel, then the CSV text crosses one guarded write seam into the local exports directory</title>
<desc id="ptD">{esc(T["desc"])}</desc>
<defs>
  <linearGradient id="ptBg" x1="0" y1="0" x2="0.25" y2="1">
    <stop offset="0" stop-color="{s['bg_from']}"/>
    <stop offset="1" stop-color="{s['bg_to']}"/>
  </linearGradient>
  <filter id="ptSoft" x="-25%" y="-25%" width="155%" height="170%">
    <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#1b1735" flood-opacity="{0.16 if skin_name == "light" else 0.55}"/>
  </filter>
  <pattern id="ptDots" width="26" height="26" patternUnits="userSpaceOnUse">
    <circle cx="1.3" cy="1.3" r="1.3" fill="{s['grid']}"/>
  </pattern>
</defs>
<rect width="{W}" height="{H}" rx="22" fill="url(#ptBg)"/>
<rect width="{W}" height="{H}" rx="22" fill="url(#ptDots)" opacity=".55"/>
''')

    # ------------------------------------------------------------------ header
    tx(44, 58, T["title"], 30, "text", "mono", bold=True)
    tx(44, 88, T["sub"], 15, "sub", "sans", maxw=1012, where="header sub")
    tx(1056, 50, T["meta1"], 12.5, "faint", "mono", anchor="end", maxw=420,
       where="header meta 1")
    tx(1056, 72, T["meta2"], 12.5, "faint", "mono", anchor="end", maxw=320,
       where="header meta 2")
    a(f'<line x1="44" y1="100" x2="1056" y2="100" stroke="{s["grid"]}" '
      f'stroke-width="1.4"/>')

    # ------------------------------------------------- R0 panel + page column
    a(f'<g filter="url(#ptSoft)"><rect x="204" y="104" width="860" height="272" '
      f'rx="22" fill="{s["card"]}" stroke="{s["edge"]}" stroke-width="1.5"/></g>')
    a(f'<rect x="220" y="92" width="128" height="26" rx="13" fill="{s["pill"]}" '
      f'stroke="{s["accent"]}" stroke-width="1.3"/>')
    tx(284, 110, T["r0tab"], 12, "accent", "mono", bold=True, anchor="middle")
    tx(220, 142, T["r0sub"], 12, "faint", "mono", maxw=812, where="r0 subtitle")

    # page specimen (outside the panel, left)
    tx(36, 122, T["page_file"], 13, "text", "mono", bold=True)
    tx(36, 141, T["page_meta"], 11, "faint", "sans", maxw=152, where="page meta")
    a(f'<g filter="url(#ptSoft)"><rect x="36" y="154" width="152" height="188" '
      f'rx="8" fill="{s["card"]}" stroke="{s["edge"]}" stroke-width="1.4"/></g>')
    bars = [
        (174, [(48, 26), (80, 30), (114, 22), (148, 26)]),
        (200, [(48, 22), (76, 34), (116, 20), (144, 30)]),
        (226, [(48, 30), (84, 24), (114, 30)]),
        (252, [(48, 24), (78, 28), (112, 24), (142, 30)]),
    ]
    for y, items in bars:
        for x, w in items:
            a(f'<rect x="{x}" y="{y}" width="{w}" height="7" rx="3.5" '
              f'fill="{s["faint"]}" opacity=".55"/>')
    a(f'<rect x="48" y="300" width="128" height="7" rx="3.5" '
      f'fill="{s["faint"]}" opacity=".3"/>')
    tx(36, 362, T["page_inspect"], 11, "accent", "mono", bold=True)
    tx(36, 380, T["page_stamp"], 11, "faint", "sans", maxw=168,
       where="page stamp")

    # --------------------------------------------------------- coordinate field
    ax, ay = 256, 326
    a(f'<line x1="{ax}" y1="{ay}" x2="{ax}" y2="170" stroke="{s["edge"]}" '
      f'stroke-width="1.4"/>')
    a(f'<path d="M{ax} 162l-4 8h8z" fill="{s["edge"]}"/>')
    a(f'<line x1="{ax}" y1="{ay}" x2="612" y2="{ay}" stroke="{s["edge"]}" '
      f'stroke-width="1.4"/>')
    a(f'<path d="M620 {ay}l-8 -4v8z" fill="{s["edge"]}"/>')
    tx(ax, 158, "y", 12, "faint", "mono", anchor="middle")
    tx(626, ay + 4, "x", 12, "faint", "mono")

    cols = [300, 380, 460, 540]
    for i, cx in enumerate(cols):
        a(f'<line x1="{cx}" y1="186" x2="{cx}" y2="296" stroke="{s["accent"]}" '
          f'stroke-width="1" stroke-dasharray="4 5" opacity=".35"/>')
        tx(cx, 344, f"C{i + 1}", 11, "faint", "mono", anchor="middle")

    rows = [
        (196, [(0, 34), (1, 44), (2, 28), (3, 26)]),
        (226, [(0, 30), (1, 40), (2, 32), (3, 24)]),
        (256, [(0, 36), (1, 30), (2, 34)]),
        (286, [(0, 28), (1, 42), (2, 30), (3, 28)]),
    ]
    for idx, (y, items) in enumerate(rows):
        tx(252, y + 6, f"R{idx + 1}", 11, "faint", "mono", anchor="end")
        for col, w in items:
            a(f'<rect x="{cols[col]}" y="{y}" width="{w}" height="8" rx="4" '
              f'fill="{s["accent"]}" opacity=".72"/>')
    # prose band, dropped
    a(f'<rect x="296" y="298" width="212" height="20" rx="7" fill="none" '
      f'stroke="{s["amber"]}" stroke-width="1.4" stroke-dasharray="5 4"/>')
    a(f'<rect x="300" y="304" width="196" height="8" rx="4" '
      f'fill="{s["faint"]}" opacity=".45"/>')
    tx(516, 313, T["prose"], 11, "amber", "mono", maxw=110, where="prose tag")

    # 18pt column-start tolerance bracket
    a(f'<path d="M300 178 V170 H380 V178" fill="none" stroke="{s["accent"]}" '
      f'stroke-width="1.3"/>')
    tx(340, 166, "18pt", 11, "accent", "mono", anchor="middle")
    # >6pt cell gap caliper on row 2
    a(f'<path d="M330 236 H380" stroke="{s["accent"]}" stroke-width="1.2" '
      f'stroke-dasharray="3 3" opacity=".7"/>')
    a(f'<path d="M330 232v8M380 232v8" stroke="{s["accent"]}" '
      f'stroke-width="1.2" opacity=".7"/>')
    tx(355, 228, ">6pt", 11, "accent", "mono", anchor="middle")
    tx(220, 366, T["legend"], 11.5, "faint", "mono", maxw=408,
       where="field legend")

    # ------------------------------------------------------------- matrix side
    a(f'<line x1="640" y1="152" x2="640" y2="226" stroke="{s["edge"]}" '
      f'stroke-width="1.2" stroke-dasharray="3 5"/>')
    a(f'<line x1="640" y1="274" x2="640" y2="356" stroke="{s["edge"]}" '
      f'stroke-width="1.2" stroke-dasharray="3 5"/>')
    a(f'<path d="M632 250h18" stroke="{s["accent"]}" stroke-width="2" '
      f'stroke-linecap="round"/>')
    a(f'<path d="M656 250l-10 -5v10z" fill="{s["accent"]}"/>')
    tx(656, 172, T["matrix"], 13, "text", "mono", bold=True)
    tx(1046, 172, T["matrix_note"], 11, "faint", "mono", anchor="end")

    mx0, my0, mw_, mh_ = 656, 182, 390, 34
    cw = mw_ / 4
    a(f'<rect x="{mx0}" y="{my0}" width="{mw_}" height="{mh_}" '
      f'fill="{s["row_tint"]}" opacity=".8"/>')
    for i in range(5):
        a(f'<line x1="{mx0 + i * cw:.1f}" y1="{my0}" x2="{mx0 + i * cw:.1f}" '
          f'y2="{my0 + 4 * mh_}" stroke="{s["grid"]}" stroke-width="1.1"/>')
    for i in range(5):
        a(f'<line x1="{mx0}" y1="{my0 + i * mh_}" x2="{mx0 + mw_}" '
          f'y2="{my0 + i * mh_}" stroke="{s["grid"]}" stroke-width="1.1"/>')
    for r, values in enumerate(SAMPLE):
        for c, value in enumerate(values):
            _svg_fit(value, 13, cw - 14, True, "matrix cell")
            a(f'<text x="{mx0 + c * cw + 7:.1f}" y="{my0 + r * mh_ + mh_ / 2 + 4.5}" '
              f'fill="{s["text"] if r else s["sub"]}" {mono} font-size="13">'
              f'{esc(value)}</text>')
    a(f'<rect x="{mx0}" y="334" width="{mw_}" height="26" rx="8" fill="none" '
      f'stroke="{s["amber"]}" stroke-width="1.3" stroke-dasharray="5 4"/>')
    tx(668, 352, T["ghost"], 11, "amber", "mono", maxw=250, where="ghost row")

    # ------------------------------------------------- R1 write zone + receipt
    a(f'<rect x="28" y="412" width="680" height="224" rx="24" '
      f'fill="{s["zone"]}" stroke="{s["accent"]}" stroke-width="1.5" '
      f'stroke-dasharray="7 6" opacity=".95"/>')
    a(f'<rect x="44" y="400" width="144" height="26" rx="13" fill="{s["pill"]}" '
      f'stroke="{s["accent"]}" stroke-width="1.3"/>')
    tx(116, 418, T["r1tab"], 12, "accent", "mono", bold=True, anchor="middle")

    a(f'<g filter="url(#ptSoft)"><rect x="44" y="428" width="348" height="192" '
      f'rx="18" fill="{s["card"]}" stroke="{s["accent"]}" stroke-width="1.6"/></g>')
    tx(62, 456, T["receipt_title"], 13, "text", "mono", bold=True, maxw=310,
       where="receipt title")
    tx(62, 482, T["receipt_path"], 11.5, "sub", "mono", maxw=312,
       where="receipt path")
    tx(62, 504, T["receipt_file"], 11.5, "sub", "mono", maxw=312,
       where="receipt file")
    a(f'<line x1="62" y1="518" x2="374" y2="518" stroke="{s["grid"]}" '
      f'stroke-width="1.1"/>')
    tx(62, 542, T["receipt_sha"], 11.5, "text", "mono", maxw=250,
       where="receipt sha")
    tx(62, 564, T["receipt_bytes"], 11.5, "sub", "mono", maxw=250,
       where="receipt bytes")
    tx(62, 592, T["receipt_foot"], 11, "accent2", "sans", maxw=250,
       where="receipt foot")
    a(f'<circle cx="352" cy="590" r="10" fill="none" stroke="{s["accent2"]}" '
      f'stroke-width="1.8"/>')
    a(f'<path d="M347 590l4 5 7 -9" fill="none" stroke="{s["accent2"]}" '
      f'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>')

    a(f'<g filter="url(#ptSoft)"><rect x="420" y="428" width="272" height="192" '
      f'rx="18" fill="{s["card"]}" stroke="{s["edge"]}" stroke-width="1.5"/></g>')
    tx(438, 456, T["gate_title"], 13, "text", "mono", bold=True, maxw=236,
       where="gate title")
    for i, key in enumerate(("gate_check1", "gate_check2", "gate_check3")):
        y = 482 + i * 24
        a(f'<circle cx="443" cy="{y - 4}" r="4" fill="none" '
          f'stroke="{s["accent2"]}" stroke-width="1.4"/>')
        a(f'<path d="M441 {y - 4}l2 2.4 3.4 -4.4" fill="none" '
          f'stroke="{s["accent2"]}" stroke-width="1.4"/>')
        tx(454, y, T[key], 11.5, "sub", "mono", maxw=222, where="gate check")
    a(f'<line x1="438" y1="548" x2="674" y2="548" stroke="{s["grid"]}" '
      f'stroke-width="1.1"/>')
    tx(438, 570, T["gate_bad1"], 11, "red", "sans", maxw=232,
       where="gate reject 1")
    tx(438, 592, T["gate_bad2"], 11, "red", "sans", maxw=232,
       where="gate reject 2")

    # ------------------------------------------------------------- CSV text card
    a(f'<g filter="url(#ptSoft)"><rect x="724" y="412" width="340" height="224" '
      f'rx="20" fill="{s["card"]}" stroke="{s["edge"]}" stroke-width="1.5"/></g>')
    tx(742, 442, T["csv_title"], 13, "text", "mono", bold=True, maxw=230,
       where="csv title")
    a(f'<rect x="990" y="426" width="58" height="22" rx="11" '
      f'fill="{s["pill"]}"/>')
    tx(1019, 441, T["csv_chip"], 10.5, "accent", "mono", anchor="middle")
    tx(742, 462, T["csv_sub"], 11, "faint", "mono", maxw=240,
       where="csv subtitle")

    csv_lines = ['Region,"Q1 ""units""",Q2,Q3', "North,120,135,150",
                 '"South, East",90,110,130']
    for i, line in enumerate(csv_lines):
        _svg_fit(line, 13, 300, True, "csv line")
        a(f'<text x="742" y="{492 + i * 26}" fill="{s["text"]}" {mono} '
          f'font-size="13">{esc(line)}</text>')
    a(f'<line x1="742" y1="556" x2="1046" y2="556" stroke="{s["grid"]}" '
      f'stroke-width="1.1"/>')
    tx(742, 578, T["csv_note1"], 11.5, "sub", "mono", maxw=300,
       where="csv note 1")
    tx(742, 600, T["csv_note2"], 11.5, "faint", "mono", maxw=300,
       where="csv note 2")

    # ------------------------------------------------------------------- arrows
    # page -> panel
    a(f'<path d="M192 248H198" stroke="{s["accent"]}" stroke-width="2"/>')
    a(f'<path d="M204 248l-8 -5v10z" fill="{s["accent"]}"/>')
    # matrix -> CSV (panel bottom into the CSV card)
    a(f'<path d="M890 378V402" stroke="{s["accent"]}" stroke-width="2" '
      f'stroke-linecap="round"/>')
    a(f'<path d="M890 412l-5 -10h10z" fill="{s["accent"]}"/>')
    # CSV -> gate (crosses the R1 seam)
    a(f'<path d="M722 524H700" stroke="{s["accent"]}" stroke-width="2"/>')
    a(f'<path d="M692 524l10 -5v10z" fill="{s["accent"]}"/>')
    # gate -> receipt
    a(f'<path d="M418 524H400" stroke="{s["accent"]}" stroke-width="2"/>')
    a(f'<path d="M392 524l10 -5v10z" fill="{s["accent"]}"/>')

    # ------------------------------------------------------------------- footer
    tx(44, 650, T["foot"], 11.5, "faint", "sans", maxw=1012, where="footer")
    a("</svg>")
    return "\n".join(p) + "\n"


def main():
    os.makedirs(OUT, exist_ok=True)
    for lang in ("zh", "en"):
        for skin_name in ("light", "dark"):
            hero(lang, skin_name)
    for skin_name in ("light", "dark"):
        name = f"dsh-pdf-table-flow-v5-{skin_name}.svg"
        with open(os.path.join(OUT, name), "w", encoding="utf-8",
                  newline="\n") as fh:
            fh.write(flow_svg(skin_name))
        print(f"wrote {name}")


if __name__ == "__main__":
    main()
